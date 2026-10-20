// @vitest-environment happy-dom
import type { PropsWithChildren, ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MovementRow } from '@/types';
import { MovementsTab } from './MovementsTab';

const query = vi.hoisted(() => ({
  data: { pages: [] as MovementRow[][] }, isLoading: false, isError: false, isFetching: false,
  isFetchingNextPage: false, hasNextPage: true, fetchNextPage: vi.fn(), refetch: vi.fn(),
}));
const list = vi.hoisted(() => vi.fn());
vi.mock('@/hooks', () => ({ useBranchMovementsInfinite: () => query }));
vi.mock('react-native', () => ({ FlatList: (props: {
  data: MovementRow[]; renderItem: (props: { item: MovementRow }) => ReactNode;
  ListHeaderComponent: ReactNode; ListEmptyComponent: ReactNode; ListFooterComponent: ReactNode;
}) => {
  list(props);
  return <div>{props.ListHeaderComponent}{props.data.length ? props.data.slice(0, 3).map(item => <div key={item.id}>{props.renderItem({ item })}</div>) : props.ListEmptyComponent}{props.ListFooterComponent}</div>;
} }));
vi.mock('@/components/ui/box', () => ({ Box: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/hstack', () => ({ HStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/vstack', () => ({ VStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/text', () => ({ Text: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/amount', () => ({ Amount: ({ value }: { value: number }) => <span>{value}</span> }));
vi.mock('@/components/ui/icon', () => ({ Icon: () => null, BanknoteIcon: 'cash', TruckIcon: 'truck' }));
vi.mock('@/components/ui/pressable', () => ({ Pressable: ({ children, onPress }: PropsWithChildren<{ onPress: () => void }>) => <button onClick={onPress}>{children}</button> }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, onPress, disabled }: PropsWithChildren<{ onPress: () => void; disabled: boolean }>) => <button disabled={disabled} onClick={onPress}>{children}</button>, ButtonText: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/query-error', () => ({ QueryError: ({ onRetry }: { onRetry: () => void }) => <button onClick={onRetry}>Retry</button> }));
vi.mock('@/components/ui/spinner', () => ({ Spinner: () => <span>Loading</span> }));
vi.mock('@/components/ui/empty-state', () => ({ EmptyState: () => <span>Empty</span> }));
vi.mock('@/components/admin/MovementDetailSheet', () => ({ MovementDetailSheet: ({ item }: { item: MovementRow | null }) => item ? <span>Details {item.id}</span> : null }));

beforeEach(() => {
  Object.assign(query, { data: { pages: [] }, isLoading: false, isError: false, isFetching: false, isFetchingNextPage: false, hasNextPage: true });
  query.fetchNextPage.mockReset().mockResolvedValue(undefined); query.refetch.mockReset(); list.mockClear();
});
afterEach(cleanup);

describe('virtualized branch movements', () => {
  it('delegates all rows to the list window, keeps its header, and opens row details', () => {
    query.data.pages = [Array.from({ length: 500 }, (_, id): MovementRow => ({
      id: String(id), kind: 'delivery', date: '2026-10-19', amount: 10, isDeleted: false, createdAt: '2026-10-19T00:00:00Z', payment: null,
    }))];
    render(<MovementsTab branchId="branch" header={<span>Branch header</span>} />);
    expect(list.mock.calls[0][0].data).toHaveLength(500);
    expect(screen.getByText('Branch header')).toBeTruthy();
    expect(screen.getAllByRole('button').filter(button => button.textContent?.includes('Teslimat'))).toHaveLength(3);
    fireEvent.click(screen.getAllByRole('button')[0]);
    expect(screen.getByText('Details 0')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Daha Fazla/ }));
    expect(query.fetchNextPage).toHaveBeenCalledWith({ cancelRefetch: false });
  });
  it('keeps the header during loading/failure and blocks pagination during refresh', () => {
    query.isLoading = true;
    const view = render(<MovementsTab branchId="branch" header={<span>Branch header</span>} />);
    expect(screen.getByText('Loading')).toBeTruthy();
    expect(screen.getByText('Branch header')).toBeTruthy();
    query.isLoading = false; query.isError = true;
    view.rerender(<MovementsTab branchId="branch" />);
    fireEvent.click(screen.getByText('Retry'));
    expect(query.refetch).toHaveBeenCalledOnce();
    query.isError = false; query.isFetching = true;
    view.rerender(<MovementsTab branchId="branch" />);
    fireEvent.click(screen.getByRole('button', { name: /Daha Fazla/ }));
    expect(query.fetchNextPage).not.toHaveBeenCalled();
  });
});
