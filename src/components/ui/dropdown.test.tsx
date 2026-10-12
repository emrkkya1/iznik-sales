// @vitest-environment happy-dom
import type { CSSProperties, PropsWithChildren, ReactNode, ReactPortal } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Dropdown } from './dropdown';

const native = vi.hoisted(() => ({
  rect: { x: 100, y: 540, width: 200, height: 40 },
  viewport: { width: 800, height: 600 },
  dismiss: vi.fn(),
  listeners: new Map<string, () => void>(),
}));
vi.mock('react-native', async () => {
  const { forwardRef, useEffect, useImperativeHandle } = await import('react');
  const { createPortal } = await vi.importActual<{
    createPortal: (children: ReactNode, container: Element) => ReactPortal;
  }>('react-dom');
  return {
    useWindowDimensions: () => native.viewport,
    Keyboard: {
      dismiss: native.dismiss,
      addListener: (name: string, callback: () => void) => {
        native.listeners.set(name, callback);
        return { remove: () => native.listeners.delete(name) };
      },
    },
    Modal: ({ visible, onShow, children }: PropsWithChildren<{ visible: boolean; onShow: () => void }>) => {
      useEffect(() => { if (visible) onShow(); }, [visible, onShow]);
      return visible ? createPortal(<div>{children}</div>, document.body) : null;
    },
    Pressable: forwardRef(function Pressable({ children, onPress, disabled, accessibilityRole, accessibilityLabel, accessibilityState }: PropsWithChildren<{
      onPress: () => void; disabled?: boolean; accessibilityRole?: string; accessibilityLabel?: string; accessibilityState?: { expanded?: boolean };
    }>, ref) {
      useImperativeHandle(ref, () => ({ measureInWindow: (callback: (...args: number[]) => void) => {
        const { x, y, width, height } = native.rect;
        callback(x, y, width, height);
      } }));
      return <button onClick={onPress} disabled={disabled} role={accessibilityRole} aria-label={accessibilityLabel} aria-expanded={accessibilityState?.expanded}>{children}</button>;
    }),
    ScrollView: ({ children, style }: PropsWithChildren<{ style: CSSProperties }>) => <div style={style}>{children}</div>,
  };
});
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock('./box', () => ({ Box: ({ children, style, accessibilityRole }: PropsWithChildren<{ style: CSSProperties; accessibilityRole?: string }>) => <div style={style} role={accessibilityRole}>{children}</div> }));
vi.mock('./text', () => ({ Text: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('./icon', () => ({ ChevronDownIcon: () => null, Icon: () => null }));
vi.mock('./spinner', () => ({ Spinner: () => <span>Loading</span> }));

const options = [{ value: 'cash', label: 'Nakit' }, { value: 'transfer', label: 'Havale' }];

afterEach(cleanup);
beforeEach(() => {
  native.rect = { x: 100, y: 540, width: 200, height: 40 };
  native.viewport = { width: 800, height: 600 };
  native.dismiss.mockReset();
  native.listeners.clear();
});

describe('Dropdown viewport containment', () => {
  it('opens above near the bottom in an overlay outside the parent scroll container', () => {
    const { container } = render(<Dropdown value="cash" onChange={vi.fn()} options={options} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nakit' }));
    const menu = screen.getByRole('menu');
    expect(container.contains(menu)).toBe(false);
    expect(menu.style.top).toBe('446px');
    expect(menu.style.maxHeight).toBe('90px');
    expect(native.dismiss).toHaveBeenCalledOnce();
  });

  it('selects an option and dismisses the popover', () => {
    const change = vi.fn();
    render(<Dropdown value="cash" onChange={change} options={options} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nakit' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Havale' }));
    expect(change).toHaveBeenCalledWith('transfer');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on outside press without changing the value', () => {
    const change = vi.fn();
    render(<Dropdown value="cash" onChange={change} options={options} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nakit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dropdown menüsünü kapat' }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it('re-measures when the keyboard closes and the sheet shifts', () => {
    render(<Dropdown value="cash" onChange={vi.fn()} options={options} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nakit' }));
    native.rect.y = 100;
    act(() => { native.listeners.get('keyboardDidHide')?.(); });
    expect(screen.getByRole('menu').style.top).toBe('144px');
  });

  it('does not open while disabled or loading and closes if disabled while open', () => {
    const { rerender } = render(<Dropdown value="cash" onChange={vi.fn()} options={options} disabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Nakit' }));
    expect(screen.queryByRole('menu')).toBeNull();
    rerender(<Dropdown value="cash" onChange={vi.fn()} options={options} loading />);
    fireEvent.click(screen.getByRole('button', { name: 'Nakit' }));
    expect(screen.queryByRole('menu')).toBeNull();
    rerender(<Dropdown value="cash" onChange={vi.fn()} options={options} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nakit' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    rerender(<Dropdown value="cash" onChange={vi.fn()} options={options} disabled />);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
