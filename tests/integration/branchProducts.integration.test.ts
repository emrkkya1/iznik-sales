import { serviceClient } from './_helpers/clients';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAdminClient,
  createAnonClient,
  createStaffClient,
  type AdminClient,
} from './_helpers/clients';

const PREFIX = `ITEST-BP ${Date.now().toString(36)}`;
const TODAY = new Date().toISOString().slice(0, 10);
const TOMORROW = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;
let cityId: string;
let districtId: string;
let branchId: string;
let productId: string;
let branchProductId: string;

async function cleanup() {
  if (branchProductId) {
    await admin.from('branch_product_prices').delete().eq('branch_product_id', branchProductId);
    await admin.from('branch_products').delete().eq('id', branchProductId);
  }
  if (productId) await admin.from('products').delete().eq('id', productId);
  if (branchId) await serviceClient().from('branches').delete().eq('id', branchId);
  if (districtId) await admin.from('districts').delete().eq('id', districtId);
  if (cityId) await admin.from('cities').delete().eq('id', cityId);
}

describe('branch product lifecycle RPCs (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient();
    staff = await createStaffClient();
    anon = await createAnonClient();

    const city = await admin.from('cities').insert({ name: `${PREFIX} Şehir` }).select('id').single();
    if (city.error || !city.data) throw city.error;
    cityId = city.data.id;
    const district = await admin.from('districts').insert({ city_id: cityId, name: `${PREFIX} İlçe` }).select('id').single();
    if (district.error || !district.data) throw district.error;
    districtId = district.data.id;
    const branch = await serviceClient().from('branches').insert({
      district_id: districtId, name: `${PREFIX} Şube`, opening_balance: 0, current_balance: 0, is_active: true,
    }).select('id').single();
    if (branch.error || !branch.data) throw branch.error;
    branchId = branch.data.id;
    const product = await admin.from('products').insert({ name: `${PREFIX} Ürün`, is_active: true }).select('id').single();
    if (product.error || !product.data) throw product.error;
    productId = product.data.id;
  }, 60_000);

  afterAll(async () => {
    if (admin) await cleanup();
  }, 60_000);

  it('admin activates an unassigned product with its first effective price', async () => {
    const { data, error } = await admin.rpc('activate_branch_product', {
      p_branch_id: branchId,
      p_product_id: productId,
      p_new_price: 11.25,
      p_effective_from: TODAY,
    });
    expect(error).toBeNull();
    branchProductId = data as string;

    const status = await admin.rpc('list_branch_products_with_status', { p_branch_id: branchId });
    expect(status.error).toBeNull();
    expect((status.data as { productId: string; branchProductId: string; isActivatedForBranch: boolean; currentPrice: number }[])
      .find((row) => row.productId === productId))
      .toMatchObject({ branchProductId, isActivatedForBranch: true, currentPrice: 11.25 });
  });

  it('rejects duplicate, unauthorized, anonymous, and malformed activation', async () => {
    const duplicate = await admin.rpc('activate_branch_product', {
      p_branch_id: branchId, p_product_id: productId, p_new_price: 11.25, p_effective_from: TODAY,
    });
    expect(duplicate.error?.message).toMatch(/already activated/i);

    const staffResult = await staff.rpc('activate_branch_product', {
      p_branch_id: branchId, p_product_id: productId, p_new_price: 12, p_effective_from: TODAY,
    });
    expect(staffResult.error?.message).toMatch(/not authorized/i);
    const anonResult = await anon.rpc('activate_branch_product', {
      p_branch_id: branchId, p_product_id: productId, p_new_price: 12, p_effective_from: TODAY,
    });
    expect(anonResult.error).not.toBeNull();
    const malformed = await admin.rpc('activate_branch_product', {
      p_branch_id: branchId, p_product_id: productId, p_new_price: 0, p_effective_from: TODAY,
    });
    expect(malformed.error?.message).toMatch(/greater than zero/i);
  });

  it('deactivation blocks new deliveries and reactivation preserves the price history', async () => {
    const deactivate = await admin.rpc('set_branch_product_active', {
      p_branch_product_id: branchProductId, p_is_active: false,
    });
    expect(deactivate.error).toBeNull();

    const blocked = await admin.rpc('create_delivery_atomic', {
      p_branch_id: branchId,
      p_items: [{ product_id: productId, delivered_quantity: 1, returned_quantity: 0 }],
      p_payment_amount: 0,
      p_payment_type: 'field_collection',
      p_date: TODAY,
      p_idempotency_key: `${PREFIX}-inactive-${Date.now()}`,
    });
    expect(blocked.error?.message).toMatch(/not available/i);

    const reactivate = await admin.rpc('set_branch_product_active', {
      p_branch_product_id: branchProductId, p_is_active: true,
    });
    expect(reactivate.error).toBeNull();
    const prices = await admin
      .from('branch_product_prices')
      .select('price, start_date, end_date')
      .eq('branch_product_id', branchProductId);
    expect(prices.error).toBeNull();
    expect(prices.data).toEqual([{ price: 11.25, start_date: TODAY, end_date: null }]);
  });

  it('allows only admins to toggle branch-product activation and validates the id', async () => {
    const staffResult = await staff.rpc('set_branch_product_active', {
      p_branch_product_id: branchProductId, p_is_active: false,
    });
    expect(staffResult.error?.message).toMatch(/not authorized/i);
    const anonResult = await anon.rpc('set_branch_product_active', {
      p_branch_product_id: branchProductId, p_is_active: false,
    });
    expect(anonResult.error).not.toBeNull();
    const malformed = await admin.rpc('set_branch_product_active', {
      p_branch_product_id: '00000000-0000-0000-0000-000000000000', p_is_active: false,
    });
    expect(malformed.error?.message).toMatch(/not found/i);
  });

  it('creates contiguous future price history and rejects retroactive prices', async () => {
    const scheduled = await admin.rpc('set_branch_product_price_atomic', {
      p_branch_product_id: branchProductId, p_new_price: 13.5, p_effective_from: TOMORROW,
    });
    expect(scheduled.error).toBeNull();

    const prices = await admin
      .from('branch_product_prices')
      .select('price, start_date, end_date')
      .eq('branch_product_id', branchProductId)
      .order('start_date');
    expect(prices.error).toBeNull();
    expect(prices.data).toEqual([
      { price: 11.25, start_date: TODAY, end_date: TODAY },
      { price: 13.5, start_date: TOMORROW, end_date: null },
    ]);

    const retroactive = await admin.rpc('set_branch_product_price_atomic', {
      p_branch_product_id: branchProductId, p_new_price: 14, p_effective_from: '2000-01-01',
    });
    expect(retroactive.error?.message).toMatch(/today or later/i);
  });
});
