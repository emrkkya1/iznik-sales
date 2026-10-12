// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormSheet, type FormField } from './FormSheet';

vi.mock('@/components/ui/bottom-sheet', () => ({ BottomSheet: ({ children, open }: PropsWithChildren<{ open: boolean }>) => open ? <div>{children}</div> : null }));
vi.mock('@/components/ui/box', () => ({ Box: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/hstack', () => ({ HStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/vstack', () => ({ VStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/text', () => ({ Text: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/scroll-view', () => ({ ScrollView: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/keyboard-avoiding-view', () => ({ KeyboardAvoidingView: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/icon', () => ({ Icon: () => null, CheckIcon: 'check' }));
vi.mock('@/components/ui/input', () => ({ Input: ({ children }: PropsWithChildren) => <div>{children}</div>, InputField: ({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) => <input value={value} onChange={e => onChangeText(e.target.value)} /> }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, disabled, onPress }: PropsWithChildren<{ disabled: boolean; onPress: () => void }>) => <button disabled={disabled} onClick={onPress}>{children}</button>, ButtonText: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/pressable', () => ({ Pressable: ({ children, accessibilityLabel, accessibilityState, onPress, disabled }: PropsWithChildren<{ accessibilityLabel: string; accessibilityState: { checked: boolean }; onPress: () => void; disabled: boolean }>) => <button role="checkbox" aria-label={accessibilityLabel} aria-checked={accessibilityState.checked} onClick={onPress} disabled={disabled}>{children}</button> }));
afterEach(cleanup);
const fields: FormField[] = [
  { name: 'price', label: 'Fiyat', type: 'numeric', required: true, defaultValue: '55' },
  { name: 'updateBranches', label: 'Fiyatı tüm şubelerde güncelle.', type: 'checkbox', defaultValue: false },
];
describe('price propagation checkbox', () => {
  it('starts unchecked and submits checked even with an unchanged price', async () => {
    const submit = vi.fn(); render(<FormSheet open title="Fiyat" fields={fields} onCancel={vi.fn()} onSubmit={submit} submitLabel="Uygula" />);
    const checkbox = screen.getByRole('checkbox'); expect(checkbox.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(checkbox); expect(checkbox.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ price: '55', updateBranches: true }));
  });
  it('resets selection when reopening and still rejects malformed prices', () => {
    const submit = vi.fn(); const props = { title: 'Fiyat', fields, onCancel: vi.fn(), onSubmit: submit, submitLabel: 'Uygula' };
    const { rerender } = render(<FormSheet {...props} open />);
    fireEvent.click(screen.getByRole('checkbox'));
    rerender(<FormSheet {...props} open={false} />); rerender(<FormSheet {...props} open />);
    expect(screen.getByRole('checkbox').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('checkbox')); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Uygula' })); expect(submit).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Uygula' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
