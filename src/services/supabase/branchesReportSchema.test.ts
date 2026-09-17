import { describe, expect, it } from 'vitest';

import { parseBranchesReportSnapshot } from './branchesReportSchema';

const UUID = '00000000-0000-4000-8000-000000000001';

function valid(): any {
  return {
    schemaVersion: 1,
    snapshotAt: '2026-09-03T14:25:33',
    filters: {
      search: null,
      status: 'all',
      dateFrom: null,
      dateTo: null,
      daysOfWeek: null,
      cityName: null,
      districtName: null,
      sortBy: 'name',
      sortDir: 'asc',
      productIds: null,
      productFilterApplied: false,
      salesProductScoped: false,
      paymentsAllProducts: true,
      balancesAllProducts: true,
    },
    summary: {
      branchCount: 1,
      activeBranchCount: 1,
      totalSales: 100,
      totalCollection: 50,
      deliveredQty: 10,
      returnedQty: 1,
      returnRate: 10,
      balanceSum: 50,
      lastActivityDate: '2026-09-03',
    },
    rows: [
      {
        branchId: UUID,
        name: 'Şube',
        cityName: 'İznik',
        districtName: 'Merkez',
        currentBalance: 50,
        deliveredQty: 10,
        returnedQty: 1,
        returnRate: 10,
        lastActivityDate: '2026-09-03',
        isActive: true,
        salesTotal: 100,
        collectionTotal: 50,
        deliveryCount: 2,
        paymentCount: 1,
      },
    ],
    totalCount: 1,
    truncated: false,
  };
}

describe('branchesReportSnapshotSchema', () => {
  it('accepts a complete valid payload', () => {
    expect(() => parseBranchesReportSnapshot(valid())).not.toThrow();
  });

  it('rejects an unknown status', () => {
    const v = valid();
    v.filters = { ...v.filters, status: 'bogus' };
    expect(() => parseBranchesReportSnapshot(v)).toThrow();
  });

  it('rejects an unknown sortBy', () => {
    const v = valid();
    v.filters = { ...v.filters, sortBy: 'bogus' };
    expect(() => parseBranchesReportSnapshot(v)).toThrow();
  });

  it('rejects an invalid day of week', () => {
    const v = valid();
    v.filters = { ...v.filters, daysOfWeek: [7] };
    expect(() => parseBranchesReportSnapshot(v)).toThrow();
  });

  it('rejects a missing summary block', () => {
    const v = valid() as Record<string, unknown>;
    delete v.summary;
    expect(() => parseBranchesReportSnapshot(v)).toThrow();
  });

  it('rejects an invalid branchId', () => {
    const v = valid();
    v.rows = [{ ...v.rows[0]!, branchId: 'nope' }];
    expect(() => parseBranchesReportSnapshot(v)).toThrow();
  });
});
