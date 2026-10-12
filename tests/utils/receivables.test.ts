import { describe, expect, it } from 'vitest';
import { getReceivablesTotal, getSelectedReceivables } from '@/utils/receivables';

describe('receivable selection', () => {
  it('includes only positive, finite balances and deduplicates loaded rows', () => {
    expect(getSelectedReceivables([
      { branchId: 'a', name: 'A', currentBalance: 10.1 },
      { branchId: 'b', name: 'B', currentBalance: 0 },
      { branchId: 'c', name: 'C', currentBalance: -50 },
      { branchId: 'd', name: 'D', currentBalance: NaN },
      { branchId: 'e', name: 'E', currentBalance: Infinity },
      { branchId: 'a', name: 'A', currentBalance: 10.1 },
    ])).toEqual([{ branchId: 'a', name: 'A', amount: 10.1 }]);
  });
  it('totals currency in cents without floating-point drift', () => {
    expect(getReceivablesTotal([{ branchId: 'a', name: 'A', amount: 0.1 }, { branchId: 'b', name: 'B', amount: 0.2 }])).toBe(0.3);
    expect(getReceivablesTotal([])).toBe(0);
  });
});
