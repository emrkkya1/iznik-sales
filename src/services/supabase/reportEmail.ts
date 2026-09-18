import { File } from 'expo-file-system';
import { v4 as uuidv4 } from 'uuid';
import { FunctionsHttpError } from '@supabase/supabase-js';

import type { ReportEmailRepository } from '@/services/contracts';
import type {
  ReportEmailSettings,
  ReportRecipient,
  ReportScheduleMode,
  SendReportEmailInput,
  SendReportEmailResult,
} from '@/types';

import { supabaseClient } from './supabaseClient';

export class EdgeFunctionInvocationError extends Error {
  readonly functionName: string;
  readonly status: number;
  readonly responseBody: unknown;

  constructor(functionName: string, status: number, responseBody: unknown, cause: Error) {
    const detail = typeof responseBody === 'object' && responseBody !== null && 'message' in responseBody
      ? String(responseBody.message)
      : typeof responseBody === 'string' ? responseBody : cause.message;
    super(`${functionName} failed (${status}): ${detail}`, { cause });
    this.name = 'EdgeFunctionInvocationError';
    this.functionName = functionName;
    this.status = status;
    this.responseBody = responseBody;
  }
}

export class ReportEmailDeliveryError extends Error {
  readonly result: SendReportEmailResult;

  constructor(result: SendReportEmailResult) {
    const message = result.sentCount === 0
      ? `${result.failedCount} alıcıya e-posta gönderilemedi.`
      : `${result.sentCount} alıcıya gönderildi, ${result.failedCount} alıcıya gönderilemedi.`;
    super(message);
    this.name = 'ReportEmailDeliveryError';
    this.result = result;
  }
}

async function throwFunctionError(functionName: string, error: Error): Promise<never> {
  if (error instanceof FunctionsHttpError) {
    const response = error.context;
    const text = await response.clone().text().catch(() => '');
    let body: unknown = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Retain the raw, bounded response text when it is not JSON.
      body = text.slice(0, 2000);
    }
    throw new EdgeFunctionInvocationError(functionName, response.status, body, error);
  }
  throw error;
}

function asRecipients(data: unknown): ReportRecipient[] {
  if (!Array.isArray(data)) throw new Error('Alıcı listesi okunamadı.');
  return data.map((row) => {
    const value = row as Record<string, unknown>;
    if (typeof value.id !== 'string' || typeof value.email !== 'string') {
      throw new Error('Alıcı listesi geçersiz.');
    }
    return {
      id: value.id,
      email: value.email,
      isEnabled: value.isEnabled === true,
      createdAt: String(value.createdAt ?? ''),
      updatedAt: String(value.updatedAt ?? ''),
    };
  });
}

function asSettings(data: unknown): ReportEmailSettings {
  const value = data as Record<string, unknown> | null;
  if (!value || !['weekly', 'monthly', 'disabled'].includes(String(value.scheduleMode))) {
    throw new Error('E-posta ayarları okunamadı.');
  }
  return { scheduleMode: value.scheduleMode as ReportScheduleMode, updatedAt: String(value.updatedAt ?? '') };
}

export const supabaseReportEmailRepository: ReportEmailRepository = {
  async getSettings() {
    const { data, error } = await supabaseClient.rpc('get_report_email_settings');
    if (error) throw error;
    return asSettings(data);
  },

  async listRecipients() {
    const { data, error } = await supabaseClient.rpc('list_report_recipients');
    if (error) throw error;
    return asRecipients(data);
  },

  async addRecipient(email) {
    const { data, error } = await supabaseClient.rpc('upsert_report_recipient', {
      p_email: email,
      p_is_enabled: true,
    });
    if (error) throw error;
    return data;
  },

  async removeRecipient(id) {
    const { error } = await supabaseClient.rpc('delete_report_recipient', { p_id: id });
    if (error) throw error;
  },

  async setScheduleMode(mode) {
    const { error } = await supabaseClient.rpc('set_report_schedule_mode', { p_mode: mode });
    if (error) throw error;
  },

  async sendManualReport(input: SendReportEmailInput) {
    const { data: userData, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !userData.user) throw userError ?? new Error('Oturum bulunamadı.');
    const file = new File(input.uri);
    if (!file.exists || !file.size) throw new Error('Rapor dosyası bulunamadı. Lütfen yeniden oluşturun.');
    const artifactPath = `${userData.user.id}/${uuidv4()}-${input.fileName}`;
    const content = await file.arrayBuffer();
    const { error: uploadError } = await supabaseClient.storage
      .from('report-artifacts')
      .upload(artifactPath, content, { contentType: 'application/pdf', upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await supabaseClient.functions.invoke('send-report-email', {
      body: {
        artifactPath,
        fileName: input.fileName,
        reportType: input.reportType,
        reportLabel: input.reportLabel,
        recipientIds: input.recipientIds,
      },
    });
    if (error) await throwFunctionError('send-report-email', error);
    const value = data as Partial<SendReportEmailResult>;
    if (typeof value.runId !== 'string' || typeof value.sentCount !== 'number' || typeof value.failedCount !== 'number') {
      throw new Error('E-posta gönderim sonucu geçersiz.');
    }
    const result = value as SendReportEmailResult;
    if (result.failedCount > 0) throw new ReportEmailDeliveryError(result);
    return result;
  },
};
