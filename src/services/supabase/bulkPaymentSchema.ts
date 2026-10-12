import { z } from 'zod';

export const bulkPaymentResultSchema = z.object({
  payments: z.array(z.object({
    branchId: z.string().uuid(),
    paymentId: z.string().uuid(),
    amount: z.number().finite().positive(),
  })).min(1),
  totalAmount: z.number().finite().positive(),
});
export type BulkPaymentResult = z.infer<typeof bulkPaymentResultSchema>;
export function parseBulkPaymentResult(value: unknown): BulkPaymentResult {
  return bulkPaymentResultSchema.parse(value);
}
