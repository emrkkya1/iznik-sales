import { describe, expect, it } from 'vitest';

import type { BranchHubReport } from '@/services/supabase/branchHubReportSchema';

import { buildBranchDetailDocument } from '@/utils/pdf/branchDetail';
import { assembleReportDocument } from '@/utils/pdf/document';

const UUID = '00000000-0000-4000-8000-000000000001';

function snapshot(overrides: Partial<BranchHubReport> = {}): BranchHubReport {
  return {
    schemaVersion: 1,
    snapshotAt: '2026-09-03T14:25:33',
    identity: {
      id: UUID,
      name: 'Merkez Şube',
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
    period: { dateFrom: '2026-08-01', dateTo: '2026-09-03', daysOfWeek: null, productIds: null, productFilterApplied: false, salesProductScoped: false, paymentsAllProducts: true, balancesAllProducts: true },
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
    products: [],
    movements: [],
    movementCount: 0,
    movementTruncated: false,
    ...overrides,
  };
}

describe('buildBranchDetailDocument', () => {
  it('always produces at least two pages (identity + products)', () => {
    const doc = buildBranchDetailDocument(snapshot());
    expect(doc.pages.length).toBeGreaterThanOrEqual(2);
  });

  it('renders the branch name in the title', () => {
    const html = assembleReportDocument(buildBranchDetailDocument(snapshot()));
    expect(html).toContain('Merkez Şube');
  });

  it('renders period KPIs and balance breakdown', () => {
    const html = assembleReportDocument(buildBranchDetailDocument(snapshot()));
    expect(html).toContain('Dönem Satışı');
    expect(html).toContain('Bakiye Detayları');
    expect(html).toContain('Dönem Başı');
    expect(html).toContain('Güncel Bakiye');
  });

  it('paginates the movement ledger at 26 rows', () => {
    const movements = Array.from({ length: 60 }, (_, i) => ({
      id: UUID,
      kind: 'payment' as const,
      date: '2026-09-03',
      amount: 10,
      isDeleted: false,
      createdAt: '2026-09-03T14:00:00+00:00',
      paymentType: 'field_collection',
    }));
    const doc = buildBranchDetailDocument(snapshot({ movements, movementCount: 60 }));
    // 2 base pages + ceil(60 / 26) = 3 ledger pages.
    expect(doc.pages.length).toBe(5);
  });

  it('renders an empty ledger state for zero movements', () => {
    const html = assembleReportDocument(buildBranchDetailDocument(snapshot()));
    expect(html).toContain('Bu dönemde hareket yok');
  });

  it('renders a truncation note when the ledger is capped', () => {
    const movements = Array.from({ length: 26 }, (_, i) => ({
      id: UUID,
      kind: 'payment' as const,
      date: '2026-09-03',
      amount: 10,
      isDeleted: false,
      createdAt: '2026-09-03T14:00:00+00:00',
      paymentType: 'field_collection',
    }));
    const doc = buildBranchDetailDocument(
      snapshot({ movements, movementCount: 100, movementTruncated: true }),
    );
    const html = assembleReportDocument(doc);
    expect(html).toContain('Defter ilk');
  });

  it('escapes HTML in branch and product names', () => {
    const snap = snapshot({
      products: [
        {
          productId: UUID,
          productName: '<script>',
          deliveredQty: 1,
          returnedQty: 0,
          netQty: 1,
          sales: 10,
          returnedValue: 0,
          returnRate: 0,
        },
      ],
    });
    const html = assembleReportDocument(buildBranchDetailDocument(snap));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
