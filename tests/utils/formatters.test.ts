import { describe, it, expect } from 'vitest';

import {
  formatBalanceAmount,
  formatCurrency,
  formatDate,
  getBalanceColorClass,
  getBalanceLabel,
  getBranchBalanceDirection,
} from '@/utils/formatters';

describe('formatDate', () => {
  it('uses the Istanbul day for timestamps and preserves date-only values', () => {
    expect(formatDate('2026-12-31T21:15:00Z')).toBe('01.01.2027');
    expect(formatDate(new Date('2026-12-31T21:15:00Z'))).toBe('01.01.2027');
    expect(formatDate('2026-12-31')).toBe('31.12.2026');
  });
});

describe('formatBalanceAmount', () => {
  it('renders the positive amount as currency without a sign', () => {
    expect(formatBalanceAmount(1234.56)).toBe('₺1.234,56');
  });

  it('renders negative balances as their absolute amount', () => {
    expect(formatBalanceAmount(-500)).toBe('₺500,00');
  });

  it('renders zero', () => {
    expect(formatBalanceAmount(0)).toBe('₺0,00');
  });
});

describe('getBalanceLabel', () => {
  it('returns Alacak for positive balances', () => {
    expect(getBalanceLabel(10)).toBe('Alacak');
  });

  it('returns Borç for negative balances', () => {
    expect(getBalanceLabel(-10)).toBe('Borç');
  });

  it('returns null for zero balance', () => {
    expect(getBalanceLabel(0)).toBeNull();
  });
});

describe('getBalanceColorClass', () => {
  it('uses info/blue for Alacak (positive)', () => {
    expect(getBalanceColorClass(10)).toBe('text-info');
  });

  it('uses destructive/red for Borç (negative)', () => {
    expect(getBalanceColorClass(-10)).toBe('text-destructive');
  });

  it('uses foreground for zero', () => {
    expect(getBalanceColorClass(0)).toBe('text-foreground');
  });
});

describe('getBranchBalanceDirection', () => {
  it('renders the long Alacak phrasing', () => {
    expect(getBranchBalanceDirection(120)).toBe('Şubeden Alacak');
  });

  it('renders the long Borç phrasing', () => {
    expect(getBranchBalanceDirection(-25)).toBe('Şubeye ödenecek');
  });

  it('renders the settled phrasing for zero', () => {
    expect(getBranchBalanceDirection(0)).toBe('Şubeden alınacak');
  });

  it('lowercases the first letter when sentenceInitial is false', () => {
    expect(getBranchBalanceDirection(-25, false)).toBe('şubeye ödenecek');
  });
});

describe('formatCurrency', () => {
  it('preserves the negative sign for non-balance uses', () => {
    expect(formatCurrency(-123.45)).toBe('-₺123,45');
  });

  it('formats positive values', () => {
    expect(formatCurrency(50)).toBe('₺50,00');
  });
});
