// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useRenameBranch } from '@/hooks/useAdminLocations';

const renameBranch = vi.fn();
const logMutation = vi.fn();
vi.mock('@/services', () => ({
  services: { adminLocations: { renameBranch: (...args: unknown[]) => renameBranch(...args) } },
}));
vi.mock('@/utils/logger', () => ({
  logMutation: (...args: unknown[]) => logMutation(...args),
  instrumentQuery: vi.fn(),
  summarizeResult: vi.fn(),
}));

afterEach(cleanup);

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { ...renderHook(() => useRenameBranch(), { wrapper }), invalidate };
}

describe('useRenameBranch', () => {
  beforeEach(() => {
    renameBranch.mockReset();
    logMutation.mockReset();
  });

  it('logs the rename and refreshes every cache displaying branch names', async () => {
    renameBranch.mockResolvedValue(undefined);
    const { result, invalidate } = setup();
    const input = { id: 'branch-1', name: 'Yeni Şube' };
    await act(async () => { await result.current.mutateAsync(input); });
    expect(renameBranch).toHaveBeenCalledWith(input.id, input.name);
    expect(logMutation).toHaveBeenCalledWith('rename_branch', 'start', input);
    expect(logMutation).toHaveBeenCalledWith('rename_branch', 'success', input);
    for (const queryKey of [
      ['admin', 'branches'], ['admin', 'branch-hub', 'details', input.id],
      ['analytics', 'branches'], ['branches'], ['branch-location', input.id],
      ['deliveries'], ['reports'],
    ]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  });

  it('logs server errors without invalidating caches on failure', async () => {
    const error = new Error('Not authorized');
    renameBranch.mockRejectedValue(error);
    const { result, invalidate } = setup();
    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'branch-1', name: 'Yeni Şube' })).rejects.toThrow('Not authorized');
    });
    expect(logMutation).toHaveBeenCalledWith('rename_branch', 'error', error);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
