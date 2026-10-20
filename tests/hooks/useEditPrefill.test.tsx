// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PrefillDelivery = {
  id: string; branchId: string; date: string;
  items: { productId: string; deliveredQuantity: number; returnedQuantity: number }[];
  payments: { amount: number; deletedAt: string | null }[];
};
const queries = vi.hoisted(() => ({
  delivery: { data: undefined as PrefillDelivery | undefined, isError: false },
  branch: { data: undefined as { id: string; cityId: string; districtId: string } | undefined, isError: false },
}));
vi.mock('@/hooks/useDeliveries', () => ({ useDelivery: () => queries.delivery }));
vi.mock('@/hooks/useLocations', () => ({ useBranchLocation: () => queries.branch }));

import { useEditPrefill } from '@/hooks/useEditPrefill';
import { useReceiptDraftStore } from '@/store/receiptDraft';

const branch = { id: 'branch', cityId: 'city', districtId: 'district' };
const delivery: PrefillDelivery = {
  id: 'delivery', branchId: 'branch', date: '2026-10-19',
  items: [{ productId: 'bread', deliveredQuantity: 5, returnedQuantity: 1 }],
  payments: [{ amount: 10, deletedAt: null }, { amount: 90, deletedAt: '2026-10-19' }],
};

beforeEach(() => {
  useReceiptDraftStore.getState().clear();
  queries.delivery = { data: undefined, isError: false };
  queries.branch = { data: undefined, isError: false };
});
afterEach(cleanup);

describe('edit prefill identity and readiness', () => {
  it('isolates the old draft and stays unready until matching delivery and location arrive', () => {
    const store = useReceiptDraftStore.getState();
    store.applyPath(branchPath()); store.setDelivered('old', 20); store.setPaymentAmount(50);
    store.beginEdit('delivery');
    expect(useReceiptDraftStore.getState()).toMatchObject({ branchId: null, entries: {}, paymentAmount: 0, prefilledDeliveryId: null });
    const hook = renderHook(() => useEditPrefill('delivery'));
    expect(hook.result.current.isReady).toBe(false);
    queries.delivery.data = delivery;
    hook.rerender();
    expect(hook.result.current.isReady).toBe(false);
    queries.branch.data = { ...branch, id: 'wrong' };
    hook.rerender();
    expect(hook.result.current.isReady).toBe(false);
    const changes = vi.fn();
    const unsubscribe = useReceiptDraftStore.subscribe(changes);
    queries.branch.data = branch;
    hook.rerender();
    expect(hook.result.current.isReady).toBe(true);
    expect(changes).toHaveBeenCalledOnce();
    expect(useReceiptDraftStore.getState()).toMatchObject({ ...branchPath(), date: delivery.date,
      entries: { bread: { delivered: 5, returned: 1 } }, paymentAmount: 10, prefilledDeliveryId: 'delivery' });
    unsubscribe();
  });

  it('does not publish stale responses after target switch or cancellation', () => {
    useReceiptDraftStore.getState().beginEdit('delivery');
    const hook = renderHook(({ id }) => useEditPrefill(id), { initialProps: { id: 'delivery' as string | null } });
    act(() => useReceiptDraftStore.getState().beginEdit('new'));
    queries.delivery.data = delivery;
    queries.branch.data = branch;
    hook.rerender({ id: 'new' });
    expect(hook.result.current.isReady).toBe(false);
    expect(useReceiptDraftStore.getState().entries).toEqual({});
    act(() => useReceiptDraftStore.getState().clear());
    hook.rerender({ id: 'delivery' });
    expect(hook.result.current.isReady).toBe(false);
    expect(useReceiptDraftStore.getState().editingDeliveryId).toBeNull();
  });

  it('never replaces a dirty prefilled form on refetch or another home mount', () => {
    useReceiptDraftStore.getState().beginEdit('delivery');
    queries.delivery.data = delivery; queries.branch.data = branch;
    const first = renderHook(() => useEditPrefill('delivery'));
    expect(first.result.current.isReady).toBe(true);
    act(() => useReceiptDraftStore.getState().setDelivered('bread', 42));
    queries.delivery.data = { ...delivery };
    first.rerender();
    const second = renderHook(() => useEditPrefill('delivery'));
    expect(second.result.current.isReady).toBe(true);
    expect(useReceiptDraftStore.getState().entries.bread.delivered).toBe(42);
  });

  it('keeps loading failures unready instead of accepting an old draft', () => {
    useReceiptDraftStore.getState().beginEdit('delivery');
    queries.delivery.isError = true;
    const hook = renderHook(() => useEditPrefill('delivery'));
    expect(hook.result.current.isReady).toBe(false);
    expect(hook.result.current.delivery.isError).toBe(true);
  });
});

function branchPath() {
  return { branchId: branch.id, cityId: branch.cityId, districtId: branch.districtId };
}
