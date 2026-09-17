import { z } from 'zod';

// Runtime contract for report_summary_pdf (M25). The RPC returns JSONB, so
// supabase-js hands us untyped JSON; this schema is the single source of truth
// for the PDF payload and its inferred TypeScript type flows through the whole
// pipeline (service → hook → document builder).

const kpisSchema = z.object({
  totalSales: z.number().finite(),
  totalCollection: z.number().finite(),
  deliveredQty: z.number().finite().nonnegative(),
  returnedQty: z.number().finite().nonnegative(),
  returnRate: z.number().finite().nonnegative().nullable(),
  activeBranchCount: z.number().int().nonnegative(),
  activeProductCount: z.number().int().nonnegative(),
});

const dailyPointSchema = z.object({
  bucket: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sales: z.number().finite(),
  deliveredQty: z.number().finite().nonnegative(),
  returnedQty: z.number().finite().nonnegative(),
});

const branchSalesRowSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  sales: z.number().finite(),
  collection: z.number().finite(),
  returnRate: z.number().finite().nonnegative().nullable(),
  currentBalance: z.number().finite(),
});

const branchReturnRateRowSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  returnRate: z.number().finite().nonnegative().nullable(),
  delivered: z.number().finite().nonnegative(),
  returned: z.number().finite().nonnegative(),
});

const branchBalanceRowSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  currentBalance: z.number().finite(),
});

const productRowSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  delivered: z.number().finite().nonnegative(),
  returned: z.number().finite().nonnegative(),
  returnRate: z.number().finite().nonnegative().nullable(),
  returnedValue: z.number().finite(),
});

export const summaryPdfSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  range: z.enum(['week', 'month', 'all']),
  snapshotAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  period: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    granularity: z.enum(['day', 'week', 'month']),
  }),
  filters: z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable(),
    productFilterApplied: z.literal(false),
    salesProductScoped: z.literal(false),
    paymentsAllProducts: z.literal(true),
    balancesAllProducts: z.literal(true),
  }),
  kpis: kpisSchema,
  dailyPoints: z.array(dailyPointSchema),
  branchesBySales: z.array(branchSalesRowSchema),
  branchesByReturnRate: z.array(branchReturnRateRowSchema),
  branchesByBalance: z.array(branchBalanceRowSchema),
  productsByReturnRate: z.array(productRowSchema),
  productsByReturnedValue: z.array(productRowSchema),
});

export type SummaryPdfSnapshot = z.infer<typeof summaryPdfSnapshotSchema>;

export function parseSummaryPdfSnapshot(value: unknown): SummaryPdfSnapshot {
  return summaryPdfSnapshotSchema.parse(value);
}
