import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAdminClient,
  createAnonClient,
  createStaffClient,
  type AdminClient,
} from './_helpers/clients';

const PREFIX = `ITEST-BRPDF ${Date.now().toString(36)}`;

type FixtureIds = {
  cityId: string;
  districtId: string;
  branchId: string;
  productId: string;
  branchProductId: string;
  deliveryIds: string[];
};

const ids: Partial<FixtureIds> = {};
let admin: AdminClient;
let staff: AdminClient;

type SnapshotShape = {
  schemaVersion: number;
  filters: { cityName: string | null; status: string; search: string | null };
  summary: { branchCount: number; totalSales: number; totalCollection: number };
  rows: Array<{
    branchId: string;
    name: string;
    salesTotal: number;
    collectionTotal: number;
    currentBalance: number;
    isActive: boolean;
  }>;
  totalCount: number;
  truncated: boolean;
};

async function cleanup(admin: AdminClient) {
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

describe('Şubeler raporu — report_branches_pdf RPC (M26, integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient();
    staff = await createStaffClient();

    const city = await admin
      .from('cities')
      .insert({ name: `${PREFIX} Şehir` })
      .select('id')
      .single();
    if (city.error || !city.data) throw new Error(`city: ${city.error?.message}`);
    ids.cityId = city.data.id;

    const district = await admin
      .from('districts')
      .insert({ city_id: ids.cityId, name: `${PREFIX} İlçe` })
      .select('id')
      .single();
    if (district.error || !district.data) throw new Error(`district: ${district.error?.message}`);
    ids.districtId = district.data.id;

    const branch = await admin
      .from('branches')
      .insert({
        district_id: ids.districtId,
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
      .insert({ branch_id: ids.branchId, product_id: ids.productId, is_active: true })
      .select('id')
      .single();
    if (bp.error || !bp.data) throw new Error(`bp: ${bp.error?.message}`);
    ids.branchProductId = bp.data.id;

    const today = new Date().toISOString().slice(0, 10);
    const price = await admin
      .from('branch_product_prices')
      .insert({ branch_product_id: ids.branchProductId, price: 25, start_date: today })
      .select('id')
      .single();
    if (price.error || !price.data) throw new Error(`price: ${price.error?.message}`);

    const d1 = await admin.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId,
      p_items: [{ product_id: ids.productId, delivered_quantity: 10, returned_quantity: 0 }],
      p_payment_amount: 100,
      p_payment_type: 'field_collection',
      p_date: today,
    });
    if (d1.error) throw new Error(`create_delivery: ${d1.error.message}`);
    ids.deliveryIds = [d1.data as string];

    const d2 = await admin.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId,
      p_items: [{ product_id: ids.productId, delivered_quantity: 5, returned_quantity: 2 }],
      p_payment_amount: 75,
      p_payment_type: 'bank_transfer',
      p_date: today,
    });
    if (d2.error) throw new Error(`create_delivery2: ${d2.error.message}`);
    ids.deliveryIds.push(d2.data as string);
  });

  afterAll(async () => {
    await cleanup(admin);
  });

  describe('authorization', () => {
    it('rejects anonymous callers', async () => {
      const anon = await createAnonClient();
      const r = await anon.rpc('report_branches_pdf', {});
      expect(r.error).toBeTruthy();
    });

    it('rejects staff callers', async () => {
      const r = await staff.rpc('report_branches_pdf', {});
      expect(r.error).toBeTruthy();
    });
  });

  describe('input validation', () => {
    it('rejects an invalid status', async () => {
      const r = await admin.rpc('report_branches_pdf', { p_status: 'bogus' });
      expect(r.error).toBeTruthy();
    });

    it('rejects an invalid day of week', async () => {
      const r = await admin.rpc('report_branches_pdf', { p_days_of_week: [9] });
      expect(r.error).toBeTruthy();
    });

    it('rejects an inverted date range', async () => {
      const r = await admin.rpc('report_branches_pdf', {
        p_date_from: '2026-12-31',
        p_date_to: '2026-01-01',
      });
      expect(r.error).toBeTruthy();
    });

    it('rejects an unknown city', async () => {
      const r = await admin.rpc('report_branches_pdf', {
        p_city_id: '00000000-0000-4000-8000-000000000000',
      });
      expect(r.error).toBeTruthy();
    });

    it('rejects an unknown product', async () => {
      const r = await admin.rpc('report_branches_pdf', {
        p_product_ids: ['00000000-0000-4000-8000-000000000999'],
      });
      expect(r.error).toBeTruthy();
    });
  });

  describe('admin happy path', () => {
    it('returns the filtered set with money columns and filter echo', async () => {
      const { data, error } = await admin.rpc('report_branches_pdf', {
        p_city_id: ids.cityId,
        p_sort_by: 'name',
        p_sort_dir: 'asc',
      });
      expect(error).toBeNull();
      const snap = data as SnapshotShape;

      expect(snap.schemaVersion).toBe(1);
      expect(snap.filters.cityName).toBe(`${PREFIX} Şehir`);
      expect(snap.truncated).toBe(false);
      expect(snap.totalCount).toBe(snap.rows.length);

      const ours = snap.rows.find((r) => r.branchId === ids.branchId);
      expect(ours).toBeTruthy();
      expect(Number(ours?.salesTotal)).toBeCloseTo(325, 2);
      expect(Number(ours?.collectionTotal)).toBeCloseTo(175, 2);
      expect(Number(ours?.currentBalance)).toBeCloseTo(150, 2);

      expect(Number(snap.summary.totalSales)).toBeCloseTo(325, 2);
      expect(Number(snap.summary.totalCollection)).toBeCloseTo(175, 2);
    });

    it('echoes product-scoped sales metadata without filtering payments or balances', async () => {
      const { data, error } = await admin.rpc('report_branches_pdf', {
        p_city_id: ids.cityId,
        p_product_ids: [ids.productId],
      });
      expect(error).toBeNull();
      const snap = data as SnapshotShape & { filters: { productFilterApplied: boolean; paymentsAllProducts: boolean; balancesAllProducts: boolean } };
      expect(snap.filters.productFilterApplied).toBe(true);
      expect(snap.filters.paymentsAllProducts).toBe(true);
      expect(snap.filters.balancesAllProducts).toBe(true);
      expect(Number(snap.summary.totalSales)).toBeCloseTo(325, 2);
      expect(Number(snap.summary.totalCollection)).toBeCloseTo(175, 2);
    });

    it('matches the on-screen list ordering (sort by balance desc)', async () => {
      const { data } = await admin.rpc('report_branches_pdf', {
        p_city_id: ids.cityId,
        p_sort_by: 'balance',
        p_sort_dir: 'desc',
      });
      const snap = data as SnapshotShape;
      for (let i = 0; i < snap.rows.length - 1; i++) {
        expect(Number(snap.rows[i]!.currentBalance)).toBeGreaterThanOrEqual(
          Number(snap.rows[i + 1]!.currentBalance),
        );
      }
    });
  });
});
