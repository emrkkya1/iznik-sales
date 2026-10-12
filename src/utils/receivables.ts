import type { BranchAnalyticsRow } from '@/types';

export type ReceivableBranch = { branchId: string; name: string; amount: number };

export function getSelectedReceivables(rows: Pick<BranchAnalyticsRow, 'branchId' | 'name' | 'currentBalance'>[]): ReceivableBranch[] {
  const unique = new Map<string, ReceivableBranch>();
  for (const row of rows) {
    if (Number.isFinite(row.currentBalance) && row.currentBalance > 0) {
      unique.set(row.branchId, { branchId: row.branchId, name: row.name, amount: row.currentBalance });
    }
  }
  return [...unique.values()];
}

export function getReceivablesTotal(branches: ReceivableBranch[]): number {
  return branches.reduce((sum, branch) => sum + Math.round(branch.amount * 100), 0) / 100;
}
