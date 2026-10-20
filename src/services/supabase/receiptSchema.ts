import { z } from 'zod';

export const receiptSchema = z.object({
  deliveryId: z.string().uuid(), branchId: z.string().uuid(), branchName: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalSalesAmount: z.number().finite(), paymentAmount: z.number().finite().nonnegative(),
  previousBalance: z.number().finite(), newBalance: z.number().finite(),
  items: z.array(z.object({
    productName: z.string(), deliveredQuantity: z.number().finite().nonnegative(),
    returnedQuantity: z.number().finite().nonnegative(), netQuantity: z.number().finite(),
    unitPrice: z.number().finite(), lineTotal: z.number().finite(),
  })).min(1).max(200),
});

export const paymentReceiptSchema = z.object({
  id: z.string().uuid(), branchId: z.string().uuid(), userId: z.string().uuid(),
  deliveryId: z.string().uuid().nullable(), amount: z.number().finite().positive(),
  paymentType: z.enum(['field_collection', 'bank_transfer']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deletedAt: z.string().nullable(), deletedBy: z.string().uuid().nullable(), deletionReason: z.string().nullable(),
});
