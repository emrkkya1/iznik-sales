import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getIstanbulToday } from '../../src/utils/dates';
import { financialEventSchema, currentFinancialMovementSchema } from '../../src/services/supabase/financialMovementSchema';
import { createAdminClient, createAnonClient, createStaffClient, serviceClient, type AdminClient } from './_helpers/clients';

const prefix = `ITEST-HISTORY ${Date.now().toString(36)}`;
const today = getIstanbulToday();
let admin: AdminClient, staff: AdminClient, anon: AdminClient;
let branch: string, product: string, bp: string;
const deliveryIds: string[] = [];
const line = (quantity = 2) => [{ product_id: product, delivered_quantity: quantity, returned_quantity: 0 }];
async function createDelivery(client = admin, collection = 5) {
  const result = await client.rpc('create_delivery_atomic', { p_branch_id: branch, p_items: line(), p_payment_amount: collection,
    p_payment_type: 'field_collection', p_date: today, p_idempotency_key: `${prefix}-${deliveryIds.length}` });
  if (result.error) throw result.error;
  deliveryIds.push(result.data);
  return result.data as string;
}
async function current(kind: string, id: string) {
  const result = await admin.rpc('get_financial_movement', { p_kind: kind, p_id: id });
  if (result.error) throw result.error;
  return currentFinancialMovementSchema.parse(result.data);
}
async function events(id: string) {
  const result = await serviceClient().from('financial_movement_events').select('*').eq('record_id', id).order('occurred_at');
  if (result.error) throw result.error;
  return result.data!;
}
function change(kind: string, id: string, version: string, patch: unknown, key: string, action = 'edit') {
  return { p_kind: kind, p_id: id, p_version: version, p_patch: patch, p_key: `${prefix}-${key}`, p_action: action };
}

describe('financial movement history', () => {
  beforeAll(async () => {
    admin = await createAdminClient(); staff = await createStaffClient(); anon = await createAnonClient();
    const district = await admin.from('districts').select('id').limit(1).single();
    if (district.error) throw district.error;
    const b = await admin.from('branches').insert({ name: prefix, district_id: district.data.id }).select('id').single();
    if (b.error) throw b.error; branch = b.data.id;
    const p = await admin.from('products').insert({ name: prefix, is_active: true }).select('id').single();
    if (p.error) throw p.error; product = p.data.id;
    const link = await admin.from('branch_products').insert({ branch_id: branch, product_id: product, is_active: true }).select('id').single();
    if (link.error) throw link.error; bp = link.data.id;
    const price = await admin.from('branch_product_prices').insert({ branch_product_id: bp, price: 10, start_date: '2020-01-01' });
    if (price.error) throw price.error;
  });
  afterAll(async () => {
    if (!branch) return;
    await admin.from('payments').delete().eq('branch_id', branch);
    if (deliveryIds.length) await admin.from('delivery_items').delete().in('delivery_id', deliveryIds);
    await admin.from('deliveries').delete().eq('branch_id', branch);
    await admin.from('branch_product_prices').delete().eq('branch_product_id', bp);
    await admin.from('branch_products').delete().eq('id', bp);
    await admin.from('products').delete().eq('id', product);
    await admin.from('branches').delete().eq('id', branch);
  });

  it('captures a complete creation snapshot and actor once, including linked collection', async () => {
    const id = await createDelivery();
    const rows = await events(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: 'create', kind: 'delivery', actor_role: 'admin', before_snapshot: null });
    expect(rows[0].actor_name).toBeTruthy();
    expect(rows[0].after_snapshot).toMatchObject({ amount: 20, items: [expect.objectContaining({ unitPrice: 10, deliveredQuantity: 2 })], payments: [expect.objectContaining({ amount: 5 })] });
    const retry = await admin.rpc('create_delivery_atomic', { p_branch_id: branch, p_items: line(), p_payment_amount: 5, p_payment_type: 'field_collection', p_date: today, p_idempotency_key: `${prefix}-0` });
    expect(retry.data).toBe(id); expect(await events(id)).toHaveLength(1);
  });

  it('edits quantities/date/collection while preserving recorded prices and before/after history', async () => {
    const id = await createDelivery();
    const old = await current('delivery', id);
    await admin.from('branch_product_prices').update({ price: 99 }).eq('branch_product_id', bp);
    const patch = { date: '2026-01-10', items: line(3), payments: old.snapshot.payments.map(p => ({ id: p.id, amount: 7, paymentType: 'bank_transfer' })) };
    const input = change('delivery', id, old.version, patch, 'edit-delivery');
    const result = await admin.rpc('change_financial_movement', input);
    expect(result.error).toBeNull(); expect(result.data).toEqual({ changed: true });
    const updated = await current('delivery', id);
    expect(updated.snapshot).toMatchObject({ date: '2026-01-10', amount: 30, items: [expect.objectContaining({ unitPrice: 10 })], payments: [expect.objectContaining({ amount: 7, paymentType: 'bank_transfer', date: '2026-01-10' })] });
    const rows = await events(id);
    expect(rows).toHaveLength(2); expect(rows[0].after_snapshot).toEqual(old.snapshot);
    expect(rows[1]).toMatchObject({ action: 'edit', before_snapshot: old.snapshot, after_snapshot: updated.snapshot });
    const retry = await admin.rpc('change_financial_movement', input);
    expect(retry.error).toBeNull(); expect(retry.data).toEqual(result.data); expect(await events(id)).toHaveLength(2);
    await admin.from('branch_product_prices').update({ price: 10 }).eq('branch_product_id', bp);
  });

  it('does not append a history event for an unchanged save', async () => {
    const id = await createDelivery(); const old = await current('delivery', id);
    const result = await admin.rpc('change_financial_movement', change('delivery', id, old.version, { date: today, items: line(), payments: old.snapshot.payments }, 'noop'));
    expect(result.error).toBeNull(); expect(result.data).toEqual({ changed: false }); expect(await events(id)).toHaveLength(1);
  });

  it('updates the original displayed movement and adds separate immutable rows for each edit and deletion', async () => {
    const id = await createDelivery();
    const creation = (await events(id))[0];
    for (const quantity of [3, 4]) {
      const value = await current('delivery', id);
      const result = await admin.rpc('change_financial_movement', change('delivery', id, value.version,
        { date: today, items: line(quantity), payments: value.snapshot.payments }, `current-row-${quantity}`));
      expect(result.error).toBeNull();
    }
    const list = async () => {
      const result = await admin.rpc('list_financial_movement_events', { p_limit: 100 });
      expect(result.error).toBeNull();
      return financialEventSchema.array().parse(result.data).filter(row => row.recordId === id);
    };
    const displayed = await list();
    expect(displayed).toHaveLength(3);
    expect(displayed.find(row => row.id === creation.id)).toMatchObject({ action: 'create', after: { amount: 40 } });
    expect(displayed.filter(row => row.action === 'edit').map(row => row.after?.amount)).toEqual([40, 30]);
    expect(new Set(displayed.map(row => row.id)).size).toBe(3);
    // Updating the projection must not mutate the original audit snapshot.
    expect((await events(id))[0].after_snapshot.amount).toBe(20);
    const value = await current('delivery', id);
    const deleted = await admin.rpc('change_financial_movement', change('delivery', id, value.version,
      { reason: 'Geçmiş testi' }, 'current-row-delete', 'delete'));
    expect(deleted.error).toBeNull();
    const afterDelete = await list();
    expect(afterDelete).toHaveLength(4);
    expect(afterDelete.find(row => row.id === creation.id)).toMatchObject({ action: 'create', after: { amount: 40, deleted: true }, canManage: false });
    expect(afterDelete.find(row => row.action === 'delete')).toMatchObject({ before: { amount: 40 }, reason: 'Geçmiş testi' });
    expect(afterDelete.filter(row => row.action === 'edit').map(row => row.after?.amount)).toEqual([40, 30]);
  });

  it('rejects stale edits and rolls malformed edits back without partial changes', async () => {
    const id = await createDelivery(); const old = await current('delivery', id);
    const before = (await admin.rpc('get_branch_balance', { p_branch_id: branch })).data;
    const bad = await admin.rpc('change_financial_movement', change('delivery', id, old.version, { date: today, items: line(8), payments: [] }, 'missing-payment'));
    expect(bad.error?.message).toMatch(/missing linked payment/i);
    expect((await current('delivery', id)).snapshot).toEqual(old.snapshot); expect(await events(id)).toHaveLength(1);
    expect((await admin.rpc('get_branch_balance', { p_branch_id: branch })).data).toBe(before);
    const stale = await admin.rpc('change_financial_movement', change('delivery', id, '0'.repeat(32), { date: today, items: line(), payments: old.snapshot.payments }, 'stale'));
    expect(stale.error?.message).toMatch(/movement changed/i);
  });

  it('soft-deletes delivery and all collections, retains details, and changes balance once', async () => {
    const id = await createDelivery(); const old = await current('delivery', id);
    const balance = Number((await admin.rpc('get_branch_balance', { p_branch_id: branch })).data);
    const input = change('delivery', id, old.version, { reason: 'Yanlış kayıt' }, 'delete', 'delete');
    const result = await admin.rpc('change_financial_movement', input);
    expect(result.error).toBeNull();
    expect(Number((await admin.rpc('get_branch_balance', { p_branch_id: branch })).data)).toBe(balance - 15);
    const payments = await admin.from('payments').select('deleted_at').eq('delivery_id', id);
    expect(payments.data?.every(p => !!p.deleted_at)).toBe(true);
    const rows = await events(id);
    expect(rows).toHaveLength(2); expect(rows[1]).toMatchObject({ action: 'delete', reason: 'Yanlış kayıt', before_snapshot: old.snapshot, after_snapshot: expect.objectContaining({ deleted: true, items: old.snapshot.items }) });
    expect((await admin.rpc('change_financial_movement', input)).error).toBeNull(); expect(await events(id)).toHaveLength(2);
    const deleted = await admin.rpc('get_financial_movement', { p_kind: 'delivery', p_id: id });
    expect(deleted.error).not.toBeNull();
    const listing = await admin.rpc('list_financial_movement_events', { p_limit: 100 });
    expect(financialEventSchema.array().parse(listing.data).filter(e => e.recordId === id).every(e => !e.canManage)).toBe(true);
  });

  it('records staff edits from the existing RPC with the correct actor and unchanged permissions', async () => {
    const id = await createDelivery(staff);
    const result = await staff.rpc('update_delivery_atomic', { p_delivery_id: id, p_items: line(4), p_date: today });
    expect(result.error).toBeNull();
    const rows = await events(id);
    expect(rows).toHaveLength(2); expect(rows[1]).toMatchObject({ action: 'edit', actor_role: 'staff', before_snapshot: expect.objectContaining({ amount: 20 }), after_snapshot: expect.objectContaining({ amount: 40 }) });
    const other = await createDelivery(admin);
    expect((await staff.rpc('update_delivery_atomic', { p_delivery_id: other, p_items: line(), p_date: today })).error).not.toBeNull();
    expect((await staff.rpc('update_delivery_atomic', { p_delivery_id: id, p_items: line(), p_date: '2026-01-01' })).error).not.toBeNull();
    expect((await anon.rpc('update_delivery_atomic', { p_delivery_id: id, p_items: line(), p_date: today })).error).not.toBeNull();
  });

  it('edits and deletes standalone payments without touching delivery quantities', async () => {
    const created = await admin.rpc('record_manual_payment_atomic', { p_branch_id: branch, p_amount: 12, p_payment_type: 'field_collection', p_date: today, p_idempotency_key: `${prefix}-payment` });
    expect(created.error).toBeNull(); const id = created.data as string;
    const old = await current('payment', id);
    const input = change('payment', id, old.version, { date: today, amount: 15, paymentType: 'bank_transfer' }, 'payment-edit');
    const [a, b] = await Promise.all([admin.rpc('change_financial_movement', input), admin.rpc('change_financial_movement', input)]);
    expect(a.error).toBeNull(); expect(b.error).toBeNull(); expect(a.data).toEqual(b.data);
    expect(await events(id)).toHaveLength(2);
    const updated = await current('payment', id); expect(updated.snapshot.amount).toBe(15);
    const balance = Number((await admin.rpc('get_branch_balance', { p_branch_id: branch })).data);
    expect((await admin.rpc('change_financial_movement', change('payment', id, updated.version, { reason: 'İptal' }, 'payment-delete', 'delete'))).error).toBeNull();
    expect(Number((await admin.rpc('get_branch_balance', { p_branch_id: branch })).data)).toBe(balance + 15);
    expect(await events(id)).toHaveLength(3);
  });

  it('captures a bulk settlement payment through the existing endpoint', async () => {
    const balance = Number((await admin.rpc('get_branch_balance', { p_branch_id: branch })).data);
    expect(balance).toBeGreaterThan(0);
    const result = await admin.rpc('close_branch_receivables', { p_branches: [{ branchId: branch, expectedAmount: balance }], p_payment_type: 'bank_transfer', p_date: today, p_idempotency_key: `${prefix}-bulk` });
    expect(result.error).toBeNull();
    const rows = await events(result.data.payments[0].paymentId);
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ kind: 'payment', action: 'create', actor_role: 'admin' });
  });

  it('paginates by action timestamp + ID without duplicating rows when newer events arrive', async () => {
    const first = await admin.rpc('list_financial_movement_events', { p_limit: 2 });
    expect(first.error).toBeNull(); const rows = financialEventSchema.array().parse(first.data); expect(rows).toHaveLength(3);
    await createDelivery();
    const cursor = { at: rows[1].occurredAt, id: rows[1].id };
    const second = await admin.rpc('list_financial_movement_events', { p_limit: 2, p_cursor: cursor });
    expect(second.error).toBeNull(); const next = financialEventSchema.array().parse(second.data);
    expect(next[0].id).toBe(rows[2].id); expect(next.some(e => rows.slice(0, 2).some(r => r.id === e.id))).toBe(false);
  });

  it('serializes staff creation with an admin correction and keeps the aggregate balance exact', async () => {
    const id = await createDelivery(); const old = await current('delivery', id);
    const [edited] = await Promise.all([
      admin.rpc('change_financial_movement', change('delivery', id, old.version,
        { date: today, items: line(7), payments: old.snapshot.payments }, 'concurrent-staff')),
      createDelivery(staff),
    ]);
    expect(edited.error).toBeNull();
    const sales = await admin.from('deliveries').select('total_sales_amount').eq('branch_id', branch).is('deleted_at', null);
    const payments = await admin.from('payments').select('amount').eq('branch_id', branch).is('deleted_at', null);
    expect(sales.error).toBeNull(); expect(payments.error).toBeNull();
    const expected = sales.data!.reduce((sum, row) => sum + Number(row.total_sales_amount), 0)
      - payments.data!.reduce((sum, row) => sum + Number(row.amount), 0);
    expect(Number((await admin.rpc('get_branch_balance', { p_branch_id: branch })).data)).toBe(expected);
    expect(await events(id)).toHaveLength(2);
  });

  it('rejects staff/anonymous management, malformed inputs, forged events, and journal writes', async () => {
    const id = await createDelivery(); const old = await current('delivery', id);
    for (const client of [staff, anon]) {
      expect((await client.rpc('list_financial_movement_events', { p_limit: 50 })).error).not.toBeNull();
      expect((await client.rpc('get_financial_movement', { p_kind: 'delivery', p_id: id })).error).not.toBeNull();
      expect((await client.rpc('change_financial_movement', change('delivery', id, old.version, { reason: 'test' }, 'unauthorized', 'delete'))).error).not.toBeNull();
    }
    expect((await admin.rpc('change_financial_movement', change('delivery', id, old.version, { reason: ' ' }, 'blank', 'delete'))).error).not.toBeNull();
    for (const patch of [null, [], { date: null, items: line(), payments: old.snapshot.payments }, { date: today, items: [{ product_id: product, delivered_quantity: -1, returned_quantity: 0 }], payments: old.snapshot.payments }, { date: today, items: line(), payments: [{ id: old.snapshot.payments[0].id, amount: null, paymentType: 'field_collection' }] }]) {
      expect((await admin.rpc('change_financial_movement', change('delivery', id, old.version, patch, 'malformed'))).error).not.toBeNull();
    }
    for (const p_limit of [0, 101, null]) expect((await admin.rpc('list_financial_movement_events', { p_limit })).error).not.toBeNull();
    expect((await admin.rpc('list_financial_movement_events', { p_cursor: {} })).error).not.toBeNull();
    expect((await admin.from('financial_movement_events').select('*')).error).not.toBeNull();
    expect((await admin.from('financial_movement_events').update({ actor_name: 'Forged' }).eq('record_id', id)).error).not.toBeNull();
    expect((await admin.rpc('log_audit', { p_operation_type: 'DELETE', p_table_name: 'deliveries', p_record_id: id })).error).not.toBeNull();
    expect((await admin.from('audit_logs').insert({ operation_type: 'DELETE', table_name: 'deliveries', record_id: id })).error).not.toBeNull();
    expect(await events(id)).toHaveLength(1);
  });
});
