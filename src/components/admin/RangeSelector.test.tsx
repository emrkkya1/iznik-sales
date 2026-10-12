// @vitest-environment happy-dom
import { useState, type PropsWithChildren } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SummaryRange } from '@/types';
import { RangeSelector } from './RangeSelector';

vi.mock('@/components/ui/hstack', () => ({
  HStack: ({ children }: PropsWithChildren) => <div>{children}</div>,
}));
vi.mock('@/components/ui/text', () => ({
  Text: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock('@/components/ui/pressable', () => ({
  Pressable: ({ children, onPress, accessibilityState }: PropsWithChildren<{
    onPress: () => void;
    accessibilityState: { selected: boolean };
  }>) => <button onClick={onPress} aria-pressed={accessibilityState.selected}>{children}</button>,
}));

afterEach(cleanup);

describe('RangeSelector', () => {
  it('offers Daily alongside all existing periods and emits the daily range', () => {
    const onChange = vi.fn();
    render(<RangeSelector value="week" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Bu Hafta' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Bu Ay' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tüm Zamanlar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Günlük' }));
    expect(onChange).toHaveBeenCalledWith('day');
  });

  it('selects Daily and lets the user switch back to another period', () => {
    function Selector() {
      const [range, setRange] = useState<SummaryRange>('week');
      return <RangeSelector value={range} onChange={setRange} />;
    }
    render(<Selector />);
    fireEvent.click(screen.getByRole('button', { name: 'Günlük' }));
    expect(screen.getByRole('button', { name: 'Günlük' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Bu Hafta' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Bu Ay' }));
    expect(screen.getByRole('button', { name: 'Bu Ay' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Günlük' }).getAttribute('aria-pressed')).toBe('false');
  });
});
