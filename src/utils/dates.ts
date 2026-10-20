// Date helpers that use Europe/Istanbul timezone for business rules.

export const ISTANBUL_TIME_ZONE = 'Europe/Istanbul';

// Fixed, lazily initialized formatters: list rows and PDF points must not
// repeatedly initialize ICU timezone/locale machinery. Never cache the clock.
const formatterOptions = {
  parts: { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false },
  date: { day: '2-digit', month: '2-digit', year: 'numeric' },
  time: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  seconds: { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' },
  day: { month: 'short', day: '2-digit' },
  month: { month: 'short', year: '2-digit' },
} satisfies Record<string, Intl.DateTimeFormatOptions>;
type FormatterName = keyof typeof formatterOptions;
const formatters = new Map<FormatterName, Intl.DateTimeFormat>();

function formatter(name: FormatterName): Intl.DateTimeFormat {
  let cached = formatters.get(name);
  if (!cached) {
    cached = new Intl.DateTimeFormat(name === 'parts' ? 'en-US' : 'tr-TR', {
      timeZone: ISTANBUL_TIME_ZONE,
      ...formatterOptions[name],
    });
    formatters.set(name, cached);
  }
  return cached;
}

// Business dates and zone-less legacy timestamps are Istanbul wall time.
// Zoned timestamps represent instants: preserve their offset when parsing.
// Normalize PostgreSQL's space separator, microseconds, and short +00 offset
// to ISO syntax supported consistently by Hermes and browsers.
export function parseDisplayDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+03:00`);
  let iso = value.replace(/^(\d{4}-\d{2}-\d{2}) /, '$1T')
    .replace(/(\.\d{3})\d+/, '$1')
    .replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  if (/T\d{2}:\d{2}/.test(iso)) {
    if (/[+-]\d{2}$/.test(iso)) iso += ':00';
    if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += '+03:00';
  }
  return new Date(iso);
}

interface IstanbulParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

// Extracts calendar components in Europe/Istanbul without relying on
// `toLocaleString` output parsing (unreliable under Hermes).
function getIstanbulParts(date: Date): IstanbulParts {
  const parts = formatter('parts').formatToParts(date);

  const get = (type: string): number => {
    const value = parts.find((p) => p.type === type)?.value ?? '0';
    const parsed = Number(value);
    // hour12: false can still emit "24" for midnight in some runtimes.
    return type === 'hour' && parsed === 24 ? 0 : parsed;
  };

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

// Returns today's date in Europe/Istanbul as YYYY-MM-DD.
export function getIstanbulToday(): string {
  const { year, month, day } = getIstanbulParts(new Date());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export type DateRangePreset = '7d' | '30d' | 'month' | 'all';

// Date-only range arithmetic. UTC is used only as a calendar calculator, so
// the result does not depend on the device timezone.
export function getDatePresetRange(
  preset: DateRangePreset,
  today: string = getIstanbulToday(),
): { dateFrom: string | undefined; dateTo: string | undefined } {
  if (preset === 'all') {
    return { dateFrom: undefined, dateTo: undefined };
  }

  const [year, month, day] = today.split('-').map(Number);
  if (preset === 'month') {
    return {
      dateFrom: `${year}-${String(month).padStart(2, '0')}-01`,
      dateTo: today,
    };
  }

  const days = preset === '7d' ? 7 : 30;
  const start = new Date(Date.UTC(year, month - 1, day - (days - 1)));
  return {
    dateFrom: start.toISOString().slice(0, 10),
    dateTo: today,
  };
}

// Staff may edit a delivery only if its business date is today in
// Europe/Istanbul and the local time is before 23:59.
export function canEditDelivery(deliveryDate: string): boolean {
  const { year, month, day, hour, minute } = getIstanbulParts(new Date());
  const today = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  if (deliveryDate !== today) return false;
  return hour < 23 || (hour === 23 && minute < 59);
}

// Date-only values keep their business date; instants use Istanbul's date,
// including rollover at UTC 21:00. Never depend on the device timezone.
export function formatDateForDisplay(date: string): string {
  const parsed = parseDisplayDate(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return formatter('date').format(parsed);
}

// YYYY-MM-DD -> Date using local calendar. Noon avoids any UTC day-shift when
// round-tripping through toISOString (the native date picker path).
export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

// Date -> YYYY-MM-DD using local calendar components.
export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatTime(iso: string, includeSeconds = false): string {
  if (!iso) return '';
  const date = parseDisplayDate(iso);
  if (Number.isNaN(date.getTime())) return '';
  return formatter(includeSeconds ? 'seconds' : 'time').format(date);
}

// Convert the instant, not just its textual clock portion.
export function formatDateTime(iso: string): string {
  if (!iso) return '';
  const date = formatDateForDisplay(iso);
  if (!/[T ]\d{2}:\d{2}/.test(iso)) return date;
  const time = formatTime(iso, true);
  return time ? `${date} ${time}` : date;
}

// Shared chart labels for screen and PDF; ISO-week arithmetic is UTC-only
// after extracting the correct Istanbul calendar date.
export function formatDateBucketLabel(bucket: string, granularity: 'day' | 'week' | 'month'): string {
  const date = parseDisplayDate(bucket);
  if (Number.isNaN(date.getTime())) return bucket;
  if (granularity !== 'week') {
    return formatter(granularity).format(date);
  }
  const { year, month, day } = getIstanbulParts(date);
  const tmp = new Date(Date.UTC(year, month - 1, day));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((tmp.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `H${week}`;
}
