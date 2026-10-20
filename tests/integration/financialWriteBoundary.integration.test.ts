import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getIstanbulToday } from '@/utils/dates';
import { createAdminClient, createAnonClient, createStaffClient, serviceClient, type AdminClient } from './_helpers/clients';

const prefix = `ITEST-BOUNDARY ${Date.now().toString(36)}`;
const service = serviceClient();
let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;
let districtId: string;
let branchId: string;
let productId: string;
let assignmentId: string;
let deliveryId: string;
let itemId: string;
let paymentId: string;
let auditId: string;
let inactiveUserId: string;

function creation(date: string, key: string) {
  return {
    p_branch_id: branchId, p_items: [{ product_id: productId, delivered_quantity: 2, returned_quantity: 0 }],
    p_payment_amount: 5, p_payment_type: 'field_collection', p_date: date, p_idempotency_key: `${prefix}-${key}`,
  };
}

async function snapshot() {
  const deliveries = await service.from('deliveries').select('*').eq('branch_id', branchId).order('id').throwOnError();
  const deliveryIds = deliveries.data!.map(row => row.id);
  const payments = await service.from('payments').select('*').eq('branch_id', branchId).order('id').throwOnError();
  const records = [branchId, ...deliveryIds, ...payments.data!.map(row => row.id)];
  const [branches, items, audit, events] = await Promise.all([
    service.from('branches').select('*').eq('id', branchId).throwOnError(),
    service.from('delivery_items').select('*').in('delivery_id', deliveryIds).order('id').throwOnError(),
    service.from('audit_logs').select('*').in('record_id', records).order('id').throwOnError(),
    service.from('financial_movement_events').select('*').eq('branch_id', branchId).order('id').throwOnError(),
  ]);
  return { branches: branches.data, deliveries: deliveries.data, items: items.data, payments: payments.data, audit: audit.data, events: events.data };
}

describe('RPC-only financial write boundary', () => {
  beforeAll(async () => {
    [admin, staff, anon] = await Promise.all([createAdminClient(), createStaffClient(), createAnonClient()]);
    const district = await service.from('districts').select('id').limit(1).single().throwOnError();
    districtId = district.data!.id;
    const branch = await service.from('branches').insert({ district_id: districtId, name: prefix, opening_balance: 0, current_balance: 0 }).select('id').single().throwOnError();
    branchId = branch.data!.id;
    const product = await service.from('products').insert({ name: prefix, default_price: 10 }).select('id').single().throwOnError();
    productId = product.data!.id;
    const assignment = await service.from('branch_products').insert({ branch_id: branchId, product_id: productId }).select('id').single().throwOnError();
    assignmentId = assignment.data!.id;
    await service.from('branch_product_prices').insert({ branch_product_id: assignmentId, price: 10, start_date: '2000-01-01' }).throwOnError();
    // Own historical rows were writable through the previous staff policies.
    const historical = await staff.rpc('create_delivery_atomic', creation('2020-01-02', 'historical')).throwOnError();
    deliveryId = historical.data;
    const item = await service.from('delivery_items').select('id').eq('delivery_id', deliveryId).single().throwOnError();
    itemId = item.data!.id;
    const payment = await service.from('payments').select('id').eq('delivery_id', deliveryId).single().throwOnError();
    paymentId = payment.data!.id;
    const audit = await service.from('audit_logs').select('id').eq('record_id', deliveryId).single().throwOnError();
    auditId = audit.data!.id;
  });

  afterAll(async () => {
    if (branchId) {
      const deliveries = await service.from('deliveries').select('id').eq('branch_id', branchId).throwOnError();
      const ids = deliveries.data!.map(row => row.id);
      const payments = await service.from('payments').select('id').eq('branch_id', branchId).throwOnError();
      await service.from('audit_logs').delete().in('record_id', [branchId, ...ids, ...payments.data!.map(row => row.id)]).throwOnError();
      await service.from('payments').delete().eq('branch_id', branchId).throwOnError();
      await service.from('delivery_items').delete().in('delivery_id', ids).throwOnError();
      await service.from('deliveries').delete().eq('branch_id', branchId).throwOnError();
      if (assignmentId) await service.from('branch_product_prices').delete().eq('branch_product_id', assignmentId).throwOnError();
      await service.from('branch_products').delete().eq('branch_id', branchId).throwOnError();
      await service.from('branches').delete().eq('id', branchId).throwOnError();
    }
    if (productId) await service.from('products').delete().eq('id', productId).throwOnError();
    if (inactiveUserId) {
      const result = await service.auth.admin.deleteUser(inactiveUserId);
      expect(result.error).toBeNull();
    }
  });

  it.each(['admin', 'staff', 'anonymous'] as const)('rejects every direct financial write by %s without changing balances/history', async role => {
    const client = { admin, staff, anonymous: anon }[role];
    const userId = role === 'anonymous' ? null : (await client.auth.getUser()).data.user!.id;
    const before = await snapshot();
    const tables: { table: string; id: string; insert: Record<string, string | number | null>; update: Record<string, string | number> }[] = [
      { table: 'branches', id: branchId, insert: { district_id: districtId, name: `${prefix}-${role}`, opening_balance: 999, current_balance: 999 }, update: { current_balance: 999, opening_balance: 999 } },
      { table: 'deliveries', id: deliveryId, insert: { branch_id: branchId, user_id: userId, total_sales_amount: 999, date: '2020-01-02' }, update: { total_sales_amount: 999 } },
      { table: 'delivery_items', id: itemId, insert: { delivery_id: deliveryId, product_id: productId, delivered_quantity: 99, returned_quantity: 0, unit_price: 10 }, update: { delivered_quantity: 99 } },
      { table: 'payments', id: paymentId, insert: { branch_id: branchId, user_id: userId, amount: 999, payment_type: 'field_collection', date: '2020-01-02' }, update: { amount: 999 } },
      { table: 'audit_logs', id: auditId, insert: { operation_type: 'DELETE', table_name: 'deliveries', record_id: deliveryId, user_id: userId }, update: { operation_type: 'DELETE' } },
    ];
    for (const entry of tables) {
      const writes = [
        client.from(entry.table).insert(entry.insert),
        client.from(entry.table).update(entry.update).eq('id', entry.id),
        client.from(entry.table).delete().eq('id', entry.id),
      ];
      for (const write of writes) {
        const result = await write;
        expect(result.error?.code, `${role}: ${entry.table}`).toBe('42501');
      }
    }
    expect(await snapshot()).toEqual(before);
  });

  it('keeps admin and staff financial RPCs authorized, audited and reconciled', async () => {
    const today = getIstanbulToday();
    for (const [role, client] of [['admin', admin], ['staff', staff]] as const) {
      const created = await client.rpc('create_delivery_atomic', creation(today, role));
      expect(created.error).toBeNull();
      const edited = await client.rpc('update_delivery_atomic', { p_delivery_id: created.data, p_date: today, p_items: [{ product_id: productId, delivered_quantity: 3, returned_quantity: 0 }] });
      expect(edited.error).toBeNull();
      const events = await service.from('financial_movement_events').select('action').eq('record_id', created.data).order('occurred_at').throwOnError();
      expect(events.data!.map(event => event.action)).toEqual(['create', 'edit']);
      const balance = await client.rpc('get_branch_balance', { p_branch_id: branchId });
      expect(balance.error).toBeNull();
      expect(balance.data).toBe(role === 'admin' ? 40 : 65); // historical 15 + each edited sale 30 - collection 5
    }
  });

  it('rejects anonymous RPC writes, staff admin-only writes and malformed admin requests atomically', async () => {
    const before = await snapshot();
    expect((await anon.rpc('create_delivery_atomic', creation(getIstanbulToday(), 'anon'))).error).not.toBeNull();
    expect((await staff.rpc('record_manual_payment_atomic', { p_branch_id: branchId, p_amount: 5, p_payment_type: 'field_collection', p_date: getIstanbulToday() })).error).not.toBeNull();
    expect((await admin.rpc('create_delivery_atomic', { ...creation(getIstanbulToday(), 'invalid'), p_items: [] })).error).not.toBeNull();
    expect((await admin.rpc('get_branch_balance', { p_branch_id: null })).error?.message).toMatch(/required/i);
    expect(await snapshot()).toEqual(before);
  });

  it('does not expose internal mutation/snapshot helpers to application roles', async () => {
    const before = await snapshot();
    const helpers = [
      ['recalculate_branch_balance', { p_branch_id: branchId }],
      ['create_delivery_atomic_before_history', creation(getIstanbulToday(), 'internal')],
      ['edit_financial_delivery_items', { p_id: deliveryId, p_items: [], p_date: getIstanbulToday() }],
      ['financial_movement_snapshot', { p_kind: 'delivery', p_id: deliveryId }],
      ['log_audit', { p_operation_type: 'DELETE', p_table_name: 'deliveries', p_record_id: deliveryId }],
    ] as const;
    for (const client of [admin, staff, anon]) {
      for (const [name, args] of helpers) expect((await client.rpc(name, args)).error, name).not.toBeNull();
    }
    expect(await snapshot()).toEqual(before);
  });

  it('requires an active authenticated profile for balance reads', async () => {
    expect((await anon.rpc('get_branch_balance', { p_branch_id: branchId })).error).not.toBeNull();
    const email = `boundary-${Date.now()}@iznik.test`;
    const password = 'boundary-inactive-test-password';
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    inactiveUserId = created.data.user!.id;
    await service.from('users').insert({ id: inactiveUserId, full_name: prefix, username: prefix, role: 'staff', is_active: false }).throwOnError();
    const inactive = await createAnonClient();
    expect((await inactive.auth.signInWithPassword({ email, password })).error).toBeNull();
    const balance = await inactive.rpc('get_branch_balance', { p_branch_id: branchId });
    expect(balance.error?.message).toMatch(/not authorized/i);
    expect((await inactive.rpc('create_delivery_atomic', creation(getIstanbulToday(), 'inactive'))).error).not.toBeNull();
  });
});
