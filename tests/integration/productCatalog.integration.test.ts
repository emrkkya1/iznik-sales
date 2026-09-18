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
});
