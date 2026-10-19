// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpeningBalanceSheet } from './OpeningBalanceSheet';

const mutation = vi.hoisted(() => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as Error | null }));
const lock = vi.hoisted(() => ({ data: false as boolean | undefined, isPending: false, isError: false, refetch: vi.fn() }));
vi.mock('@/hooks/useAdminLocations', () => ({ useOpeningBalancesLocked: () => lock, useUpdateOpeningBalance: () => mutation }));
vi.mock('@/components/ui/bottom-sheet', () => ({ BottomSheet: ({ children, onClose }: PropsWithChildren<{ onClose: () => void }>) => <div><button onClick={onClose}>Kapat</button>{children}</div> }));
vi.mock('@/components/ui/vstack', () => ({ VStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/hstack', () => ({ HStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/text', () => ({ Text: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onPress, disabled }: PropsWithChildren<{ onPress: () => void; disabled: boolean }>) => <button onClick={onPress} disabled={disabled}>{children}</button>,
  ButtonText: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock('@/components/ui/input', () => ({
  Input: ({ children }: PropsWithChildren) => <div>{children}</div>,
  InputField: ({ value, onChangeText, editable }: { value: string; onChangeText: (text: string) => void; editable: boolean }) => <input aria-label="Açılış tutarı" value={value} onChange={e => onChangeText(e.target.value)} disabled={!editable} />,
}));
vi.mock('@/components/ui/dropdown', () => ({ Dropdown: ({ value, onChange, options, disabled }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled: boolean }) => (
  <select value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
afterEach(cleanup);
beforeEach(() => {
  mutation.mutate.mockReset(); mutation.reset.mockReset(); mutation.isPending = false; mutation.isError = false; mutation.error = null;
  lock.data = false; lock.isPending = false; lock.isError = false; lock.refetch.mockReset();
});

describe('OpeningBalanceSheet', () => {
  it('prefills a negative opening balance with Borç and blocks unchanged saves', () => {
    render(<OpeningBalanceSheet branchId="branch-1" openingBalance={-125.5} onClose={vi.fn()} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('125,50');
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('payable');
    expect((screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it.each([['receivable', 75.25], ['payable', -75.25]])('submits %s, preserves expected balance, and prevents duplicate taps', (direction, expected) => {
    const close = vi.fn();
    const { rerender } = render(<OpeningBalanceSheet branchId="branch-1" openingBalance={10} onClose={close} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '75,25' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: direction } });
    rerender(<OpeningBalanceSheet branchId="branch-1" openingBalance={99} onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(mutation.mutate).toHaveBeenCalledOnce();
    expect(mutation.mutate).toHaveBeenCalledWith({ branchId: 'branch-1', openingBalance: expected, expectedOpeningBalance: 10 }, { onSuccess: close, onSettled: expect.any(Function) });
    expect(close).not.toHaveBeenCalled();
  });
  it('allows setting an existing opening balance to zero', () => {
    render(<OpeningBalanceSheet branchId="branch-1" openingBalance={10} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(mutation.mutate.mock.calls[0][0].openingBalance).toBe(0);
  });
  it.each(['', '-1', 'abc', '1,234', '10000000000'])('blocks invalid input: %s', (value) => {
    render(<OpeningBalanceSheet branchId="branch-1" openingBalance={10} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value } });
    expect((screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mutation.mutate).not.toHaveBeenCalled();
  });
  it.each(['locked', 'loading', 'failed'])('fails closed when lock state is %s', (state) => {
    lock.data = state === 'locked' ? true : undefined; lock.isPending = state === 'loading'; lock.isError = state === 'failed';
    render(<OpeningBalanceSheet branchId="branch-1" openingBalance={10} onClose={vi.fn()} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(true);
    if (state === 'failed') { fireEvent.click(screen.getByRole('button', { name: 'Tekrar Dene' })); expect(lock.refetch).toHaveBeenCalledOnce(); }
  });
  it('blocks dismissal while saving and cancels without saving otherwise', () => {
    mutation.isPending = true;
    const close = vi.fn();
    const { rerender } = render(<OpeningBalanceSheet branchId="branch-1" openingBalance={10} onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(close).not.toHaveBeenCalled();
    mutation.isPending = false;
    rerender(<OpeningBalanceSheet branchId="branch-1" openingBalance={10} onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(close).toHaveBeenCalledOnce();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });
  it('shows mutation errors and clears them on editing', () => {
    mutation.isError = true; mutation.error = new Error('Açılış bakiyesi başka bir işlemle değişti.');
    render(<OpeningBalanceSheet branchId="branch-1" openingBalance={10} onClose={vi.fn()} />);
    expect(screen.getByText(mutation.error.message)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '11' } });
    expect(mutation.reset).toHaveBeenCalledOnce();
  });
});
