// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSetCatalogProductDefaultPrice } from '@/hooks/useProducts';

const mocks = vi.hoisted(() => ({ setPrice: vi.fn(), log: vi.fn() }));
vi.mock('@/services', () => ({ services: { products: { setCatalogProductDefaultPrice: mocks.setPrice } } }));
vi.mock('@/utils/logger', () => ({ logMutation: mocks.log, instrumentQuery: vi.fn() }));
afterEach(cleanup);
beforeEach(() => { mocks.setPrice.mockReset(); mocks.log.mockReset(); });
function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { wrapper, invalidate };
}
describe('catalog price mutation', () => {
  it.each([true, false, undefined])('passes propagation %s and refreshes catalog and branch prices', async updateBranches => {
    mocks.setPrice.mockResolvedValue(undefined);
    const { wrapper, invalidate } = setup();
    const { result } = renderHook(useSetCatalogProductDefaultPrice, { wrapper });
    const input = { productId: 'product', defaultPrice: 55, updateBranches };
    await act(async () => { await result.current.mutateAsync(input); });
    expect(mocks.setPrice).toHaveBeenCalledWith('product', 55, updateBranches ?? false);
    for (const queryKey of [['catalog-products'], ['products'], ['branch-products-with-status']]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
    expect(mocks.log).toHaveBeenCalledWith('set_catalog_product_default_price', 'start', input);
    expect(mocks.log).toHaveBeenCalledWith('set_catalog_product_default_price', 'success', { id: 'product' });
  });
  it('logs failures and does not invalidate on failed propagation', async () => {
    const error = new Error('Not authorized'); mocks.setPrice.mockRejectedValue(error);
    const { wrapper, invalidate } = setup(); const { result } = renderHook(useSetCatalogProductDefaultPrice, { wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ productId: 'product', defaultPrice: 55, updateBranches: true })).rejects.toThrow('Not authorized'); });
    expect(mocks.log).toHaveBeenCalledWith('set_catalog_product_default_price', 'error', error);
    expect(invalidate).not.toHaveBeenCalled();
  });
});
