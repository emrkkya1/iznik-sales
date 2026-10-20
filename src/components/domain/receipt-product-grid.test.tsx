// @vitest-environment happy-dom
import type { PropsWithChildren, ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchProductWithPrice } from '@/types';
import { ReceiptProductGrid } from './receipt-product-grid';
import { useReceiptDraftStore } from '@/store/receiptDraft';

const renders = vi.hoisted(() => vi.fn());
vi.mock('react-native', () => ({ FlatList: ({ data, renderItem }: { data: BranchProductWithPrice[]; renderItem: (props: { item: BranchProductWithPrice }) => ReactNode }) => <div>{data.map(item => <div key={item.productId}>{renderItem({ item })}</div>)}</div> }));
vi.mock('@/components/ui/box', () => ({ Box: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('./product-card', () => ({ ProductCard: ({ name, delivered, returned, onDeliveredChange, onReturnedChange }: {
  name: string; delivered: number; returned: number; onDeliveredChange: (quantity: number) => void; onReturnedChange: (quantity: number) => void;
}) => {
  renders(name);
  return <div><button onClick={() => onDeliveredChange(delivered + 1)}>{name} deliver {delivered}</button><button onClick={() => onReturnedChange(returned + 1)}>{name} return {returned}</button></div>;
} }));

const products: BranchProductWithPrice[] = ['Bread', 'Roll'].map(name => ({
  id: name, branchId: 'branch', productId: name, isActive: true, productName: name, productImageUrl: null, currentPrice: 10,
}));
function Parent() {
  const draft = useReceiptDraftStore();
  return <><span>{draft.paymentAmount}</span><ReceiptProductGrid products={products} columns={3} cardWidth={200} /></>;
}
beforeEach(() => { useReceiptDraftStore.getState().clear(); renders.mockClear(); });
afterEach(cleanup);

describe('receipt product cell subscriptions', () => {
  it('only rerenders the edited product even when the parent subscribes to the whole draft', () => {
    render(<Parent />);
    renders.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Bread deliver 0' }));
    expect(renders.mock.calls).toEqual([['Bread']]);
    expect(useReceiptDraftStore.getState().entries.Bread.delivered).toBe(1);
    renders.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Roll return 0' }));
    expect(renders.mock.calls).toEqual([['Roll']]);
    expect(useReceiptDraftStore.getState().entries.Roll.returned).toBe(1);
  });
  it('does not rerender cards for unrelated payment changes and resets cells when entries clear', () => {
    render(<Parent />);
    renders.mockClear();
    act(() => useReceiptDraftStore.getState().setPaymentAmount(20));
    expect(renders).not.toHaveBeenCalled();
    act(() => useReceiptDraftStore.getState().setDelivered('Bread', 4));
    renders.mockClear();
    act(() => useReceiptDraftStore.getState().setDate('2026-10-20'));
    expect(renders.mock.calls).toEqual([['Bread']]);
    expect(screen.getByRole('button', { name: 'Bread deliver 0' })).toBeTruthy();
  });
});
