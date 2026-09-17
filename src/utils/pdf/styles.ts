/**
 * Brand styles for PDF reports.
 *
 * `expo-print` renders our HTML inside a WebView, so the styles live in a
 * single `<style>` block. Tailwind classNames are NOT applied here — the
 * WebView doesn't run the NativeWind runtime. We inline the CSS by hand
 * using the same hex values as `src/utils/chartPalette.ts` so the report
 * matches the dashboard visually.
 *
 * Page size: A4 landscape (842 × 595 px @ 72dpi). The `@page` rule below
 * only affects Android (iOS uses its own margin config passed to
 * printToFileAsync). Each document is a fixed sequence of `.pdf-page`
 * sections — every `.pdf-page` maps 1:1 to a PDF page, so pagination is
 * deterministic and page numbers are known before printing.
 */

import { CHART_PALETTE } from '@/utils/chartPalette';

// Brand hex mirror — kept here so the PDF CSS does not need to import
// from chartPalette.ts at render time (we hand-write the strings).
export const BRAND_COLORS = {
  primary: '#6A4715',
  primaryForeground: '#FFFCF7',
  secondary: '#004C6E',
  secondaryForeground: '#FFFFFF',
  background: '#FFFFFF',
  foreground: '#2C2115',
  card: '#FFFFFF',
  cardForeground: '#2C2115',
  muted: '#F6F0E8',
  mutedForeground: '#85653D',
  accent: '#F1E9E0',
  accentForeground: '#6A4715',
  border: '#E5DCCD',
  ring: '#724E1C',
  destructive: '#C43428',
  destructiveForeground: '#FFFFFF',
  info: '#006093',
  infoSoft: '#3C749C',
  chartAxis: '#E5DCCD',
  chartLabel: '#85653D',
} as const;

// Categorical palette used by donut / bar / line series.
export const PDF_CHART_PALETTE = [...CHART_PALETTE] as readonly string[];

// Per-report constants. A4 landscape @ 72dpi.
export const PAGE_WIDTH = 842;
export const PAGE_HEIGHT = 595;
export const PAGE_MARGIN_PX = 24;

// A4 paper ratio (297mm × 210mm). Exact — the PDF 842/595 ratio differs by
// ~0.06% due to PDF point rounding. Kept for any aspect-ratio consumers.
export const A4_ASPECT_RATIO = 297 / 210;

// Single shared stylesheet — injected into every PDF HTML document.
// Keep the selector list flat; nesting hurts cross-WebView compatibility.
//
// Android WebView does not consistently honor a pixel-sized @page. Use native
// paper units and the landscape keyword so the HTML section and PDF canvas
// share the same physical A4 geometry on both Android and iOS.
export const PDF_STYLESHEET = `
  @page { size: A4 landscape; margin: 0; }

  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: ${BRAND_COLORS.background};
    color: ${BRAND_COLORS.foreground};
    font-family: 'Helvetica', 'Arial', sans-serif;
    font-size: 10px;
    line-height: 1.35;
  }

  .pdf-page {
    width: 297mm;
    height: 210mm;
    padding: 8mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    position: relative;
    page-break-after: always;
    page-break-inside: avoid;
  }
  .pdf-page:last-child { page-break-after: auto; }

  .page-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    border-bottom: 1px solid ${BRAND_COLORS.border};
    padding-bottom: 10px;
    margin-bottom: 12px;
  }
  .page-brand {
    font-size: 8px;
    color: ${BRAND_COLORS.mutedForeground};
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  .page-title {
    margin: 2px 0 0;
    font-size: 16px;
    font-weight: 700;
    color: ${BRAND_COLORS.foreground};
  }
  .page-context {
    font-size: 9px;
    color: ${BRAND_COLORS.mutedForeground};
    text-align: right;
    white-space: nowrap;
  }

  .pdf-page-body {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding-bottom: 12mm;
  }

  .page-footer {
    position: absolute;
    left: 8mm;
    right: 8mm;
    bottom: 4mm;
    padding-top: 6px;
    border-top: 1px solid ${BRAND_COLORS.border};
    display: flex;
    justify-content: space-between;
    font-size: 7.5px;
    color: ${BRAND_COLORS.mutedForeground};
  }

  .section { margin-bottom: 12px; }
  .section:last-child { margin-bottom: 0; }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: ${BRAND_COLORS.mutedForeground};
    margin-bottom: 6px;
  }

  h1, h2, h3, h4 { margin: 0; font-weight: 700; color: ${BRAND_COLORS.foreground}; }

  .muted   { color: ${BRAND_COLORS.mutedForeground}; }
  .destruct { color: ${BRAND_COLORS.destructive}; }
  .info    { color: ${BRAND_COLORS.info}; }
  .strong  { font-weight: 700; }

  .row { display: flex; flex-direction: row; }
  .col { display: flex; flex-direction: column; }
  .grow { flex: 1 1 auto; min-width: 0; }
  .gap-4 { gap: 4px; }
  .gap-8 { gap: 8px; }
  .gap-12 { gap: 12px; }
  .gap-16 { gap: 16px; }
  .gap-24 { gap: 24px; }
  .center { align-items: center; justify-content: center; }
  .between { justify-content: space-between; }
  .items-center { align-items: center; }
  .items-end    { align-items: flex-end; }
  .items-start  { align-items: flex-start; }
  .items-baseline { align-items: baseline; }

  /* KPI cards */
  .kpi {
    border: 1px solid ${BRAND_COLORS.border};
    border-radius: 10px;
    background: ${BRAND_COLORS.card};
    padding: 8px 10px;
    flex: 1 1 0;
    min-width: 0;
  }
  .kpi .label {
    font-size: 8.5px;
    color: ${BRAND_COLORS.mutedForeground};
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 4px;
  }
  .kpi .value {
    font-size: 16px;
    font-weight: 700;
    color: ${BRAND_COLORS.foreground};
  }
  .kpi .sub {
    font-size: 8.5px;
    color: ${BRAND_COLORS.mutedForeground};
    margin-top: 2px;
  }

  /* Tables */
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 9px;
  }
  thead th {
    text-align: left;
    padding: 5px 7px;
    font-weight: 700;
    color: ${BRAND_COLORS.mutedForeground};
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 1px solid ${BRAND_COLORS.border};
    background: ${BRAND_COLORS.muted};
  }
  tbody td {
    padding: 4px 7px;
    border-bottom: 1px solid ${BRAND_COLORS.border};
    color: ${BRAND_COLORS.foreground};
    vertical-align: middle;
  }
  tbody tr { page-break-inside: avoid; }
  tbody tr:last-child td { border-bottom: none; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  th.num { text-align: right; }
  td.destruct { color: ${BRAND_COLORS.destructive}; font-weight: 700; }
  td.info    { color: ${BRAND_COLORS.info}; font-weight: 700; }
  tfoot td {
    padding: 6px 7px 0;
    border-top: 2px solid ${BRAND_COLORS.foreground};
    font-weight: 700;
    font-size: 9px;
  }

  /* Definition lists (filter echo / metadata) */
  .kv { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; }
  .kv .k { color: ${BRAND_COLORS.mutedForeground}; }
  .kv .v { font-weight: 600; text-align: right; }

  /* Chart wrappers */
  .chart-wrap {
    border: 1px solid ${BRAND_COLORS.border};
    border-radius: 8px;
    padding: 6px 8px;
    background: ${BRAND_COLORS.card};
  }
  .chart-title {
    font-size: 10px;
    font-weight: 700;
    color: ${BRAND_COLORS.foreground};
    margin-bottom: 4px;
  }
  .chart-empty {
    text-align: center;
    color: ${BRAND_COLORS.mutedForeground};
    padding: 16px 0;
    font-size: 9px;
  }
  svg { display: block; }

  /* Chips / badges */
  .chip {
    display: inline-block;
    border-radius: 999px;
    padding: 1px 8px;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }
  .chip-active   { background: ${BRAND_COLORS.accent}; color: ${BRAND_COLORS.accentForeground}; }
  .chip-inactive { background: ${BRAND_COLORS.muted}; color: ${BRAND_COLORS.mutedForeground}; }
  .chip-alacak   { background: ${BRAND_COLORS.info}; color: #FFFFFF; }
  .chip-borc     { background: ${BRAND_COLORS.destructive}; color: #FFFFFF; }
`;

// Returns the localized display label for a `SummaryRange` value.
export function rangeLabel(range: 'week' | 'month' | 'all'): string {
  if (range === 'week') return 'Bu Hafta';
  if (range === 'month') return 'Bu Ay';
  return 'Tüm Zamanlar';
}
