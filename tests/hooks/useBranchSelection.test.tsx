// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useBranchSelection } from '@/hooks/useBranchSelection';
import type { BranchAnalyticsRow } from '@/types';

afterEach(cleanup);
const row = (branchId: string, balance = 10): BranchAnalyticsRow => ({ branchId, name: branchId, cityName: 'City', districtName: 'District', currentBalance: balance, deliveredQty: 0, returnedQty: 0, returnRate: null, lastActivityDate: null, isActive: true });

describe('useBranchSelection', () => {
  it('toggles individual rows, including zero/Borç rows, without fetching anything', () => {
    const { result } = renderHook(() => useBranchSelection([row('a'), row('b', -5)], 'all', true));
    act(() => result.current.toggle('b'));
    expect(result.current.selectedRows.map(row => row.branchId)).toEqual(['b']);
    act(() => result.current.toggle('b'));
    expect(result.current.selectedRows).toEqual([]);
  });
  it('selects only loaded rows and does not automatically select newly loaded pages', () => {
    const { result, rerender } = renderHook(({ rows }) => useBranchSelection(rows, 'filter', true), { initialProps: { rows: [row('a'), row('b', 0)] } });
    act(() => result.current.selectAll());
    expect([...result.current.selectedIds]).toEqual(['a', 'b']);
    rerender({ rows: [row('a'), row('b', 0), row('c')] });
    expect([...result.current.selectedIds]).toEqual(['a', 'b']);
    act(() => result.current.selectAll());
    expect([...result.current.selectedIds]).toEqual(['a', 'b', 'c']);
  });
  it('clears selections on search/filter/sort changes and does not resurrect them later', () => {
    const { result, rerender } = renderHook(({ scope }) => useBranchSelection([row('a')], scope, true), { initialProps: { scope: 'old' } });
    act(() => result.current.toggle('a'));
    rerender({ scope: 'new' });
    expect(result.current.selectedRows).toEqual([]);
    rerender({ scope: 'old' });
    expect(result.current.selectedRows).toEqual([]);
  });
  it('blocks selecting placeholder/debounced results and clears after settlement', () => {
    const { result, rerender } = renderHook(({ enabled }) => useBranchSelection([row('a')], 'all', enabled), { initialProps: { enabled: false } });
    act(() => { result.current.toggle('a'); result.current.selectAll(); });
    expect(result.current.selectedRows).toEqual([]);
    rerender({ enabled: true });
    act(() => result.current.selectAll());
    expect(result.current.selectedRows).toHaveLength(1);
    act(() => result.current.clear());
    expect(result.current.selectedRows).toEqual([]);
  });
});
