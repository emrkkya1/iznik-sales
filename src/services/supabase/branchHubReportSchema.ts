import { z } from 'zod';

// Runtime contract for report_branch_hub_pdf (M27): a single-branch report
// snapshot. Inferred type flows through service → hook → PDF builder.

const identitySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  cityName: z.string(),
  districtName: z.string(),
  isActive: z.boolean(),
  branchCreatedAt: z.string(),
  openingBalance: z.number().finite(),
  currentBalance: z.number().finite(),
  activeProductCount: z.number().int().nonnegative(),
  totalProductCount: z.number().int().nonnegative(),
  lastMovementDate: z.string().nullable(),
  auditCount: z.number().int().nonnegative(),
});

const metricsSchema = z.object({
  totalSales: z.number().finite(),
  totalCollection: z.number().finite(),
  deliveredQty: z.number().finite().nonnegative(),
  returnedQty: z.number().finite().nonnegative(),
  returnRate: z.number().finite().nonnegative().nullable(),
  collectionRate: z.number().finite().nonnegative().nullable(),
});

const dailySalesSchema = z.object({
  bucket: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sales: z.number().finite(),
});

const productSchema = z.object({
  productId: z.string().uuid(),
  productName: z.string(),
  deliveredQty: z.number().finite().nonnegative(),
  returnedQty: z.number().finite().nonnegative(),
  netQty: z.number().finite(),
  sales: z.number().finite(),
  returnedValue: z.number().finite(),
  returnRate: z.number().finite().nonnegative().nullable(),
});

const movementSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['delivery', 'payment']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().finite(),
  isDeleted: z.boolean(),
  createdAt: z.string(),
  paymentType: z.string().nullable().optional(),
  payment: z
    .object({
      id: z.string().uuid(),
      amount: z.number().finite(),
      paymentType: z.string().nullable(),
      createdAt: z.string(),
    })
    .nullable()
    .optional(),
});

export const branchHubReportSchema = z.object({
  schemaVersion: z.literal(1),
  snapshotAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/),
  identity: identitySchema,
  period: z.object({
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).nullable(),
    productIds: z.array(z.string().uuid()).nullable(),
    productFilterApplied: z.boolean(),
    salesProductScoped: z.boolean(),
    paymentsAllProducts: z.literal(true),
    balancesAllProducts: z.literal(true),
  }),
  periodOpeningBalance: z.number().finite(),
  metrics: metricsSchema,
  dailySales: z.array(dailySalesSchema),
  products: z.array(productSchema),
  movements: z.array(movementSchema),
  movementCount: z.number().int().nonnegative(),
  movementTruncated: z.boolean(),
});

export type BranchHubReport = z.infer<typeof branchHubReportSchema>;

export function parseBranchHubReport(value: unknown): BranchHubReport {
  return branchHubReportSchema.parse(value);
}
