// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendManualReport = vi.fn();
const logMutation = vi.fn();

vi.mock('@/services', () => ({
  services: {
    reportEmail: { sendManualReport: (...args: unknown[]) => sendManualReport(...args) },
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
import { useSendReportEmail } from '@/hooks/useReportEmail';

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSendReportEmail', () => {
  beforeEach(() => {
    sendManualReport.mockReset();
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
});
