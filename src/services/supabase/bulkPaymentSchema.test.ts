import { describe, expect, it } from 'vitest';
import { parseBulkPaymentResult } from './bulkPaymentSchema';

const valid = { payments: [{ branchId: '00000000-0000-4000-8000-000000000001', paymentId: '00000000-0000-4000-8000-000000000002', amount: 10 }], totalAmount: 10 };
describe('bulk payment result schema', () => {
  it('accepts a valid result', () => expect(parseBulkPaymentResult(valid)).toEqual(valid));
  it.each([null, undefined, {}, { ...valid, totalAmount: null }, { ...valid, payments: [] }, { ...valid, totalAmount: NaN }, { ...valid, payments: [{ ...valid.payments[0], amount: -1 }] }, { ...valid, payments: [{ ...valid.payments[0], branchId: 'not-a-uuid' }] }])('rejects missing, null, or malformed results (%j)', (value) => {
    expect(() => parseBulkPaymentResult(value)).toThrow();
  });
});
