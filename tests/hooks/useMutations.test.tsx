// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/store';

const pendingStorage = vi.hoisted(() => new Map<string, string>());
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => pendingStorage.get(key) ?? null,
  setItem: async (key: string, value: string) => { pendingStorage.set(key, value); },
  removeItem: async (key: string) => { pendingStorage.delete(key); },
} }));

const createDelivery = vi.fn();
const updateDelivery = vi.fn();
const softDeleteDelivery = vi.fn();
const recordManualPayment = vi.fn();
const generateIdempotencyKey = vi.fn();
const logMutation = vi.fn();

vi.mock('@/services', () => ({
  services: {
    deliveries: {
      createDelivery: (...args: unknown[]) => createDelivery(...args),
      updateDelivery: (...args: unknown[]) => updateDelivery(...args),
      softDeleteDelivery: (...args: unknown[]) => softDeleteDelivery(...args),
    },
    payments: {
      recordManualPayment: (...args: unknown[]) => recordManualPayment(...args),
    },
  },
}));

vi.mock('@/utils/idempotency', () => ({
  generateIdempotencyKey: () => generateIdempotencyKey(),
}));

vi.mock('@/utils/logger', () => ({
  logMutation: (...args: unknown[]) => logMutation(...args),
  instrumentQuery: (_name: string, fn: unknown) => fn,
}));

import {
  useCreateDelivery,
  useRecordManualPayment,
  useSoftDeleteDelivery,
  useUpdateDelivery,
} from '@/hooks/useMutations';

const deliveryInput = {
  branchId: 'branch-1',
  items: [{ productId: 'product-1', deliveredQuantity: 2, returnedQuantity: 0 }],
  paymentAmount: 3,
  paymentType: 'field_collection' as const,
  date: '2026-09-19',
};

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function expectFinancialInvalidation(invalidate: ReturnType<typeof vi.spyOn>) {
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['deliveries'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['payments'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['balance'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['analytics', 'branches'] });
}

describe('financial mutation hooks', () => {
  afterEach(() => { cleanup(); useAuthStore.getState().reset(); });
  beforeEach(() => {
    pendingStorage.clear();
    useAuthStore.getState().setSession({ accessToken: 'token', expiresAt: null, user: { id: 'user-1', email: null } });
    createDelivery.mockReset();
    updateDelivery.mockReset();
    softDeleteDelivery.mockReset();
    recordManualPayment.mockReset();
    generateIdempotencyKey.mockReset();
    logMutation.mockReset();
  });

  it('logs successful mutations and invalidates financial query families', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = createWrapper(client);
    generateIdempotencyKey.mockReturnValueOnce('key-1').mockReturnValueOnce('edit-key').mockReturnValueOnce('payment-key').mockReturnValueOnce('key-2');
    createDelivery.mockResolvedValue({ deliveryId: 'delivery-1' });
    updateDelivery.mockResolvedValue(undefined);
    softDeleteDelivery.mockResolvedValue(undefined);
    recordManualPayment.mockResolvedValue({ id: 'payment-1' });

    const create = renderHook(() => useCreateDelivery(), { wrapper });
    const update = renderHook(() => useUpdateDelivery(), { wrapper });
    const remove = renderHook(() => useSoftDeleteDelivery(), { wrapper });
    const payment = renderHook(() => useRecordManualPayment(), { wrapper });

    await act(async () => {
      await create.result.current.mutateAsync(deliveryInput);
      await update.result.current.mutateAsync({ ...deliveryInput, deliveryId: 'delivery-1' });
      await remove.result.current.mutateAsync({ id: 'delivery-1', reason: 'duplicate' });
      await payment.result.current.mutateAsync({
        branchId: 'branch-1', amount: 5, paymentType: 'bank_transfer', date: '2026-09-19',
      });
    });

    expect(createDelivery).toHaveBeenCalledWith(deliveryInput, 'key-1', 'user-1');
    expect(logMutation).toHaveBeenCalledWith('createDelivery', 'success', {
      phase: 'receipt_loaded',
    });
    expect(logMutation).toHaveBeenCalledWith('updateDelivery', 'success', { phase: 'receipt_loaded' });
    expect(logMutation).toHaveBeenCalledWith('softDeleteDelivery', 'success', { id: 'delivery-1' });
    expect(logMutation).toHaveBeenCalledWith('recordManualPayment', 'success', { phase: 'receipt_loaded' });
    expect(recordManualPayment).toHaveBeenCalledWith({
      branchId: 'branch-1', amount: 5, paymentType: 'bank_transfer', date: '2026-09-19',
    }, 'payment-key', 'user-1');
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'branch-movements'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'branch-hub', 'details'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['admin', 'branches'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['reports'] });
    expectFinancialInvalidation(invalidate);

    await act(async () => {
      await create.result.current.mutateAsync(deliveryInput);
    });
    expect(createDelivery).toHaveBeenLastCalledWith(deliveryInput, 'key-2', 'user-1');
  });

  it('logs errors, keeps caches untouched, and retains the create idempotency key for retry', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = createWrapper(client);
    const failure = new Error('network unavailable');
    generateIdempotencyKey.mockReturnValueOnce('retry-key').mockReturnValueOnce('edit-key').mockReturnValueOnce('payment-key');
    createDelivery.mockRejectedValueOnce(failure).mockResolvedValueOnce({ deliveryId: 'delivery-2' });
    updateDelivery.mockRejectedValue(failure);
    softDeleteDelivery.mockRejectedValue(failure);
    recordManualPayment.mockRejectedValue(failure);

    const create = renderHook(() => useCreateDelivery(), { wrapper });
    const update = renderHook(() => useUpdateDelivery(), { wrapper });
    const remove = renderHook(() => useSoftDeleteDelivery(), { wrapper });
    const payment = renderHook(() => useRecordManualPayment(), { wrapper });

    await act(async () => {
      await expect(create.result.current.mutateAsync(deliveryInput)).rejects.toMatchObject({ name: 'FinancialOutcomeUnknownError' });
      await expect(update.result.current.mutateAsync({ ...deliveryInput, deliveryId: 'delivery-1' })).rejects.toMatchObject({ name: 'FinancialOutcomeUnknownError' });
      await expect(remove.result.current.mutateAsync({ id: 'delivery-1', reason: 'bad' })).rejects.toThrow(failure);
      await expect(payment.result.current.mutateAsync({
        branchId: 'branch-1', amount: 5, paymentType: 'bank_transfer', date: '2026-09-19',
      })).rejects.toMatchObject({ name: 'FinancialOutcomeUnknownError' });
    });

    expect(invalidate.mock.calls.filter(([filters]) => filters?.queryKey?.[0] !== 'financial-operation')).toHaveLength(0);
    expect(logMutation).toHaveBeenCalledWith('createDelivery', 'error', expect.objectContaining({ name: 'FinancialOutcomeUnknownError' }));
    expect(logMutation).toHaveBeenCalledWith('updateDelivery', 'error', expect.objectContaining({ name: 'FinancialOutcomeUnknownError' }));
    expect(logMutation).toHaveBeenCalledWith('softDeleteDelivery', 'error', failure);
    expect(logMutation).toHaveBeenCalledWith('recordManualPayment', 'error', expect.objectContaining({ name: 'FinancialOutcomeUnknownError' }));

    await act(async () => {
      await create.result.current.recover();
    });
    expect(createDelivery).toHaveBeenLastCalledWith(deliveryInput, 'retry-key', 'user-1');
    expect(generateIdempotencyKey).toHaveBeenCalledTimes(3);
  });

  it('retains the original actor identity when the account changes during a write', async () => {
    const client = new QueryClient();
    const wrapper = createWrapper(client);
    generateIdempotencyKey.mockReturnValueOnce('actor-key');
    createDelivery.mockImplementationOnce(async () => {
      useAuthStore.getState().setSession({ accessToken: 'other', expiresAt: null, user: { id: 'user-2', email: null } });
      return { deliveryId: 'committed' };
    });
    const mutation = renderHook(() => useCreateDelivery(), { wrapper });
    await act(async () => {
      await expect(mutation.result.current.mutateAsync(deliveryInput)).rejects.toMatchObject({ name: 'FinancialWriteCommittedError' });
    });
    expect(createDelivery).toHaveBeenCalledWith(deliveryInput, 'actor-key', 'user-1');
    expect(pendingStorage.has('financial-operation:v1:user-1:create_delivery')).toBe(true);
    expect(pendingStorage.has('financial-operation:v1:user-2:create_delivery')).toBe(false);
  });

  it('recovers manual-payment identity after remount and blocks changed submissions until recovery', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = createWrapper(client);
    const input = { branchId: 'branch-1', amount: 5, paymentType: 'bank_transfer' as const, date: '2026-09-19' };
    generateIdempotencyKey.mockReturnValueOnce('retry-payment').mockReturnValueOnce('next-payment');
    recordManualPayment.mockRejectedValueOnce(new Error('Response lost')).mockResolvedValue({ id: 'payment-1' });
    const first = renderHook(() => useRecordManualPayment(), { wrapper });
    await act(async () => { await expect(first.result.current.mutateAsync(input)).rejects.toMatchObject({ name: 'FinancialOutcomeUnknownError' }); });
    first.unmount();
    const payment = renderHook(() => useRecordManualPayment(), { wrapper });
    await act(async () => { await expect(payment.result.current.mutateAsync({ ...input, amount: 10 })).rejects.toMatchObject({ name: 'PendingFinancialOperationError' }); });
    await act(async () => { await expect(payment.result.current.mutateAsync(input)).rejects.toMatchObject({ name: 'PendingFinancialOperationError' }); });
    expect(recordManualPayment).toHaveBeenCalledOnce();
    await act(async () => { await payment.result.current.recover(); });
    expect(recordManualPayment).toHaveBeenNthCalledWith(1, input, 'retry-payment', 'user-1');
    expect(recordManualPayment).toHaveBeenNthCalledWith(2, input, 'retry-payment', 'user-1');
    await act(async () => { await payment.result.current.mutateAsync({ ...input, amount: 10 }); });
    expect(recordManualPayment).toHaveBeenLastCalledWith({ ...input, amount: 10 }, 'next-payment', 'user-1');
  });
});
