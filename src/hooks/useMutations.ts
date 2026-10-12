import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { services } from '@/services';
import { generateIdempotencyKey } from '@/utils/idempotency';
import { logMutation } from '@/utils/logger';
import type {
  CreateDeliveryInput,
  ManualPaymentInput,
  UpdateDeliveryInput,
} from '@/types';

import { BRANCH_ANALYTICS_QUERY_KEY } from './useBranchesAnalytics';

function invalidateBranchData(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['financial-movements'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'branch-movements'] });
  queryClient.invalidateQueries({ queryKey: ['admin', 'branch-hub', 'details'] });
  queryClient.invalidateQueries({ queryKey: ['reports'] });
  queryClient.invalidateQueries({ queryKey: ['deliveries'] });
  queryClient.invalidateQueries({ queryKey: ['payments'] });
  queryClient.invalidateQueries({ queryKey: ['balance'] });
  queryClient.invalidateQueries({ queryKey: BRANCH_ANALYTICS_QUERY_KEY });
}

export function useCreateDelivery() {
  const queryClient = useQueryClient();
  const idempotencyKeyRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: (input: CreateDeliveryInput) => {
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = generateIdempotencyKey();
      }
      return services.deliveries.createDelivery(
        input,
        idempotencyKeyRef.current,
      );
    },
    onMutate: (input) => {
      logMutation('createDelivery', 'start', { input });
    },
    onSuccess: (data) => {
      logMutation('createDelivery', 'success', {
        idempotencyKey: idempotencyKeyRef.current,
        result: data,
      });
      idempotencyKeyRef.current = null;
      invalidateBranchData(queryClient);
    },
    onError: (error) => {
      logMutation('createDelivery', 'error', error);
    },
  });
}

export function useUpdateDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateDeliveryInput) =>
      services.deliveries.updateDelivery(input),
    onMutate: (input) => {
      logMutation('updateDelivery', 'start', { input });
    },
    onSuccess: (data) => {
      logMutation('updateDelivery', 'success', { result: data });
      invalidateBranchData(queryClient);
    },
    onError: (error) => {
      logMutation('updateDelivery', 'error', error);
    },
  });
}

export function useSoftDeleteDelivery() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      services.deliveries.softDeleteDelivery(id, reason),
    onMutate: ({ id, reason }) => {
      logMutation('softDeleteDelivery', 'start', { id, reason });
    },
    onSuccess: (_data, { id }) => {
      logMutation('softDeleteDelivery', 'success', { id });
      invalidateBranchData(queryClient);
    },
    onError: (error) => {
      logMutation('softDeleteDelivery', 'error', error);
    },
  });
}

export function useRecordManualPayment() {
  const queryClient = useQueryClient();
  const attemptRef = useRef<{ inputKey: string; idempotencyKey: string } | null>(null);

  return useMutation({
    retry: false,
    mutationFn: (input: ManualPaymentInput) => {
      const inputKey = JSON.stringify([input.branchId, input.amount, input.paymentType, input.date]);
      if (!attemptRef.current || attemptRef.current.inputKey !== inputKey) {
        attemptRef.current = { inputKey, idempotencyKey: generateIdempotencyKey() };
      }
      return services.payments.recordManualPayment(input, attemptRef.current.idempotencyKey);
    },
    onMutate: (input) => {
      logMutation('recordManualPayment', 'start', { input });
    },
    onSuccess: async (data, input) => {
      logMutation('recordManualPayment', 'success', { result: data });
      attemptRef.current = null;
      invalidateBranchData(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'branch-movements', input.branchId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'branch-hub', 'details', input.branchId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
    onError: (error) => {
      logMutation('recordManualPayment', 'error', error);
    },
  });
}
