import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createAdminClient,
  createAnonClient,
  createStaffClient,
  type AdminClient,
} from './_helpers/clients';

const PREFIX = `ITEST-BHPDF ${Date.now().toString(36)}`;

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
  identity: {
    openingBalance: number;
    currentBalance: number;
    name: string;
  };
  period: { dateFrom: string | null; dateTo: string | null };
  periodOpeningBalance: number;
  metrics: {
    totalSales: number;
    totalCollection: number;
    deliveredQty: number;
    returnedQty: number;
    returnRate: number | null;
  };
  products: Array<{ productId: string; returnedValue: number }>;
  movements: Array<{ kind: string }>;
  movementCount: number;
  movementTruncated: boolean;
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

describe('Şube detay raporu — report_branch_hub_pdf RPC (M27, integration)', () => {
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
        current_balance: 100,
        opening_balance: 100,
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
      const r = await anon.rpc('report_branch_hub_pdf', { p_branch_id: ids.branchId });
      expect(r.error).toBeTruthy();
    });

    it('rejects staff callers', async () => {
      const r = await staff.rpc('report_branch_hub_pdf', { p_branch_id: ids.branchId });
      expect(r.error).toBeTruthy();
    });
  });

  describe('input validation', () => {
    it('rejects a missing branch id', async () => {
      const r = await admin.rpc('report_branch_hub_pdf', {});
      expect(r.error).toBeTruthy();
    });

    it('rejects an unknown branch', async () => {
      const r = await admin.rpc('report_branch_hub_pdf', {
        p_branch_id: '00000000-0000-4000-8000-000000000000',
      });
      expect(r.error).toBeTruthy();
    });

    it('rejects an inverted date range', async () => {
      const r = await admin.rpc('report_branch_hub_pdf', {
        p_branch_id: ids.branchId,
        p_date_from: '2026-12-31',
        p_date_to: '2026-01-01',
      });
      expect(r.error).toBeTruthy();
    });

    it('rejects an invalid day of week and product', async () => {
      const day = await admin.rpc('report_branch_hub_pdf', {
        p_branch_id: ids.branchId,
        p_days_of_week: [7],
      });
      const product = await admin.rpc('report_branch_hub_pdf', {
        p_branch_id: ids.branchId,
        p_product_ids: ['00000000-0000-4000-8000-000000000999'],
      });
      expect(day.error).toBeTruthy();
      expect(product.error).toBeTruthy();
    });
  });

  describe('admin happy path', () => {
    it('returns identity + metrics + products + ledger (all time)', async () => {
      const { data, error } = await admin.rpc('report_branch_hub_pdf', {
        p_branch_id: ids.branchId,
      });
      expect(error).toBeNull();
      const snap = data as SnapshotShape;

      expect(snap.schemaVersion).toBe(1);
      expect(snap.period.dateFrom).toBeNull();

      expect(Number(snap.identity.openingBalance)).toBeCloseTo(100, 2);
      expect(Number(snap.identity.currentBalance)).toBeCloseTo(250, 2);
      expect(Number(snap.periodOpeningBalance)).toBeCloseTo(100, 2);

      expect(Number(snap.metrics.totalSales)).toBeCloseTo(325, 2);
      expect(Number(snap.metrics.totalCollection)).toBeCloseTo(175, 2);
      expect(Number(snap.metrics.deliveredQty)).toBeCloseTo(15, 2);
      expect(Number(snap.metrics.returnedQty)).toBeCloseTo(2, 2);

      const product = snap.products.find((r) => r.productId === ids.productId);
      expect(product).toBeTruthy();
      expect(Number(product?.returnedValue)).toBeCloseTo(50, 2);

      // Two deliveries, each with an embedded payment → 2 ledger rows.
      expect(snap.movementCount).toBe(2);
      expect(snap.movementTruncated).toBe(false);

      // Reconciliation: opening + net period change = current balance.
      const net = snap.metrics.totalSales - snap.metrics.totalCollection;
      expect(snap.periodOpeningBalance + net).toBeCloseTo(
        snap.identity.currentBalance,
        2,
      );
    });

    it('uses item-level sales for a selected product and labels all-product values', async () => {
      const { data, error } = await admin.rpc('report_branch_hub_pdf', {
        p_branch_id: ids.branchId,
        p_product_ids: [ids.productId],
      });
      expect(error).toBeNull();
      const snap = data as SnapshotShape & { period: { productFilterApplied: boolean; paymentsAllProducts: boolean; balancesAllProducts: boolean } };
      expect(snap.period.productFilterApplied).toBe(true);
      expect(snap.period.paymentsAllProducts).toBe(true);
      expect(snap.period.balancesAllProducts).toBe(true);
      expect(Number(snap.metrics.totalSales)).toBeCloseTo(325, 2);
      expect(Number(snap.metrics.totalCollection)).toBeCloseTo(175, 2);
    });

    it('returns zero metrics for an empty past window', async () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const { data, error } = await admin.rpc('report_branch_hub_pdf', {
        p_branch_id: ids.branchId,
        p_date_from: yesterday,
        p_date_to: yesterday,
      });
      expect(error).toBeNull();
      const snap = data as SnapshotShape;

      expect(Number(snap.metrics.totalSales)).toBeCloseTo(0, 2);
      expect(Number(snap.metrics.totalCollection)).toBeCloseTo(0, 2);
      // No activity before the window either → opening balance unchanged.
      expect(Number(snap.periodOpeningBalance)).toBeCloseTo(100, 2);
    });
  });
});
