import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { services } from '@/services';
import type { CloseReceivablesInput } from '@/types';
import { generateIdempotencyKey } from '@/utils/idempotency';
import { logMutation } from '@/utils/logger';
import { BRANCH_ANALYTICS_QUERY_KEY } from './useBranchesAnalytics';

export function useCloseReceivables() {
  const queryClient = useQueryClient();
  const attempt = useRef<{ inputKey: string; key: string } | null>(null);
  return useMutation({
    retry: false,
    mutationFn: (input: CloseReceivablesInput) => {
      const branches = [...input.branches].sort((a, b) => a.branchId.localeCompare(b.branchId));
      const inputKey = JSON.stringify([branches, input.paymentType, input.date]);
      if (!attempt.current || attempt.current.inputKey !== inputKey) {
        attempt.current = { inputKey, key: generateIdempotencyKey() };
      }
      return services.payments.closeReceivables(input, attempt.current.key);
    },
    onMutate: (input) => logMutation('close_branch_receivables', 'start', { input }),
    onSuccess: async (result) => {
      logMutation('close_branch_receivables', 'success', { count: result.payments.length, totalAmount: result.totalAmount });
      attempt.current = null;
      await Promise.all([
        BRANCH_ANALYTICS_QUERY_KEY, ['payments'], ['balance'], ['reports'],
        ['financial-movements'],
        ['admin', 'branches'], ['admin', 'branch-hub', 'details'], ['admin', 'branch-movements'],
      ].map(queryKey => queryClient.invalidateQueries({ queryKey })));
    },
    onError: (error) => {
      logMutation('close_branch_receivables', 'error', error);
      // Refresh stale balances (and ambiguous network failures) without
      // discarding the request key needed to retry this exact batch safely.
      void queryClient.invalidateQueries({ queryKey: BRANCH_ANALYTICS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: ['balance'] });
    },
  });
}
