// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialMovementEditor } from './FinancialMovementEditor';
import { FinancialMovementDetailSheet } from './FinancialMovementDetailSheet';
import type { CurrentFinancialMovement, FinancialEvent } from '@/services/supabase/financialMovementSchema';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), pending: false, failed: false, loading: false, queryError: false, data: null as CurrentFinancialMovement | null }));
vi.mock('react-native', () => ({ useWindowDimensions: () => ({ width: 1024, height: 600 }) }));
vi.mock('@/hooks/useFinancialMovements', () => ({
  useCurrentFinancialMovement: () => ({ data: mocks.data, isLoading: mocks.loading, isError: mocks.queryError, refetch: vi.fn() }),
  useChangeFinancialMovement: () => ({ mutate: mocks.mutate, isPending: mocks.pending, isError: mocks.failed, error: new Error('Bu hareket değişti.') }),
}));
vi.mock('@/hooks/useProducts', () => ({ useBranchProducts: () => ({ data: [], isLoading: false, isFetching: false, isError: false }) }));
vi.mock('@/components/ui/bottom-sheet', () => ({ BottomSheet: ({ children, title, onClose }: PropsWithChildren<{ title: string; onClose: () => void }>) => <div><h1>{title}</h1><button onClick={onClose}>Kapat</button>{children}</div> }));
vi.mock('@/components/ui/box', () => ({ Box: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/vstack', () => ({ VStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/hstack', () => ({ HStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/text', () => ({ Text: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, disabled, onPress }: PropsWithChildren<{ disabled?: boolean; onPress: () => void }>) => <button disabled={disabled} onClick={onPress}>{children}</button>, ButtonText: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/input', () => ({ Input: ({ children }: PropsWithChildren) => <div>{children}</div>, InputField: ({ value, onChangeText, accessibilityLabel, editable }: { value: string; onChangeText: (value: string) => void; accessibilityLabel: string; editable: boolean }) => <input aria-label={accessibilityLabel} value={value} onChange={e => onChangeText(e.target.value)} disabled={!editable} /> }));
vi.mock('@/components/ui/date-field', () => ({ DateField: ({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) => <input aria-label="İşlem tarihi" value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled} /> }));
vi.mock('@/components/ui/dropdown', () => ({ Dropdown: ({ value, onChange, options, disabled }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled: boolean }) => <select aria-label="Ödeme Tipi" value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }));
vi.mock('@/components/ui/spinner', () => ({ Spinner: () => <span>Yükleniyor</span> }));
vi.mock('@/components/ui/query-error', () => ({ QueryError: () => <span>Yüklenemedi</span> }));

const id = '00000000-0000-4000-8000-000000000001';
const event: FinancialEvent = { id, recordId: id, kind: 'payment', action: 'create', branchId: id, branchName: 'Şube A', actorName: 'Emre', actorRole: 'admin', occurredAt: '2026-10-12T12:00:00Z', before: null, after: null, reason: null, legacy: false, canManage: true };
const initial: CurrentFinancialMovement = { version: 'a'.repeat(32), snapshot: { date: '2026-10-12', amount: 10, deleted: false, paymentType: 'field_collection', items: [], payments: [] } };
beforeEach(() => { mocks.mutate.mockReset(); mocks.pending = false; mocks.failed = false; mocks.loading = false; mocks.queryError = false; mocks.data = initial; });
afterEach(cleanup);

describe('financial movement editor and details', () => {
  it('prefills the current payment and submits the captured version only once', () => {
    render(<FinancialMovementEditor event={event} action="edit" onClose={vi.fn()} />);
    expect((screen.getByLabelText('Tahsilat miktarı') as HTMLInputElement).value).toBe('10');
    fireEvent.change(screen.getByLabelText('Tahsilat miktarı'), { target: { value: '12,25' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bank_transfer' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(mocks.mutate).toHaveBeenCalledWith({ kind: 'payment', id, action: 'edit', version: initial.version, patch: { date: initial.snapshot.date, amount: 12.25, paymentType: 'bank_transfer' } }, expect.any(Object));
  });
  it('blocks malformed amounts and allows cancelling without any mutation', () => {
    const close = vi.fn(); render(<FinancialMovementEditor event={event} action="edit" onClose={close} />);
    fireEvent.change(screen.getByLabelText('Tahsilat miktarı'), { target: { value: '-10' } });
    expect((screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(close).toHaveBeenCalledOnce(); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('announces a changed save only after success, not for cancellation or an unchanged save', () => {
    const saved = vi.fn(); const close = vi.fn();
    render(<FinancialMovementEditor event={event} action="edit" onClose={close} onSaved={saved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(saved).not.toHaveBeenCalled();
    const callbacks = mocks.mutate.mock.calls[0][1];
    callbacks.onSuccess({ changed: false });
    expect(close).toHaveBeenCalledOnce(); expect(saved).not.toHaveBeenCalled();
    callbacks.onSuccess({ changed: true });
    expect(saved).toHaveBeenCalledOnce();
  });
  it('requires a deletion reason and explains delivery plus linked collection deletion', () => {
    render(<FinancialMovementEditor event={{ ...event, kind: 'delivery' }} action="delete" onClose={vi.fn()} />);
    expect(screen.getByText(/Teslimat ve bağlı tahsilatları silinecek/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Sil' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Silme nedeni'), { target: { value: '  Yanlış kayıt  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sil' }));
    expect(mocks.mutate).toHaveBeenCalledWith({ kind: 'delivery', id, action: 'delete', version: initial.version, patch: { reason: 'Yanlış kayıt' } }, expect.any(Object));
  });
  it('keeps dirty fields and the original version if background data changes', () => {
    const { rerender } = render(<FinancialMovementEditor event={event} action="edit" onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Tahsilat miktarı'), { target: { value: '25' } });
    mocks.data = { version: 'b'.repeat(32), snapshot: { ...initial.snapshot, amount: 99 } };
    rerender(<FinancialMovementEditor event={event} action="edit" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(mocks.mutate.mock.calls[0][0]).toMatchObject({ version: initial.version, patch: { amount: 25 } });
  });
  it('prevents dismissing a pending mutation and shows clear failures', () => {
    mocks.pending = true; mocks.failed = true; const close = vi.fn();
    render(<FinancialMovementEditor event={event} action="edit" onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByText('Bu hareket değişti.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Kaydediliyor…' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('uses immutable before/after snapshots and prominently shows the actor', () => {
    render(<FinancialMovementDetailSheet event={{ ...event, action: 'edit', before: initial.snapshot, after: { ...initial.snapshot, amount: 20 } }} onClose={vi.fn()} />);
    expect(screen.getByText('Önce')).toBeTruthy(); expect(screen.getByText('Sonra')).toBeTruthy();
    expect(screen.getByText('Emre · Admin')).toBeTruthy(); expect(screen.getByText('Değişen alanlar: Tutar')).toBeTruthy();
  });
  it('labels incomplete legacy details instead of claiming a reconstructed after state', () => {
    render(<FinancialMovementDetailSheet event={{ ...event, legacy: true, action: 'edit', before: initial.snapshot, after: null }} onClose={vi.fn()} />);
    expect(screen.getByText(/Ürün detayları ve işlem sonrası durum bilinmiyor/)).toBeTruthy(); expect(screen.queryByText('Sonra')).toBeNull();
  });
  it('covers loading and query failures without opening an editable stale record', () => {
    mocks.loading = true;
    const { rerender } = render(<FinancialMovementEditor event={event} action="edit" onClose={vi.fn()} />);
    expect(screen.getByText('Yükleniyor')).toBeTruthy();
    mocks.loading = false; mocks.queryError = true;
    rerender(<FinancialMovementEditor event={event} action="edit" onClose={vi.fn()} />);
    expect(screen.getByText('Yüklenemedi')).toBeTruthy(); expect(screen.queryByLabelText('Tahsilat miktarı')).toBeNull();
  });
});
