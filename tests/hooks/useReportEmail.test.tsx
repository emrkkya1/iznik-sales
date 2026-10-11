// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendManualReport = vi.fn();
const addRecipient = vi.fn();
const removeRecipient = vi.fn();
const setScheduleMode = vi.fn();
const logMutation = vi.fn();

vi.mock('@/services', () => ({
  services: {
    reportEmail: {
      sendManualReport: (...args: unknown[]) => sendManualReport(...args),
      addRecipient: (...args: unknown[]) => addRecipient(...args),
      removeRecipient: (...args: unknown[]) => removeRecipient(...args),
      setScheduleMode: (...args: unknown[]) => setScheduleMode(...args),
    },
  },
}));

vi.mock('@/services/supabase/reportEmail', () => {
  class EdgeFunctionInvocationError extends Error {}
  class ReportEmailDeliveryError extends Error {
    result: { runId: string; sentCount: number; failedCount: number };

    constructor(result: { runId: string; sentCount: number; failedCount: number }) {
      super(`${result.failedCount} alıcıya e-posta gönderilemedi.`);
      this.result = result;
    }
  }
  return { EdgeFunctionInvocationError, ReportEmailDeliveryError };
});

vi.mock('@/utils/logger', () => ({
  instrumentQuery: <T,>(_name: string, fn: T) => fn,
  logMutation: (...args: unknown[]) => logMutation(...args),
  summarizeResult: vi.fn(),
}));

import { ReportEmailDeliveryError } from '@/services/supabase/reportEmail';
import {
  useAddReportRecipient,
  useRemoveReportRecipient,
  useSendReportEmail,
  useSetReportScheduleMode,
} from '@/hooks/useReportEmail';

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSendReportEmail', () => {
  beforeEach(() => {
    sendManualReport.mockReset();
    addRecipient.mockReset();
    removeRecipient.mockReset();
    setScheduleMode.mockReset();
    logMutation.mockReset();
  });

  it('logs a failed recipient run as an error rather than success', async () => {
    sendManualReport.mockRejectedValue(new ReportEmailDeliveryError({ runId: 'run-1', sentCount: 0, failedCount: 1 }));
    const { result } = renderHook(() => useSendReportEmail(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({
        uri: 'file:///report.pdf', fileName: 'report.pdf', reportType: 'summary', reportLabel: 'Özet', recipientIds: ['recipient-1'],
      })).rejects.toThrow('1 alıcıya e-posta gönderilemedi.');
    });

    expect(logMutation).toHaveBeenCalledWith('send_report_email', 'error', {
      runId: 'run-1', sentCount: 0, failedCount: 1, message: '1 alıcıya e-posta gönderilemedi.',
    });
    expect(logMutation).not.toHaveBeenCalledWith('send_report_email', 'success', expect.anything());
  });

  it('invalidates only the affected settings query after successful mutations', async () => {
    addRecipient.mockResolvedValue('recipient-1');
    removeRecipient.mockResolvedValue(undefined);
    setScheduleMode.mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const localWrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const add = renderHook(() => useAddReportRecipient(), { wrapper: localWrapper });
    const remove = renderHook(() => useRemoveReportRecipient(), { wrapper: localWrapper });
    const schedule = renderHook(() => useSetReportScheduleMode(), { wrapper: localWrapper });

    await act(async () => {
      await add.result.current.mutateAsync('reports@example.test');
      await remove.result.current.mutateAsync('recipient-1');
      await schedule.result.current.mutateAsync('weekly');
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['report-email', 'recipients'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['report-email', 'settings'] });
    expect(logMutation).toHaveBeenCalledWith('set_report_schedule_mode', 'success', { mode: 'weekly' });
  });

  it('logs recipient and schedule errors without invalidating stale data', async () => {
    const error = new Error('rejected');
    addRecipient.mockRejectedValue(error);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const localWrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const add = renderHook(() => useAddReportRecipient(), { wrapper: localWrapper });

    await act(async () => {
      await expect(add.result.current.mutateAsync('reports@example.test')).rejects.toThrow(error);
    });
    expect(invalidate).not.toHaveBeenCalled();
    expect(logMutation).toHaveBeenCalledWith('add_report_recipient', 'error', error);
  });
});
