import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { services } from '@/services';
import { instrumentQuery, logMutation } from '@/utils/logger';
import { getPendingFinancialOperation, runFinancialOperation } from '@/services/financialOperations';
import { FinancialWriteCommittedError } from '@/services/financialOperationErrors';
import { useAuthStore } from '@/store';
import type {
  CreateDeliveryInput,
  ManualPaymentInput,
  UpdateDeliveryInput,
  ReceiptSummary,
  Payment,
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

type FinancialInputs = { create_delivery: CreateDeliveryInput; update_delivery: UpdateDeliveryInput; manual_payment: ManualPaymentInput };
const RECOVER = Symbol('recover financial operation');

function currentActor(): string {
  const actorId = useAuthStore.getState().session?.user.id;
  if (!actorId) throw new Error('Oturum bulunamadı.');
  return actorId;
}

function useDurableFinancialMutation<K extends keyof FinancialInputs, T>(kind: K, name: string, execute: (input: FinancialInputs[K], key: string, actorId: string) => Promise<T>) {
  const queryClient = useQueryClient();
  const actorId = useAuthStore(s => s.session?.user.id);
  const pendingKey = ['financial-operation', actorId, kind];
  const pending = useQuery({
    queryKey: pendingKey,
    enabled: !!actorId,
    queryFn: instrumentQuery('load_pending_financial_operation', () => getPendingFinancialOperation(actorId!, kind), result => ({ pending: result !== null })),
    retry: false,
    staleTime: 0,
  });
  const mutation = useMutation({
    retry: false,
    mutationFn: (input: FinancialInputs[K] & { [RECOVER]?: true }) => {
      const actor = currentActor();
      return runFinancialOperation({
      actorId: actor, kind, input, recovering: input[RECOVER],
      execute: (snapshot, key) => {
        logMutation(name, 'start', { phase: 'rpc_started', operationId: key });
        return execute(snapshot, key, actor).then(result => {
          if (useAuthStore.getState().session?.user.id !== actor) throw new FinancialWriteCommittedError();
          return result;
        });
      },
      });
    },
    onMutate: (input) => logMutation(name, 'start', { phase: 'preparing', recovery: input[RECOVER] === true }),
    onSuccess: () => {
      logMutation(name, 'success', { phase: 'receipt_loaded' });
      invalidateBranchData(queryClient);
      if (kind === 'manual_payment') void queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] });
    },
    onError: (error) => {
      logMutation(name, 'error', error);
      if (error instanceof FinancialWriteCommittedError) invalidateBranchData(queryClient);
    },
    onSettled: () => { void queryClient.invalidateQueries({ queryKey: pendingKey }); },
  });
  const recover = async (options?: Parameters<typeof mutation.mutateAsync>[1]) => {
    const operation = await getPendingFinancialOperation(currentActor(), kind);
    if (!operation) throw new Error('Bekleyen işlem bulunamadı.');
    // getPendingFinancialOperation verifies the stored kind before returning.
    const original = operation.input as FinancialInputs[K];
    return mutation.mutateAsync({ ...original, [RECOVER]: true }, options);
  };
  return { ...mutation, recover, hasPendingOperation: pending.data !== null && pending.data !== undefined,
    recoveryLoading: pending.isLoading,
    requiresRecovery: ['PendingFinancialOperationError', 'FinancialOutcomeUnknownError', 'FinancialWriteCommittedError'].includes(mutation.error?.name ?? '') };
}

export function useCreateDelivery() {
  return useDurableFinancialMutation<'create_delivery', ReceiptSummary>('create_delivery', 'createDelivery', (input, key, actor) => services.deliveries.createDelivery(input, key, actor));
}

export function useUpdateDelivery() {
  return useDurableFinancialMutation<'update_delivery', ReceiptSummary>('update_delivery', 'updateDelivery', (input, key, actor) => services.deliveries.updateDelivery(input, key, actor));
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
  return useDurableFinancialMutation<'manual_payment', Payment>('manual_payment', 'recordManualPayment', (input, key, actor) => services.payments.recordManualPayment(input, key, actor));
}
