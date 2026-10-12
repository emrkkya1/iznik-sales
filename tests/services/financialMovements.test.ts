import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseFinancialMovementRepository as repository } from '@/services/supabase/financialMovements';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/services/supabase/supabaseClient', () => ({ supabaseClient: { rpc } }));
beforeEach(() => rpc.mockReset());
const id = '00000000-0000-4000-8000-000000000001';
const snapshot = { date: '2026-10-12', amount: 10, deleted: false, items: [], payments: [], paymentType: 'bank_transfer' };
const event = { id, recordId: id, kind: 'payment', action: 'create', branchId: id, branchName: 'Şube', actorName: 'Emre', actorRole: 'admin', occurredAt: '2026-10-12T12:00:00Z', before: null, after: snapshot, reason: null, legacy: false, canManage: true };
describe('financial movement repository', () => {
  it('uses the extra row as a sentinel, not a displayed row', async () => {
    rpc.mockResolvedValue({ data: [event, { ...event, id: '00000000-0000-4000-8000-000000000002' }], error: null });
    expect(await repository.list(null, 1)).toEqual({ rows: [event], nextCursor: { at: event.occurredAt, id } });
    expect(rpc).toHaveBeenCalledWith('list_financial_movement_events', { p_limit: 1, p_cursor: undefined });
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await repository.list({ at: event.occurredAt, id }, 1)).toEqual({ rows: [], nextCursor: null });
  });
  it('validates current snapshots and forwards the version/key to the atomic mutation', async () => {
    rpc.mockResolvedValueOnce({ data: { snapshot, version: 'a'.repeat(32) }, error: null }).mockResolvedValueOnce({ data: { changed: true }, error: null });
    expect(await repository.get('payment', id)).toEqual({ snapshot, version: 'a'.repeat(32) });
    const input = { kind: 'payment' as const, id, action: 'delete' as const, version: 'a'.repeat(32), patch: { reason: 'İptal' } };
    expect(await repository.change(input, 'key')).toEqual({ changed: true });
    expect(rpc).toHaveBeenLastCalledWith('change_financial_movement', { p_kind: 'payment', p_id: id, p_action: 'delete', p_patch: input.patch, p_version: input.version, p_key: 'key' });
  });
  it('maps stale/deleted errors and rejects malformed server payloads', async () => {
    rpc.mockResolvedValueOnce({ error: { message: 'Movement changed. Reopen and try again.' } });
    await expect(repository.change({ kind: 'payment', id, action: 'edit', version: '', patch: {} }, 'key')).rejects.toThrow('Bu hareket başka bir işlemle değişti.');
    rpc.mockResolvedValueOnce({ error: { message: 'Movement not found or deleted' } });
    await expect(repository.get('payment', id)).rejects.toThrow('Bu hareket bulunamadı veya silindi.');
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(repository.list(null)).rejects.toThrow();
    await expect(repository.get('payment', id)).rejects.toThrow();
  });
});
