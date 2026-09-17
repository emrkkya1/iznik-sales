/**
 * Shared PDF document assembly.
 *
 * Report-specific builders return a `ReportDocument` (a list of page bodies);
 * this module turns that into a complete, self-contained HTML string with
 * uniform page chrome. Because the page count is known up front
 * (`pages.length`), the "sayfa X / Y" footer is computed before printing —
 * no reliance on WebView pagination.
 */

import { formatLongDatePdf } from './formatters';
import { PDF_STYLESHEET } from './styles';

export type ReportPage = {
  /** Page title rendered in the page header (h2). */
  title: string;
  /** Right-aligned context line (period / filter summary / branch + period). */
  contextLine: string;
  /** Report-specific body markup for this page. */
  bodyHtml: string;
};

export type ReportDocument = {
  /** Human-readable document label used in footers ("Genel Özet Raporu"). */
  label: string;
  /** ISO timestamp of the underlying data snapshot; formatted for the footer. */
  generatedAt: string;
  pages: ReportPage[];
};

/** HTML-escape a value for safe interpolation into markup/attributes. */
export function esc(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Centered muted empty-state block used when a section has no data. */
export function emptyState(message: string): string {
  return `<div class="chart-empty">${esc(message)}</div>`;
}

/** Split an array into fixed-size chunks (used for ledger/table pagination). */
export function chunkRows<T>(rows: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function pageSection(doc: ReportDocument, page: ReportPage, index: number): string {
  const total = doc.pages.length;
  const date = formatLongDatePdf(doc.generatedAt);
  return `
    <section class="pdf-page">
      <header class="page-header">
        <div>
          <div class="page-brand">Tarihi İznik Fırını</div>
          <h2 class="page-title">${esc(page.title)}</h2>
        </div>
        <div class="page-context">${esc(page.contextLine)}</div>
      </header>
      <div class="pdf-page-body">${page.bodyHtml}</div>
      <footer class="page-footer">
        <span>Tarihi İznik Fırını · ${esc(doc.label)}</span>
        <span>${esc(date)} · sayfa ${index + 1} / ${total}</span>
      </footer>
    </section>
  `;
}

/**
 * Build the full `<!DOCTYPE html>` document from a `ReportDocument`. Pass the
 * result directly to `Print.printToFileAsync({ html })`.
 */
export function assembleReportDocument(doc: ReportDocument): string {
  const body = doc.pages
    .map((page, index) => pageSection(doc, page, index))
    .join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>Tarihi İznik Fırını · ${esc(doc.label)}</title>
  <style>${PDF_STYLESHEET}</style>
</head>
<body>${body}</body>
</html>`;
}
