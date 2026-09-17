import { z } from 'zod';

// Runtime contract for report_branches_pdf (M26). Same row shape as
// list_branches_analytics plus money/count columns, plus a summary + filter
// echo. The inferred type flows through service → hook → PDF builder.

const branchReportFiltersSchema = z.object({
  search: z.string().nullable(),
  status: z.enum(['all', 'active', 'inactive']),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable(),
  cityName: z.string().nullable(),
  districtName: z.string().nullable(),
  sortBy: z.enum(['name', 'balance', 'return_rate', 'last_activity', 'location']),
  sortDir: z.enum(['asc', 'desc']),
  productIds: z.array(z.string().uuid()).nullable(),
  productFilterApplied: z.boolean(),
  salesProductScoped: z.boolean(),
  paymentsAllProducts: z.literal(true),
  balancesAllProducts: z.literal(true),
});

const branchReportSummarySchema = z.object({
  branchCount: z.number().int().nonnegative(),
  activeBranchCount: z.number().int().nonnegative(),
  totalSales: z.number().finite(),
  totalCollection: z.number().finite(),
  deliveredQty: z.number().finite().nonnegative(),
  returnedQty: z.number().finite().nonnegative(),
  returnRate: z.number().finite().nonnegative().nullable(),
  balanceSum: z.number().finite(),
  lastActivityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

const branchReportRowSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string(),
  cityName: z.string(),
  districtName: z.string(),
  currentBalance: z.number().finite(),
  deliveredQty: z.number().finite().nonnegative(),
  returnedQty: z.number().finite().nonnegative(),
  returnRate: z.number().finite().nonnegative().nullable(),
  lastActivityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  isActive: z.boolean(),
  salesTotal: z.number().finite(),
  collectionTotal: z.number().finite(),
  deliveryCount: z.number().int().nonnegative(),
  paymentCount: z.number().int().nonnegative(),
});

export const branchesReportSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  filters: branchReportFiltersSchema,
  summary: branchReportSummarySchema,
  rows: z.array(branchReportRowSchema),
  totalCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});

export type BranchReportSnapshot = z.infer<typeof branchesReportSnapshotSchema>;

export function parseBranchesReportSnapshot(value: unknown): BranchReportSnapshot {
  return branchesReportSnapshotSchema.parse(value);
}
