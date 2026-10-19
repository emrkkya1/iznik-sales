import { ISTANBUL_TIME_ZONE, parseDisplayDate } from './dates';

const currencyFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
});

export function formatCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatDate(value: Date | string): string {
  return new Intl.DateTimeFormat('tr-TR', { timeZone: ISTANBUL_TIME_ZONE }).format(parseDisplayDate(value));
}

// Bakiye gösterimi için mutlak tutar. Bakiye tek bir değer olarak sunulur;
// yön bilgisi etiketten (Alacak/Borç) ve renkten gelir, "+/-" işareti
// göstermeyiz.
export function formatBalanceAmount(value: number, fractionDigits: 0 | 2 = 2): string {
  if (fractionDigits === 0) return wholeCurrencyFormatter.format(Math.abs(value));
  return currencyFormatter.format(Math.abs(value));
}

const wholeCurrencyFormatter = new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// Bakiye yön etiketi (fırın perspektifinden):
//   value > 0  → "Alacak"  (şube bize borçlu, tahsil edeceğiz)
//   value < 0  → "Borç"    (biz şubeye borçluyuz, ödeyeceğiz)
//   value == 0 → null      (etiket göstermeyiz)
export function getBalanceLabel(value: number): 'Alacak' | 'Borç' | null {
  if (value > 0) return 'Alacak';
  if (value < 0) return 'Borç';
  return null;
}

// Bakiye rengi için gluestack semantic token sınıfı:
//   pozitif → info/mavi, negatif → destructive/kırmızı, sıfır → foreground.
export function getBalanceColorClass(
  value: number,
): 'text-info' | 'text-destructive' | 'text-foreground' {
  if (value > 0) return 'text-info';
  if (value < 0) return 'text-destructive';
  return 'text-foreground';
}

// Cümle içinde kullanılabilecek uzun bakiye yönü ifadesi.
//   value > 0  → "Şubeden Alacak"
//   value < 0  → "Şubeye ödenecek"
//   value == 0 → "Şubeden alınacak"
// `sentenceInitial` false yapılırsa Türkçe yerel kurallarına göre
// cümlenin ortasındaki "ş/ö" küçük harfle başlatılır.
export function getBranchBalanceDirection(
  value: number,
  sentenceInitial: boolean = true,
): string {
  let base: string;
  if (value > 0) base = 'Şubeden Alacak';
  else if (value < 0) base = 'Şubeye ödenecek';
  else base = 'Şubeden alınacak';

  if (sentenceInitial) return base;
  return base.charAt(0).toLocaleLowerCase('tr-TR') + base.slice(1);
}
