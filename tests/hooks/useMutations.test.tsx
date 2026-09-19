// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeEach(() => {
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
    generateIdempotencyKey.mockReturnValueOnce('key-1').mockReturnValueOnce('key-2');
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

    expect(createDelivery).toHaveBeenCalledWith(deliveryInput, 'key-1');
    expect(logMutation).toHaveBeenCalledWith('createDelivery', 'success', {
      idempotencyKey: 'key-1', result: { deliveryId: 'delivery-1' },
    });
    expect(logMutation).toHaveBeenCalledWith('updateDelivery', 'success', { result: undefined });
    expect(logMutation).toHaveBeenCalledWith('softDeleteDelivery', 'success', { id: 'delivery-1' });
    expect(logMutation).toHaveBeenCalledWith('recordManualPayment', 'success', { result: { id: 'payment-1' } });
    expectFinancialInvalidation(invalidate);

    await act(async () => {
      await create.result.current.mutateAsync(deliveryInput);
    });
    expect(createDelivery).toHaveBeenLastCalledWith(deliveryInput, 'key-2');
  });

  it('logs errors, keeps caches untouched, and retains the create idempotency key for retry', async () => {
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const wrapper = createWrapper(client);
    const failure = new Error('network unavailable');
    generateIdempotencyKey.mockReturnValue('retry-key');
    createDelivery.mockRejectedValueOnce(failure).mockResolvedValueOnce({ deliveryId: 'delivery-2' });
    updateDelivery.mockRejectedValue(failure);
    softDeleteDelivery.mockRejectedValue(failure);
    recordManualPayment.mockRejectedValue(failure);

    const create = renderHook(() => useCreateDelivery(), { wrapper });
    const update = renderHook(() => useUpdateDelivery(), { wrapper });
    const remove = renderHook(() => useSoftDeleteDelivery(), { wrapper });
    const payment = renderHook(() => useRecordManualPayment(), { wrapper });

    await act(async () => {
      await expect(create.result.current.mutateAsync(deliveryInput)).rejects.toThrow(failure);
      await expect(update.result.current.mutateAsync({ ...deliveryInput, deliveryId: 'delivery-1' })).rejects.toThrow(failure);
      await expect(remove.result.current.mutateAsync({ id: 'delivery-1', reason: 'bad' })).rejects.toThrow(failure);
      await expect(payment.result.current.mutateAsync({
        branchId: 'branch-1', amount: 5, paymentType: 'bank_transfer', date: '2026-09-19',
      })).rejects.toThrow(failure);
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(logMutation).toHaveBeenCalledWith('createDelivery', 'error', failure);
    expect(logMutation).toHaveBeenCalledWith('updateDelivery', 'error', failure);
    expect(logMutation).toHaveBeenCalledWith('softDeleteDelivery', 'error', failure);
    expect(logMutation).toHaveBeenCalledWith('recordManualPayment', 'error', failure);

    await act(async () => {
      await create.result.current.mutateAsync(deliveryInput);
    });
    expect(createDelivery).toHaveBeenLastCalledWith(deliveryInput, 'retry-key');
    expect(generateIdempotencyKey).toHaveBeenCalledTimes(1);
  });
});
