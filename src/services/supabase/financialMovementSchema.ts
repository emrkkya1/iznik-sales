import { z } from 'zod';

const paymentType = z.enum(['field_collection', 'bank_transfer']);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const financialSnapshotSchema = z.object({
  date,
  amount: z.number().finite(),
  deleted: z.boolean(),
  paymentType: paymentType.optional(),
  items: z.array(z.object({
    productId: z.string().uuid(), productName: z.string(),
    deliveredQuantity: z.number().finite().nonnegative(),
    returnedQuantity: z.number().finite().nonnegative(),
    unitPrice: z.number().finite(),
  })),
  payments: z.array(z.object({
    id: z.string().uuid(), amount: z.number().finite().positive(), paymentType, date,
  })),
});
export const financialEventSchema = z.object({
  id: z.string().uuid(), kind: z.enum(['delivery', 'payment']), recordId: z.string().uuid(),
  branchId: z.string().uuid().nullable(), branchName: z.string(),
  action: z.enum(['create', 'edit', 'delete', 'baseline']),
  actorName: z.string(), actorRole: z.enum(['admin', 'staff']).nullable(),
  occurredAt: z.string().datetime({ offset: true }),
  before: financialSnapshotSchema.nullable(), after: financialSnapshotSchema.nullable(),
  reason: z.string().nullable(), legacy: z.boolean(), canManage: z.boolean(),
});
export const currentFinancialMovementSchema = z.object({
  snapshot: financialSnapshotSchema, version: z.string().regex(/^[a-f0-9]{32}$/),
});
export const financialChangeResultSchema = z.object({ changed: z.boolean() });
export type FinancialSnapshot = z.infer<typeof financialSnapshotSchema>;
export type FinancialEvent = z.infer<typeof financialEventSchema>;
export type CurrentFinancialMovement = z.infer<typeof currentFinancialMovementSchema>;
export type MovementCursor = { at: string; id: string };
export type FinancialChangeInput = {
  kind: FinancialEvent['kind']; id: string; action: 'edit' | 'delete'; version: string;
  patch: {
    reason?: string; date?: string; amount?: number; paymentType?: 'field_collection' | 'bank_transfer';
    items?: { product_id: string; delivered_quantity: number; returned_quantity: number }[];
    payments?: { id: string | null; amount: number; paymentType: 'field_collection' | 'bank_transfer' }[];
  };
};
