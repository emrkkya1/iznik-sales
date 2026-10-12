import { describe, expect, it } from 'vitest';
import { parsePaymentAmount } from '@/utils/parsePaymentAmount';

describe('parsePaymentAmount', () => {
  it.each([
    ['125', 125], ['125,50', 125.5], ['125.50', 125.5],
    [' 0,01 ', 0.01], ['0010,5', 10.5], ['9999999999.99', 9999999999.99],
  ])('parses %s', (text, expected) => {
    expect(parsePaymentAmount(text)).toBe(expected);
  });

  it.each(['', ' ', '0', '0,00', '-1', 'NaN', 'Infinity', '1e3', '0x10', '1.234', '1,234', '1.000,00', '1,2,3', '10000000000', '1.', 'abc'])('rejects %s', (text) => {
    expect(parsePaymentAmount(text)).toBeNull();
  });
});
