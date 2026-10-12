import { useState } from 'react';
import type { BranchAnalyticsRow } from '@/types';

// A selection belongs to one exact search/filter/sort scope. Pagination only
// adds rows to that scope; select-all never fetches hidden/unloaded branches.
export function useBranchSelection(rows: BranchAnalyticsRow[], scopeKey: string, enabled: boolean) {
  const [selection, setSelection] = useState<{ scopeKey: string; ids: string[] }>({ scopeKey, ids: [] });
  const ids = enabled && selection.scopeKey === scopeKey ? selection.ids : [];
  const selectedIds = new Set(ids);
  const selectedRows = [...new Map(rows.filter(row => selectedIds.has(row.branchId)).map(row => [row.branchId, row])).values()];
  const toggle = (id: string) => {
    if (!enabled) return;
    setSelection(current => {
      const previous = current.scopeKey === scopeKey ? current.ids : [];
      return { scopeKey, ids: previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id] };
    });
  };
  const selectAll = () => {
    if (enabled) setSelection({ scopeKey, ids: [...new Set(rows.map(row => row.branchId))] });
  };
  const clear = () => setSelection({ scopeKey, ids: [] });
  // Do not resurrect an old selection if the user later restores old filters.
  if (selection.scopeKey !== scopeKey) setSelection({ scopeKey, ids: [] });
  return { selectedIds, selectedRows, toggle, selectAll, clear };
}
