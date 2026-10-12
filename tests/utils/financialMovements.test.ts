import { describe, expect, it } from 'vitest';
import { changedFinancialFields, financialActorLabel, financialEventTitle, parseMovementNumber } from '@/utils/financialMovements';
import type { FinancialSnapshot } from '@/services/supabase/financialMovementSchema';

describe('financial movement presentation', () => {
  it('uses explicit labels for every event action and role', () => {
    expect(financialEventTitle({ kind: 'delivery', action: 'edit' })).toBe('Teslimat düzenlendi');
    expect(financialEventTitle({ kind: 'payment', action: 'delete' })).toBe('Tahsilat silindi');
    expect(financialEventTitle({ kind: 'payment', action: 'create' })).toBe('Tahsilat');
    expect(financialEventTitle({ kind: 'delivery', action: 'baseline' })).toBe('Teslimat · Önceki kayıt');
    expect(financialEventTitle({ kind: 'delivery', action: 'edit', legacy: true })).toBe('Teslimat düzenlendi · Geçmiş');
    expect(financialActorLabel({ actorName: 'Emre', actorRole: 'admin' })).toBe('Emre · Admin');
    expect(financialActorLabel({ actorName: 'Ali', actorRole: 'staff' })).toBe('Ali · Personel');
    expect(financialActorLabel({ actorName: 'Bilinmeyen kullanıcı', actorRole: null })).toBe('Bilinmeyen kullanıcı');
  });
  it('lists changed fields without claiming unknown legacy snapshots are complete', () => {
    const before: FinancialSnapshot = { date: '2026-10-12', amount: 10, deleted: false, items: [], payments: [] };
    expect(changedFinancialFields(before, before)).toEqual([]);
    expect(changedFinancialFields(before, { ...before, date: '2026-10-11', amount: 11, paymentType: 'bank_transfer' })).toEqual(['Tarih', 'Tutar', 'Ödeme tipi']);
    expect(changedFinancialFields(null, before)).toEqual([]);
  });
  it.each([['0', 0], ['12,25', 12.25], ['12.25', 12.25], [' 1 ', 1], ['', null], ['-1', null], ['1e3', null], ['1.001', null], ['Infinity', null], ['10000000000', null], ['1,2,3', null]])('validates decimal input %s', (text, expected) => {
    expect(parseMovementNumber(String(text))).toBe(expected);
  });
});
