import { describe, expect, it } from 'vitest';
import { paymentReceiptSchema, receiptSchema } from './receiptSchema';
const id = '00000000-0000-4000-8000-000000000001';
const receipt = { deliveryId: id, branchId: id, branchName: 'Branch', date: '2026-10-20', totalSalesAmount: -10,
  paymentAmount: 0, previousBalance: 5, newBalance: -5,
  items: [{ productName: 'Bread', deliveredQuantity: 0, returnedQuantity: 1, netQuantity: -1, unitPrice: 10, lineTotal: -10 }] };
const payment = { id, branchId: id, userId: id, deliveryId: null, amount: 10, paymentType: 'field_collection', date: receipt.date,
  deletedAt: null, deletedBy: null, deletionReason: null };
describe('financial receipt schemas', () => {
  it('accepts signed balances/returns and nullable payment relationships', () => {
    expect(receiptSchema.parse(receipt)).toEqual(receipt);
    expect(paymentReceiptSchema.parse(payment)).toEqual(payment);
  });
  it.each([null, undefined, {}, { ...receipt, previousBalance: null }, { ...receipt, items: [] }, { ...receipt, newBalance: Infinity }, { ...receipt, deliveryId: 'invalid' }])('rejects missing/malformed delivery contracts', value => {
    expect(receiptSchema.safeParse(value).success).toBe(false);
  });
  it.each([null, undefined, {}, { ...payment, amount: 0 }, { ...payment, userId: null }, { ...payment, paymentType: 'other' }])('rejects missing/malformed payment contracts', value => {
    expect(paymentReceiptSchema.safeParse(value).success).toBe(false);
  });
});
