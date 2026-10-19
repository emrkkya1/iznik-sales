import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getIstanbulToday } from '../../src/utils/dates';
import { createAdminClient, createAnonClient, createStaffClient, type AdminClient } from './_helpers/clients';

const PREFIX = `ITEST-OPENING ${Date.now().toString(36)}`;
let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;
let branchId: string;
let emptyBranchId: string;
let deliveryId: string;
let wasLocked = false;

async function branch() {
  const result = await admin.from('branches').select('*').eq('id', branchId).single();
  if (result.error) throw result.error;
  return result.data;
}
function update(value: number | string | null, expected: number | string | null = 10, id: string | null = branchId) {
  return admin.rpc('update_branch_opening_balance', { p_branch_id: id, p_opening_balance: value, p_expected_opening_balance: expected });
}
async function audits() {
  const result = await admin.from('audit_logs').select('*').eq('record_id', branchId).eq('operation_type', 'UPDATE').order('created_at');
  if (result.error) throw result.error;
  return result.data;
}

describe('update_branch_opening_balance (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient(); staff = await createStaffClient(); anon = await createAnonClient();
    const config = await admin.rpc('get_opening_balances_locked');
    if (config.error) throw config.error;
    wasLocked = config.data;
    expect((await admin.rpc('set_opening_balances_locked', { p_locked: false })).error).toBeNull();
    const district = await admin.from('districts').select('id').limit(1).single();
    const product = await admin.from('products').select('id').eq('is_active', true).limit(1).single();
    if (district.error || product.error) throw new Error('Reference fixtures unavailable');
    const created = await admin.rpc('create_branch', {
      p_district_id: district.data.id, p_name: PREFIX, p_opening_balance: 10, p_is_active: true,
      p_products: [{ productId: product.data.id, price: 25 }],
    });
    if (created.error) throw created.error;
    branchId = created.data;
    const delivery = await admin.rpc('create_delivery_atomic', {
      p_branch_id: branchId, p_date: getIstanbulToday(),
      p_items: [{ product_id: product.data.id, delivered_quantity: 10, returned_quantity: 2 }],
      p_payment_amount: 100, p_payment_type: 'field_collection',
    });
    if (delivery.error) throw delivery.error;
    deliveryId = delivery.data;
    const empty = await admin.from('branches').insert({ district_id: district.data.id, name: `${PREFIX} Empty`, opening_balance: 0, current_balance: 0, is_active: false }).select('id').single();
    if (empty.error) throw empty.error;
    emptyBranchId = empty.data.id;
  });

  beforeEach(async () => {
    const current = await branch();
    expect((await update(10, current.opening_balance ?? 0)).error).toBeNull();
  });

  afterAll(async () => {
    if (!admin) return;
    expect((await admin.rpc('set_opening_balances_locked', { p_locked: wasLocked })).error).toBeNull();
    if (deliveryId) {
      expect((await admin.from('payments').delete().eq('delivery_id', deliveryId)).error).toBeNull();
      expect((await admin.from('delivery_items').delete().eq('delivery_id', deliveryId)).error).toBeNull();
      expect((await admin.from('deliveries').delete().eq('id', deliveryId)).error).toBeNull();
    }
    if (branchId) {
      const links = await admin.from('branch_products').select('id').eq('branch_id', branchId);
      if (links.data?.length) expect((await admin.from('branch_product_prices').delete().in('branch_product_id', links.data.map(row => row.id))).error).toBeNull();
      expect((await admin.from('branch_products').delete().eq('branch_id', branchId)).error).toBeNull();
      expect((await admin.from('branches').delete().eq('id', branchId)).error).toBeNull();
    }
    if (emptyBranchId) expect((await admin.from('branches').delete().eq('id', emptyBranchId)).error).toBeNull();
  });

  it.each([125.5, -200.25, 0])('sets %s and recalculates balance without changing transactions', async (value) => {
    const before = await branch();
    const deliveryBefore = await admin.from('deliveries').select('*').eq('id', deliveryId).single();
    const itemsBefore = await admin.from('delivery_items').select('*').eq('delivery_id', deliveryId);
    const paymentsBefore = await admin.from('payments').select('*').eq('delivery_id', deliveryId);
    const auditBefore = await audits();
    expect((await update(value)).error).toBeNull();
    const after = await branch();
    expect(after).toEqual({ ...before, opening_balance: value, current_balance: value + 100, updated_at: expect.any(String) });
    expect((await admin.from('deliveries').select('*').eq('id', deliveryId).single()).data).toEqual(deliveryBefore.data);
    expect((await admin.from('delivery_items').select('*').eq('delivery_id', deliveryId)).data).toEqual(itemsBefore.data);
    expect((await admin.from('payments').select('*').eq('delivery_id', deliveryId)).data).toEqual(paymentsBefore.data);
    const auditAfter = await audits();
    expect(auditAfter).toHaveLength(auditBefore.length + 1);
    expect(auditAfter.at(-1)?.old_data).toMatchObject({ opening_balance: 10, current_balance: 110 });
    expect(auditAfter.at(-1)?.user_id).toBe((await admin.auth.getUser()).data.user?.id);
    expect((await admin.rpc('get_branch_balance', { p_branch_id: branchId })).data).toBe(value + 100);
    expect((await admin.rpc('get_branch_hub_details', { p_branch_id: branchId })).data).toMatchObject({ openingBalance: value });
    const report = await admin.rpc('report_branch_hub_pdf', { p_branch_id: branchId });
    expect(report.error).toBeNull();
    expect(report.data.identity).toMatchObject({ openingBalance: value, currentBalance: value + 100 });
  });

  it('works on inactive branches with no transactions', async () => {
    expect((await update(-50, 0, emptyBranchId)).error).toBeNull();
    const result = await admin.from('branches').select('opening_balance,current_balance,is_active').eq('id', emptyBranchId).single();
    expect(result.data).toEqual({ opening_balance: -50, current_balance: -50, is_active: false });
  });
  it('is a no-op for unchanged values and safe when retrying a committed write', async () => {
    const initial = await audits();
    expect((await update(10)).error).toBeNull();
    expect(await audits()).toEqual(initial);
    expect((await update(20)).error).toBeNull();
    const saved = await branch();
    const after = await audits();
    expect((await update(20, 10)).error).toBeNull();
    expect(await branch()).toEqual(saved);
    expect(await audits()).toEqual(after);
  });
  it('rejects stale and concurrent edits rather than overwriting another correction', async () => {
    const results = await Promise.all([update(30), update(40)]);
    expect(results.filter(result => result.error === null)).toHaveLength(1);
    expect(results.find(result => result.error)?.error?.message).toBe('Opening balance changed. Reopen and try again.');
    const current = await branch();
    expect([30, 40]).toContain(current.opening_balance);
    expect(current.current_balance).toBe(current.opening_balance + 100);
  });
  it('respects the global lock without changing balance or audit data', async () => {
    const before = await branch(); const auditBefore = await audits();
    expect((await admin.rpc('set_opening_balances_locked', { p_locked: true })).error).toBeNull();
    try {
      expect((await update(20)).error?.message).toBe('Opening balances are locked');
      expect(await branch()).toEqual(before);
      expect(await audits()).toEqual(auditBefore);
    } finally {
      expect((await admin.rpc('set_opening_balances_locked', { p_locked: false })).error).toBeNull();
    }
  });
  it('rejects staff and anonymous callers without changing financial data', async () => {
    const before = await branch();
    for (const client of [staff, anon]) {
      expect((await client.rpc('update_branch_opening_balance', { p_branch_id: branchId, p_opening_balance: 20, p_expected_opening_balance: 10 })).error).not.toBeNull();
    }
    expect(await branch()).toEqual(before);
  });
  it.each([null, 'NaN', 'Infinity', '-Infinity', 10000000000, -10000000000, 1.234])('rejects invalid amounts: %s', async (value) => {
    const before = await branch();
    expect((await update(value)).error?.message).toBe('Invalid opening balance');
    expect(await branch()).toEqual(before);
  });
  it.each([null, 'NaN', 'Infinity', 1.234])('rejects invalid expected balances: %s', async (value) => {
    expect((await update(20, value)).error?.message).toBe('Invalid expected opening balance');
  });
  it('rejects null, malformed, and missing branch identifiers', async () => {
    for (const id of [null, 'invalid', '00000000-0000-0000-0000-000000000000']) {
      expect((await update(20, 10, id)).error).not.toBeNull();
    }
  });
  it('rolls back the opening correction if the recalculated balance overflows', async () => {
    const before = await branch(); const auditBefore = await audits();
    expect((await update(9999999999.99)).error).not.toBeNull();
    expect(await branch()).toEqual(before);
    expect(await audits()).toEqual(auditBefore);
  });
});
