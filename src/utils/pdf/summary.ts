/**
 * Summary PDF — pure HTML builder.
 *
 * Consumes the validated `SummaryPdfSnapshot` (from report_summary_pdf) and
 * returns a `ReportDocument` of exactly two A4-landscape pages:
 *
 *   Page 1 — Yönetici Özeti: KPI strip, sales + returns trend charts, and
 *            "Dikkat Gerektiren Şubeler" (top-5 balance + top-5 return rate).
 *   Page 2 — Şube ve Ürün Detayı: top-8 branch performance table, top-5
 *            products by return rate and by return value, and a footnote.
 *
 * Pagination is deterministic: the document is a fixed sequence of pages
 * assembled by `assembleReportDocument`; nothing relies on WebView flow.
 */

import type { SummaryPdfSnapshot } from '@/services/supabase/summaryPdfSchema';

import type { ReportDocument, ReportPage } from './document';
import { emptyState, esc } from './document';
import {
  formatBalanceAmountPdf,
  formatBucketLabelPdf,
  formatCurrencyPdf,
  formatPercentPdf,
  formatQtyPdf,
  formatShortDatePdf,
  getBalanceLabelPdf,
} from './formatters';
import {
  BRAND_COLORS,
  PDF_CHART_PALETTE,
  rangeLabel,
} from './styles';
import {
  buildSvgLineChart,
  type LinePoint,
} from './svgCharts';

const CHART_GEOM = { width: 380, height: 118, paddingLeft: 34, paddingRight: 8, paddingTop: 8, paddingBottom: 22 };

// ─── KPI strip ────────────────────────────────────────────────────────────
function buildKpis(snap: SummaryPdfSnapshot): string {
  const { kpis } = snap;
  const outstanding = kpis.totalSales - kpis.totalCollection;
  const collectionRate = kpis.totalSales > 0 ? (kpis.totalCollection / kpis.totalSales) * 100 : null;

  const card = (label: string, value: string, sub?: string): string => `
    <div class="kpi">
      <div class="label">${esc(label)}</div>
      <div class="value">${value}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    </div>`;

  return `
    <div class="section">
      <div class="row gap-8">
        ${card('Toplam Satış', esc(formatCurrencyPdf(kpis.totalSales)))}
        ${card('Toplam Tahsilat', esc(formatCurrencyPdf(kpis.totalCollection)))}
        ${card('Bekleyen Alacak', esc(formatCurrencyPdf(outstanding)), 'Satış − Tahsilat')}
        ${card('İade Oranı', esc(formatPercentPdf(kpis.returnRate)))}
      </div>
      <div class="row gap-8" style="margin-top:8px;">
        ${card('Tahsilat Oranı', esc(formatPercentPdf(collectionRate)), 'Tahsilat / Satış')}
        ${card('Verilen / Alınan', esc(`${formatQtyPdf(kpis.deliveredQty)} / ${formatQtyPdf(kpis.returnedQty)}`), 'adet')}
        ${card('Aktif Şube', esc(formatQtyPdf(kpis.activeBranchCount)))}
        ${card('Aktif Ürün', esc(formatQtyPdf(kpis.activeProductCount)))}
      </div>
    </div>`;
}

// ─── Trend charts ─────────────────────────────────────────────────────────
function buildCharts(snap: SummaryPdfSnapshot): string {
  const gran = snap.period.granularity;

  const salesLine: LinePoint[] = snap.dailyPoints.map((p) => ({
    label: formatBucketLabelPdf(p.bucket, gran),
    value: p.sales,
  }));
  const returnsLine: LinePoint[] = snap.dailyPoints.map((p) => ({
    label: formatBucketLabelPdf(p.bucket, gran),
    value: p.returnedQty,
  }));

  const chart = (title: string, line: LinePoint[], color: string): string => `
    <div class="chart-wrap grow">
      <div class="chart-title">${esc(title)}</div>
      ${line.length === 0
        ? emptyState('Bu aralıkta veri yok')
        : buildSvgLineChart(line, { geom: CHART_GEOM, lineColor: color, showValues: false })}
    </div>`;

  return `
    <div class="section">
      <div class="row gap-8">
        ${chart('Toplam Satış (₺)', salesLine, PDF_CHART_PALETTE[0])}
        ${chart('İade Miktarı (adet)', returnsLine, BRAND_COLORS.destructive)}
      </div>
    </div>`;
}

// ─── Dikkat Gerektiren Şubeler ────────────────────────────────────────────
function buildAttentionBranches(snap: SummaryPdfSnapshot): string {
  const balanceRows = snap.branchesByBalance;
  const rateRows = snap.branchesByReturnRate;

  const balanceTable = (): string => {
    if (balanceRows.length === 0) return emptyState('Bu aralıkta veri yok');
    return `
      <table>
        <thead>
          <tr><th style="width:18px">#</th><th>Şube</th><th class="num">Bakiye</th><th>Yön</th></tr>
        </thead>
        <tbody>
          ${balanceRows
            .map((row, i) => {
              const dir = getBalanceLabelPdf(row.currentBalance);
              const tone = dir === 'Alacak' ? 'info' : dir === 'Borç' ? 'destruct' : '';
              const chip = dir
                ? `<span class="chip ${dir === 'Alacak' ? 'chip-alacak' : 'chip-borc'}">${esc(dir)}</span>`
                : '<span class="muted">—</span>';
              return `
                <tr>
                  <td class="muted">${i + 1}</td>
                  <td>${esc(row.label)}</td>
                  <td class="num ${tone}">${esc(formatBalanceAmountPdf(row.currentBalance))}</td>
                  <td>${chip}</td>
                </tr>`;
            })
            .join('')}
        </tbody>
      </table>`;
  };

  const rateTable = (): string => {
    if (rateRows.length === 0) return emptyState('Bu aralıkta veri yok');
    return `
      <table>
        <thead>
          <tr><th style="width:18px">#</th><th>Şube</th><th class="num">İade %</th><th class="num">Verilen / Alınan</th></tr>
        </thead>
        <tbody>
          ${rateRows
            .map((row, i) => `
              <tr>
                <td class="muted">${i + 1}</td>
                <td>${esc(row.label)}</td>
                <td class="num destruct">${esc(formatPercentPdf(row.returnRate))}</td>
                <td class="num">${esc(`${formatQtyPdf(row.delivered)} / ${formatQtyPdf(row.returned)}`)}</td>
              </tr>`)
            .join('')}
        </tbody>
      </table>`;
  };

  return `
    <div class="section">
      <div class="section-title">Dikkat Gerektiren Şubeler</div>
      <div class="row gap-8">
        <div class="chart-wrap grow">
          <div class="chart-title">Bakiye (Mutlak En Yüksek 5)</div>
          ${balanceTable()}
        </div>
        <div class="chart-wrap grow">
          <div class="chart-title">İade Oranı (En Yüksek 5)</div>
          ${rateTable()}
        </div>
      </div>
    </div>`;
}

// ─── Şube performansı (page 2) ────────────────────────────────────────────
function buildBranchPerformance(snap: SummaryPdfSnapshot): string {
  const rows = snap.branchesBySales;
  if (rows.length === 0) return emptyState('Bu aralıkta satış verisi yok');

  return `
    <div class="section">
      <div class="section-title">Şube Performansı (En Yüksek 8)</div>
      <div class="chart-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:18px">#</th><th>Şube</th>
              <th class="num">Satış ₺</th><th class="num">Tahsilat ₺</th>
              <th class="num">İade %</th><th class="num">Bakiye</th><th>Yön</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .map((row, i) => {
                const dir = getBalanceLabelPdf(row.currentBalance);
                const tone = dir === 'Alacak' ? 'info' : dir === 'Borç' ? 'destruct' : '';
                const chip = dir
                  ? `<span class="chip ${dir === 'Alacak' ? 'chip-alacak' : 'chip-borc'}">${esc(dir)}</span>`
                  : '<span class="muted">—</span>';
                return `
                  <tr>
                    <td class="muted">${i + 1}</td>
                    <td>${esc(row.label)}</td>
                    <td class="num">${esc(formatCurrencyPdf(row.sales))}</td>
                    <td class="num">${esc(formatCurrencyPdf(row.collection))}</td>
                    <td class="num destruct">${esc(formatPercentPdf(row.returnRate))}</td>
                    <td class="num ${tone}">${esc(formatBalanceAmountPdf(row.currentBalance))}</td>
                    <td>${chip}</td>
                  </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ─── Ürünler (page 2) ─────────────────────────────────────────────────────
function buildProducts(snap: SummaryPdfSnapshot): string {
  const byRate = snap.productsByReturnRate;
  const byValue = snap.productsByReturnedValue;

  const rateTable = (): string => {
    if (byRate.length === 0) return emptyState('Bu aralıkta veri yok');
    return `
      <table>
        <thead>
          <tr><th style="width:18px">#</th><th>Ürün</th><th class="num">Verilen</th><th class="num">İade</th><th class="num">İade %</th></tr>
        </thead>
        <tbody>
          ${byRate
            .map((row, i) => `
              <tr>
                <td class="muted">${i + 1}</td>
                <td>${esc(row.label)}</td>
                <td class="num">${esc(formatQtyPdf(row.delivered))}</td>
                <td class="num">${esc(formatQtyPdf(row.returned))}</td>
                <td class="num destruct">${esc(formatPercentPdf(row.returnRate))}</td>
              </tr>`)
            .join('')}
        </tbody>
      </table>`;
  };

  const valueTable = (): string => {
    if (byValue.length === 0) return emptyState('Bu aralıkta veri yok');
    return `
      <table>
        <thead>
          <tr><th style="width:18px">#</th><th>Ürün</th><th class="num">İade ₺</th></tr>
        </thead>
        <tbody>
          ${byValue
            .map((row, i) => `
              <tr>
                <td class="muted">${i + 1}</td>
                <td>${esc(row.label)}</td>
                <td class="num">${esc(formatCurrencyPdf(row.returnedValue))}</td>
              </tr>`)
            .join('')}
        </tbody>
      </table>`;
  };

  return `
    <div class="section">
      <div class="section-title">Ürün İadeleri</div>
      <div class="row gap-8">
        <div class="chart-wrap grow">
          <div class="chart-title">İade Oranı (En Yüksek 5)</div>
          ${rateTable()}
        </div>
        <div class="chart-wrap grow">
          <div class="chart-title">İade ₺ Değeri (En Yüksek 5)</div>
          ${valueTable()}
        </div>
      </div>
    </div>`;
}

function footnote(snap: SummaryPdfSnapshot): string {
  return `
    <div class="section" style="margin-top:auto;">
      <div class="muted" style="font-size:8px; line-height:1.4;">
        Bakiye, raporun oluşturulduğu andaki güncel değerdir; satış, tahsilat,
        verilen/alınan adet ve iade metrikleri ${esc(rangeLabel(snap.range))} dönemine
        (${esc(formatShortDatePdf(snap.period.startDate))} – ${esc(formatShortDatePdf(snap.period.endDate))}) aittir.
      </div>
    </div>`;
}

export function buildSummaryDocument(snap: SummaryPdfSnapshot): ReportDocument {
  const context = rangeLabel(snap.range);
  const rangeSpan = `${formatShortDatePdf(snap.period.startDate)} – ${formatShortDatePdf(snap.period.endDate)}`;

  const page1: ReportPage = {
    title: 'Genel Özet Raporu',
    contextLine: context,
    bodyHtml: `${buildKpis(snap)}${buildCharts(snap)}${buildAttentionBranches(snap)}`,
  };

  const page2: ReportPage = {
    title: 'Şube ve Ürün Detayı',
    contextLine: `${context} · ${rangeSpan}`,
    bodyHtml: `${buildBranchPerformance(snap)}${buildProducts(snap)}${footnote(snap)}`,
  };

  return {
    label: 'Genel Özet Raporu',
    generatedAt: snap.snapshotAt,
    pages: [page1, page2],
  };
}
