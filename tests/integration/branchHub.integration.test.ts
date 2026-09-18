import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAdminClient, createAnonClient, createStaffClient, type AdminClient } from './_helpers/clients';

const PREFIX = `ITEST-HUB ${Date.now().toString(36)}`;

type FixtureIds = {
  cityId: string;
  districtId: string;
  branchId: string;
  productId: string;
  branchProductId: string;
  deliveryIds: string[];
  paymentIds: string[];
};

const ids: Partial<FixtureIds> = {};
let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;

async function getBranchHubDetails(branchId: string) {
  const { data, error } = await admin.rpc('get_branch_hub_details', { p_branch_id: branchId });
  if (error) throw error;
  return data as {
    name: string;
    districtName: string;
    cityName: string;
    openingBalance: number;
    isActive: boolean;
    activeProductCount: number;
    totalProductCount: number;
    lastMovementDate: string | null;
    deliveredQty: number;
    returnedQty: number;
    returnRate: number | null;
    auditCount: number;
    branchCreatedAt: string;
  };
}

async function cleanup(admin: AdminClient) {
  if (ids.paymentIds && ids.paymentIds.length > 0) {
    await admin.from('payments').delete().in('id', ids.paymentIds);
  }
  if (ids.deliveryIds && ids.deliveryIds.length > 0) {
    await admin.from('delivery_items').delete().in('delivery_id', ids.deliveryIds);
    await admin.from('deliveries').delete().in('id', ids.deliveryIds);
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

describe('branch hub details + ledger (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient();
    staff = await createStaffClient();
    anon = await createAnonClient();

    const city = await admin
      .from('cities')
      .insert({ name: `${PREFIX} Şehir` })
      .select('id')
      .single();
    if (city.error || !city.data) throw new Error(`city: ${city.error?.message}`);
    ids.cityId = city.data.id;

    const district = await admin
      .from('districts')
      .insert({ city_id: ids.cityId!, name: `${PREFIX} İlçe` })
      .select('id')
      .single();
    if (district.error || !district.data) throw new Error(`district: ${district.error?.message}`);
    ids.districtId = district.data.id;

    const branch = await admin
      .from('branches')
      .insert({
        district_id: ids.districtId!,
        name: `${PREFIX} Şube`,
        current_balance: 0,
        opening_balance: 0,
        is_active: true,
      })
      .select('id')
      .single();
    if (branch.error || !branch.data) throw new Error(`branch: ${branch.error?.message}`);
    ids.branchId = branch.data.id;

    const product = await admin
      .from('products')
      .insert({ name: `${PREFIX} Ürün`, is_active: true })
      .select('id')
      .single();
    if (product.error || !product.data) throw new Error(`product: ${product.error?.message}`);
    ids.productId = product.data.id;

    const branchProduct = await admin
      .from('branch_products')
      .insert({ branch_id: ids.branchId!, product_id: ids.productId!, is_active: true })
      .select('id')
      .single();
    if (branchProduct.error || !branchProduct.data) {
      throw new Error(`branch_product: ${branchProduct.error?.message}`);
    }
    ids.branchProductId = branchProduct.data.id;

    await admin.from('branch_product_prices').insert({
      branch_product_id: ids.branchProductId!,
      price: 12.5,
      start_date: new Date().toISOString().slice(0, 10),
    });

    ids.deliveryIds = [];
    ids.paymentIds = [];
  }, 60_000);

  afterAll(async () => {
    if (admin) await cleanup(admin);
  }, 60_000);

  it('reports zero activity before any deliveries or payments', async () => {
    const details = await getBranchHubDetails(ids.branchId!);
    expect(details.name).toBe(`${PREFIX} Şube`);
    expect(details.cityName).toBe(`${PREFIX} Şehir`);
    expect(details.districtName).toBe(`${PREFIX} İlçe`);
    expect(details.lastMovementDate).toBeNull();
    expect(Number(details.deliveredQty)).toBe(0);
    expect(Number(details.returnedQty)).toBe(0);
    expect(details.returnRate).toBeNull();
    expect(details.activeProductCount).toBeGreaterThanOrEqual(1);
    expect(details.totalProductCount).toBeGreaterThanOrEqual(1);
  });

  it('allows repeated same-day price edits without creating an invalid price range', async () => {
    const today = new Date().toISOString().slice(0, 10);

    for (const price of [15, 17.5]) {
      const { error } = await admin.rpc('set_branch_product_price_atomic', {
        p_branch_product_id: ids.branchProductId!,
        p_new_price: price,
        p_effective_from: today,
      });
      expect(error).toBeNull();
    }

    const { data, error } = await admin
      .from('branch_product_prices')
      .select('price, start_date, end_date')
      .eq('branch_product_id', ids.branchProductId!);

    expect(error).toBeNull();
    expect(data).toEqual([{ price: 17.5, start_date: today, end_date: null }]);

    // Keep the shared fixture's original price for the financial tests below.
    const { error: restoreError } = await admin.rpc('set_branch_product_price_atomic', {
      p_branch_product_id: ids.branchProductId!,
      p_new_price: 12.5,
      p_effective_from: today,
    });
    expect(restoreError).toBeNull();
  });

  it('rejects non-admin and malformed price updates', async () => {
    const today = new Date().toISOString().slice(0, 10);

    const { error: staffError } = await staff.rpc('set_branch_product_price_atomic', {
      p_branch_product_id: ids.branchProductId!,
      p_new_price: 20,
      p_effective_from: today,
    });
    expect(staffError?.message).toContain('Not authorized');

    const { error: anonError } = await anon.rpc('set_branch_product_price_atomic', {
      p_branch_product_id: ids.branchProductId!,
      p_new_price: 20,
      p_effective_from: today,
    });
    expect(anonError?.message).toContain('Not authorized');

    const { error: malformedError } = await admin.rpc('set_branch_product_price_atomic', {
      p_branch_product_id: ids.branchProductId!,
      p_new_price: 0,
      p_effective_from: today,
    });
    expect(malformedError?.message).toContain('Price must be greater than zero');
  });

  it('reflects a delivery + payment combination and excludes soft-deleted rows', async () => {
    const today = new Date().toISOString().slice(0, 10);

    // Two visible deliveries with deliveries 10/5 and 6/2 (returns > 0).
    for (const item of [
      { delivered: 10, returned: 5 },
      { delivered: 6, returned: 2 },
    ]) {
      const { data, error } = await admin.rpc('create_delivery_atomic', {
        p_branch_id: ids.branchId!,
        p_items: [{ product_id: ids.productId!, delivered_quantity: item.delivered, returned_quantity: item.returned }],
        p_payment_amount: 0,
        p_payment_type: 'field_collection',
        p_date: today,
      });
      if (error) throw error;
      ids.deliveryIds!.push(data as string);
    }

    // A payment larger than any delivery date to drive lastMovementDate.
    const paymentDate = today;
    const { data: paymentId } = await admin.rpc('record_manual_payment_atomic', {
      p_branch_id: ids.branchId!,
      p_amount: 5,
      p_payment_type: 'bank_transfer',
      p_date: paymentDate,
    });
    ids.paymentIds!.push(paymentId as string);

    // A soft-deleted delivery should NOT contribute to metrics.
    const deletedDelivery = await admin
      .from('deliveries')
      .insert({
        branch_id: ids.branchId!,
        user_id: (await admin.from('users').select('id').eq('role', 'admin').limit(1).single()).data!.id,
        total_sales_amount: 999,
        date: today,
        deleted_at: new Date().toISOString(),
        deletion_reason: `${PREFIX}-hidden`,
      })
      .select('id')
      .single();
    if (deletedDelivery.error || !deletedDelivery.data) {
      throw new Error(`hidden delivery: ${deletedDelivery.error?.message}`);
    }
    await admin.from('delivery_items').insert({
      delivery_id: deletedDelivery.data.id,
      product_id: ids.productId!,
      delivered_quantity: 999,
      returned_quantity: 999,
      unit_price: 99,
    });
    ids.deliveryIds!.push(deletedDelivery.data.id);

    const details = await getBranchHubDetails(ids.branchId!);
    expect(Number(details.deliveredQty)).toBe(16);
    expect(Number(details.returnedQty)).toBe(7);
    // 7 / 16 * 100 = 43.75
    expect(Number(details.returnRate)).toBeCloseTo(43.75, 2);
    expect(details.lastMovementDate).toBe(paymentDate);
  });

  it('rejects staff from reading hub details', async () => {
    const { error } = await staff.rpc('get_branch_hub_details', { p_branch_id: ids.branchId! });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/Not authorized/i);
  });

  it('returns a stable balance through get_branch_balance for both admin and staff', async () => {
    const adminBalance = (await admin.rpc('get_branch_balance', {
      p_branch_id: ids.branchId!,
    })) as unknown as { data: number };
    const staffBalance = (await staff.rpc('get_branch_balance', {
      p_branch_id: ids.branchId!,
    })) as unknown as { data: number };
    expect(Number(adminBalance.data)).toBeCloseTo(Number(staffBalance.data), 2);
    // Sanity: balance reflects the two visible deliveries minus the payment.
    // sales = (10-5)*12.5 + (6-2)*12.5 = 62.5 + 50 = 112.5; payment = 5.
    // Canonical (M20): balance = opening + sales - payments
    //   = 0 + 112.5 - 5 = 107.5 (Alacak).
    expect(Number(adminBalance.data)).toBeCloseTo(107.5, 2);
  });
});
