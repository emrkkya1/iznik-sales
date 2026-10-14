/**
 * PDF formatters — mirror `src/utils/formatters.ts` so the PDF and the
 * dashboard render the same Turkish strings byte-for-byte. We don't share
 * the helpers directly because `Intl.NumberFormat` is a JS-runtime thing
 * and the dashboard already owns those instances — keeping PDF copies
 * makes the boundary explicit and testable in isolation.
 *
 * Rules:
 *   * Locale 'tr-TR' everywhere.
 *   * Currency in ₺ (TRY), no decimals stripping (Intl handles it).
 *   * Quantity uses the dot-thousands separator (1.234).
 *   * Percent renders as e.g. "%12,3" with one decimal — same as KpiCard.
 *   * Date renders as long Turkish (e.g. "12 Ağustos 2026").
 *   * Empty / null handling returns "—" or "Veri yok" depending on call site.
 */

import { formatDateBucketLabel, ISTANBUL_TIME_ZONE, parseDisplayDate } from '../dates';

const currency = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

const quantity = new Intl.NumberFormat('tr-TR', {
  maximumFractionDigits: 2,
});

const longDate = new Intl.DateTimeFormat('tr-TR', {
  timeZone: ISTANBUL_TIME_ZONE,
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const shortDate = new Intl.DateTimeFormat('tr-TR', {
  timeZone: ISTANBUL_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatCurrencyPdf(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return currency.format(value);
}

// Per AGENTS.md "balance convention": never show a leading "-". Display the
// absolute amount + the label (Alacak/Borç). The label is rendered separately
// by callers so we don't bake the sign into the number.
export function formatBalanceAmountPdf(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return currency.format(Math.abs(value));
}

export function getBalanceLabelPdf(value: number): 'Alacak' | 'Borç' | null {
  if (value > 0) return 'Alacak';
  if (value < 0) return 'Borç';
  return null;
}

export function formatQtyPdf(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return quantity.format(value);
}

export function formatPercentPdf(
  value: number | null | undefined,
  decimals: 0 | 1 = 1,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  // Use Intl.NumberFormat with the requested max decimals so tr-TR produces
  // "12,3" (comma decimal) instead of "12.3" (dot). For decimals=1 the
  // formatter drops the decimal when the value is whole (matches KpiCard).
  const formatter = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return `%${formatter.format(value)}`;
}

export function formatLongDatePdf(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = parseDisplayDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return longDate.format(d);
}

export function formatShortDatePdf(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const d = parseDisplayDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return shortDate.format(d);
}

// Share Istanbul calendar labels with the on-screen charts.
export function formatBucketLabelPdf(
  bucket: string,
  granularity: 'day' | 'week' | 'month',
): string {
  return formatDateBucketLabel(bucket, granularity);
}
