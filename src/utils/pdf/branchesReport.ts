/**
 * Şubeler Raporu — pure HTML builder.
 *
 * Consumes a validated `BranchReportSnapshot` and returns a `ReportDocument`:
 *
 *   Page 1 — cover: filter echo + KPI strip + first rows of the branch table.
 *   Pages 2..N — 24-row continuation pages with a totals row on the last one.
 *
 * The report honors the exact on-screen filters (the RPC reuses M23's
 * predicates + ordering), so the PDF can never disagree with the table.
 */

import type { BranchReportSnapshot } from '@/services/supabase/branchesReportSchema';

import type { ReportDocument, ReportPage } from './document';
import { chunkRows, emptyState, esc } from './document';
import {
  formatBalanceAmountPdf,
  formatCurrencyPdf,
  formatPercentPdf,
  formatQtyPdf,
  formatShortDatePdf,
  getBalanceLabelPdf,
} from './formatters';

const COVER_ROWS = 10;
const PAGE_ROWS = 24;

// Local mirror of the day-of-week labels (Mon-first display order, matching
// DayOfWeekPicker). Kept local so this pure builder has no react-native import.
const DOW_SHORT: Record<number, string> = {
  0: 'Pa',
  1: 'Pt',
  2: 'Sa',
  3: 'Ça',
  4: 'Pe',
  5: 'Cu',
  6: 'Ct',
};
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];

const SORT_LABELS: Record<string, string> = {
  name: 'Şube Adı',
  balance: 'Bakiye',
  return_rate: 'İade Oranı',
  last_activity: 'Son İşlem',
  location: 'Konum',
};

function dayLabels(daysOfWeek: number[] | null): string {
  if (!daysOfWeek || daysOfWeek.length === 0) return 'Tümü';
  return DOW_ORDER.filter((d) => daysOfWeek.includes(d))
    .map((d) => DOW_SHORT[d])
    .join(', ');
}

function describeFilters(snap: BranchReportSnapshot): string {
  const f = snap.filters;
  const status = f.status === 'active' ? 'Aktif' : f.status === 'inactive' ? 'Pasif' : 'Tümü';
  const range =
    f.dateFrom || f.dateTo
      ? `${f.dateFrom ? formatShortDatePdf(f.dateFrom) : '…'} – ${f.dateTo ? formatShortDatePdf(f.dateTo) : '…'}`
      : 'Tüm zamanlar';
  const location = f.cityName || f.districtName
    ? [f.cityName, f.districtName].filter(Boolean).join(' / ')
    : 'Tümü';
  const sort = `${SORT_LABELS[f.sortBy] ?? f.sortBy} (${f.sortDir === 'asc' ? 'artan' : 'azalan'})`;

  const kv = (k: string, v: string) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`;
  return `
    <div class="section">
      <div class="section-title">Uygulanan Filtreler</div>
      <div class="chart-wrap">
        ${kv('Arama', f.search ?? 'Tümü')}
        ${kv('Durum', status)}
        ${kv('Tarih Aralığı', range)}
        ${kv('Haftanın Günleri', dayLabels(f.daysOfWeek))}
        ${kv('Şehir / İlçe', location)}
        ${kv('Sıralama', sort)}
      </div>
    </div>`;
}

function buildKpis(snap: BranchReportSnapshot): string {
  const s = snap.summary;
  const card = (label: string, value: string, sub?: string) => `
    <div class="kpi">
      <div class="label">${esc(label)}</div>
      <div class="value">${value}</div>
      ${sub ? `<div class="sub">${esc(sub)}</div>` : ''}
    </div>`;

  return `
    <div class="section">
      <div class="section-title">Genel Bakış</div>
      <div class="row gap-8">
        ${card('Şube Sayısı', esc(formatQtyPdf(s.branchCount)), `${formatQtyPdf(s.activeBranchCount)} aktif`)}
        ${card('Toplam Satış', esc(formatCurrencyPdf(s.totalSales)))}
        ${card('Toplam Tahsilat', esc(formatCurrencyPdf(s.totalCollection)))}
      </div>
      <div class="row gap-8" style="margin-top:8px;">
        ${card('Net Bakiye', esc(formatBalanceAmountPdf(s.balanceSum)), getBalanceLabelPdf(s.balanceSum) ?? undefined)}
        ${card('İade Oranı', esc(formatPercentPdf(s.returnRate)))}
        ${card('Son İşlem', esc(s.lastActivityDate ? formatShortDatePdf(s.lastActivityDate) : '—'))}
      </div>
    </div>`;
}

function balanceChip(value: number): string {
  const dir = getBalanceLabelPdf(value);
  if (!dir) return '<span class="muted">—</span>';
  return `<span class="chip ${dir === 'Alacak' ? 'chip-alacak' : 'chip-borc'}">${esc(dir)}</span>`;
}

function renderTable(
  rows: BranchReportSnapshot['rows'],
  opts: { withTotals: boolean; startIndex: number },
  snap: BranchReportSnapshot,
): string {
  if (rows.length === 0) return emptyState('Filtrelerle eşleşen şube bulunamadı');

  const body = rows
    .map((row, i) => `
      <tr>
        <td class="muted">${opts.startIndex + i + 1}</td>
        <td>${esc(row.name)}${row.isActive ? '' : ' <span class="muted">(pasif)</span>'}</td>
        <td class="muted">${esc(row.cityName)} / ${esc(row.districtName)}</td>
        <td class="num">${esc(formatCurrencyPdf(row.salesTotal))}</td>
        <td class="num">${esc(formatCurrencyPdf(row.collectionTotal))}</td>
        <td class="num">${esc(formatBalanceAmountPdf(row.currentBalance))} ${balanceChip(row.currentBalance)}</td>
        <td class="num destruct">${esc(formatPercentPdf(row.returnRate))}</td>
        <td class="num muted">${esc(row.lastActivityDate ? formatShortDatePdf(row.lastActivityDate) : '—')}</td>
      </tr>`)
    .join('');

  const totals = opts.withTotals
    ? `<tfoot><tr>
        <td></td><td class="strong">Toplam (${snap.summary.branchCount} şube)</td><td></td>
        <td class="num">${esc(formatCurrencyPdf(snap.summary.totalSales))}</td>
        <td class="num">${esc(formatCurrencyPdf(snap.summary.totalCollection))}</td>
        <td class="num">${esc(formatBalanceAmountPdf(snap.summary.balanceSum))}</td>
        <td class="num">${esc(formatPercentPdf(snap.summary.returnRate))}</td>
        <td></td>
      </tr></tfoot>`
    : '';

  return `
    <div class="chart-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:16px">#</th>
            <th>Şube</th>
            <th>Şehir / İlçe</th>
            <th class="num">Satış ₺</th>
            <th class="num">Tahsilat ₺</th>
            <th class="num">Bakiye</th>
            <th class="num">İade %</th>
            <th class="num">Son İşlem</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
        ${totals}
      </table>
    </div>`;
}

function contextLine(snap: BranchReportSnapshot): string {
  const f = snap.filters;
  const parts: string[] = [];
  if (f.search) parts.push(`"${f.search}"`);
  if (f.status !== 'all') parts.push(f.status === 'active' ? 'Aktif' : 'Pasif');
  if (f.dateFrom || f.dateTo) {
    parts.push(`${f.dateFrom ?? '…'} – ${f.dateTo ?? '…'}`);
  }
  if (f.cityName) parts.push(f.cityName);
  return parts.length > 0 ? parts.join(' · ') : 'Tüm Şubeler';
}

export function buildBranchesDocument(snap: BranchReportSnapshot): ReportDocument {
  const rows = snap.rows;

  // Single page when the whole set fits on the cover.
  if (rows.length <= COVER_ROWS) {
    return {
      label: 'Şubeler Raporu',
      generatedAt: snap.snapshotAt,
      pages: [
        {
          title: 'Şubeler Raporu',
          contextLine: contextLine(snap),
          bodyHtml: `${describeFilters(snap)}${buildKpis(snap)}${renderTable(rows, { withTotals: true, startIndex: 0 }, snap)}`,
        },
      ],
    };
  }

  const pages: ReportPage[] = [];
  const coverRows = rows.slice(0, COVER_ROWS);
  const rest = rows.slice(COVER_ROWS);
  const restChunks = chunkRows(rest, PAGE_ROWS);

  pages.push({
    title: 'Şubeler Raporu',
    contextLine: contextLine(snap),
    bodyHtml: `${describeFilters(snap)}${buildKpis(snap)}${renderTable(coverRows, { withTotals: false, startIndex: 0 }, snap)}`,
  });

  restChunks.forEach((chunk, index) => {
    const isLast = index === restChunks.length - 1;
    pages.push({
      title: `Şube Listesi (devam) — ${snap.summary.branchCount} şube`,
      contextLine: contextLine(snap),
      bodyHtml: renderTable(chunk, { withTotals: isLast, startIndex: COVER_ROWS + index * PAGE_ROWS }, snap),
    });
  });

  return { label: 'Şubeler Raporu', generatedAt: snap.snapshotAt, pages };
}
