// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChangeFinancialMovement, useCurrentFinancialMovement, useFinancialMovements } from '@/hooks/useFinancialMovements';
import type { FinancialChangeInput } from '@/services/supabase/financialMovementSchema';

const mocks = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), change: vi.fn(), key: vi.fn(), log: vi.fn() }));
vi.mock('@/services', () => ({ services: { financialMovements: { list: mocks.list, get: mocks.get, change: mocks.change } } }));
vi.mock('@/utils/idempotency', () => ({ generateIdempotencyKey: mocks.key }));
vi.mock('@/utils/logger', async importOriginal => ({ ...await importOriginal<typeof import('@/utils/logger')>(), logMutation: mocks.log }));
afterEach(cleanup);
beforeEach(() => { Object.values(mocks).forEach(mock => mock.mockReset()); });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { wrapper, invalidate, client };
}
const input: FinancialChangeInput = { kind: 'payment', id: 'record', action: 'edit', version: 'a'.repeat(32), patch: { date: '2026-10-12', amount: 10, paymentType: 'bank_transfer' } };

describe('financial movement hooks', () => {
  it('passes a cursor to the next page and stops when the server returns no cursor', async () => {
    const cursor = { at: '2026-10-12T12:00:00Z', id: 'event' };
    mocks.list.mockResolvedValueOnce({ rows: [], nextCursor: cursor }).mockResolvedValueOnce({ rows: [], nextCursor: null });
    const { wrapper } = setup(); const { result } = renderHook(useFinancialMovements, { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.list).toHaveBeenNthCalledWith(1, null, 50);
    expect(result.current.hasNextPage).toBe(true);
    await act(async () => { await result.current.fetchNextPage(); });
    expect(mocks.list).toHaveBeenNthCalledWith(2, cursor, 50);
    await waitFor(() => expect(result.current.hasNextPage).toBe(false));
  });
  it('surfaces initial query errors and supports retry', async () => {
    mocks.list.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ rows: [], nextCursor: null });
    const { wrapper } = setup(); const { result } = renderHook(useFinancialMovements, { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Offline');
    await act(async () => { await result.current.refetch(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
  it('fetches the current record under a record-specific key', async () => {
    mocks.get.mockResolvedValue({ snapshot: {}, version: 'version' });
    const { wrapper, client } = setup();
    const { result } = renderHook(() => useCurrentFinancialMovement('delivery', 'record'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mocks.get).toHaveBeenCalledWith('delivery', 'record');
    expect(client.getQueryData(['financial-movements', 'current', 'delivery', 'record'])).toEqual({ snapshot: {}, version: 'version' });
  });
  it('logs mutations and invalidates every affected financial view after success', async () => {
    mocks.key.mockReturnValue('key'); mocks.change.mockResolvedValue({ changed: true });
    const { wrapper, invalidate } = setup(); const { result } = renderHook(useChangeFinancialMovement, { wrapper });
    await act(async () => { await result.current.mutateAsync(input); });
    expect(mocks.change).toHaveBeenCalledWith(input, 'key');
    expect(mocks.log).toHaveBeenCalledWith('change_financial_movement', 'start', { input });
    expect(mocks.log).toHaveBeenCalledWith('change_financial_movement', 'success', { changed: true });
    for (const queryKey of [['financial-movements'], ['deliveries'], ['payments'], ['balance'], ['analytics'], ['reports'], ['admin', 'branches'], ['admin', 'branch-hub', 'details'], ['admin', 'branch-movements']]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
  });
  it('retains the key after an ambiguous error and renews it when the patch changes', async () => {
    mocks.key.mockReturnValueOnce('retry').mockReturnValueOnce('changed');
    mocks.change.mockRejectedValueOnce(new Error('Response lost')).mockRejectedValueOnce(new Error('Response lost')).mockResolvedValue({ changed: true });
    const { wrapper } = setup(); const { result } = renderHook(useChangeFinancialMovement, { wrapper });
    for (let i = 0; i < 2; i++) await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow('Response lost'); });
    expect(mocks.change).toHaveBeenNthCalledWith(1, input, 'retry');
    expect(mocks.change).toHaveBeenNthCalledWith(2, input, 'retry');
    const updated = { ...input, patch: { ...input.patch, amount: 20 } };
    await act(async () => { await result.current.mutateAsync(updated); });
    expect(mocks.change).toHaveBeenLastCalledWith(updated, 'changed');
    expect(mocks.log).toHaveBeenCalledWith('change_financial_movement', 'error', expect.any(Error));
  });
});
