// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RenameBranchSheet } from './RenameBranchSheet';

const mutation = vi.hoisted(() => ({
  mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false, error: null as Error | null,
}));
vi.mock('@/hooks/useAdminLocations', () => ({ useRenameBranch: () => mutation }));
vi.mock('@/components/ui/bottom-sheet', () => ({
  BottomSheet: ({ children, title, onClose }: PropsWithChildren<{ title: string; onClose: () => void }>) => (
    <div><h1>{title}</h1><button onClick={onClose}>Kapat</button>{children}</div>
  ),
}));
vi.mock('@/components/ui/vstack', () => ({ VStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/hstack', () => ({ HStack: ({ children }: PropsWithChildren) => <div>{children}</div> }));
vi.mock('@/components/ui/text', () => ({ Text: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onPress, disabled }: PropsWithChildren<{ onPress: () => void; disabled: boolean }>) => (
    <button onClick={onPress} disabled={disabled}>{children}</button>
  ),
  ButtonText: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock('@/components/ui/input', () => ({
  Input: ({ children }: PropsWithChildren) => <div>{children}</div>,
  InputField: ({ value, onChangeText, editable, accessibilityLabel }: {
    value: string; onChangeText: (value: string) => void; editable: boolean; accessibilityLabel: string;
  }) => <input value={value} onChange={event => onChangeText(event.target.value)} disabled={!editable} aria-label={accessibilityLabel} />,
}));

afterEach(cleanup);
beforeEach(() => {
  mutation.mutate.mockReset();
  mutation.reset.mockReset();
  mutation.isPending = false;
  mutation.isError = false;
  mutation.error = null;
});

describe('RenameBranchSheet', () => {
  it('prefills the name, prevents blank/unchanged saves, and submits trimmed text', () => {
    const close = vi.fn();
    render(<RenameBranchSheet branchId="branch-1" currentName="Eski Şube" onClose={close} />);
    const field = screen.getByRole('textbox', { name: 'Şube adı' }) as HTMLInputElement;
    const save = screen.getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement;
    expect(field.value).toBe('Eski Şube');
    expect(save.disabled).toBe(true);
    fireEvent.change(field, { target: { value: '   ' } });
    expect(save.disabled).toBe(true);
    expect(screen.getByText('Şube adı boş bırakılamaz.')).toBeTruthy();
    fireEvent.change(field, { target: { value: '  Yeni Şube  ' } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(mutation.mutate).toHaveBeenCalledWith({ id: 'branch-1', name: 'Yeni Şube' }, { onSuccess: close });
    expect(close).not.toHaveBeenCalled();
  });

  it('cancels without saving', () => {
    const close = vi.fn();
    render(<RenameBranchSheet branchId="branch-1" currentName="Şube" onClose={close} />);
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(close).toHaveBeenCalledOnce();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('prevents editing or dismissing while a save is pending', () => {
    mutation.isPending = true;
    const close = vi.fn();
    render(<RenameBranchSheet branchId="branch-1" currentName="Şube" onClose={close} />);
    expect((screen.getByRole('textbox') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Kaydediliyor…' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(close).not.toHaveBeenCalled();
  });

  it('shows save errors and clears them when the name is edited', () => {
    mutation.isError = true;
    mutation.error = new Error('Şube adı kaydedilemedi');
    render(<RenameBranchSheet branchId="branch-1" currentName="Şube" onClose={vi.fn()} />);
    expect(screen.getByText('Şube adı kaydedilemedi')).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Yeni Şube' } });
    expect(mutation.reset).toHaveBeenCalledOnce();
  });
});
