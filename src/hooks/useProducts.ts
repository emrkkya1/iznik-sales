import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { services } from '@/services';
import type {
  ActivateBranchProductInput,
  SetBranchProductActiveInput,
  SetBranchProductPriceInput,
} from '@/types';
import { instrumentQuery, logMutation, summarizeResult } from '@/utils/logger';

const TRANSACTIONAL_STALE_MS = 60_000;

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: instrumentQuery('list_products', () => services.products.listProducts(), summarizeResult),
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function useBranchProducts(branchId: string | null, date: string) {
  return useQuery({
    queryKey: ['branch-products', branchId, date],
    queryFn: instrumentQuery(
      'list_branch_products',
      () => services.products.listBranchProducts(branchId as string, date),
    ),
    enabled: !!branchId,
  });
}

// PR-6.2 — Branch Hub Ürünler & Fiyatlar tab
export function useBranchProductsWithStatus(branchId: string | null) {
  return useQuery({
    queryKey: ['branch-products-with-status', branchId],
    queryFn: instrumentQuery(
      'list_branch_products_with_status',
      () => services.products.listBranchProductsWithStatus(branchId as string),
      summarizeResult,
    ),
    enabled: !!branchId,
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

export function useSetBranchProductPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetBranchProductPriceInput) =>
      services.products.setBranchProductPrice(input),
    onMutate: (input) =>
      logMutation('set_branch_product_price', 'start', { bp: input.branchProductId }),
    onSuccess: (_data, input) => {
      logMutation('set_branch_product_price', 'success', { bp: input.branchProductId });
      queryClient.invalidateQueries({ queryKey: ['branch-products-with-status'] });
      queryClient.invalidateQueries({ queryKey: ['branch-products'] });
    },
    onError: (error) => logMutation('set_branch_product_price', 'error', error),
  });
}

export function useSetBranchProductActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SetBranchProductActiveInput) =>
      services.products.setBranchProductActive(input),
    onMutate: (input) =>
      logMutation('set_branch_product_active', 'start', { bp: input.branchProductId }),
    onSuccess: (_data, input) => {
      logMutation('set_branch_product_active', 'success', { bp: input.branchProductId });
      queryClient.invalidateQueries({ queryKey: ['branch-products-with-status'] });
    },
    onError: (error) => logMutation('set_branch_product_active', 'error', error),
  });
}

export function useActivateBranchProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ActivateBranchProductInput) =>
      services.products.activateBranchProduct(input),
    onMutate: (input) =>
      logMutation('activate_branch_product', 'start', { p: input.productId }),
    onSuccess: (_data, input) => {
      logMutation('activate_branch_product', 'success', { p: input.productId });
      queryClient.invalidateQueries({ queryKey: ['branch-products-with-status'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'branch-hub', 'details'] });
    },
    onError: (error) => logMutation('activate_branch_product', 'error', error),
  });
}
