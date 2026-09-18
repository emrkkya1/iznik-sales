import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAdminClient, createAnonClient, createStaffClient, type AdminClient } from './_helpers/clients';

const PREFIX = `ITEST-LOC ${Date.now().toString(36)}`;

type FixtureIds = {
  cityId?: string;
  blockedCityId?: string;
  districtId?: string;
  branchId?: string;
  blockedBranchId?: string;
  productId?: string;
};

const ids: FixtureIds = {};
let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;
const createdCities: string[] = [];
const createdDistricts: string[] = [];
const createdBranches: string[] = [];

async function cleanup(admin: AdminClient) {
  for (const id of createdBranches) {
    await admin.from('branch_products').delete().eq('branch_id', id);
    await admin.from('branches').delete().eq('id', id);
  }
  for (const id of createdDistricts) {
    await admin.from('districts').delete().eq('id', id);
  }
  for (const id of createdCities) {
    await admin.from('cities').delete().eq('id', id);
  }
  if (ids.productId) {
    await admin.from('products').delete().eq('id', ids.productId);
  }
  // Reset opening_balances_locked back to FALSE in case a test flipped it.
  await admin.rpc('set_opening_balances_locked', { p_locked: false });
}

describe('admin locations RPCs (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient();
    staff = await createStaffClient();
    anon = await createAnonClient();

    // Reset any leftover state from previous runs.
    await admin.rpc('set_opening_balances_locked', { p_locked: false });
  }, 60_000);

  afterAll(async () => {
    if (admin) await cleanup(admin);
  }, 60_000);

  it('creates a city, district, and branch in order', async () => {
    const { data: cityId, error: cityError } = await admin.rpc('create_city', {
      p_name: `${PREFIX} Şehir`,
    });
    expect(cityError).toBeNull();
    ids.cityId = cityId as string;
    createdCities.push(ids.cityId);

    const { data: districtId, error: districtError } = await admin.rpc('create_district', {
      p_city_id: ids.cityId,
      p_name: `${PREFIX} İlçe`,
    });
    expect(districtError).toBeNull();
    ids.districtId = districtId as string;
    createdDistricts.push(ids.districtId);

    const { data: branchId, error: branchError } = await admin.rpc('create_branch', {
      p_district_id: ids.districtId,
      p_name: `${PREFIX} Şube`,
      p_opening_balance: 0,
      p_is_active: true,
    });
    expect(branchError).toBeNull();
    ids.branchId = branchId as string;
    createdBranches.push(ids.branchId);

    const cities = (await admin.rpc('list_cities_with_counts')) as unknown as {
      data: { id: string; name: string; districtCount: number; branchCount: number }[];
    };
    const created = cities.data.find((c) => c.id === ids.cityId);
    expect(created?.districtCount).toBe(1);
    expect(created?.branchCount).toBe(1);
  });

  it('rejects duplicate city names', async () => {
    const { error } = await admin.rpc('create_city', { p_name: `${PREFIX} Şehir` });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/duplicate|unique/i);
  });

  it('rejects staff from creating a city', async () => {
    const { error } = await staff.rpc('create_city', { p_name: `${PREFIX} Staff Şehir` });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/Not authorized/i);
  });

  it('rejects creating a branch with negative opening balance', async () => {
    const { error } = await admin.rpc('create_branch', {
      p_district_id: ids.districtId!,
      p_name: `${PREFIX} Negatif`,
      p_opening_balance: -1,
      p_is_active: true,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/opening balance/i);
  });

  it('locks opening balances and refuses non-zero opening_balance, then unlocks', async () => {
    await admin.rpc('set_opening_balances_locked', { p_locked: true });
    const locked = (await admin.rpc('get_opening_balances_locked')) as unknown as { data: boolean };
    expect(locked.data).toBe(true);

    const { error: blocked } = await admin.rpc('create_branch', {
      p_district_id: ids.districtId!,
      p_name: `${PREFIX} Kilitli`,
      p_opening_balance: 10,
      p_is_active: true,
    });
    expect(blocked).not.toBeNull();
    expect(blocked?.message).toMatch(/locked/i);

    // Zero opening_balance is still allowed even when locked.
    const { data: zeroId, error: zeroError } = await admin.rpc('create_branch', {
      p_district_id: ids.districtId!,
      p_name: `${PREFIX} Sıfır`,
      p_opening_balance: 0,
      p_is_active: true,
    });
    expect(zeroError).toBeNull();
    ids.blockedBranchId = zeroId as string;
    createdBranches.push(ids.blockedBranchId);

    await admin.rpc('set_opening_balances_locked', { p_locked: false });
    const unlocked = (await admin.rpc('get_opening_balances_locked')) as unknown as { data: boolean };
    expect(unlocked.data).toBe(false);
  });

  it('toggles branch active state and reflects it in counts', async () => {
    const { data, error } = await admin.rpc('list_districts_with_counts', {
      p_city_id: ids.cityId!,
    });
    expect(error).toBeNull();
    const list = data as unknown as { id: string; branchCount: number; activeBranchCount: number }[];
    const target = list.find((d) => d.id === ids.districtId);
    expect(target?.branchCount).toBe(2);

    await admin.rpc('set_branch_active', { p_branch_id: ids.branchId!, p_is_active: false });

    const after = (await admin.rpc('list_districts_with_counts', {
      p_city_id: ids.cityId!,
    })) as unknown as { data: { id: string; activeBranchCount: number }[] };
    const afterTarget = after.data.find((d) => d.id === ids.districtId);
    expect(afterTarget?.activeBranchCount).toBe(1);

    await admin.rpc('set_branch_active', { p_branch_id: ids.branchId!, p_is_active: true });
  });

  it('rejects unknown district on create_branch', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const { error } = await admin.rpc('create_branch', {
      p_district_id: fakeId,
      p_name: `${PREFIX} Sahte`,
      p_opening_balance: 0,
      p_is_active: true,
    });
    expect(error).not.toBeNull();
    expect(error?.message).toMatch(/not found/i);
  });

  it('creates selected branch products atomically and rejects invalid selections', async () => {
    const { data: products, error: productsError } = await admin
      .from('products')
      .select('id')
      .order('name')
      .limit(2);
    expect(productsError).toBeNull();
    const [first, second] = products ?? [];
    expect(first?.id).toBeTruthy();
    expect(second?.id).toBeTruthy();

    const { data: branchId, error } = await admin.rpc('create_branch', {
      p_district_id: ids.districtId!,
      p_name: `${PREFIX} Seçimli`,
      p_opening_balance: 0,
      p_is_active: true,
      p_products: [{ productId: first.id, price: 77.5 }],
    });
    expect(error).toBeNull();
    createdBranches.push(branchId as string);

    const { data: branchProducts } = await admin
      .from('branch_products')
      .select('product_id, branch_product_prices(price)')
      .eq('branch_id', branchId);
    expect(branchProducts).toHaveLength(1);
    expect(branchProducts?.[0]?.product_id).toBe(first.id);
    expect((branchProducts?.[0]?.branch_product_prices as { price: number }[])?.[0]?.price).toBe(77.5);

    const bad = await admin.rpc('create_branch', {
      p_district_id: ids.districtId!,
      p_name: `${PREFIX} Hatalı`,
      p_opening_balance: 0,
      p_is_active: true,
      p_products: [{ productId: second.id, price: 1 }, { productId: second.id, price: 1 }],
    });
    expect(bad.error?.message).toMatch(/duplicate/i);

    const staffResult = await staff.rpc('create_branch', {
      p_district_id: ids.districtId!, p_name: `${PREFIX} Staff`, p_opening_balance: 0, p_is_active: true, p_products: [],
    });
    expect(staffResult.error?.message).toMatch(/not authorized/i);
    const anonResult = await anon.rpc('create_branch', {
      p_district_id: ids.districtId!, p_name: `${PREFIX} Anon`, p_opening_balance: 0, p_is_active: true, p_products: [],
    });
    expect(anonResult.error).not.toBeNull();
  });
});
