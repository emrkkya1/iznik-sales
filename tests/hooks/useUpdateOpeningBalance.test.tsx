// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUpdateOpeningBalance } from '@/hooks/useAdminLocations';

const updateOpeningBalance = vi.fn();
const logMutation = vi.fn();
vi.mock('@/services', () => ({ services: { adminLocations: { updateOpeningBalance: (...args: unknown[]) => updateOpeningBalance(...args) } } }));
vi.mock('@/utils/logger', () => ({ logMutation: (...args: unknown[]) => logMutation(...args), instrumentQuery: vi.fn(), summarizeResult: vi.fn() }));
afterEach(cleanup);
beforeEach(() => { updateOpeningBalance.mockReset(); logMutation.mockReset(); });

function setup() {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useUpdateOpeningBalance(), { wrapper }), invalidate };
}

describe('useUpdateOpeningBalance', () => {
  const input = { branchId: 'branch-1', openingBalance: -125.5, expectedOpeningBalance: 10 };
  it('logs changes and refreshes balances, details, branches, and reports', async () => {
    updateOpeningBalance.mockResolvedValue(undefined);
    const { result, invalidate } = setup();
    await act(async () => { await result.current.mutateAsync(input); });
    expect(updateOpeningBalance).toHaveBeenCalledWith(input);
    expect(logMutation).toHaveBeenCalledWith('update_branch_opening_balance', 'start', input);
    expect(logMutation).toHaveBeenCalledWith('update_branch_opening_balance', 'success', input);
    for (const queryKey of [
      ['admin', 'branches'], ['admin', 'branch-hub', 'details', input.branchId],
      ['balance', input.branchId], ['analytics', 'branches'], ['reports'],
      ['branches'], ['branch-location', input.branchId],
    ]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  });
  it('logs failures, does not retry automatically, and reloads state after a stale or ambiguous write', async () => {
    const error = new Error('Açılış bakiyesi başka bir işlemle değişti.');
    updateOpeningBalance.mockRejectedValue(error);
    const { result, invalidate } = setup();
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow(error.message); });
    expect(updateOpeningBalance).toHaveBeenCalledOnce();
    expect(logMutation).toHaveBeenCalledWith('update_branch_opening_balance', 'error', error);
    for (const queryKey of [['admin', 'branch-hub', 'details', input.branchId], ['balance', input.branchId], ['admin', 'app-config']]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey });
    }
  });
});
