import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getIstanbulToday } from '@/utils/dates';
import { paymentReceiptSchema, receiptSchema } from '@/services/supabase/receiptSchema';
import { createAdminClient, createAnonClient, createStaffClient, serviceClient, type AdminClient } from './_helpers/clients';

const prefix = `ITEST-RECEIPT-${Date.now().toString(36)}`;
const service = serviceClient();
let admin: AdminClient; let staff: AdminClient; let anon: AdminClient;
let adminId: string; let staffId: string; let branch: string; let product: string; let assignment: string;
let sequence = 0;
const key = () => `${prefix}-${++sequence}`;
const line = (delivered = 2, returned = 0) => [{ product_id: product, delivered_quantity: delivered, returned_quantity: returned }];
const create = (retryKey = key()) => ({ p_branch_id: branch, p_items: line(), p_payment_amount: 5,
  p_payment_type: 'field_collection', p_date: getIstanbulToday(), p_idempotency_key: retryKey, p_actor_id: adminId });
const payment = (retryKey = key()) => ({ p_branch_id: branch, p_amount: 5, p_payment_type: 'bank_transfer',
  p_date: getIstanbulToday(), p_idempotency_key: retryKey, p_actor_id: adminId });

async function state() {
  const [b, d, p, e, r] = await Promise.all([
    service.from('branches').select('current_balance').eq('id', branch).single().throwOnError(),
    service.from('deliveries').select('id,total_sales_amount').eq('branch_id', branch).order('id').throwOnError(),
    service.from('payments').select('id,amount').eq('branch_id', branch).order('id').throwOnError(),
    service.from('financial_movement_events').select('id').eq('branch_id', branch).order('id').throwOnError(),
    service.from('financial_write_receipts').select('key,input,result').like('key', `${prefix}%`).order('key').throwOnError(),
  ]);
  return { balance: Number(b.data!.current_balance), deliveries: d.data, payments: p.data, events: e.data, receipts: r.data };
}

describe('atomic financial operation receipts', () => {
  beforeAll(async () => {
    [admin, staff, anon] = await Promise.all([createAdminClient(), createStaffClient(), createAnonClient()]);
    adminId = (await admin.auth.getUser()).data.user!.id;
    staffId = (await staff.auth.getUser()).data.user!.id;
    const district = await service.from('districts').select('id').limit(1).single().throwOnError();
    const b = await service.from('branches').insert({ district_id: district.data!.id, name: prefix, opening_balance: 100, current_balance: 100 }).select('id').single().throwOnError();
    branch = b.data!.id;
    const p = await service.from('products').insert({ name: prefix, default_price: 10 }).select('id').single().throwOnError();
    product = p.data!.id;
    const bp = await service.from('branch_products').insert({ branch_id: branch, product_id: product }).select('id').single().throwOnError();
    assignment = bp.data!.id;
    await service.from('branch_product_prices').insert({ branch_product_id: assignment, start_date: '2000-01-01', price: 10 }).throwOnError();
  });
  afterAll(async () => {
    if (branch) {
      const deliveries = await service.from('deliveries').select('id').eq('branch_id', branch).throwOnError();
      await service.from('payments').delete().eq('branch_id', branch).throwOnError();
      await service.from('delivery_items').delete().in('delivery_id', deliveries.data!.map(row => row.id)).throwOnError();
      await service.from('deliveries').delete().eq('branch_id', branch).throwOnError();
      if (assignment) await service.from('branch_product_prices').delete().eq('branch_product_id', assignment).throwOnError();
      await service.from('branch_products').delete().eq('branch_id', branch).throwOnError();
      await service.from('branches').delete().eq('id', branch).throwOnError();
    }
    if (product) await service.from('products').delete().eq('id', product).throwOnError();
    // Immutable receipt/history rows deliberately survive fixture deletion;
    // they have no live delivery FK and are reset with the disposable DB.
  });

  it('returns one immutable creation receipt for concurrent retries and subsequent replay', async () => {
    const args = create();
    const before = (await state()).balance;
    const results = await Promise.all([admin.rpc('create_delivery_with_receipt', args), admin.rpc('create_delivery_with_receipt', args)]);
    for (const result of results) expect(result.error).toBeNull();
    const receipt = receiptSchema.parse(results[0].data);
    expect(results[1].data).toEqual(receipt);
    expect(receipt).toMatchObject({ previousBalance: before, newBalance: before + 15, totalSalesAmount: 20, paymentAmount: 5 });
    const count = await service.from('deliveries').select('id', { count: 'exact', head: true }).eq('idempotency_key', args.p_idempotency_key).throwOnError();
    expect(count.count).toBe(1);
    expect((await admin.rpc('record_manual_payment_with_receipt', payment())).error).toBeNull();
    const after = await state();
    const replay = await admin.rpc('create_delivery_with_receipt', args);
    expect(replay.error).toBeNull();
    expect(replay.data).toEqual(receipt); // not reconstructed using today's branch balance
    expect(await state()).toEqual(after);
  });

  it('rejects actor/payload/key reuse for both new and legacy creation without financial changes', async () => {
    const args = create();
    const created = await admin.rpc('create_delivery_with_receipt', args).throwOnError();
    const before = await state();
    for (const patch of [
      { p_items: line(3) }, { p_payment_amount: 6 }, { p_date: '2020-01-02' },
      { p_payment_type: 'bank_transfer' }, { p_branch_id: '00000000-0000-4000-8000-000000000001' },
    ]) expect((await admin.rpc('create_delivery_with_receipt', { ...args, ...patch })).error?.message).toMatch(/different operation/i);
    expect((await staff.rpc('create_delivery_with_receipt', { ...args, p_actor_id: staffId })).error?.message).toMatch(/different operation/i);
    expect((await admin.rpc('create_delivery_with_receipt', { ...args, p_actor_id: staffId })).error?.message).toMatch(/not authorized/i);
    const { p_actor_id: _actor, ...legacy } = args;
    expect((await admin.rpc('create_delivery_atomic', legacy)).data).toBe(created.data.deliveryId);
    expect((await admin.rpc('create_delivery_atomic', { ...legacy, p_items: line(4) })).error?.message).toMatch(/different operation/i);
    expect((await staff.rpc('create_delivery_atomic', legacy)).error?.message).toMatch(/different operation/i);
    expect(await state()).toEqual(before);
  });

  it('binds concurrent independent writes to their actual before/after balances', async () => {
    const before = (await state()).balance;
    const results = await Promise.all([
      admin.rpc('create_delivery_with_receipt', create()),
      staff.rpc('create_delivery_with_receipt', { ...create(), p_actor_id: staffId }),
    ]);
    for (const result of results) expect(result.error).toBeNull();
    const receipts = results.map(result => receiptSchema.parse(result.data)).sort((a, b) => a.previousBalance - b.previousBalance);
    expect(receipts.map(result => [result.previousBalance, result.newBalance])).toEqual([[before, before + 15], [before + 15, before + 30]]);
  });

  it('returns an edit transaction snapshot and never reapplies that edit during recovery', async () => {
    const created = await admin.rpc('create_delivery_with_receipt', create()).throwOnError();
    const deliveryId = created.data.deliveryId;
    const beforeBalance = (await state()).balance;
    const args = { p_delivery_id: deliveryId, p_items: line(4, 1), p_date: getIstanbulToday(), p_idempotency_key: key(), p_actor_id: adminId };
    const edited = await admin.rpc('update_delivery_with_receipt', args);
    expect(edited.error).toBeNull();
    const receipt = receiptSchema.parse(edited.data);
    expect(receipt).toMatchObject({ totalSalesAmount: 30, previousBalance: beforeBalance, newBalance: beforeBalance + 10 });
    expect((await admin.rpc('update_delivery_atomic', { p_delivery_id: deliveryId, p_items: line(7), p_date: args.p_date })).error).toBeNull();
    const after = await state();
    expect((await admin.rpc('update_delivery_with_receipt', args)).data).toEqual(receipt);
    expect((await admin.rpc('update_delivery_with_receipt', { ...args, p_items: line(8) })).error?.message).toMatch(/different operation/i);
    expect((await staff.rpc('update_delivery_with_receipt', { ...args, p_actor_id: staffId })).error).not.toBeNull();
    expect(await state()).toEqual(after);
    expect(after.deliveries!.find(row => row.id === deliveryId)!.total_sales_amount).toBe(70);
  });

  it('returns payment data atomically and replays its original acknowledgement after an admin correction', async () => {
    const args = payment();
    const results = await Promise.all([admin.rpc('record_manual_payment_with_receipt', args), admin.rpc('record_manual_payment_with_receipt', args)]);
    for (const result of results) expect(result.error).toBeNull();
    const saved = paymentReceiptSchema.parse(results[0].data);
    expect(results[1].data).toEqual(saved);
    const current = await admin.rpc('get_financial_movement', { p_kind: 'payment', p_id: saved.id }).throwOnError();
    expect((await admin.rpc('change_financial_movement', { p_kind: 'payment', p_id: saved.id, p_action: 'edit',
      p_patch: { amount: 9, date: args.p_date, paymentType: 'bank_transfer' }, p_version: current.data.version, p_key: key() })).error).toBeNull();
    const after = await state();
    expect((await admin.rpc('record_manual_payment_with_receipt', args)).data).toEqual(saved);
    expect((await admin.rpc('record_manual_payment_with_receipt', { ...args, p_amount: 6 })).error?.message).toMatch(/different operation/i);
    expect((await admin.rpc('create_delivery_with_receipt', create(args.p_idempotency_key))).error?.message).toMatch(/different operation/i);
    expect(await state()).toEqual(after);
  });

  it('preserves legacy UUID replay but refuses to fabricate an original receipt for a pre-migration write', async () => {
    const args = create();
    const old = await service.from('deliveries').insert({ branch_id: branch, user_id: adminId, date: args.p_date, total_sales_amount: 20, idempotency_key: args.p_idempotency_key }).select('id').single().throwOnError();
    await service.from('delivery_items').insert({ delivery_id: old.data!.id, product_id: product, delivered_quantity: 2, returned_quantity: 0, unit_price: 10 }).throwOnError();
    await service.from('payments').insert({ branch_id: branch, user_id: adminId, delivery_id: old.data!.id, amount: 5, payment_type: 'field_collection', date: args.p_date }).throwOnError();
    await service.rpc('recalculate_branch_balance', { p_branch_id: branch }).throwOnError();
    const before = await state();
    expect((await admin.rpc('create_delivery_with_receipt', args)).error?.message).toMatch(/legacy operation requires reconciliation/i);
    const { p_actor_id: _actor, ...legacy } = args;
    expect((await admin.rpc('create_delivery_atomic', legacy)).data).toBe(old.data!.id);
    expect((await admin.rpc('create_delivery_atomic', { ...legacy, p_items: line(3) })).error).not.toBeNull();
    expect(await state()).toEqual(before);
  });

  it('allows staff to save/edit its own current record and rejects unauthorized, malformed, or oversized requests atomically', async () => {
    const own = await staff.rpc('create_delivery_with_receipt', { ...create(), p_actor_id: staffId }).throwOnError();
    expect((await staff.rpc('update_delivery_with_receipt', { p_delivery_id: own.data.deliveryId, p_items: line(3), p_date: getIstanbulToday(), p_idempotency_key: key(), p_actor_id: staffId })).error).toBeNull();
    const before = await state();
    for (const patch of [
      { p_idempotency_key: null }, { p_idempotency_key: '' }, { p_idempotency_key: 'x'.repeat(201) },
      { p_items: [] }, { p_items: [...line(), ...line()] }, { p_items: line(-1) },
      { p_items: Array.from({ length: 201 }, () => line()[0]) }, { p_payment_amount: -1 }, { p_date: null },
    ]) expect((await admin.rpc('create_delivery_with_receipt', { ...create(), ...patch })).error).not.toBeNull();
    expect((await anon.rpc('create_delivery_with_receipt', create())).error).not.toBeNull();
    expect((await anon.rpc('update_delivery_with_receipt', { p_delivery_id: own.data.deliveryId, p_items: line(), p_date: getIstanbulToday(), p_idempotency_key: key(), p_actor_id: staffId })).error).not.toBeNull();
    expect((await staff.rpc('record_manual_payment_with_receipt', { ...payment(), p_actor_id: staffId })).error).not.toBeNull();
    expect((await anon.rpc('record_manual_payment_with_receipt', payment())).error).not.toBeNull();
    expect((await admin.rpc('record_manual_payment_with_receipt', { ...payment(), p_amount: -1 })).error).not.toBeNull();
    expect((await admin.rpc('update_delivery_with_receipt', { p_delivery_id: own.data.deliveryId, p_items: [], p_date: getIstanbulToday(), p_idempotency_key: key(), p_actor_id: adminId })).error).not.toBeNull();
    for (const client of [admin, staff, anon]) {
      expect((await client.from('financial_write_receipts').select('*')).error).not.toBeNull();
      expect((await client.rpc('delivery_transaction_receipt', { p_id: own.data.deliveryId, p_previous_balance: 0 })).error).not.toBeNull();
      expect((await client.rpc('canonical_delivery_items', { p_items: line() })).error).not.toBeNull();
    }
    expect(await state()).toEqual(before);
  });
});
