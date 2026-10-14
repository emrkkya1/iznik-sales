import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAdminClient,
  createAnonClient,
  createStaffClient,
  serviceClient,
  type AdminClient,
} from './_helpers/clients';

const PREFIX = `ITEST-DEL ${Date.now().toString(36)}`;

type FixtureIds = {
  cityId: string;
  districtId: string;
  branchId: string;
  productId: string;
  branchProductId: string;
  deliveryId?: string;
  updatedDeliveryId?: string;
  softDeletedDeliveryId?: string;
  paymentIds: string[];
  manualPaymentId?: string;
};

const ids: Partial<FixtureIds> = {};
let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;
const extraDeliveryIds: string[] = [];

async function ensureCityDistrictBranch(admin: AdminClient, prefix: string) {
  const city = await admin
    .from('cities')
    .insert({ name: `${prefix} Şehir` })
    .select('id')
    .single();
  if (city.error || !city.data) throw new Error(`city insert failed: ${city.error?.message}`);

  const district = await admin
    .from('districts')
    .insert({ city_id: city.data.id, name: `${prefix} İlçe` })
    .select('id')
    .single();
  if (district.error || !district.data) throw new Error(`district insert failed: ${district.error?.message}`);

  const branch = await admin
    .from('branches')
    .insert({
      district_id: district.data.id,
      name: `${prefix} Şube`,
      current_balance: 0,
      opening_balance: 0,
      is_active: true,
    })
    .select('id')
    .single();
  if (branch.error || !branch.data) throw new Error(`branch insert failed: ${branch.error?.message}`);

  return { cityId: city.data.id, districtId: district.data.id, branchId: branch.data.id };
}

async function ensureProductWithPrice(admin: AdminClient, branchId: string, prefix: string) {
  const product = await admin
    .from('products')
    .insert({ name: `${prefix} Ürün`, is_active: true })
    .select('id')
    .single();
  if (product.error || !product.data) throw new Error(`product insert failed: ${product.error?.message}`);

  const branchProduct = await admin
    .from('branch_products')
    .insert({ branch_id: branchId, product_id: product.data.id, is_active: true })
    .select('id')
    .single();
  if (branchProduct.error || !branchProduct.data) {
    throw new Error(`branch_product insert failed: ${branchProduct.error?.message}`);
  }

  const price = await admin
    .from('branch_product_prices')
    .insert({
      branch_product_id: branchProduct.data.id,
      price: 5,
      start_date: '2000-01-01',
      end_date: '2026-01-01',
    })
    .select('id')
    .single();
  if (price.error || !price.data) throw new Error(`price insert failed: ${price.error?.message}`);
  const currentPrice = await admin.from('branch_product_prices').insert({
    branch_product_id: branchProduct.data.id,
    price: 10,
    start_date: '2026-01-02',
  });
  if (currentPrice.error) throw currentPrice.error;

  return { productId: product.data.id, branchProductId: branchProduct.data.id };
}

async function cleanup(admin: AdminClient) {
  if (extraDeliveryIds.length > 0) {
    await admin.from('delivery_items').delete().in('delivery_id', extraDeliveryIds);
    await admin.from('payments').delete().in('delivery_id', extraDeliveryIds);
    await admin.from('deliveries').delete().in('id', extraDeliveryIds);
  }
  if (ids.softDeletedDeliveryId) {
    await admin.from('deliveries').delete().eq('id', ids.softDeletedDeliveryId);
  }
  if (ids.updatedDeliveryId) {
    await admin.from('delivery_items').delete().eq('delivery_id', ids.updatedDeliveryId);
    await admin.from('payments').delete().eq('delivery_id', ids.updatedDeliveryId);
    await admin.from('deliveries').delete().eq('id', ids.updatedDeliveryId);
  }
  if (ids.deliveryId) {
    await admin.from('delivery_items').delete().eq('delivery_id', ids.deliveryId);
    await admin.from('payments').delete().eq('delivery_id', ids.deliveryId);
    await admin.from('deliveries').delete().eq('id', ids.deliveryId);
  }
  if (ids.paymentIds && ids.paymentIds.length > 0) {
    await admin.from('payments').delete().in('id', ids.paymentIds);
  }
  if (ids.manualPaymentId) {
    await admin.from('payments').delete().eq('id', ids.manualPaymentId);
  }
  if (ids.branchProductId) {
    await admin.from('branch_product_prices').delete().eq('branch_product_id', ids.branchProductId);
    await admin.from('branch_products').delete().eq('id', ids.branchProductId);
  }
  if (ids.productId) {
    await admin.from('products').delete().eq('id', ids.productId);
  }
  if (ids.branchId) {
    await admin.from('branches').delete().eq('id', ids.branchId);
  }
  if (ids.districtId) {
    await admin.from('districts').delete().eq('id', ids.districtId);
  }
  if (ids.cityId) {
    await admin.from('cities').delete().eq('id', ids.cityId);
  }
}

async function getBranchBalance(client: AdminClient, branchId: string): Promise<number> {
  const { data, error } = await client.rpc('get_branch_balance', { p_branch_id: branchId });
  if (error) throw error;
  return Number(data ?? 0);
}

async function getBranchRow(client: AdminClient, branchId: string) {
  const { data, error } = await client
    .from('branches')
    .select('id, current_balance, is_active')
    .eq('id', branchId)
    .single();
  if (error) throw error;
  return data;
}

describe('delivery lifecycle RPCs (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient();
    staff = await createStaffClient();
    anon = await createAnonClient();

    const location = await ensureCityDistrictBranch(admin, PREFIX);
    ids.cityId = location.cityId;
    ids.districtId = location.districtId;
    ids.branchId = location.branchId;

    const product = await ensureProductWithPrice(admin, ids.branchId!, PREFIX);
    ids.productId = product.productId;
    ids.branchProductId = product.branchProductId;
  }, 60_000);

  afterAll(async () => {
    if (admin) await cleanup(admin);
  }, 60_000);

  it('admin creates a delivery with one item and a payment, then updates it', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: deliveryId, error: createError } = await admin.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId!,
      p_items: [{ product_id: ids.productId!, delivered_quantity: 10, returned_quantity: 0 }],
      p_payment_amount: 25,
      p_payment_type: 'field_collection',
      p_date: today,
    });
    expect(createError).toBeNull();
    expect(deliveryId).toBeTruthy();
    ids.deliveryId = deliveryId as string;

    const afterCreate = await getBranchRow(admin, ids.branchId!);
    // Canonical (M20): balance = opening + sales - payments
    //   = 0 + 100 - 25 = 75 (Alacak: branch owes us 75).
    expect(Number(afterCreate?.current_balance)).toBeCloseTo(75, 2);
    expect(Number(await getBranchBalance(admin, ids.branchId!))).toBeCloseTo(75, 2);

    const { error: updateError } = await admin.rpc('update_delivery_atomic', {
      p_delivery_id: ids.deliveryId!,
      p_items: [{ product_id: ids.productId!, delivered_quantity: 8, returned_quantity: 2 }],
      p_date: today,
    });
    expect(updateError).toBeNull();
    ids.updatedDeliveryId = ids.deliveryId;

    const afterUpdate = await getBranchRow(admin, ids.branchId!);
    // net = 6 * 10 = 60 sales; payment still 25.
    // canonical: 0 + 60 - 25 = 35 (Alacak).
    expect(Number(afterUpdate?.current_balance)).toBeCloseTo(35, 2);
  });

  it('replays create_delivery_atomic with the same idempotency key without double-inserting', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const idempotencyKey = `${PREFIX}-idem-${Date.now()}`;
    const args = {
      p_branch_id: ids.branchId!,
      p_items: [{ product_id: ids.productId!, delivered_quantity: 5, returned_quantity: 0 }],
      p_payment_amount: 10,
      p_payment_type: 'field_collection',
      p_date: today,
      p_idempotency_key: idempotencyKey,
    };

    const { data: first, error: firstError } = await admin.rpc('create_delivery_atomic', args);
    expect(firstError).toBeNull();
    const firstId = first as string;
    expect(firstId).toBeTruthy();

    const { data: replay, error: replayError } = await admin.rpc('create_delivery_atomic', args);
    expect(replayError).toBeNull();
    expect(replay).toBe(firstId);

    ids.paymentIds = ids.paymentIds ?? [];
    ids.paymentIds.push(firstId);
    const { count: deliveryCount } = await admin
      .from('deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('idempotency_key', idempotencyKey);
    expect(deliveryCount).toBe(1);
    ids.deliveryId = firstId;
  });

  it('allows staff to create a current-day field collection', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
    const { data, error } = await staff.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId!,
      p_items: [{ product_id: ids.productId!, delivered_quantity: 2, returned_quantity: 0 }],
      p_payment_amount: 5,
      p_payment_type: 'field_collection',
      p_date: today,
      p_idempotency_key: `${PREFIX}-staff-${Date.now()}`,
    });

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    extraDeliveryIds.push(data as string);

    const { data: created, error: createdError } = await admin
      .from('deliveries')
      .select('user_id')
      .eq('id', data as string)
      .single();
    expect(createdError).toBeNull();

    const { data: staffUser, error: staffUserError } = await staff.auth.getUser();
    expect(staffUserError).toBeNull();
    expect(created?.user_id).toBe(staffUser.user?.id);
  });

  it('allows backdated staff deliveries at the historical price with dated collections and audit history', async () => {
    const input = {
      p_branch_id: ids.branchId!,
      p_items: [{ product_id: ids.productId!, delivered_quantity: 3, returned_quantity: 1 }],
      p_payment_amount: 5,
      p_payment_type: 'field_collection',
      p_date: '2025-12-31',
      p_idempotency_key: `${PREFIX}-staff-backdated`,
    };
    const balanceBefore = await getBranchBalance(admin, ids.branchId!);
    const { data: id, error } = await staff.rpc('create_delivery_atomic', input);
    expect(error).toBeNull();
    expect(id).toBeTruthy();
    extraDeliveryIds.push(id as string);
    const delivery = await admin.from('deliveries').select('date,total_sales_amount,user_id').eq('id', id).single();
    expect(delivery.data).toMatchObject({ date: input.p_date, total_sales_amount: 10, user_id: (await staff.auth.getUser()).data.user?.id });
    const items = await admin.from('delivery_items').select('unit_price').eq('delivery_id', id).single();
    expect(items.data?.unit_price).toBe(5);
    const payment = await admin.from('payments').select('date,amount').eq('delivery_id', id).single();
    expect(payment.data).toMatchObject({ date: input.p_date, amount: 5 });
    expect(await getBranchBalance(admin, ids.branchId!)).toBeCloseTo(balanceBefore + 5, 2);
    const retry = await staff.rpc('create_delivery_atomic', input);
    expect(retry.error).toBeNull();
    expect(retry.data).toBe(id);
    expect(await getBranchBalance(admin, ids.branchId!)).toBeCloseTo(balanceBefore + 5, 2);
    const events = await serviceClient().from('financial_movement_events').select('action').eq('record_id', id);
    expect(events.error).toBeNull();
    expect(events.data).toEqual([{ action: 'create' }]);
    const edit = await staff.rpc('update_delivery_atomic', { p_delivery_id: id, p_items: input.p_items, p_date: input.p_date });
    expect(edit.error?.message).toMatch(/today/i);
  });

  it('rejects staff future dates and bank transfers without inserting a delivery', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
    const before = await admin
      .from('deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', ids.branchId!);

    const future = await staff.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId!,
      p_items: [{ product_id: ids.productId!, delivered_quantity: 1, returned_quantity: 0 }],
      p_payment_amount: 0,
      p_payment_type: 'field_collection',
      p_date: '2999-01-01',
      p_idempotency_key: `${PREFIX}-staff-future-${Date.now()}`,
    });
    expect(future.error?.message).toMatch(/future/i);

    const bankTransfer = await staff.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId!,
      p_items: [{ product_id: ids.productId!, delivered_quantity: 1, returned_quantity: 0 }],
      p_payment_amount: 0,
      p_payment_type: 'bank_transfer',
      p_date: today,
      p_idempotency_key: `${PREFIX}-staff-bank-${Date.now()}`,
    });
    expect(bankTransfer.error?.message).toMatch(/field collections/i);

    const after = await admin
      .from('deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', ids.branchId!);
    expect(after.count).toBe(before.count);
  });

  it('rejects anonymous and malformed delivery creation without partial writes', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const before = await admin
      .from('deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', ids.branchId!);

    const anonymous = await anon.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId!,
      p_items: [{ product_id: ids.productId!, delivered_quantity: 1, returned_quantity: 0 }],
      p_payment_amount: 0,
      p_payment_type: 'field_collection',
      p_date: today,
      p_idempotency_key: `${PREFIX}-anon-${Date.now()}`,
    });
    expect(anonymous.error).not.toBeNull();

    const emptyItems = await admin.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId!,
      p_items: [],
      p_payment_amount: 0,
      p_payment_type: 'field_collection',
      p_date: today,
      p_idempotency_key: `${PREFIX}-empty-${Date.now()}`,
    });
    expect(emptyItems.error?.message).toMatch(/at least one item/i);

    const after = await admin
      .from('deliveries')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', ids.branchId!);
    expect(after.count).toBe(before.count);
  });

  it('rejects missing dates and missing historical prices without leaving partial records', async () => {
    const before = await admin.from('deliveries').select('id', { count: 'exact', head: true }).eq('branch_id', ids.branchId!);
    for (const date of [null, '1999-12-31']) {
      const result = await staff.rpc('create_delivery_atomic', {
        p_branch_id: ids.branchId!,
        p_items: [{ product_id: ids.productId!, delivered_quantity: 1, returned_quantity: 0 }],
        p_payment_amount: 5, p_payment_type: 'field_collection', p_date: date,
        p_idempotency_key: `${PREFIX}-missing-${date}`,
      });
      expect(result.error?.message).toMatch(date === null ? /date is required/i : /no price found/i);
    }
    const after = await admin.from('deliveries').select('id', { count: 'exact', head: true }).eq('branch_id', ids.branchId!);
    expect(after.count).toBe(before.count);
  });

  it('admin soft-deletes a delivery and the branch balance is recalculated', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: deliveryId, error: createError } = await admin.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId!,
      p_items: [{ product_id: ids.productId!, delivered_quantity: 4, returned_quantity: 0 }],
      p_payment_amount: 0,
      p_payment_type: 'field_collection',
      p_date: today,
    });
    expect(createError).toBeNull();
    ids.softDeletedDeliveryId = deliveryId as string;

    const { error: deleteError } = await admin.rpc('soft_delete_delivery_atomic', {
      p_delivery_id: idAsString(ids.softDeletedDeliveryId),
      p_deletion_reason: `${PREFIX}-delete`,
    });
    expect(deleteError).toBeNull();

    const { data: row } = await admin
      .from('deliveries')
      .select('deleted_at, deleted_by, deletion_reason')
      .eq('id', ids.softDeletedDeliveryId!)
      .single();
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.deletion_reason).toBe(`${PREFIX}-delete`);

    const { count: activePayments } = await admin
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('delivery_id', ids.softDeletedDeliveryId!)
      .is('deleted_at', null);
    expect(activePayments).toBe(0);
  });

  it('rejects staff soft-deleting a delivery', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { data: deliveryId } = await admin.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId!,
      p_items: [{ product_id: ids.productId!, delivered_quantity: 3, returned_quantity: 0 }],
      p_payment_amount: 0,
      p_payment_type: 'field_collection',
      p_date: today,
    });
    const safeId = idAsString(deliveryId);
    ids.paymentIds = ids.paymentIds ?? [];
    ids.paymentIds.push(safeId);

    const { error } = await staff.rpc('soft_delete_delivery_atomic', {
      p_delivery_id: safeId,
      p_deletion_reason: `${PREFIX}-staff-delete`,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/Not authorized/i);
  });

  it('rejects unknown products on create with a useful error message', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const fakeProductId = '00000000-0000-0000-0000-000000000000';
    const { error } = await admin.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId!,
      p_items: [{ product_id: fakeProductId, delivered_quantity: 1, returned_quantity: 0 }],
      p_payment_amount: 0,
      p_payment_type: 'field_collection',
      p_date: today,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not available/i);
  });

  it('records an admin manual payment atomically and rejects unauthorized or non-positive payments', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const balanceBefore = await getBranchBalance(admin, ids.branchId!);
    const { data: paymentId, error } = await admin.rpc('record_manual_payment_atomic', {
      p_branch_id: ids.branchId!,
      p_amount: 12.5,
      p_payment_type: 'bank_transfer',
      p_date: today,
    });
    expect(error).toBeNull();
    expect(paymentId).toBeTruthy();
    ids.manualPaymentId = paymentId as string;
    expect(await getBranchBalance(admin, ids.branchId!)).toBeCloseTo(balanceBefore - 12.5, 2);

    const staffResult = await staff.rpc('record_manual_payment_atomic', {
      p_branch_id: ids.branchId!, p_amount: 1, p_payment_type: 'bank_transfer', p_date: today,
    });
    expect(staffResult.error?.message).toMatch(/not authorized/i);
    const anonResult = await anon.rpc('record_manual_payment_atomic', {
      p_branch_id: ids.branchId!, p_amount: 1, p_payment_type: 'bank_transfer', p_date: today,
    });
    expect(anonResult.error).not.toBeNull();

    const beforeInvalid = await getBranchBalance(admin, ids.branchId!);
    const invalid = await admin.rpc('record_manual_payment_atomic', {
      p_branch_id: ids.branchId!, p_amount: 0, p_payment_type: 'bank_transfer', p_date: today,
    });
    expect(invalid.error?.message).toMatch(/positive/i);
    expect(await getBranchBalance(admin, ids.branchId!)).toBeCloseTo(beforeInvalid, 2);
  });
});

function idAsString(value: string | null | undefined): string {
  if (!value) throw new Error('expected delivery id');
  return value;
}
