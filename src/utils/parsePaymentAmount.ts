// Currency input accepts Turkish commas or decimal points, never grouping,
// exponent notation, or silent rounding of extra decimal places.
export function parsePaymentAmount(text: string): number | null {
  const value = text.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const amount = Number(value.replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0 || amount >= 10_000_000_000) return null;
  return amount;
}
