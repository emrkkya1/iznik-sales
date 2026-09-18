import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { services } from '@/services';
import type {
  ActivateBranchProductInput,
  CatalogProduct,
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

export function useCatalogProducts(includeArchived = false) {
  return useQuery({
    queryKey: ['catalog-products', includeArchived],
    queryFn: instrumentQuery(
      'list_catalog_products',
      () => services.products.listCatalogProducts(includeArchived),
      summarizeResult,
    ),
    staleTime: TRANSACTIONAL_STALE_MS,
  });
}

function invalidateCatalogProducts(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['catalog-products'] });
  queryClient.invalidateQueries({ queryKey: ['products'] });
  queryClient.invalidateQueries({ queryKey: ['branch-products-with-status'] });
}

export function useCreateCatalogProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Pick<CatalogProduct, 'name' | 'defaultPrice'>) =>
      services.products.createCatalogProduct(input),
    onMutate: (input) => logMutation('create_catalog_product', 'start', input),
    onSuccess: (id) => {
      logMutation('create_catalog_product', 'success', { id });
      invalidateCatalogProducts(queryClient);
    },
    onError: (error) => logMutation('create_catalog_product', 'error', error),
  });
}

export function useSetCatalogProductDefaultPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, defaultPrice }: { productId: string; defaultPrice: number }) =>
      services.products.setCatalogProductDefaultPrice(productId, defaultPrice),
    onMutate: (input) => logMutation('set_catalog_product_default_price', 'start', input),
    onSuccess: (_data, input) => {
      logMutation('set_catalog_product_default_price', 'success', { id: input.productId });
      invalidateCatalogProducts(queryClient);
    },
    onError: (error) => logMutation('set_catalog_product_default_price', 'error', error),
  });
}

export function useSetCatalogProductArchived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, archived }: { productId: string; archived: boolean }) =>
      services.products.setCatalogProductArchived(productId, archived),
    onMutate: (input) => logMutation('set_catalog_product_archived', 'start', input),
    onSuccess: (_data, input) => {
      logMutation('set_catalog_product_archived', 'success', { id: input.productId, archived: input.archived });
      invalidateCatalogProducts(queryClient);
    },
    onError: (error) => logMutation('set_catalog_product_archived', 'error', error),
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
