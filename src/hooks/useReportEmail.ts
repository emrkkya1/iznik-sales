import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { services } from '@/services';
import { EdgeFunctionInvocationError, ReportEmailDeliveryError } from '@/services/supabase/reportEmail';
import type { ReportScheduleMode, SendReportEmailInput } from '@/types';
import { instrumentQuery, logMutation, summarizeResult } from '@/utils/logger';

const RECIPIENTS_KEY = ['report-email', 'recipients'] as const;
const SETTINGS_KEY = ['report-email', 'settings'] as const;

export function useReportRecipients() {
  return useQuery({
    queryKey: RECIPIENTS_KEY,
    queryFn: instrumentQuery('list_report_recipients', () => services.reportEmail.listRecipients(), summarizeResult),
  });
}

export function useReportEmailSettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: instrumentQuery('get_report_email_settings', () => services.reportEmail.getSettings(), summarizeResult),
  });
}

export function useAddReportRecipient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => services.reportEmail.addRecipient(email),
    onMutate: (email) => logMutation('add_report_recipient', 'start', { email }),
    onSuccess: (id) => {
      logMutation('add_report_recipient', 'success', { id });
      void queryClient.invalidateQueries({ queryKey: RECIPIENTS_KEY });
    },
    onError: (error) => logMutation('add_report_recipient', 'error', error),
  });
}

export function useRemoveReportRecipient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => services.reportEmail.removeRecipient(id),
    onMutate: (id) => logMutation('remove_report_recipient', 'start', { id }),
    onSuccess: (_data, id) => {
      logMutation('remove_report_recipient', 'success', { id });
      void queryClient.invalidateQueries({ queryKey: RECIPIENTS_KEY });
    },
    onError: (error) => logMutation('remove_report_recipient', 'error', error),
  });
}

export function useSetReportScheduleMode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (mode: ReportScheduleMode) => services.reportEmail.setScheduleMode(mode),
    onMutate: (mode) => logMutation('set_report_schedule_mode', 'start', { mode }),
    onSuccess: (_data, mode) => {
      logMutation('set_report_schedule_mode', 'success', { mode });
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
    onError: (error) => logMutation('set_report_schedule_mode', 'error', error),
  });
}

export function useSendReportEmail() {
  return useMutation({
    mutationFn: (input: SendReportEmailInput) => services.reportEmail.sendManualReport(input),
    onMutate: (input) => logMutation('send_report_email', 'start', { reportType: input.reportType, recipientCount: input.recipientIds.length }),
    onSuccess: (result) => logMutation('send_report_email', 'success', result),
    onError: (error) => logMutation('send_report_email', 'error',
      error instanceof EdgeFunctionInvocationError
        ? {
            function: error.functionName,
            status: error.status,
            response: error.responseBody,
          }
        : error instanceof ReportEmailDeliveryError
          ? {
              runId: error.result.runId,
              sentCount: error.result.sentCount,
              failedCount: error.result.failedCount,
              message: error.message,
            }
        : error,
    ),
  });
}
