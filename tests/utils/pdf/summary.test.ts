import { describe, expect, it } from 'vitest';

import type { SummaryPdfSnapshot } from '@/services/supabase/summaryPdfSchema';

import { buildSummaryDocument } from '@/utils/pdf/summary';
import { assembleReportDocument } from '@/utils/pdf/document';

const UUID = '00000000-0000-4000-8000-000000000001';

function snapshotFixture(): SummaryPdfSnapshot {
  return {
    schemaVersion: 1,
    range: 'week',
    snapshotAt: '2026-09-03T14:25:33',
    period: { startDate: '2026-08-31', endDate: '2026-09-03', granularity: 'day' },
    filters: { dateFrom: null, dateTo: null, daysOfWeek: null, productFilterApplied: false, salesProductScoped: false, paymentsAllProducts: true, balancesAllProducts: true },
    kpis: {
      totalSales: 12345.67,
      totalCollection: 10000,
      deliveredQty: 500,
      returnedQty: 25,
      returnRate: 5,
      activeBranchCount: 7,
      activeProductCount: 12,
    },
    dailyPoints: [
      { bucket: '2026-09-01', sales: 4000, deliveredQty: 200, returnedQty: 10 },
      { bucket: '2026-09-02', sales: 4000, deliveredQty: 150, returnedQty: 5 },
      { bucket: '2026-09-03', sales: 4345.67, deliveredQty: 150, returnedQty: 10 },
    ],
    branchesBySales: [
      { id: UUID, label: 'Şube A', sales: 5000, collection: 4000, returnRate: 5, currentBalance: 1000 },
      { id: UUID, label: 'Şube B', sales: 3000, collection: 3500, returnRate: 10, currentBalance: -500 },
    ],
    branchesByReturnRate: [
      { id: UUID, label: 'Şube B', returnRate: 10, delivered: 100, returned: 10 },
    ],
    branchesByBalance: [
      { id: UUID, label: 'Pozitif', currentBalance: 1500 },
      { id: UUID, label: 'Negatif', currentBalance: -2000 },
    ],
    productsByReturnRate: [
      { id: UUID, label: 'Ürün X', delivered: 100, returned: 50, returnRate: 50, returnedValue: 500 },
    ],
    productsByReturnedValue: [
      { id: UUID, label: 'Ürün X', delivered: 100, returned: 50, returnRate: 50, returnedValue: 500 },
    ],
  };
}

describe('buildSummaryDocument', () => {
  it('produces exactly two pages', () => {
    const doc = buildSummaryDocument(snapshotFixture());
    expect(doc.pages).toHaveLength(2);
  });

  it('renders KPI labels on page 1', () => {
    const doc = buildSummaryDocument(snapshotFixture());
    const html = assembleReportDocument(doc);
    expect(html).toContain('Toplam Satış');
    expect(html).toContain('Toplam Tahsilat');
    expect(html).toContain('Bekleyen Alacak');
    expect(html).toContain('İade Oranı');
  });

  it('renders the two trend charts on page 1', () => {
    const doc = buildSummaryDocument(snapshotFixture());
    const html = assembleReportDocument(doc);
    expect(html).toContain('Toplam Satış (₺)');
    expect(html).toContain('İade Miktarı (adet)');
  });

  it('renders branch performance + product tables on page 2', () => {
    const doc = buildSummaryDocument(snapshotFixture());
    const html = assembleReportDocument(doc);
    expect(html).toContain('Şube Performansı');
    expect(html).toContain('İade Oranı (En Yüksek 5)');
    expect(html).toContain('İade ₺ Değeri (En Yüksek 5)');
  });

  it('renders balance direction chips (Alacak/Borç)', () => {
    const doc = buildSummaryDocument(snapshotFixture());
    const html = assembleReportDocument(doc);
    expect(html).toContain('Alacak');
    expect(html).toContain('Borç');
  });

  it('escapes HTML in labels', () => {
    const snap = snapshotFixture();
    snap.branchesByBalance = [
      { id: UUID, label: '<script>', currentBalance: 1500 },
    ];
    const html = assembleReportDocument(buildSummaryDocument(snap));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders empty states for empty datasets without breaking page count', () => {
    const snap = snapshotFixture();
    snap.branchesByBalance = [];
    snap.branchesByReturnRate = [];
    snap.branchesBySales = [];
    snap.productsByReturnRate = [];
    snap.productsByReturnedValue = [];
    const doc = buildSummaryDocument(snap);
    expect(doc.pages).toHaveLength(2);
    const html = assembleReportDocument(doc);
    expect(html).toContain('Bu aralıkta veri yok');
  });

  it('renders Turkish range label in the context line', () => {
    const doc = buildSummaryDocument({ ...snapshotFixture(), range: 'month' });
    expect(assembleReportDocument(doc)).toContain('Bu Ay');
  });
});
