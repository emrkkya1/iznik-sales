// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ManualPaymentSheet } from './ManualPaymentSheet';

const mutation = vi.hoisted(() => ({
  mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as Error | null,
}));
vi.mock('@/hooks/useMutations', () => ({ useRecordManualPayment: () => mutation }));
vi.mock('@/utils/dates', () => ({ getIstanbulToday: () => '2026-10-12' }));
vi.mock('@/components/ui/bottom-sheet', () => ({
  BottomSheet: ({ children, onClose }: PropsWithChildren<{ onClose: () => void }>) => (
    <div><button onClick={onClose}>Kapat</button>{children}</div>
  ),
}));
vi.mock('@/components/ui/vstack', () => ({ VStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/hstack', () => ({ HStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/text', () => ({ Text: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onPress, disabled }: PropsWithChildren<{ onPress: () => void; disabled: boolean }>) => <button onClick={onPress} disabled={disabled}>{children}</button>,
  ButtonText: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock('@/components/ui/input', () => ({
  Input: ({ children }: PropsWithChildren) => <div>{children}</div>,
  InputField: ({ value, onChangeText, editable }: { value: string; onChangeText: (value: string) => void; editable: boolean }) => (
    <input aria-label="Miktar" value={value} onChange={event => onChangeText(event.target.value)} disabled={!editable} />
  ),
}));
vi.mock('@/components/ui/dropdown', () => ({
  Dropdown: ({ value, onChange, options, disabled }: {
    value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled: boolean;
  }) => <select aria-label="Ödeme Tipi" value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>
    {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select>,
}));

afterEach(cleanup);
beforeEach(() => {
  mutation.mutate.mockReset();
  mutation.reset.mockReset();
  mutation.isPending = false;
  mutation.isError = false;
  mutation.error = null;
});

describe('ManualPaymentSheet', () => {
  it.each([
    ['field_collection', 'Nakit'], ['bank_transfer', 'Havale'],
  ])('submits %s with today’s business date and no product input', (type, label) => {
    const close = vi.fn();
    render(<ManualPaymentSheet branchId="branch-1" onClose={close} />);
    expect(screen.getByRole('option', { name: label })).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Ödeme Al' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole('textbox', { name: 'Miktar' }), { target: { value: '125,50' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: type } });
    fireEvent.click(screen.getByRole('button', { name: 'Ödeme Al' }));
    expect(mutation.mutate).toHaveBeenCalledWith({
      branchId: 'branch-1', amount: 125.5, paymentType: type, date: '2026-10-12',
    }, { onSuccess: close, onSettled: expect.any(Function) });
    expect(close).not.toHaveBeenCalled();
    // The synchronous guard stops a second tap before pending-state rendering.
    fireEvent.click(screen.getByRole('button', { name: 'Ödeme Al' }));
    expect(mutation.mutate).toHaveBeenCalledOnce();
  });

  it.each(['0', '-1', 'abc', '1,234'])('blocks invalid amounts (%s)', (value) => {
    render(<ManualPaymentSheet branchId="branch-1" onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value } });
    expect((screen.getByRole('button', { name: 'Ödeme Al' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Sıfırdan büyük/)).toBeTruthy();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('cancels without recording a payment', () => {
    const close = vi.fn();
    render(<ManualPaymentSheet branchId="branch-1" onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(close).toHaveBeenCalledOnce();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('disables controls and dismissal while saving', () => {
    mutation.isPending = true;
    const close = vi.fn();
    render(<ManualPaymentSheet branchId="branch-1" onClose={close} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Kaydediliyor…' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(close).not.toHaveBeenCalled();
  });

  it('shows failures and allows a retry after the request settles', () => {
    mutation.isError = true;
    mutation.error = new Error('Network unavailable');
    render(<ManualPaymentSheet branchId="branch-1" onClose={vi.fn()} />);
    expect(screen.getByText('Network unavailable')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '10' } });
    expect(mutation.reset).toHaveBeenCalled();
    const button = screen.getByRole('button', { name: 'Ödeme Al' });
    fireEvent.click(button);
    const callbacks = mutation.mutate.mock.calls[0][1] as { onSettled: () => void };
    callbacks.onSettled();
    fireEvent.click(button);
    expect(mutation.mutate).toHaveBeenCalledTimes(2);
  });
});
