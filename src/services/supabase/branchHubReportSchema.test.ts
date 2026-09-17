import { describe, expect, it } from 'vitest';

import { parseBranchHubReport } from './branchHubReportSchema';

const UUID = '00000000-0000-4000-8000-000000000001';

function valid(): any {
  return {
    schemaVersion: 1,
    snapshotAt: '2026-09-03T14:25:33',
    identity: {
      id: UUID,
      name: 'Şube',
      cityName: 'İznik',
      districtName: 'Merkez',
      isActive: true,
      branchCreatedAt: '2026-01-01T00:00:00+00:00',
      openingBalance: 100,
      currentBalance: 150,
      activeProductCount: 3,
      totalProductCount: 5,
      lastMovementDate: '2026-09-03',
      auditCount: 4,
    },
    period: {
      dateFrom: '2026-08-01',
      dateTo: '2026-09-03',
      daysOfWeek: null,
      productIds: null,
      productFilterApplied: false,
      salesProductScoped: false,
      paymentsAllProducts: true,
      balancesAllProducts: true,
    },
    periodOpeningBalance: 100,
    metrics: {
      totalSales: 300,
      totalCollection: 250,
      deliveredQty: 30,
      returnedQty: 3,
      returnRate: 10,
      collectionRate: 83.33,
    },
    dailySales: [{ bucket: '2026-09-03', sales: 300 }],
    products: [
      {
        productId: UUID,
        productName: 'Ürün',
        deliveredQty: 30,
        returnedQty: 3,
        netQty: 27,
        sales: 675,
        returnedValue: 75,
        returnRate: 10,
      },
    ],
    movements: [
      {
        id: UUID,
        kind: 'delivery',
        date: '2026-09-03',
        amount: 300,
        isDeleted: false,
        createdAt: '2026-09-03T14:00:00+00:00',
        payment: {
          id: UUID,
          amount: 250,
          paymentType: 'field_collection',
          createdAt: '2026-09-03T14:00:00+00:00',
        },
      },
    ],
    movementCount: 1,
    movementTruncated: false,
  };
}

describe('branchHubReportSchema', () => {
  it('accepts a complete valid payload', () => {
    expect(() => parseBranchHubReport(valid())).not.toThrow();
  });

  it('rejects a missing identity', () => {
    const v = valid();
    delete v.identity;
    expect(() => parseBranchHubReport(v)).toThrow();
  });

  it('rejects an invalid movement kind', () => {
    const v = valid();
    v.movements = [{ ...v.movements[0], kind: 'bogus' }];
    expect(() => parseBranchHubReport(v)).toThrow();
  });

  it('rejects a negative delivered quantity', () => {
    const v = valid();
    v.metrics = { ...v.metrics, deliveredQty: -1 };
    expect(() => parseBranchHubReport(v)).toThrow();
  });

  it('rejects a malformed snapshotAt', () => {
    const v = valid();
    v.snapshotAt = 'nope';
    expect(() => parseBranchHubReport(v)).toThrow();
  });

  it('rejects a null period with a bad date shape', () => {
    const v = valid();
    v.period = { dateFrom: '03-09-2026', dateTo: null };
    expect(() => parseBranchHubReport(v)).toThrow();
  });
});
