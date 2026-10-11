// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listCities = vi.fn();
const listDistricts = vi.fn();
const listBranches = vi.fn();
const listProducts = vi.fn();
const listBranchProducts = vi.fn();
const listDeliveriesWithPayments = vi.fn();
const instrumentQuery = vi.fn((_name: string, fn: () => unknown) => fn);

vi.mock('@/services', () => ({
  services: {
    locations: {
      listCities: () => listCities(), listDistricts: (id: string) => listDistricts(id),
      listBranches: (id: string) => listBranches(id), getBranch: vi.fn(),
    },
    products: {
      listProducts: () => listProducts(),
      listBranchProducts: (branchId: string, date: string) => listBranchProducts(branchId, date),
    },
    adminLocations: {
      listDeliveriesWithPayments: (branchId: string, limit: number, offset: number) =>
        listDeliveriesWithPayments(branchId, limit, offset),
    },
  },
}));
vi.mock('@/utils/logger', () => ({
  instrumentQuery: (name: string, fn: () => unknown) => instrumentQuery(name, fn),
  summarizeResult: vi.fn(),
}));

import { useBranchMovementsInfinite } from '@/hooks/useAdminLocations';
import { useBranches, useCities, useDistricts } from '@/hooks/useLocations';
import { useBranchProducts, useProducts } from '@/hooks/useProducts';

function wrapper({ children }: PropsWithChildren) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('query hook contracts', () => {
  beforeEach(() => {
    listCities.mockReset(); listDistricts.mockReset(); listBranches.mockReset(); listProducts.mockReset();
    listBranchProducts.mockReset(); listDeliveriesWithPayments.mockReset(); instrumentQuery.mockClear();
  });

  it('does not fetch dependent locations or products without their required id', () => {
    renderHook(() => useDistricts(null), { wrapper });
    renderHook(() => useBranches(null), { wrapper });
    renderHook(() => useBranchProducts(null, '2026-09-19'), { wrapper });
    expect(listDistricts).not.toHaveBeenCalled();
    expect(listBranches).not.toHaveBeenCalled();
    expect(listBranchProducts).not.toHaveBeenCalled();
  });

  it('uses the expected RPC names and input keys for independent queries', async () => {
    listCities.mockResolvedValue([{ id: 'city-1' }]);
    listProducts.mockResolvedValue([{ id: 'product-1' }]);
    const cities = renderHook(() => useCities(), { wrapper });
    const products = renderHook(() => useProducts(), { wrapper });
    await waitFor(() => expect(cities.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(products.result.current.isSuccess).toBe(true));
    expect(instrumentQuery).toHaveBeenCalledWith('list_cities', expect.any(Function));
    expect(instrumentQuery).toHaveBeenCalledWith('list_products', expect.any(Function));
  });

  it('uses offset pagination for subsequent movement pages', async () => {
    listDeliveriesWithPayments.mockResolvedValueOnce([{ id: 'one' }, { id: 'two' }]).mockResolvedValueOnce([{ id: 'three' }]);
    const hook = renderHook(() => useBranchMovementsInfinite('branch-1', 2), { wrapper });
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(listDeliveriesWithPayments).toHaveBeenCalledWith('branch-1', 2, 0);
    await act(async () => { await hook.result.current.fetchNextPage(); });
    expect(listDeliveriesWithPayments).toHaveBeenLastCalledWith('branch-1', 2, 2);
  });
});
