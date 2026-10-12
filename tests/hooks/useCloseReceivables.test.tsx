// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCloseReceivables } from '@/hooks/useCloseReceivables';

const closeReceivables = vi.fn();
const generateIdempotencyKey = vi.fn();
const logMutation = vi.fn();
vi.mock('@/services', () => ({ services: { payments: { closeReceivables: (...args: unknown[]) => closeReceivables(...args) } } }));
vi.mock('@/utils/idempotency', () => ({ generateIdempotencyKey: () => generateIdempotencyKey() }));
vi.mock('@/utils/logger', () => ({ logMutation: (...args: unknown[]) => logMutation(...args), instrumentQuery: vi.fn() }));

afterEach(cleanup);
beforeEach(() => { closeReceivables.mockReset(); generateIdempotencyKey.mockReset(); logMutation.mockReset(); });
const input = { branches: [{ branchId: 'b', expectedAmount: 10 }, { branchId: 'a', expectedAmount: 20 }], paymentType: 'bank_transfer' as const, date: '2026-10-12' };
const receipt = { payments: [{ branchId: 'a', paymentId: 'p1', amount: 20 }, { branchId: 'b', paymentId: 'p2', amount: 10 }], totalAmount: 30 };
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useCloseReceivables(), { wrapper }), invalidate };
}

describe('useCloseReceivables', () => {
  it('records a batch with logging and refreshes all affected financial caches', async () => {
    closeReceivables.mockResolvedValue(receipt);
    generateIdempotencyKey.mockReturnValue('batch-key');
    const { result, invalidate } = setup();
    await act(async () => { await result.current.mutateAsync(input); });
    expect(closeReceivables).toHaveBeenCalledWith(input, 'batch-key');
    expect(logMutation).toHaveBeenCalledWith('close_branch_receivables', 'start', { input });
    expect(logMutation).toHaveBeenCalledWith('close_branch_receivables', 'success', { count: 2, totalAmount: 30 });
    for (const queryKey of [['financial-movements'], ['analytics', 'branches'], ['payments'], ['balance'], ['reports'], ['admin', 'branches'], ['admin', 'branch-hub', 'details'], ['admin', 'branch-movements']]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });
  it('retains a retry key even if branch order changes, and renews it after success', async () => {
    generateIdempotencyKey.mockReturnValueOnce('retry-key').mockReturnValueOnce('next-key');
    const error = new Error('Response lost');
    closeReceivables.mockRejectedValueOnce(error).mockResolvedValue(receipt);
    const { result, invalidate } = setup();
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow('Response lost'); });
    expect(logMutation).toHaveBeenCalledWith('close_branch_receivables', 'error', error);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['analytics', 'branches'] });
    const reordered = { ...input, branches: [...input.branches].reverse() };
    await act(async () => { await result.current.mutateAsync(reordered); });
    expect(closeReceivables).toHaveBeenLastCalledWith(reordered, 'retry-key');
    await act(async () => { await result.current.mutateAsync(input); });
    expect(closeReceivables).toHaveBeenLastCalledWith(input, 'next-key');
  });
});
