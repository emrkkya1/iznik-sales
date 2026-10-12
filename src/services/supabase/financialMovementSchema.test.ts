import { describe, expect, it } from 'vitest';
import { currentFinancialMovementSchema, financialChangeResultSchema, financialEventSchema, financialSnapshotSchema } from './financialMovementSchema';

const id = '00000000-0000-4000-8000-000000000001';
const snapshot = { date: '2026-10-12', amount: 10, deleted: false, items: [{ productId: id, productName: 'Ekmek', deliveredQuantity: 2, returnedQuantity: 0, unitPrice: 5 }], payments: [] };
const event = { id, recordId: id, kind: 'delivery', action: 'create', branchId: id, branchName: 'Şube', actorName: 'Emre', actorRole: 'admin', occurredAt: '2026-10-12T12:00:00+00:00', before: null, after: snapshot, reason: null, legacy: false, canManage: true };
describe('financial movement schemas', () => {
  it('accepts complete, legacy, and deletion events', () => {
    expect(financialEventSchema.parse(event)).toEqual(event);
    expect(financialEventSchema.parse({ ...event, legacy: true, action: 'edit', before: snapshot, after: null, actorRole: null })).toBeTruthy();
    expect(financialSnapshotSchema.parse({ ...snapshot, amount: -10 })).toBeTruthy();
    expect(currentFinancialMovementSchema.parse({ snapshot, version: 'a'.repeat(32) })).toBeTruthy();
    expect(financialChangeResultSchema.parse({ changed: false })).toEqual({ changed: false });
  });
  it.each([null, undefined, {}, { ...event, actorRole: 'owner' }, { ...event, occurredAt: 'yesterday' }, { ...event, after: { ...snapshot, amount: NaN } }, { ...event, after: { ...snapshot, items: [{ ...snapshot.items[0], deliveredQuantity: -1 }] } }, { ...event, recordId: 'bad' }])('rejects missing/null/malformed events (%j)', value => {
    expect(() => financialEventSchema.parse(value)).toThrow();
  });
  it('rejects missing/null/malformed current records and mutation results', () => {
    for (const value of [null, {}, { snapshot, version: 'bad' }, { snapshot: null, version: 'a'.repeat(32) }]) expect(() => currentFinancialMovementSchema.parse(value)).toThrow();
    for (const value of [null, {}, { changed: 'yes' }]) expect(() => financialChangeResultSchema.parse(value)).toThrow();
  });
});
