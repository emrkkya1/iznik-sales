// @vitest-environment happy-dom
import type { PropsWithChildren, ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinancialEvent } from '@/services/supabase/financialMovementSchema';
import { AllMovementsScreen } from './AllMovementsScreen';

const mocks = vi.hoisted(() => ({ rows: [] as FinancialEvent[], scroll: vi.fn() }));
vi.mock('expo-router', () => ({ useRouter: () => ({ back: vi.fn() }) }));
vi.mock('@/hooks/useFinancialMovements', () => ({ useFinancialMovements: () => ({ data: { pages: [{ rows: mocks.rows }] }, isLoading: false, isError: false, hasNextPage: false, refetch: vi.fn() }) }));
vi.mock('react-native', async () => {
  const { forwardRef, useImperativeHandle } = await import('react');
  return {
    View: forwardRef(function View({ children }: PropsWithChildren, ref) {
      useImperativeHandle(ref, () => ({ measureInWindow: (callback: (x: number, y: number, width: number, height: number) => void) => callback(0, 100, 40, 40) }));
      return <div>{children}</div>;
    }),
    FlatList: forwardRef(function FlatList({ data, renderItem, keyExtractor, ListHeaderComponent, ListFooterComponent }: {
      data: FinancialEvent[]; renderItem: (input: { item: FinancialEvent }) => ReactNode;
      keyExtractor: (item: FinancialEvent) => string; ListHeaderComponent: ReactNode; ListFooterComponent: ReactNode;
    }, ref) {
      useImperativeHandle(ref, () => ({ scrollToOffset: mocks.scroll }));
      return <div>{ListHeaderComponent}{data.map(item => <div key={keyExtractor(item)} data-testid={`event-${item.id}`}>{renderItem({ item })}</div>)}{ListFooterComponent}</div>;
    }),
  };
});
vi.mock('@/components/admin/ActionMenu', () => ({ ActionMenu: ({ open, items, onClose }: { open: boolean; items: { label: string; onPress: () => void }[]; onClose: () => void }) => open ? <div>{items.map(item => <button key={item.label} onClick={() => { item.onPress(); onClose(); }}>{item.label}</button>)}</div> : null }));
vi.mock('@/components/admin/FinancialMovementEditor', () => ({ FinancialMovementEditor: ({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) => <button onClick={() => { onClose(); onSaved(); }}>Save editor</button> }));
vi.mock('@/components/admin/FinancialMovementDetailSheet', () => ({ FinancialMovementDetailSheet: () => <div>Movement details</div> }));
vi.mock('@/components/ui/box', () => ({ Box: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/hstack', () => ({ HStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/vstack', () => ({ VStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/text', () => ({ Text: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/pressable', () => ({ Pressable: ({ children, accessibilityLabel, onPress }: PropsWithChildren<{ accessibilityLabel: string; onPress: () => void }>) => <button aria-label={accessibilityLabel} onClick={onPress}>{children}</button> }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, onPress }: PropsWithChildren<{ onPress: () => void }>) => <button onClick={onPress}>{children}</button>, ButtonText: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/icon', () => ({ Icon: ({ as }: { as: string }) => <span data-testid={`icon-${as}`} />, TruckIcon: 'truck', BanknoteIcon: 'banknote', EditIcon: 'pen', ArchiveIcon: 'delete', MoreVerticalIcon: 'menu', ChevronLeftIcon: 'back' }));
vi.mock('@/components/ui/empty-state', () => ({ EmptyState: () => null }));
vi.mock('@/components/ui/query-error', () => ({ QueryError: () => null }));
vi.mock('@/components/ui/spinner', () => ({ Spinner: () => null }));

const snapshot = { date: '2026-10-12', amount: 20, deleted: false, items: [], payments: [] };
const base: FinancialEvent = { id: 'original', recordId: 'record', kind: 'delivery', action: 'create', branchId: null, branchName: 'Şube A', actorName: 'Emre', actorRole: 'admin', occurredAt: '2026-10-12T12:00:00Z', before: null, after: snapshot, reason: null, legacy: false, canManage: true };
afterEach(cleanup);
beforeEach(() => { mocks.scroll.mockReset(); mocks.rows = [base]; });

describe('AllMovementsScreen history rows', () => {
  it('shows the Istanbul timestamp while keeping the delivery business date unchanged', () => {
    mocks.rows = [{ ...base, occurredAt: '2026-10-12T21:15:00Z' }];
    render(<AllMovementsScreen />);
    expect(screen.getByTestId('event-original').textContent).toContain('13.10.2026 00:15:00');
    expect(screen.getByTestId('event-original').textContent).toContain('Tarih: 12.10.2026');
  });
  it('updates the original row while displaying separate pen/deletion rows for the same record', () => {
    mocks.rows = [
      { ...base, id: 'deleted', action: 'delete', before: { ...snapshot, amount: 30 }, after: { ...snapshot, amount: 30, deleted: true }, canManage: false },
      { ...base, id: 'edited', action: 'edit', before: snapshot, after: { ...snapshot, amount: 30 }, canManage: false },
      { ...base, after: { ...snapshot, amount: 30, deleted: true }, canManage: false },
    ];
    render(<AllMovementsScreen />);
    expect(screen.getByTestId('event-original').textContent).toContain('₺30,00');
    expect(screen.getByTestId('event-edited').textContent).toContain('₺20,00 → ₺30,00');
    expect(screen.getByTestId('event-edited').textContent).toContain('Teslimat düzenlendi');
    expect(screen.getByTestId('event-deleted').textContent).toContain('Teslimat silindi');
    expect(screen.getByTestId('icon-pen')).toBeTruthy();
    expect(screen.getByTestId('icon-delete')).toBeTruthy();
    expect(screen.getByTestId('icon-truck')).toBeTruthy();
  });
  it('deduplicates pagination overlap by event ID, never by underlying record ID', () => {
    mocks.rows = [base, { ...base, id: 'edit1', action: 'edit' }, { ...base, id: 'edit2', action: 'edit' }, base];
    render(<AllMovementsScreen />);
    expect(screen.getAllByTestId('event-original')).toHaveLength(1);
    expect(screen.getByTestId('event-edit1')).toBeTruthy(); expect(screen.getByTestId('event-edit2')).toBeTruthy();
  });
  it('scrolls to the newest event after saving and keeps menu taps separate from detail taps', () => {
    render(<AllMovementsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Şube A hareket seçenekleri' }));
    expect(screen.queryByText('Movement details')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Düzenle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save editor' }));
    expect(mocks.scroll).toHaveBeenCalledWith({ offset: 0, animated: true });
  });
  it('clearly labels old audit entries as historical rather than marking the original as edited', () => {
    mocks.rows = [{ ...base, id: 'legacy-edit', action: 'edit', legacy: true }, { ...base, action: 'baseline', legacy: true }];
    render(<AllMovementsScreen />);
    expect(screen.getByText('Teslimat düzenlendi · Geçmiş')).toBeTruthy();
    expect(screen.getByText('Teslimat · Önceki kayıt')).toBeTruthy();
  });
  it('does not offer deletion from a pen-icon history row', () => {
    mocks.rows = [{ ...base, id: 'edit', action: 'edit' }];
    render(<AllMovementsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Şube A hareket seçenekleri' }));
    expect(screen.getByRole('button', { name: 'Düzenle' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sil' })).toBeNull();
  });
  it('still offers deletion from the original financial movement row', () => {
    render(<AllMovementsScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Şube A hareket seçenekleri' }));
    expect(screen.getByRole('button', { name: 'Sil' })).toBeTruthy();
  });
});
