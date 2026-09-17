/**
 * Şube Detay Raporu — pure HTML builder.
 *
 * Consumes a validated `BranchHubReport` and returns a `ReportDocument`:
 *
 *   Page 1 — identity strip + period KPIs + balance breakdown + sales trend.
 *   Page 2 — per-product performance table (plus a top-5 bar chart when the
 *            product list is short, so the page never looks empty).
 *   Pages 3..N — movement ledger (26 rows/page), totals + truncation note on
 *            the final page.
 */

import type { BranchHubReport } from '@/services/supabase/branchHubReportSchema';

import type { ReportDocument, ReportPage } from './document';
import { chunkRows, emptyState, esc } from './document';
import {
  formatBalanceAmountPdf,
  formatBucketLabelPdf,
  formatCurrencyPdf,
  formatPercentPdf,
  formatQtyPdf,
  formatShortDatePdf,
  getBalanceLabelPdf,
} from './formatters';
import { PDF_CHART_PALETTE } from './styles';
import { buildSvgBarChart, buildSvgLineChart, type LinePoint } from './svgCharts';

const LEDGER_ROWS = 26;
const PRODUCT_CHART_THRESHOLD = 12;

function periodLabel(period: BranchHubReport['period']): string {
  if (!period.dateFrom && !period.dateTo) return 'Tüm Zamanlar';
  return `${period.dateFrom ? formatShortDatePdf(period.dateFrom) : '…'} – ${period.dateTo ? formatShortDatePdf(period.dateTo) : '…'}`;
}

function safeDate(value: string | null): string {
  if (!value || value <= '1900-01-02') return '—';
  return formatShortDatePdf(value);
}

function chip(value: number): string {
  const dir = getBalanceLabelPdf(value);
  if (!dir) return '<span class="muted">—</span>';
  return `<span class="chip ${dir === 'Alacak' ? 'chip-alacak' : 'chip-borc'}">${esc(dir)}</span>`;
}

// ─── Page 1 ────────────────────────────────────────────────────────────────
function buildIdentity(snap: BranchHubReport): string {
  const id = snap.identity;
  const cell = (label: string, value: string) => `
    <div class="kpi">
      <div class="label">${esc(label)}</div>
      <div class="value">${value}</div>
    </div>`;
  return `
    <div class="section">
      <div class="row gap-8">
        ${cell('Şehir / İlçe', esc(`${id.cityName} / ${id.districtName}`))}
        ${cell('Durum', id.isActive ? '<span class="chip chip-active">Aktif</span>' : '<span class="chip chip-inactive">Pasif</span>')}
        ${cell('Açılış Tarihi', esc(safeDate(id.branchCreatedAt)))}
        ${cell('Aktif Ürün', esc(`${formatQtyPdf(id.activeProductCount)} / ${formatQtyPdf(id.totalProductCount)}`))}
      </div>
    </div>`;
}

function buildPeriodKpis(snap: BranchHubReport): string {
  const m = snap.metrics;
  const card = (label: string, value: string, sub?: string) => `
    <div class="kpi">
      <div class="label">${esc(label)}</div>
      <div class="value">${value}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    </div>`;
  return `
    <div class="section">
      <div class="section-title">Dönem Özeti</div>
      <div class="row gap-8">
        ${card('Dönem Satışı', esc(formatCurrencyPdf(m.totalSales)))}
        ${card('Dönem Tahsilatı', esc(formatCurrencyPdf(m.totalCollection)))}
        ${card('Tahsilat Oranı', esc(formatPercentPdf(m.collectionRate)), 'Tahsilat / Satış')}
      </div>
      <div class="row gap-8" style="margin-top:8px;">
        ${card('Verilen / Alınan', esc(`${formatQtyPdf(m.deliveredQty)} / ${formatQtyPdf(m.returnedQty)}`), 'adet')}
        ${card('İade Oranı', esc(formatPercentPdf(m.returnRate)))}
        ${card('Hareket Sayısı', esc(formatQtyPdf(snap.movementCount)))}
      </div>
    </div>`;
}

function buildBalanceBreakdown(snap: BranchHubReport): string {
  const net = snap.metrics.totalSales - snap.metrics.totalCollection;
  const card = (label: string, value: string, sub?: string) => `
    <div class="kpi">
      <div class="label">${esc(label)}</div>
      <div class="value">${value}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    </div>`;
  return `
    <div class="section">
      <div class="section-title">Bakiye Detayları</div>
      <div class="row gap-8">
        ${card('Dönem Başı', `${esc(formatBalanceAmountPdf(snap.periodOpeningBalance))} ${chip(snap.periodOpeningBalance)}`)}
        ${card('Net Değişim', `${esc(formatBalanceAmountPdf(net))} ${chip(net)}`, 'Satış − Tahsilat')}
        ${card('Güncel Bakiye', `${esc(formatBalanceAmountPdf(snap.identity.currentBalance))} ${chip(snap.identity.currentBalance)}`, 'Dönem Başı + Net Değişim')}
      </div>
    </div>`;
}

function buildTrend(snap: BranchHubReport): string {
  const line: LinePoint[] = snap.dailySales.map((p) => ({
    label: formatBucketLabelPdf(p.bucket, 'day'),
    value: p.sales,
  }));
  return `
    <div class="section">
      <div class="section-title">Satış Trendi</div>
      <div class="chart-wrap">
        <div class="chart-title">Günlük Satış (₺)</div>
        ${line.length === 0
          ? emptyState('Bu dönemde satış verisi yok')
          : buildSvgLineChart(line, {
              geom: { width: 760, height: 96, paddingLeft: 34, paddingRight: 8, paddingTop: 8, paddingBottom: 22 },
              lineColor: PDF_CHART_PALETTE[0],
              showValues: false,
            })}
      </div>
    </div>`;
}

// ─── Page 2 ────────────────────────────────────────────────────────────────
function buildProducts(snap: BranchHubReport): string {
  const rows = snap.products;
  if (rows.length === 0) return emptyState('Bu dönemde ürün hareketi yok');

  const table = `
    <div class="chart-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:16px">#</th>
            <th>Ürün</th>
            <th class="num">Verilen</th>
            <th class="num">Alınan</th>
            <th class="num">Net</th>
            <th class="num">Satış ₺</th>
            <th class="num">İade ₺</th>
            <th class="num">İade %</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((row, i) => `
              <tr>
                <td class="muted">${i + 1}</td>
                <td>${esc(row.productName)}</td>
                <td class="num">${esc(formatQtyPdf(row.deliveredQty))}</td>
                <td class="num">${esc(formatQtyPdf(row.returnedQty))}</td>
                <td class="num">${esc(formatQtyPdf(row.netQty))}</td>
                <td class="num">${esc(formatCurrencyPdf(row.sales))}</td>
                <td class="num">${esc(formatCurrencyPdf(row.returnedValue))}</td>
                <td class="num destruct">${esc(formatPercentPdf(row.returnRate))}</td>
              </tr>`)
            .join('')}
        </tbody>
      </table>
    </div>`;

  // When the product list is short, add a top-5 sales bar chart beside the
  // table so the page stays filled and readable.
  if (rows.length < PRODUCT_CHART_THRESHOLD) {
    const bars = [...rows].sort((a, b) => b.sales - a.sales).slice(0, 5).map((r) => ({
      label: r.productName,
      value: r.sales,
    }));
    return `
      <div class="section">
        <div class="row gap-8">
          <div class="grow">${table}</div>
          <div class="chart-wrap" style="width:260px;">
            <div class="chart-title">Satış (En Yüksek 5)</div>
            ${buildSvgBarChart(bars, {
              geom: { width: 240, height: 160, paddingLeft: 34, paddingRight: 8, paddingTop: 8, paddingBottom: 22 },
              barColor: PDF_CHART_PALETTE[1] ?? PDF_CHART_PALETTE[0],
            })}
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="section">
      <div class="section-title">Ürün Performansı</div>
      ${table}
    </div>`;
}

// ─── Pages 3..N ────────────────────────────────────────────────────────────
function movementNet(row: BranchHubReport['movements'][number]): number {
  if (row.kind === 'delivery') {
    return (row.payment?.amount ?? 0) - row.amount;
  }
  return row.amount;
}

function renderLedger(rows: BranchHubReport['movements'], opts: { withTotals: boolean; startIndex: number }, snap: BranchHubReport): string {
  if (rows.length === 0) return emptyState('Bu dönemde hareket yok');

  const body = rows
    .map((row, i) => {
      const isDelivery = row.kind === 'delivery';
      const title = isDelivery ? 'Teslimat' : 'Tahsilat';
      const paymentType = isDelivery ? row.payment?.paymentType : row.paymentType;
      return `
        <tr>
          <td class="muted">${opts.startIndex + i + 1}</td>
          <td class="muted">${esc(safeDate(row.date))}</td>
          <td>${esc(title)}${row.isDeleted ? ' <span class="destruct">(silindi)</span>' : ''}</td>
          <td class="num">${esc(formatCurrencyPdf(movementNet(row)))}</td>
          <td class="num">${isDelivery && row.payment ? esc(formatCurrencyPdf(row.payment.amount)) : '—'}</td>
          <td class="muted">${esc(paymentType ?? '—')}</td>
        </tr>`;
    })
    .join('');

  const totals = opts.withTotals
    ? `<tfoot><tr>
        <td></td><td></td>
        <td class="strong">Dönem Toplamları</td>
        <td class="num">${esc(formatCurrencyPdf(snap.metrics.totalSales))}</td>
        <td class="num">${esc(formatCurrencyPdf(snap.metrics.totalCollection))}</td>
        <td></td>
      </tr></tfoot>`
    : '';

  return `
    <div class="chart-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:16px">#</th>
            <th>Tarih</th>
            <th>Tür</th>
            <th class="num">Tutar ₺</th>
            <th class="num">Tahsilat ₺</th>
            <th>Ödeme Türü</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
        ${totals}
      </table>
    </div>`;
}

export function buildBranchDetailDocument(snap: BranchHubReport): ReportDocument {
  const label = `Şube Raporu — ${snap.identity.name}`;
  const context = periodLabel(snap.period);

  const pages: ReportPage[] = [
    {
      title: label,
      contextLine: context,
      bodyHtml: `${buildIdentity(snap)}${buildPeriodKpis(snap)}${buildBalanceBreakdown(snap)}${buildTrend(snap)}`,
    },
    {
      title: 'Ürün Performansı',
      contextLine: `${snap.identity.name} · ${context}`,
      bodyHtml: buildProducts(snap),
    },
  ];

  const ledger = snap.movements;
  const ledgerChunks = chunkRows(ledger, LEDGER_ROWS);

  if (ledgerChunks.length === 0) {
    // Always emit a ledger page so the document has a predictable shape,
    // even for an empty period (shows an intentional empty state).
    pages.push({
      title: `Hareket Defteri (${snap.identity.name})`,
      contextLine: context,
      bodyHtml: renderLedger([], { withTotals: true, startIndex: 0 }, snap),
    });
    return { label, generatedAt: snap.snapshotAt, pages };
  }

  ledgerChunks.forEach((chunk, index) => {
    const isLast = index === ledgerChunks.length - 1;
    const bodyHtml = `${renderLedger(chunk, { withTotals: isLast, startIndex: index * LEDGER_ROWS }, snap)}${
      isLast && snap.movementTruncated
        ? `<div class="muted" style="font-size:8px; margin-top:6px;">Defter ilk ${formatQtyPdf(ledger.length)} hareket ile sınırlıdır (toplam ${formatQtyPdf(snap.movementCount)}).</div>`
        : ''
    }`;
    pages.push({
      title: `Hareket Defteri (${snap.identity.name})${index > 0 ? ' — devam' : ''}`,
      contextLine: context,
      bodyHtml,
    });
  });

  return { label, generatedAt: snap.snapshotAt, pages };
}
