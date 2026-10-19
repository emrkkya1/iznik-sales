import { describe, expect, it } from 'vitest';
import { parseOpeningBalance } from '@/utils/parseOpeningBalance';

describe('parseOpeningBalance', () => {
  it.each([['0', 0], ['0,00', 0], ['125,50', 125.5], [' 1234.56 ', 1234.56], ['9999999999,99', 9999999999.99]])('parses %s', (text, expected) => {
    expect(parseOpeningBalance(text)).toBe(expected);
  });
  it.each(['', ' ', '-1', '+1', '1e3', 'NaN', 'Infinity', '1,234', '1.234,56', '1,234.56', '10000000000', '.50', '1,', 'abc'])('rejects %s without silent rounding', (text) => {
    expect(parseOpeningBalance(text)).toBeNull();
  });
});
