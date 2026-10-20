import { serviceClient } from './_helpers/clients';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAdminClient,
  createStaffClient,
  type AdminClient,
} from './_helpers/clients';

const PREFIX = `ITEST-BAL ${Date.now().toString(36)}`;

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

async function cleanup(admin: AdminClient) {
  if (ids.paymentIds && ids.paymentIds.length > 0) {
    await serviceClient().from('payments').delete().in('id', ids.paymentIds);
  }
  if (ids.deliveryIds && ids.deliveryIds.length > 0) {
    await serviceClient().from('delivery_items').delete().in('delivery_id', ids.deliveryIds);
    await serviceClient().from('deliveries').delete().in('id', ids.deliveryIds);
  }
  if (ids.branchProductId) {
    await admin.from('branch_product_prices').delete().eq('branch_product_id', ids.branchProductId);
    await admin.from('branch_products').delete().eq('id', ids.branchProductId);
  }
  if (ids.productId) {
    await admin.from('products').delete().eq('id', ids.productId);
  }
  if (ids.branchId) {
    await serviceClient().from('branches').delete().eq('id', ids.branchId);
  }
  if (ids.districtId) {
    await admin.from('districts').delete().eq('id', ids.districtId);
  }
  if (ids.cityId) {
    await admin.from('cities').delete().eq('id', ids.cityId);
  }
}

async function readBalance(branchId: string): Promise<number> {
  const { data, error } = await admin
    .from('branches')
    .select('current_balance')
    .eq('id', branchId)
    .single();
  if (error) throw error;
  return Number((data as { current_balance: number | null }).current_balance);
}

async function createDelivery(
  productId: string,
  delivered: number,
  returned: number,
  paymentAmount: number,
  date: string,
): Promise<string> {
  const { data, error } = await admin.rpc('create_delivery_atomic', {
    p_branch_id: ids.branchId!,
    p_items: [
      { product_id: productId, delivered_quantity: delivered, returned_quantity: returned },
    ],
    p_payment_amount: paymentAmount,
    p_payment_type: 'field_collection',
    p_date: date,
  });
  if (error) throw error;
  const id = data as string;
  ids.deliveryIds!.push(id);
  if (paymentAmount > 0) ids.paymentIds!.push(`placeholder-${id}`);
  return id;
}

describe('branch balance canonical convention (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient();
    staff = await createStaffClient();

    ids.deliveryIds = [];
    ids.paymentIds = [];

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

    const branch = await serviceClient()
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

    const bp = await admin
      .from('branch_products')
      .insert({ branch_id: ids.branchId!, product_id: ids.productId!, is_active: true })
      .select('id')
      .single();
    if (bp.error || !bp.data) throw new Error(`branch_product: ${bp.error?.message}`);
    ids.branchProductId = bp.data.id;

    const price = await admin
      .from('branch_product_prices')
      .insert({
        branch_product_id: ids.branchProductId!,
        price: 10,
        start_date: '2026-01-01',
      })
      .select('id')
      .single();
    if (price.error || !price.data) throw new Error(`price: ${price.error?.message}`);
  }, 60_000);

  afterAll(async () => {
    if (admin) await cleanup(admin);
  }, 60_000);

  it('starts at zero with no transactions', async () => {
    expect(await readBalance(ids.branchId!)).toBeCloseTo(0, 2);
  });

  it('grows positive (Alacak) when sales exceed payments', async () => {
    // 5 units delivered at 10 = 50 sales; 0 payment.
    // canonical: 0 + 50 - 0 = +50 (Alacak).
    await createDelivery(ids.productId!, 5, 0, 0, '2026-08-01');
    expect(await readBalance(ids.branchId!)).toBeCloseTo(50, 2);
  });

  it('shrinks when a payment covers part of the sale', async () => {
    // +50 sales, +30 payment -> 50 - 30 = 20.
    await createDelivery(ids.productId!, 0, 0, 30, '2026-08-02');
    expect(await readBalance(ids.branchId!)).toBeCloseTo(20, 2);
  });

  it('crosses to negative (Borç) when payments exceed sales', async () => {
    // +0 sales, +50 payment -> 20 - 50 = -30.
    await createDelivery(ids.productId!, 0, 0, 50, '2026-08-03');
    expect(await readBalance(ids.branchId!)).toBeCloseTo(-30, 2);
  });

  it('exposes the same balance to admin and staff via get_branch_balance', async () => {
    const adminRes = await admin.rpc('get_branch_balance', {
      p_branch_id: ids.branchId!,
    });
    const staffRes = await staff.rpc('get_branch_balance', {
      p_branch_id: ids.branchId!,
    });
    expect(adminRes.error).toBeNull();
    expect(staffRes.error).toBeNull();
    expect(Number((adminRes.data as unknown as number))).toBeCloseTo(
      Number((staffRes.data as unknown as number)),
      2,
    );
  });

  // RPC SECURITY DEFINER + grant bazlı çalışıyor; anon call ayrı bir
  // kontrat. Bu entegrasyon testi sözleşmeyi kasıtlı olarak doğrulamaz
  // — list_branches_analytics üzerinde anon reddi ayrıca test ediliyor.
});
