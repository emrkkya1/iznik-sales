import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getIstanbulToday } from '../../src/utils/dates';
import { createAdminClient, createAnonClient, createStaffClient, serviceClient, type AdminClient } from './_helpers/clients';

const PREFIX = `ITEST-BULK ${Date.now().toString(36)}`;
let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;
const ids: Record<string, string> = {};
const amounts = { happyA: 10.25, happyB: 20.5, staleA: 30, staleB: 40, zero: 0, debt: -10, concurrentA: 5, concurrentB: 7 };
type Receipt = { payments: { branchId: string; paymentId: string; amount: number }[]; totalAmount: number };
function args(names: (keyof typeof amounts)[], key = 'happy') {
  return { p_branches: names.map(name => ({ branchId: ids[name], expectedAmount: amounts[name] })), p_payment_type: 'bank_transfer', p_date: getIstanbulToday(), p_idempotency_key: `${PREFIX}-${key}` };
}
async function paymentsFor(names: string[]) {
  const result = await admin.from('payments').select('*').in('branch_id', names.map(name => ids[name]));
  if (result.error) throw result.error;
  return result.data;
}

describe('close_branch_receivables (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient(); staff = await createStaffClient(); anon = await createAnonClient();
    const district = await admin.from('districts').select('id').limit(1).single();
    if (district.error) throw district.error;
    for (const [name, amount] of Object.entries(amounts)) {
      const branch = await serviceClient().from('branches').insert({ name: `${PREFIX}-${name}`, district_id: district.data.id, opening_balance: amount, current_balance: amount, is_active: true }).select('id').single();
      if (branch.error) throw branch.error;
      ids[name] = branch.data.id;
    }
  });
  afterAll(async () => {
    if (!admin || !Object.keys(ids).length) return;
    await serviceClient().from('payments').delete().in('branch_id', Object.values(ids));
    await serviceClient().from('branches').delete().in('id', Object.values(ids));
    await serviceClient().from('receivable_payment_batches').delete().like('idempotency_key', `${PREFIX}%`);
  });

  it('records exact standalone payments, settles every branch, and changes no product quantities', async () => {
    const result = await admin.rpc('close_branch_receivables', args(['happyA', 'happyB']));
    expect(result.error).toBeNull();
    const receipt = result.data as Receipt;
    expect(receipt.totalAmount).toBe(30.75);
    expect(receipt.payments).toHaveLength(2);
    expect((await paymentsFor(['happyA', 'happyB'])).map(payment => ({ amount: payment.amount, type: payment.payment_type, delivery: payment.delivery_id }))).toEqual(expect.arrayContaining([
      { amount: 10.25, type: 'bank_transfer', delivery: null }, { amount: 20.5, type: 'bank_transfer', delivery: null },
    ]));
    for (const name of ['happyA', 'happyB']) {
      expect(Number((await admin.rpc('get_branch_balance', { p_branch_id: ids[name] })).data)).toBe(0);
      const details = await admin.rpc('get_branch_hub_details', { p_branch_id: ids[name] });
      expect(details.error).toBeNull();
      expect(details.data).toMatchObject({ deliveredQty: 0, returnedQty: 0 });
      const movement = await admin.rpc('list_deliveries_with_payments', { p_branch_id: ids[name], p_limit: 50, p_offset: 0 });
      expect(movement.error).toBeNull();
      expect(movement.data).toEqual([expect.objectContaining({ kind: 'payment', amount: amounts[name as keyof typeof amounts], paymentType: 'bank_transfer' })]);
    }
  });

  it('returns the same receipt on retry after balances have reached zero, without duplicate payments or audits', async () => {
    const first = await admin.rpc('close_branch_receivables', args(['happyA', 'happyB']));
    const retry = await admin.rpc('close_branch_receivables', args(['happyB', 'happyA']));
    expect(first.error).toBeNull(); expect(retry.error).toBeNull();
    expect(retry.data).toEqual(first.data);
    const payments = await paymentsFor(['happyA', 'happyB']);
    expect(payments).toHaveLength(2);
    const audit = await admin.from('audit_logs').select('id').eq('table_name', 'payments').in('record_id', payments.map(payment => payment.id));
    expect(audit.error).toBeNull(); expect(audit.data).toHaveLength(2);
    const changed = await admin.rpc('close_branch_receivables', { ...args(['happyA', 'happyB']), p_payment_type: 'field_collection' });
    expect(changed.error?.message).toMatch(/different batch/i);
  });

  it('serializes simultaneous whole-batch requests into exactly one payment per branch', async () => {
    const input = { ...args(['concurrentA', 'concurrentB'], 'concurrent'), p_payment_type: 'field_collection' };
    const [first, second] = await Promise.all([admin.rpc('close_branch_receivables', input), admin.rpc('close_branch_receivables', input)]);
    expect(first.error).toBeNull(); expect(second.error).toBeNull(); expect(second.data).toEqual(first.data);
    expect(await paymentsFor(['concurrentA', 'concurrentB'])).toHaveLength(2);
    expect((first.data as Receipt).totalAmount).toBe(12);
  });

  it('rejects stale balances atomically, without partially settling the valid branch', async () => {
    const input = args(['staleA', 'staleB'], 'stale');
    input.p_branches[1].expectedAmount = 41;
    const result = await admin.rpc('close_branch_receivables', input);
    expect(result.error?.message).toMatch(/balances changed/i);
    expect(await paymentsFor(['staleA', 'staleB'])).toEqual([]);
    for (const name of ['staleA', 'staleB'] as const) expect(Number((await admin.rpc('get_branch_balance', { p_branch_id: ids[name] })).data)).toBe(amounts[name]);
    const batch = await serviceClient().from('receivable_payment_batches').select('idempotency_key').eq('idempotency_key', input.p_idempotency_key);
    expect(batch.error).toBeNull(); expect(batch.data).toEqual([]);
  });

  it('rejects zero/Borç balances and missing branches without any payment', async () => {
    for (const name of ['zero', 'debt']) {
      const input = args(['staleA'], `invalid-${name}`);
      input.p_branches.push({ branchId: ids[name], expectedAmount: 10 });
      expect((await admin.rpc('close_branch_receivables', input)).error).not.toBeNull();
    }
    const missing = args(['staleA'], 'missing');
    missing.p_branches.push({ branchId: '00000000-0000-0000-0000-000000000000', expectedAmount: 1 });
    expect((await admin.rpc('close_branch_receivables', missing)).error?.message).toMatch(/not found/i);
    expect(await paymentsFor(['staleA', 'zero', 'debt'])).toEqual([]);
  });

  it('rejects staff and anonymous callers and hides the internal batch table', async () => {
    for (const client of [staff, anon]) expect((await client.rpc('close_branch_receivables', args(['staleA'], 'unauthorized'))).error).not.toBeNull();
    expect((await admin.from('receivable_payment_batches').select('*')).error).not.toBeNull();
  });

  it('rejects malformed input and duplicate branch IDs', async () => {
    for (const branches of [null, {}, [], [{ branchId: 'bad', expectedAmount: 10 }], [{ branchId: ids.staleA, expectedAmount: null }], [{ branchId: ids.staleA, expectedAmount: -1 }], [{ branchId: ids.staleA, expectedAmount: 0.001 }], [{ branchId: ids.staleA, expectedAmount: 30 }, { branchId: ids.staleA, expectedAmount: 30 }]]) {
      expect((await admin.rpc('close_branch_receivables', { ...args(['staleA'], 'malformed'), p_branches: branches })).error).not.toBeNull();
    }
    for (const overrides of [{ p_date: null }, { p_payment_type: 'card' }, { p_idempotency_key: null }, { p_idempotency_key: ' ' }]) {
      expect((await admin.rpc('close_branch_receivables', { ...args(['staleA'], 'malformed'), ...overrides })).error).not.toBeNull();
    }
    expect(await paymentsFor(['staleA'])).toEqual([]);
  });
});
