import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getIstanbulToday } from '../../src/utils/dates';
import { createAdminClient, createAnonClient, createStaffClient, type AdminClient } from './_helpers/clients';

const PREFIX = `ITEST-PAY ${Date.now().toString(36)}`;
let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;
let branchId: string;

function input(overrides: Record<string, unknown> = {}) {
  return { p_branch_id: branchId, p_amount: 25, p_payment_type: 'field_collection', p_date: getIstanbulToday(), ...overrides };
}

describe('manual payments (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient();
    staff = await createStaffClient();
    anon = await createAnonClient();
    const district = await admin.from('districts').select('id').limit(1).single();
    if (district.error) throw district.error;
    const branch = await admin.from('branches').insert({ district_id: district.data.id, name: PREFIX, opening_balance: 100, current_balance: 100, is_active: true }).select('id').single();
    if (branch.error) throw branch.error;
    branchId = branch.data.id;
  });

  afterAll(async () => {
    if (!admin || !branchId) return;
    await admin.from('payments').delete().eq('branch_id', branchId);
    await admin.from('branches').delete().eq('id', branchId);
  });

  it.each(['field_collection', 'bank_transfer'])('records %s as a standalone movement and changes only the financial balance', async (type) => {
    const before = await admin.rpc('get_branch_balance', { p_branch_id: branchId });
    const payment = await admin.rpc('record_manual_payment_atomic', input({ p_payment_type: type, p_idempotency_key: `${PREFIX}-${type}` }));
    expect(payment.error).toBeNull();
    const saved = await admin.from('payments').select('*').eq('id', payment.data).single();
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({ branch_id: branchId, delivery_id: null, amount: 25, payment_type: type, date: getIstanbulToday() });
    const balance = await admin.rpc('get_branch_balance', { p_branch_id: branchId });
    expect(balance.error).toBeNull();
    expect(Number(balance.data)).toBeCloseTo(Number(before.data) - 25, 2);
    const deliveries = await admin.from('deliveries').select('id').eq('branch_id', branchId);
    expect(deliveries.error).toBeNull();
    expect(deliveries.data).toEqual([]);
    const details = await admin.rpc('get_branch_hub_details', { p_branch_id: branchId });
    expect(details.error).toBeNull();
    expect(details.data).toMatchObject({ deliveredQty: 0, returnedQty: 0, lastMovementDate: getIstanbulToday() });
    const movements = await admin.rpc('list_deliveries_with_payments', { p_branch_id: branchId, p_limit: 50, p_offset: 0 });
    expect(movements.error).toBeNull();
    expect(movements.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: payment.data, kind: 'payment', amount: 25, paymentType: type })]));
  });

  it('serializes simultaneous retries into one payment, one balance change, and one audit entry', async () => {
    const before = await admin.rpc('get_branch_balance', { p_branch_id: branchId });
    const args = input({ p_idempotency_key: `${PREFIX}-concurrent` });
    const [one, two] = await Promise.all([
      admin.rpc('record_manual_payment_atomic', args), admin.rpc('record_manual_payment_atomic', args),
    ]);
    expect(one.error).toBeNull();
    expect(two.error).toBeNull();
    expect(two.data).toBe(one.data);
    const retry = await admin.rpc('record_manual_payment_atomic', args);
    expect(retry.error).toBeNull();
    expect(retry.data).toBe(one.data);
    expect(Number((await admin.rpc('get_branch_balance', { p_branch_id: branchId })).data)).toBeCloseTo(Number(before.data) - 25, 2);
    const audit = await admin.from('audit_logs').select('id').eq('table_name', 'payments').eq('record_id', one.data);
    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
    const mismatch = await admin.rpc('record_manual_payment_atomic', { ...args, p_amount: 26 });
    expect(mismatch.error?.message).toMatch(/different/i);
  });

  it('rejects staff and anonymous callers', async () => {
    for (const client of [staff, anon]) {
      expect((await client.rpc('record_manual_payment_atomic', input({ p_idempotency_key: `${PREFIX}-unauthorized` }))).error).not.toBeNull();
    }
  });

  it.each([null, 0, -1, 0.001, 10000000000, 'NaN', 'Infinity', '-Infinity'])('rejects invalid amounts (%s) without changing the balance', async (amount) => {
    const before = await admin.rpc('get_branch_balance', { p_branch_id: branchId });
    expect((await admin.rpc('record_manual_payment_atomic', input({ p_amount: amount }))).error).not.toBeNull();
    expect((await admin.rpc('get_branch_balance', { p_branch_id: branchId })).data).toBe(before.data);
  });

  it('rejects malformed branch, type, date, and retry keys', async () => {
    for (const overrides of [
      { p_branch_id: null }, { p_branch_id: '00000000-0000-0000-0000-000000000000' },
      { p_payment_type: null }, { p_payment_type: 'card' }, { p_date: null }, { p_idempotency_key: ' ' },
    ]) expect((await admin.rpc('record_manual_payment_atomic', input(overrides))).error).not.toBeNull();
  });
});
