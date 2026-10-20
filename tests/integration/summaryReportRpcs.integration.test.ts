import { serviceClient } from './_helpers/clients';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getIstanbulToday } from '../../src/utils/dates';

import {
  createAdminClient,
  createAnonClient,
  createStaffClient,
  type AdminClient,
} from './_helpers/clients';

const PREFIX = `ITEST-PDF ${Date.now().toString(36)}`;

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

type KpisShape = {
  totalSales: number;
  totalCollection: number;
  deliveredQty: number;
  returnedQty: number;
  returnRate: number | null;
  activeBranchCount: number;
  activeProductCount: number;
};

type SnapshotShape = {
  schemaVersion: number;
  range: string;
  snapshotAt: string;
  period: { startDate: string; endDate: string; granularity: string };
  kpis: KpisShape;
  dailyPoints: Array<{ bucket: string; sales: number; deliveredQty: number; returnedQty: number }>;
  branchesBySales: Array<{ id: string; label: string; sales: number; collection: number; returnRate: number | null; currentBalance: number }>;
  branchesByReturnRate: Array<{ id: string; label: string; returnRate: number | null; delivered: number; returned: number }>;
  branchesByBalance: Array<{ id: string; label: string; currentBalance: number }>;
  productsByReturnRate: Array<{ id: string; label: string; delivered: number; returned: number; returnRate: number | null; returnedValue: number }>;
  productsByReturnedValue: Array<{ id: string; label: string; returnedValue: number }>;
};

async function cleanup(admin: AdminClient) {
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

describe('summary PDF — report_summary_pdf RPC (M25, integration)', () => {
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

    const branch = await serviceClient()
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

    const today = getIstanbulToday();
    const price = await admin
      .from('branch_product_prices')
      .insert({ branch_product_id: ids.branchProductId, price: 25, start_date: today })
      .select('id')
      .single();
    if (price.error || !price.data) throw new Error(`price: ${price.error?.message}`);

    // Delivery 1: 10 delivered, 0 returned. Sales = 250, payment = 100.
    const d1 = await admin.rpc('create_delivery_atomic', {
      p_branch_id: ids.branchId,
      p_items: [{ product_id: ids.productId, delivered_quantity: 10, returned_quantity: 0 }],
      p_payment_amount: 100,
      p_payment_type: 'field_collection',
      p_date: today,
    });
    if (d1.error) throw new Error(`create_delivery: ${d1.error.message}`);
    ids.deliveryIds = [d1.data as string];

    // Delivery 2: 5 delivered, 2 returned. Sales = 75, payment = 75.
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

  // ── Auth checks ───────────────────────────────────────────────────────
  describe('authorization', () => {
    it.each(['all', 'day'])('rejects anonymous callers (%s)', async (range) => {
      const anon = await createAnonClient();
      const r = await anon.rpc('report_summary_pdf', { p_range: range });
      expect(r.error).toBeTruthy();
    });

    it.each(['all', 'day'])('rejects staff callers (%s)', async (range) => {
      const r = await staff.rpc('report_summary_pdf', { p_range: range });
      expect(r.error).toBeTruthy();
    });
  });

  // ── Input validation ──────────────────────────────────────────────────
  describe('input validation', () => {
    it('rejects an invalid p_range value', async () => {
      const r = await admin.rpc('report_summary_pdf', { p_range: 'year' });
      expect(r.error).toBeTruthy();
    });

    it('rejects an invalid day of week', async () => {
      const r = await admin.rpc('report_summary_pdf', { p_range: 'all', p_days_of_week: [7] });
      expect(r.error).toBeTruthy();
    });
  });

  // ── Happy path contracts ──────────────────────────────────────────────
  describe('admin happy path', () => {
    it('daily reports include only today, excluding both adjacent calendar dates', async () => {
      const today = getIstanbulToday();
      const baseline = await admin.rpc('report_kpis', { p_range: 'day' });
      expect(baseline.error).toBeNull();
      const before = baseline.data as KpisShape;
      const deliveryId = ids.deliveryIds![0]!;

      for (const offset of [-1, 1]) {
        const adjacent = new Date(`${today}T12:00:00Z`);
        adjacent.setUTCDate(adjacent.getUTCDate() + offset);
        const date = adjacent.toISOString().slice(0, 10);
        try {
          // Move one known delivery and its collection outside today's range.
          // The other fixture delivery stays today (75 sales, 75 collected).
          const moved = await serviceClient().from('deliveries').update({ date }).eq('id', deliveryId);
          expect(moved.error).toBeNull();
          const payment = await serviceClient().from('payments').update({ date }).eq('delivery_id', deliveryId);
          expect(payment.error).toBeNull();

          const kpis = await admin.rpc('report_kpis', { p_range: 'day' });
          expect(kpis.error).toBeNull();
          const current = kpis.data as KpisShape;
          expect(Number(current.totalSales)).toBeCloseTo(Number(before.totalSales) - 250, 2);
          expect(Number(current.totalCollection)).toBeCloseTo(Number(before.totalCollection) - 100, 2);
          expect(Number(current.deliveredQty)).toBeCloseTo(Number(before.deliveredQty) - 10, 2);
          expect(Number(current.returnedQty)).toBe(Number(before.returnedQty));

          const series = await admin.rpc('report_daily_series', { p_range: 'day' });
          expect(series.error).toBeNull();
          expect(series.data).toMatchObject({
            granularity: 'day',
            points: [{ bucket: today, sales: Number(current.totalSales) }],
          });

          const pdf = await admin.rpc('report_summary_pdf', { p_range: 'day' });
          expect(pdf.error).toBeNull();
          const snap = pdf.data as SnapshotShape;
          expect(snap.range).toBe('day');
          expect(snap.period).toEqual({ startDate: today, endDate: today, granularity: 'day' });
          expect(snap.dailyPoints).toHaveLength(1);
          expect(snap.dailyPoints[0]).toMatchObject({ bucket: today, sales: Number(current.totalSales) });
          const branch = snap.branchesBySales.find((row) => row.id === ids.branchId);
          expect(branch).toMatchObject({ sales: 75, collection: 75 });
          const product = snap.productsByReturnRate.find((row) => row.id === ids.productId);
          expect(product).toMatchObject({ delivered: 5, returned: 2, returnRate: 40 });
        } finally {
          const restored = await serviceClient().from('deliveries').update({ date: today }).eq('id', deliveryId);
          expect(restored.error).toBeNull();
          const payment = await serviceClient().from('payments').update({ date: today }).eq('delivery_id', deliveryId);
          expect(payment.error).toBeNull();
        }
      }
    });

    it('returns the full snapshot contract', async () => {
      const { data, error } = await admin.rpc('report_summary_pdf', { p_range: 'all' });
      expect(error).toBeNull();
      const snap = data as SnapshotShape;

      expect(snap.schemaVersion).toBe(1);
      expect(snap.range).toBe('all');
      expect(snap.period.granularity).toMatch(/^(day|week|month)$/);
      expect(snap.period.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(snap.period.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect((snap as SnapshotShape & { filters: { productFilterApplied: boolean } }).filters.productFilterApplied).toBe(false);

      // KPIs are global, and the shared integration DB may carry data from
      // other test files that also ran against `p_range = 'all'`. Assert the
      // fixture's contribution is present rather than an exact global total.
      expect(Number(snap.kpis.totalSales)).toBeGreaterThanOrEqual(325);
      expect(Number(snap.kpis.totalCollection)).toBeGreaterThanOrEqual(175);
      expect(Number(snap.kpis.deliveredQty)).toBeGreaterThanOrEqual(15);
      expect(Number(snap.kpis.returnedQty)).toBeGreaterThanOrEqual(2);
      // returnRate is a global ratio; it is a finite percent in [0,100] or null.
      if (snap.kpis.returnRate !== null) {
        expect(Number(snap.kpis.returnRate)).toBeGreaterThanOrEqual(0);
        expect(Number(snap.kpis.returnRate)).toBeLessThanOrEqual(100);
      }
    });

    it('daily points are aligned and reconcile with KPIs', async () => {
      const { data } = await admin.rpc('report_summary_pdf', { p_range: 'all' });
      const snap = data as SnapshotShape;

      const sumSales = snap.dailyPoints.reduce((s, p) => s + Number(p.sales), 0);
      const sumDelivered = snap.dailyPoints.reduce((s, p) => s + Number(p.deliveredQty), 0);
      const sumReturned = snap.dailyPoints.reduce((s, p) => s + Number(p.returnedQty), 0);

      expect(sumSales).toBeCloseTo(Number(snap.kpis.totalSales), 2);
      expect(sumDelivered).toBeCloseTo(Number(snap.kpis.deliveredQty), 2);
      expect(sumReturned).toBeCloseTo(Number(snap.kpis.returnedQty), 2);

      // Buckets are ascending and every row carries all three aligned fields.
      for (let i = 0; i < snap.dailyPoints.length; i++) {
        const p = snap.dailyPoints[i]!;
        expect(typeof p.sales).toBe('number');
        expect(typeof p.deliveredQty).toBe('number');
        expect(typeof p.returnedQty).toBe('number');
        if (i > 0) {
          expect(p.bucket >= snap.dailyPoints[i - 1]!.bucket).toBe(true);
        }
      }
    });

    it('branchesBySales carries sales + collection + balance for the fixture branch', async () => {
      const { data } = await admin.rpc('report_summary_pdf', { p_range: 'all' });
      const snap = data as SnapshotShape;
      const ours = snap.branchesBySales.find((r) => r.id === ids.branchId);
      expect(ours).toBeTruthy();
      expect(Number(ours?.sales)).toBeCloseTo(325, 2);
      expect(Number(ours?.collection)).toBeCloseTo(175, 2);
      expect(Number(ours?.currentBalance)).toBeCloseTo(150, 2);
    });

    it('branchesByBalance orders by abs(currentBalance) DESC', async () => {
      const { data } = await admin.rpc('report_summary_pdf', { p_range: 'all' });
      const snap = data as SnapshotShape;
      for (let i = 0; i < snap.branchesByBalance.length - 1; i++) {
        expect(Math.abs(Number(snap.branchesByBalance[i]!.currentBalance))).toBeGreaterThanOrEqual(
          Math.abs(Number(snap.branchesByBalance[i + 1]!.currentBalance)),
        );
      }
    });

    it('productsByReturnRate and productsByReturnedValue both include the fixture product', async () => {
      const { data } = await admin.rpc('report_summary_pdf', { p_range: 'all' });
      const snap = data as SnapshotShape;

      const byRate = snap.productsByReturnRate.find((r) => r.id === ids.productId);
      expect(byRate).toBeTruthy();
      expect(Number(byRate?.returnRate)).toBeCloseTo(13.33, 2);
      expect(Number(byRate?.returnedValue)).toBeCloseTo(50, 2);

      const byValue = snap.productsByReturnedValue.find((r) => r.id === ids.productId);
      expect(byValue).toBeTruthy();
      expect(Number(byValue?.returnedValue)).toBeCloseTo(50, 2);
    });

    it('productsByReturnedValue is ordered by returnedValue DESC', async () => {
      const { data } = await admin.rpc('report_summary_pdf', { p_range: 'all' });
      const snap = data as SnapshotShape;
      for (let i = 0; i < snap.productsByReturnedValue.length - 1; i++) {
        expect(Number(snap.productsByReturnedValue[i]!.returnedValue)).toBeGreaterThanOrEqual(
          Number(snap.productsByReturnedValue[i + 1]!.returnedValue),
        );
      }
    });
  });
});
