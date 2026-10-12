// @vitest-environment happy-dom
import type { CSSProperties, PropsWithChildren } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './bottom-sheet';

type Layout = { nativeEvent: { layout: { height: number } } };
const state = vi.hoisted(() => ({ height: 360, top: 24, bottom: 16, layout: null as ((event: Layout) => void) | null }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: state.top, bottom: state.bottom, left: 0, right: 0 }) }));
vi.mock('react-native', () => ({
  useWindowDimensions: () => ({ height: state.height, width: 1024 }),
  Modal: ({ children, visible, onRequestClose }: PropsWithChildren<{ visible: boolean; onRequestClose: () => void }>) => visible ? <div><button onClick={onRequestClose}>Android back</button>{children}</div> : null,
  Pressable: ({ children, onPress, style }: PropsWithChildren<{ onPress: (event: { stopPropagation: () => void }) => void; style: CSSProperties }>) => <div style={style} onClick={onPress} data-testid={style.flex === 1 ? 'sheet-backdrop' : 'sheet-shell'}>{children}</div>,
  ScrollView: ({ children, style }: PropsWithChildren<{ style: CSSProperties }>) => <div data-testid="sheet-scroll" style={style}>{children}</div>,
}));
vi.mock('./box', () => ({ Box: ({ children, style }: PropsWithChildren<{ style: CSSProperties }>) => <div style={style} data-testid="sheet-surface">{children}</div> }));
vi.mock('./hstack', () => ({ HStack: ({ children, style, onLayout }: PropsWithChildren<{ style: CSSProperties; onLayout: (event: Layout) => void }>) => { state.layout = onLayout; return <div data-testid="sheet-header" style={style}>{children}</div>; } }));
vi.mock('./text', () => ({ Text: ({ children }: PropsWithChildren) => <span>{children}</span> }));
vi.mock('./button', () => ({ Button: ({ children, onPress }: PropsWithChildren<{ onPress: () => void }>) => <button onClick={event => { event.stopPropagation(); onPress(); }}>{children}</button>, ButtonText: ({ children }: PropsWithChildren) => <span>{children}</span> }));
afterEach(cleanup);
beforeEach(() => { state.height = 360; state.top = 24; state.bottom = 16; state.layout = null; });

describe('BottomSheet viewport safety', () => {
  it('clamps oversized sheets and gives the body only the space below the fixed header', () => {
    render(<BottomSheet open title="Düzenleme" onClose={vi.fn()} maxHeight={720}><div>Long before/after content</div></BottomSheet>);
    expect(screen.getByTestId('sheet-shell').style.maxHeight).toBe('304px');
    expect(screen.getByTestId('sheet-surface').style.maxHeight).toBe('304px');
    expect(screen.getByTestId('sheet-header').style.flexShrink).toBe('0');
    expect(screen.getByTestId('sheet-scroll').style.maxHeight).toBe('240px');
    act(() => state.layout!({ nativeEvent: { layout: { height: 80 } } }));
    expect(screen.getByTestId('sheet-scroll').style.maxHeight).toBe('224px');
    expect(screen.getByRole('button', { name: 'Kapat' })).toBeTruthy();
  });
  it('recomputes bounds on viewport changes and respects smaller caller caps', () => {
    const { rerender } = render(<BottomSheet open title="Detay" onClose={vi.fn()} maxHeight={200}>Details</BottomSheet>);
    expect(screen.getByTestId('sheet-shell').style.maxHeight).toBe('200px');
    state.height = 240;
    rerender(<BottomSheet open title="Detay" onClose={vi.fn()} maxHeight={720}>Details</BottomSheet>);
    expect(screen.getByTestId('sheet-shell').style.maxHeight).toBe('184px');
    expect(screen.getByTestId('sheet-scroll').style.maxHeight).toBe('120px');
  });
  it('can always close from the header, backdrop, or Android back', () => {
    const close = vi.fn(); render(<BottomSheet open title="Detay" onClose={close} maxHeight={720}>Content</BottomSheet>);
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    fireEvent.click(screen.getByTestId('sheet-backdrop'));
    fireEvent.click(screen.getByRole('button', { name: 'Android back' }));
    expect(close).toHaveBeenCalledTimes(3);
  });
  it('does not dismiss when tapping inside the scrollable content', () => {
    const close = vi.fn(); render(<BottomSheet open title="Detay" onClose={close}>Content</BottomSheet>);
    fireEvent.click(screen.getByText('Content')); expect(close).not.toHaveBeenCalled();
  });
});
