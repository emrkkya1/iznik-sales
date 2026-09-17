import { describe, expect, it } from 'vitest';

import {
  formatBalanceAmountPdf,
  formatBucketLabelPdf,
  formatCurrencyPdf,
  formatLongDatePdf,
  formatPercentPdf,
  formatQtyPdf,
  formatShortDatePdf,
  getBalanceLabelPdf,
} from '@/utils/pdf/formatters';

describe('pdf formatters', () => {
  it('formatCurrencyPdf returns Turkish TRY with ₺ symbol', () => {
    // 1234.5 → ₺1.234,50
    expect(formatCurrencyPdf(1234.5)).toContain('1.234');
    expect(formatCurrencyPdf(1234.5)).toContain('50');
    expect(formatCurrencyPdf(0)).toMatch(/0/);
  });

  it('formatCurrencyPdf renders — for null/NaN', () => {
    expect(formatCurrencyPdf(null)).toBe('—');
    expect(formatCurrencyPdf(undefined)).toBe('—');
    expect(formatCurrencyPdf(NaN)).toBe('—');
  });

  it('formatBalanceAmountPdf always returns absolute value', () => {
    expect(formatBalanceAmountPdf(-1500)).toContain('1.500');
    expect(formatBalanceAmountPdf(1500)).toContain('1.500');
    expect(formatBalanceAmountPdf(0)).not.toContain('-');
  });

  it('getBalanceLabelPdf follows the canonical M20 sign convention', () => {
    expect(getBalanceLabelPdf(100)).toBe('Alacak');
    expect(getBalanceLabelPdf(-100)).toBe('Borç');
    expect(getBalanceLabelPdf(0)).toBeNull();
  });

  it('formatQtyPdf uses dot thousands separator and 2-decimal max', () => {
    expect(formatQtyPdf(12345)).toBe('12.345');
    expect(formatQtyPdf(1234.56)).toMatch(/1\.234,56/);
  });

  it('formatPercentPdf trims trailing .0 with default 1 decimal', () => {
    expect(formatPercentPdf(12)).toBe('%12');
    expect(formatPercentPdf(12.34)).toBe('%12,3');
    expect(formatPercentPdf(0)).toBe('%0');
  });

  it('formatPercentPdf returns — for null', () => {
    expect(formatPercentPdf(null)).toBe('—');
    expect(formatPercentPdf(undefined)).toBe('—');
  });

  it('formatLongDatePdf renders Turkish long format', () => {
    const result = formatLongDatePdf('2026-08-30T00:00:00Z');
    expect(result).toMatch(/30/);
    expect(result.toLowerCase()).toMatch(/ağustos/);
  });

  it('formatShortDatePdf renders dd.MM.yyyy', () => {
    const result = formatShortDatePdf('2026-08-30T00:00:00Z');
    expect(result).toMatch(/30/);
    expect(result).toMatch(/08/);
    expect(result).toMatch(/2026/);
  });

  it('formatBucketLabelPdf returns day label for day granularity', () => {
    const result = formatBucketLabelPdf('2026-08-30', 'day');
    expect(result.toLowerCase()).toMatch(/ağu/);
    expect(result).toMatch(/30/);
  });

  it('formatBucketLabelPdf returns H{n} for week granularity', () => {
    const result = formatBucketLabelPdf('2026-08-30', 'week');
    expect(result).toMatch(/^H\d+$/);
  });

  it('formatBucketLabelPdf returns month-year for month granularity', () => {
    const result = formatBucketLabelPdf('2026-08-30', 'month');
    expect(result.toLowerCase()).toMatch(/ağu/);
    expect(result).toMatch(/26/);
  });

  it('formatBucketLabelPdf falls back to the bucket string for invalid date', () => {
    expect(formatBucketLabelPdf('not-a-date', 'day')).toBe('not-a-date');
  });
});
