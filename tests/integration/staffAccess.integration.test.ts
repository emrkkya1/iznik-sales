import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAdminClient,
  createAnonClient,
  createStaffClient,
  type AdminClient,
} from './_helpers/clients';

const PREFIX = `ITEST-STAFF ${Date.now().toString(36)}`;
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });

let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;
let cityId: string;
let districtId: string;
let branchId: string;
let productId: string;
let branchProductId: string;
let staffDeliveryId: string;
let adminDeliveryId: string;

async function cleanup() {
  const deliveryIds = [staffDeliveryId, adminDeliveryId].filter(Boolean);
  if (deliveryIds.length > 0) {
    await admin.from('delivery_items').delete().in('delivery_id', deliveryIds);
    await admin.from('payments').delete().in('delivery_id', deliveryIds);
    await admin.from('deliveries').delete().in('id', deliveryIds);
  }
  if (branchProductId) {
    await admin.from('branch_product_prices').delete().eq('branch_product_id', branchProductId);
    await admin.from('branch_products').delete().eq('id', branchProductId);
  }
  if (productId) await admin.from('products').delete().eq('id', productId);
  if (branchId) await admin.from('branches').delete().eq('id', branchId);
  if (districtId) await admin.from('districts').delete().eq('id', districtId);
  if (cityId) await admin.from('cities').delete().eq('id', cityId);
}

describe('staff delivery access boundaries (integration)', () => {
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
    const branch = await admin.from('branches').insert({
      district_id: districtId, name: `${PREFIX} Şube`, opening_balance: 0, current_balance: 0, is_active: true,
    }).select('id').single();
    if (branch.error || !branch.data) throw branch.error;
    branchId = branch.data.id;
    const product = await admin.from('products').insert({ name: `${PREFIX} Ürün`, is_active: true }).select('id').single();
    if (product.error || !product.data) throw product.error;
    productId = product.data.id;
    const branchProduct = await admin.from('branch_products').insert({ branch_id: branchId, product_id: productId, is_active: true }).select('id').single();
    if (branchProduct.error || !branchProduct.data) throw branchProduct.error;
    branchProductId = branchProduct.data.id;
    const price = await admin.from('branch_product_prices').insert({ branch_product_id: branchProductId, price: 10, start_date: TODAY });
    if (price.error) throw price.error;

    const staffDelivery = await staff.rpc('create_delivery_atomic', {
      p_branch_id: branchId,
      p_items: [{ product_id: productId, delivered_quantity: 2, returned_quantity: 0 }],
      p_payment_amount: 0,
      p_payment_type: 'field_collection',
      p_date: TODAY,
      p_idempotency_key: `${PREFIX}-staff`,
    });
    if (staffDelivery.error || !staffDelivery.data) throw staffDelivery.error;
    staffDeliveryId = staffDelivery.data as string;

    const adminDelivery = await admin.rpc('create_delivery_atomic', {
      p_branch_id: branchId,
      p_items: [{ product_id: productId, delivered_quantity: 3, returned_quantity: 0 }],
      p_payment_amount: 0,
      p_payment_type: 'field_collection',
      p_date: TODAY,
      p_idempotency_key: `${PREFIX}-admin`,
    });
    if (adminDelivery.error || !adminDelivery.data) throw adminDelivery.error;
    adminDeliveryId = adminDelivery.data as string;
  }, 60_000);

  afterAll(async () => {
    if (admin) await cleanup();
  }, 60_000);

  it('staff can read and update only its own current delivery', async () => {
    const own = await staff.from('deliveries').select('id, user_id').eq('id', staffDeliveryId).maybeSingle();
    expect(own.error).toBeNull();
    expect(own.data?.id).toBe(staffDeliveryId);

    const update = await staff.rpc('update_delivery_atomic', {
      p_delivery_id: staffDeliveryId,
      p_items: [{ product_id: productId, delivered_quantity: 4, returned_quantity: 1 }],
      p_date: TODAY,
    });
    expect(update.error).toBeNull();
  });

  it('does not expose or let staff modify an admin-owned delivery', async () => {
    const other = await staff.from('deliveries').select('id').eq('id', adminDeliveryId).maybeSingle();
    expect(other.error).toBeNull();
    expect(other.data).toBeNull();

    const update = await staff.rpc('update_delivery_atomic', {
      p_delivery_id: adminDeliveryId,
      p_items: [{ product_id: productId, delivered_quantity: 1, returned_quantity: 0 }],
      p_date: TODAY,
    });
    expect(update.error?.message).toMatch(/not authorized/i);
  });

  it('rejects anonymous access and staff access to admin-only hub data', async () => {
    const anonymous = await anon.from('deliveries').select('id').eq('id', staffDeliveryId).maybeSingle();
    expect(anonymous.data).toBeNull();
    expect(anonymous.error).not.toBeNull();

    const hub = await staff.rpc('get_branch_hub_details', { p_branch_id: branchId });
    expect(hub.error?.message).toMatch(/not authorized/i);
    const anonymousHub = await anon.rpc('get_branch_hub_details', { p_branch_id: branchId });
    expect(anonymousHub.error).not.toBeNull();
  });

  it('keeps audit logs and direct payment writes outside staff access', async () => {
    const audit = await staff.from('audit_logs').select('id').limit(1);
    expect(audit.error).toBeNull();
    expect(audit.data).toEqual([]);

    const paymentWrite = await staff.from('payments').insert({
      branch_id: branchId,
      user_id: (await staff.auth.getUser()).data.user?.id,
      amount: 1,
      payment_type: 'bank_transfer',
      date: TODAY,
    });
    expect(paymentWrite.error).not.toBeNull();
  });
});
