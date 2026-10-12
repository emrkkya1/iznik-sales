import type { FinancialEvent, FinancialSnapshot } from '@/services/supabase/financialMovementSchema';

export function financialEventTitle(event: Pick<FinancialEvent, 'kind' | 'action'> & Partial<Pick<FinancialEvent, 'legacy'>>): string {
  const noun = event.kind === 'delivery' ? 'Teslimat' : 'Tahsilat';
  if (event.action === 'create') return noun;
  if (event.action === 'baseline') return `${noun} · Önceki kayıt`;
  const action = event.action === 'edit' ? 'düzenlendi' : 'silindi';
  return `${noun} ${action}${event.legacy ? ' · Geçmiş' : ''}`;
}

export function financialActorLabel(event: Pick<FinancialEvent, 'actorName' | 'actorRole'>): string {
  const role = event.actorRole === 'admin' ? 'Admin' : event.actorRole === 'staff' ? 'Personel' : null;
  return role ? `${event.actorName} · ${role}` : event.actorName;
}

export function changedFinancialFields(before: FinancialSnapshot | null, after: FinancialSnapshot | null): string[] {
  if (!before || !after) return [];
  const fields: string[] = [];
  if (before.date !== after.date) fields.push('Tarih');
  if (before.amount !== after.amount) fields.push('Tutar');
  if (before.paymentType !== after.paymentType) fields.push('Ödeme tipi');
  if (JSON.stringify(before.items) !== JSON.stringify(after.items)) fields.push('Ürünler / miktarlar');
  if (JSON.stringify(before.payments) !== JSON.stringify(after.payments)) fields.push('Bağlı tahsilatlar');
  return fields;
}

// Quantities and amounts allow zero in delivery editors, but never negatives,
// exponent notation, or silent rounding. Accept Turkish decimal separators.
export function parseMovementNumber(text: string): number | null {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value < 10000000000 ? value : null;
}
