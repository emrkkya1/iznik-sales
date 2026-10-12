// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloseReceivablesSheet } from './CloseReceivablesSheet';

const mutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null as Error | null }));
vi.mock('@/hooks/useCloseReceivables', () => ({ useCloseReceivables: () => mutation }));
vi.mock('@/utils/dates', () => ({ getIstanbulToday: () => '2026-10-12' }));
vi.mock('react-native', () => ({ ScrollView: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/sheet', () => ({ Sheet: ({ children, title, onClose }: PropsWithChildren<{ title: string; onClose: () => void }>) => <div><h1>{title}</h1><button onClick={onClose}>Kapat</button>{children}</div> }));
vi.mock('@/components/ui/box', () => ({ Box: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/vstack', () => ({ VStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/hstack', () => ({ HStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/text', () => ({ Text: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, disabled, onPress }: PropsWithChildren<{ disabled?: boolean; onPress: () => void }>) => <button disabled={disabled} onClick={onPress}>{children}</button>,
  ButtonText: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock('@/components/ui/dropdown', () => ({ Dropdown: ({ value, onChange, options, disabled }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled: boolean }) => <select aria-label="Ödeme Tipi" value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }));

const branches = [{ branchId: 'a', name: 'Şube A', amount: 10.25 }, { branchId: 'b', name: 'Şube B', amount: 20.5 }];
afterEach(cleanup);
beforeEach(() => { mutation.mutate.mockReset(); mutation.isPending = false; mutation.isError = false; mutation.error = null; });

describe('CloseReceivablesSheet', () => {
  it('lists positive receivables, the skipped count, and the exact total before asking for confirmation', () => {
    render(<CloseReceivablesSheet branches={branches} skippedCount={2} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Emin misiniz?' })).toBeTruthy();
    expect(screen.getByText('Şube A')).toBeTruthy(); expect(screen.getByText('Şube B')).toBeTruthy();
    expect(screen.getByText('Toplam 30,75 ₺ alınacak.')).toBeTruthy();
    expect(screen.getByText('Alacağı olmayan 2 şube atlanacak.')).toBeTruthy();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });
  it.each(['field_collection', 'bank_transfer'])('confirms %s amounts once without including skipped branches', (type) => {
    const success = vi.fn();
    render(<CloseReceivablesSheet branches={branches} skippedCount={1} onClose={vi.fn()} onSuccess={success} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: type } });
    fireEvent.click(screen.getByRole('button', { name: 'Alacak Kapat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Alacak Kapat' }));
    expect(mutation.mutate).toHaveBeenCalledOnce();
    expect(mutation.mutate).toHaveBeenCalledWith({ branches: [{ branchId: 'a', expectedAmount: 10.25 }, { branchId: 'b', expectedAmount: 20.5 }], paymentType: type, date: '2026-10-12' }, { onSuccess: success, onSettled: expect.any(Function) });
    expect(success).not.toHaveBeenCalled();
  });
  it('cancels without payment or clearing selection', () => {
    const close = vi.fn(); const success = vi.fn();
    render(<CloseReceivablesSheet branches={branches} skippedCount={0} onClose={close} onSuccess={success} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(close).toHaveBeenCalledOnce(); expect(success).not.toHaveBeenCalled(); expect(mutation.mutate).not.toHaveBeenCalled();
  });
  it('prevents dismissal and editing while saving', () => {
    mutation.isPending = true;
    const close = vi.fn();
    render(<CloseReceivablesSheet branches={branches} skippedCount={0} onClose={close} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(close).not.toHaveBeenCalled();
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Kaydediliyor…' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('shows failures and allows the user to cancel and reconfirm refreshed balances', () => {
    mutation.isError = true; mutation.error = new Error('Şube bakiyeleri değişti.');
    const close = vi.fn();
    render(<CloseReceivablesSheet branches={branches} skippedCount={0} onClose={close} onSuccess={vi.fn()} />);
    expect(screen.getByText('Şube bakiyeleri değişti.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(close).toHaveBeenCalledOnce();
  });
});
