// Unsigned amount input; the UI chooses Alacak/Borç separately. Unlike a
// collection, an opening balance may be zero. Never silently round input.
export function parseOpeningBalance(text: string): number | null {
  const value = text.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value)) return null;
  const amount = Number(value.replace(',', '.'));
  if (!Number.isFinite(amount) || amount >= 10_000_000_000) return null;
  return amount;
}
