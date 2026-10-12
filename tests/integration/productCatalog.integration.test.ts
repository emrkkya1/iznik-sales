import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAdminClient, createAnonClient, createStaffClient, type AdminClient } from './_helpers/clients';

const PREFIX = `ITEST-CATALOG ${Date.now().toString(36)}`;
let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;
let productId: string;

describe('product catalog RPCs (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient();
    staff = await createStaffClient();
    anon = await createAnonClient();
  });

  afterAll(async () => {
    if (productId) {
      const assigned = await admin.from('branch_products').select('id').eq('product_id', productId);
      for (const row of assigned.data ?? []) await admin.from('branch_product_prices').delete().eq('branch_product_id', row.id);
      await admin.from('branch_products').delete().eq('product_id', productId);
    }
    if (productId) await admin.from('products').delete().eq('id', productId);
  });

  it('creates a catalog product and exposes its default price', async () => {
    const { data, error } = await admin.rpc('create_catalog_product', {
      p_name: `${PREFIX} Ürün`,
      p_default_price: 42.5,
    });
    expect(error).toBeNull();
    productId = data as string;

    const { data: catalog, error: listError } = await admin.rpc('list_catalog_products', {
      p_include_archived: false,
    });
    expect(listError).toBeNull();
    const product = (catalog as { id: string; defaultPrice: number; isArchived: boolean }[]).find((item) => item.id === productId);
    expect(product).toMatchObject({ defaultPrice: 42.5, isArchived: false });
  });

  it('changes defaults without changing branch prices and archives only future catalog membership', async () => {
    const { error: priceError } = await admin.rpc('set_catalog_product_default_price', {
      p_product_id: productId,
      p_default_price: 55,
    });
    expect(priceError).toBeNull();

    const { error: archiveError } = await admin.rpc('set_catalog_product_archived', {
      p_product_id: productId,
      p_archived: true,
    });
    expect(archiveError).toBeNull();

    const active = await admin.rpc('list_catalog_products', { p_include_archived: false });
    expect((active.data as { id: string }[]).some((item) => item.id === productId)).toBe(false);
    const all = await admin.rpc('list_catalog_products', { p_include_archived: true });
    expect((all.data as { id: string; defaultPrice: number; isArchived: boolean }[]).find((item) => item.id === productId)).toMatchObject({ defaultPrice: 55, isArchived: true });
  });

  it('rejects staff, anonymous, and malformed catalog writes', async () => {
    const staffResult = await staff.rpc('create_catalog_product', { p_name: `${PREFIX} Staff`, p_default_price: 1 });
    expect(staffResult.error?.message).toMatch(/not authorized/i);
    const anonResult = await anon.rpc('create_catalog_product', { p_name: `${PREFIX} Anon`, p_default_price: 1 });
    expect(anonResult.error).not.toBeNull();
    const malformed = await admin.rpc('create_catalog_product', { p_name: ' ', p_default_price: -1 });
    expect(malformed.error?.message).toMatch(/name|price/i);
  });

  it('propagates even an unchanged default to active and inactive assignments, preserving past and scheduled periods', async () => {
    const branches = await admin.from('branches').select('id').limit(3);
    expect(branches.data).toHaveLength(3);
    const assignments = await admin.from('branch_products').insert(branches.data!.slice(0, 2).map((branch, index) => ({
      branch_id: branch.id, product_id: productId, is_active: index === 0,
    }))).select('id, is_active');
    expect(assignments.error).toBeNull();
    const ids = assignments.data!.map(row => row.id);
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const seeded = await admin.from('branch_product_prices').insert([
      { branch_product_id: ids[0], price: 10, start_date: yesterday, end_date: today },
      { branch_product_id: ids[0], price: 80, start_date: tomorrow },
      { branch_product_id: ids[1], price: 20, start_date: today },
    ]);
    expect(seeded.error).toBeNull();
    const unchanged = await admin.rpc('set_catalog_product_default_price', { p_product_id: productId, p_default_price: 55 });
    expect(unchanged.error).toBeNull();
    expect((await admin.from('branch_product_prices').select('price').in('branch_product_id', ids)).data!.map(row => row.price).sort()).toEqual([10, 20, 80]);
    for (const price of [55, 60, 60, 0]) {
      const result = await admin.rpc('set_catalog_product_default_price', { p_product_id: productId, p_default_price: price, p_update_branches: true });
      expect(result.error).toBeNull();
      const current = await admin.from('branch_product_prices').select('price').in('branch_product_id', ids).eq('start_date', today);
      expect(current.data).toHaveLength(2);
      expect(current.data!.every(row => row.price === price)).toBe(true);
    }
    const periods = await admin.from('branch_product_prices').select('*').eq('branch_product_id', ids[0]);
    expect(periods.data).toHaveLength(3);
    expect(periods.data!.find(row => row.start_date === yesterday)).toMatchObject({ price: 10, end_date: yesterday });
    expect(periods.data!.find(row => row.start_date === tomorrow)).toMatchObject({ price: 80, end_date: null });
    const final = await admin.from('branch_products').select('id, is_active').eq('product_id', productId);
    expect(final.data).toEqual(assignments.data);
  });

  it('rejects unauthorized and malformed bulk price updates without changing the default', async () => {
    const input = { p_product_id: productId, p_default_price: 99, p_update_branches: true };
    expect((await staff.rpc('set_catalog_product_default_price', input)).error?.message).toMatch(/not authorized/i);
    expect((await anon.rpc('set_catalog_product_default_price', input)).error).not.toBeNull();
    expect((await admin.rpc('set_catalog_product_default_price', { ...input, p_default_price: -1 })).error).not.toBeNull();
    expect((await admin.from('products').select('default_price').eq('id', productId).single()).data?.default_price).toBe(0);
  });
});
