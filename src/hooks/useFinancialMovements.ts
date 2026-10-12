import { useRef } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { services } from '@/services';
import type { FinancialChangeInput, FinancialEvent, MovementCursor } from '@/services/supabase/financialMovementSchema';
import { generateIdempotencyKey } from '@/utils/idempotency';
import { instrumentQuery, logMutation } from '@/utils/logger';

export const FINANCIAL_MOVEMENTS_KEY = ['financial-movements'] as const;

export function useFinancialMovements() {
  return useInfiniteQuery({
    queryKey: FINANCIAL_MOVEMENTS_KEY,
    initialPageParam: null as MovementCursor | null,
    queryFn: instrumentQuery('list_financial_movement_events', async ({ pageParam }) =>
      services.financialMovements.list(pageParam as MovementCursor | null, 50),
    page => ({ rows: page.rows.length, hasMore: !!page.nextCursor })),
    getNextPageParam: page => page.nextCursor ?? undefined,
  });
}

export function useCurrentFinancialMovement(kind: FinancialEvent['kind'], id: string) {
  return useQuery({
    queryKey: [...FINANCIAL_MOVEMENTS_KEY, 'current', kind, id],
    queryFn: instrumentQuery('get_financial_movement', () => services.financialMovements.get(kind, id),
      result => ({ version: result.version })),
    staleTime: 0,
  });
}

export function useChangeFinancialMovement() {
  const client = useQueryClient();
  const attempt = useRef<{ input: string; key: string } | null>(null);
  return useMutation({
    retry: false,
    mutationFn: (input: FinancialChangeInput) => {
      const serialized = JSON.stringify(input);
      if (!attempt.current || attempt.current.input !== serialized) {
        attempt.current = { input: serialized, key: generateIdempotencyKey() };
      }
      return services.financialMovements.change(input, attempt.current.key);
    },
    onMutate: input => logMutation('change_financial_movement', 'start', { input }),
    onSuccess: async result => {
      logMutation('change_financial_movement', 'success', result);
      attempt.current = null;
      await Promise.all([
        FINANCIAL_MOVEMENTS_KEY, ['deliveries'], ['payments'], ['balance'], ['analytics'], ['reports'],
        ['admin', 'branches'], ['admin', 'branch-hub', 'details'], ['admin', 'branch-movements'],
      ].map(queryKey => client.invalidateQueries({ queryKey })));
    },
    onError: error => logMutation('change_financial_movement', 'error', error),
  });
}
