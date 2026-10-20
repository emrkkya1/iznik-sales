import { serviceClient } from './_helpers/clients';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getIstanbulToday } from '../../src/utils/dates';
import { createAdminClient, createAnonClient, createStaffClient, type AdminClient } from './_helpers/clients';

const PREFIX = `ITEST-RENAME ${Date.now().toString(36)}`;
let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;
let branchId: string;
let deliveryId: string;

describe('rename_branch (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient();
    staff = await createStaffClient();
    anon = await createAnonClient();
    const district = await admin.from('districts').select('id').limit(1).single();
    const product = await admin.from('products').select('id').eq('is_active', true).limit(1).single();
    if (district.error || product.error) throw new Error('Reference fixtures unavailable');
    const branch = await admin.rpc('create_branch', {
      p_district_id: district.data.id, p_name: PREFIX, p_opening_balance: 10,
      p_is_active: true, p_products: [{ productId: product.data.id, price: 25 }],
    });
    if (branch.error) throw branch.error;
    branchId = branch.data as string;
    const delivery = await admin.rpc('create_delivery_atomic', {
      p_branch_id: branchId, p_date: getIstanbulToday(),
      p_items: [{ product_id: product.data.id, delivered_quantity: 10, returned_quantity: 2 }],
      p_payment_amount: 100, p_payment_type: 'field_collection',
    });
    if (delivery.error) throw delivery.error;
    deliveryId = delivery.data as string;
  });

  afterAll(async () => {
    if (!admin || !branchId) return;
    if (deliveryId) {
      await serviceClient().from('payments').delete().eq('delivery_id', deliveryId);
      await serviceClient().from('delivery_items').delete().eq('delivery_id', deliveryId);
      await serviceClient().from('deliveries').delete().eq('id', deliveryId);
    }
    const links = await admin.from('branch_products').select('id').eq('branch_id', branchId);
    if (links.data?.length) await admin.from('branch_product_prices').delete().in('branch_product_id', links.data.map(row => row.id));
    await admin.from('branch_products').delete().eq('branch_id', branchId);
    await serviceClient().from('branches').delete().eq('id', branchId);
  });

  it('renames with trimmed Turkish text, preserves financial data, and records an audit entry', async () => {
    const before = await admin.from('branches').select('*').eq('id', branchId).single();
    const linksBefore = await admin.from('branch_products').select('*').eq('branch_id', branchId);
    const deliveryBefore = await admin.from('deliveries').select('*').eq('id', deliveryId).single();
    const name = `${PREFIX} İznik Çarşı`;
    const renamed = await admin.rpc('rename_branch', { p_branch_id: branchId, p_name: `  ${name}  ` });
    expect(renamed.error).toBeNull();
    const after = await admin.from('branches').select('*').eq('id', branchId).single();
    expect(after.error).toBeNull();
    expect(after.data).toEqual({ ...before.data, name, updated_at: expect.any(String) });
    expect((await admin.from('branch_products').select('*').eq('branch_id', branchId)).data).toEqual(linksBefore.data);
    expect((await admin.from('deliveries').select('*').eq('id', deliveryId).single()).data).toEqual(deliveryBefore.data);
    const audit = await admin.from('audit_logs').select('old_data, user_id').eq('record_id', branchId).eq('operation_type', 'UPDATE');
    expect(audit.error).toBeNull();
    expect(audit.data).toHaveLength(1);
    expect(audit.data?.[0]?.old_data).toMatchObject({ name: PREFIX });
    expect(audit.data?.[0]?.user_id).toBe((await admin.auth.getUser()).data.user?.id);
    const details = await admin.rpc('get_branch_hub_details', { p_branch_id: branchId });
    expect(details.error).toBeNull();
    expect(details.data).toMatchObject({ name });
  });

  it('treats the current name as a no-op without adding audit noise', async () => {
    const branch = await admin.from('branches').select('name').eq('id', branchId).single();
    const before = await admin.from('audit_logs').select('id').eq('record_id', branchId);
    expect((await admin.rpc('rename_branch', { p_branch_id: branchId, p_name: branch.data!.name })).error).toBeNull();
    expect((await admin.from('audit_logs').select('id').eq('record_id', branchId)).data).toEqual(before.data);
  });

  it('rejects staff and anonymous callers without changing the name', async () => {
    const before = await admin.from('branches').select('name').eq('id', branchId).single();
    for (const client of [staff, anon]) {
      expect((await client.rpc('rename_branch', { p_branch_id: branchId, p_name: 'Unauthorized rename' })).error).not.toBeNull();
    }
    expect((await admin.from('branches').select('name').eq('id', branchId).single()).data).toEqual(before.data);
  });

  it.each([null, '', '   ', '\t\n'])('rejects an empty name (%s)', async (name) => {
    const result = await admin.rpc('rename_branch', { p_branch_id: branchId, p_name: name });
    expect(result.error?.message).toMatch(/name is required/i);
  });

  it('rejects null, malformed, and unknown branch IDs', async () => {
    for (const id of [null, 'not-a-uuid', '00000000-0000-0000-0000-000000000000']) {
      expect((await admin.rpc('rename_branch', { p_branch_id: id, p_name: 'Valid name' })).error).not.toBeNull();
    }
  });
});
