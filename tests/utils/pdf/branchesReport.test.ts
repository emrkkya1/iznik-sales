import { describe, expect, it } from 'vitest';

import type { BranchReportSnapshot } from '@/services/supabase/branchesReportSchema';

import { buildBranchesDocument } from '@/utils/pdf/branchesReport';
import { assembleReportDocument } from '@/utils/pdf/document';

const UUID = '00000000-0000-4000-8000-000000000001';

function row(index: number): BranchReportSnapshot['rows'][number] {
  return {
    branchId: UUID,
    name: `Şube ${index}`,
    cityName: 'İznik',
    districtName: 'Merkez',
    currentBalance: 100 * index,
    deliveredQty: 10,
    returnedQty: 1,
    returnRate: 10,
    lastActivityDate: '2026-09-03',
    isActive: index % 2 === 0,
    salesTotal: 100 * index,
    collectionTotal: 50 * index,
    deliveryCount: 1,
    paymentCount: 1,
  };
}

function snapshot(count: number, overrides: Partial<BranchReportSnapshot> = {}): BranchReportSnapshot {
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
      branchCount: count,
      activeBranchCount: Math.ceil(count / 2),
      totalSales: 1000,
      totalCollection: 500,
      deliveredQty: 100,
      returnedQty: 10,
      returnRate: 10,
      balanceSum: 500,
      lastActivityDate: '2026-09-03',
    },
    rows: Array.from({ length: count }, (_, i) => row(i + 1)),
    totalCount: count,
    truncated: false,
    ...overrides,
  };
}

describe('buildBranchesDocument', () => {
  it('produces a single page when the set fits on the cover', () => {
    const doc = buildBranchesDocument(snapshot(5));
    expect(doc.pages).toHaveLength(1);
  });

  it('paginates larger sets with continuation pages', () => {
    const doc = buildBranchesDocument(snapshot(40));
    // 10 cover + ceil(30 / 24) = 2 continuation pages.
    expect(doc.pages).toHaveLength(3);
    expect(doc.pages[1]!.title).toContain('devam');
  });

  it('renders the filter echo and KPI overview on the cover', () => {
    const html = assembleReportDocument(buildBranchesDocument(snapshot(3)));
    expect(html).toContain('Uygulanan Filtreler');
    expect(html).toContain('Genel Bakış');
    expect(html).toContain('Toplam Satış');
  });

  it('renders a totals row only on the last page', () => {
    const doc = buildBranchesDocument(snapshot(40));
    const first = assembleReportDocument({
      ...doc,
      pages: [doc.pages[0]!],
    });
    const last = assembleReportDocument({
      ...doc,
      pages: [doc.pages[doc.pages.length - 1]!],
    });
    expect(first).not.toContain('Toplam (40 şube)');
    expect(last).toContain('Toplam (40 şube)');
  });

  it('escapes HTML in branch names', () => {
    const snap = snapshot(1);
    snap.rows = [{ ...row(1), name: '<script>' }];
    const html = assembleReportDocument(buildBranchesDocument(snap));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders an empty state for zero rows', () => {
    const html = assembleReportDocument(buildBranchesDocument(snapshot(0)));
    expect(html).toContain('Filtrelerle eşleşen şube bulunamadı');
  });

  it('echoes active filters in the context line', () => {
    const snap = snapshot(2);
    snap.filters = { ...snap.filters, status: 'active', cityName: 'İznik' };
    const html = assembleReportDocument(buildBranchesDocument(snap));
    expect(html).toContain('İznik');
  });
});
