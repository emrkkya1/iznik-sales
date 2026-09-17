import { describe, expect, it } from 'vitest';

import { parseSummaryPdfSnapshot } from './summaryPdfSchema';

const UUID = '00000000-0000-4000-8000-000000000001';

function valid() {
  return {
    schemaVersion: 1,
    range: 'week',
    snapshotAt: '2026-09-03T14:25:33',
    period: {
      startDate: '2026-08-31',
      endDate: '2026-09-03',
      granularity: 'day',
    },
    filters: {
      dateFrom: null,
      dateTo: null,
      daysOfWeek: null,
      productFilterApplied: false,
      salesProductScoped: false,
      paymentsAllProducts: true,
      balancesAllProducts: true,
    },
    kpis: {
      totalSales: 325,
      totalCollection: 175,
      deliveredQty: 15,
      returnedQty: 2,
      returnRate: 13.33,
      activeBranchCount: 7,
      activeProductCount: 12,
    },
    dailyPoints: [
      { bucket: '2026-09-03', sales: 325, deliveredQty: 15, returnedQty: 2 },
    ],
    branchesBySales: [
      { id: UUID, label: 'Şube', sales: 325, collection: 175, returnRate: 13.33, currentBalance: 150 },
    ],
    branchesByReturnRate: [
      { id: UUID, label: 'Şube', returnRate: 13.33, delivered: 15, returned: 2 },
    ],
    branchesByBalance: [
      { id: UUID, label: 'Şube', currentBalance: 150 },
    ],
    productsByReturnRate: [
      { id: UUID, label: 'Ürün', delivered: 15, returned: 2, returnRate: 13.33, returnedValue: 50 },
    ],
    productsByReturnedValue: [
      { id: UUID, label: 'Ürün', delivered: 15, returned: 2, returnRate: 13.33, returnedValue: 50 },
    ],
  };
}

describe('summaryPdfSnapshotSchema', () => {
  it('accepts a complete valid payload', () => {
    expect(() => parseSummaryPdfSnapshot(valid())).not.toThrow();
  });

  it('rejects a missing required field', () => {
    const v = valid() as Record<string, unknown>;
    delete v.kpis;
    expect(() => parseSummaryPdfSnapshot(v)).toThrow();
  });

  it('rejects an unknown schemaVersion', () => {
    const v = { ...valid(), schemaVersion: 2 };
    expect(() => parseSummaryPdfSnapshot(v)).toThrow();
  });

  it('rejects an unknown range', () => {
    const v = { ...valid(), range: 'year' };
    expect(() => parseSummaryPdfSnapshot(v)).toThrow();
  });

  it('rejects a malformed snapshotAt', () => {
    const v = { ...valid(), snapshotAt: 'not-a-timestamp' };
    expect(() => parseSummaryPdfSnapshot(v)).toThrow();
  });

  it('rejects a malformed period date', () => {
    const v = { ...valid(), period: { ...valid().period, startDate: '03-09-2026' } };
    expect(() => parseSummaryPdfSnapshot(v)).toThrow();
  });

  it('rejects an invalid UUID in a ranking row', () => {
    const v = valid();
    v.branchesBySales = [{ ...v.branchesBySales[0]!, id: 'not-a-uuid' }];
    expect(() => parseSummaryPdfSnapshot(v)).toThrow();
  });

  it('rejects a negative delivered quantity', () => {
    const v = valid();
    v.dailyPoints = [{ ...v.dailyPoints[0]!, deliveredQty: -1 }];
    expect(() => parseSummaryPdfSnapshot(v)).toThrow();
  });

  it('rejects a non-finite number', () => {
    const v = valid();
    v.kpis = { ...v.kpis, totalSales: Infinity };
    expect(() => parseSummaryPdfSnapshot(v)).toThrow();
  });
});
