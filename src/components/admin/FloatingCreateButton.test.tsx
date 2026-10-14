// @vitest-environment happy-dom
import type { PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FloatingCreateButton } from './FloatingCreateButton';

vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onPress, accessibilityLabel }: PropsWithChildren<{ onPress: () => void; accessibilityLabel: string }>) => <button onClick={onPress} aria-label={accessibilityLabel}>{children}</button>,
  ButtonIcon: () => <span>+</span>,
}));
vi.mock('@/components/ui/icon', () => ({ PlusIcon: () => null }));
vi.mock('@/components/ui/text', () => ({ Text: ({ children }: PropsWithChildren) => <span>{children}</span> }));
// A nested pressable claims the touch on Android even without an onPress.
vi.mock('@/components/ui/pressable', () => ({ Pressable: ({ children }: PropsWithChildren) => <span onClick={event => event.stopPropagation()}>{children}</span> }));
afterEach(cleanup);

describe('FloatingCreateButton', () => {
  it('opens creation when tapping either the label or the plus icon', () => {
    const onPress = vi.fn();
    render(<FloatingCreateButton label="Yeni Şube" onPress={onPress} />);
    fireEvent.click(screen.getByText('Yeni Şube'));
    fireEvent.click(screen.getByText('+'));
    expect(onPress).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Yeni Şube' })).toBeTruthy();
  });
});
