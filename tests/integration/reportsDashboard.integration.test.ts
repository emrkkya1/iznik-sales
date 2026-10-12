import { beforeAll, describe, expect, it } from 'vitest';

import { createAdminClient, createAnonClient, createStaffClient, type AdminClient } from './_helpers/clients';

let admin: AdminClient;
let staff: AdminClient;
let anon: AdminClient;

const dashboardRpcs = [
  'report_kpis',
  'report_product_distribution',
  'report_branch_distribution',
  'report_branch_income',
  'report_branch_return_rate',
  'report_daily_series',
] as const;

function paramsFor(name: typeof dashboardRpcs[number], range = 'all') {
  return name === 'report_kpis' || name === 'report_daily_series'
    ? { p_range: range }
    : { p_range: range, p_limit: 100 };
}

describe('dashboard report RPCs (integration)', () => {
  beforeAll(async () => {
    admin = await createAdminClient();
    staff = await createStaffClient();
    anon = await createAnonClient();
  });

  it('returns each dashboard data source for an administrator', async () => {
    for (const rpc of dashboardRpcs) {
      const result = await admin.rpc(rpc, paramsFor(rpc));
      expect(result.error, rpc).toBeNull();
      expect(result.data, rpc).not.toBeNull();
    }
  });

  it('supports the daily range in every dashboard data source', async () => {
    for (const rpc of dashboardRpcs) {
      const result = await admin.rpc(rpc, paramsFor(rpc, 'day'));
      expect(result.error, rpc).toBeNull();
      expect(result.data, rpc).not.toBeNull();
    }
  });

  it('rejects staff and anonymous callers for daily reports', async () => {
    for (const rpc of dashboardRpcs) {
      expect((await staff.rpc(rpc, paramsFor(rpc, 'day'))).error, `staff ${rpc}`).not.toBeNull();
      expect((await anon.rpc(rpc, paramsFor(rpc, 'day'))).error, `anon ${rpc}`).not.toBeNull();
    }
  });

  it('rejects staff and anonymous callers from every dashboard data source', async () => {
    for (const rpc of dashboardRpcs) {
      const staffResult = await staff.rpc(rpc, paramsFor(rpc));
      expect(staffResult.error, `staff ${rpc}`).not.toBeNull();
      const anonResult = await anon.rpc(rpc, paramsFor(rpc));
      expect(anonResult.error, `anon ${rpc}`).not.toBeNull();
    }
  });

  it('rejects an invalid report range without returning a partial KPI result', async () => {
    const invalid = await admin.rpc('report_kpis', { p_range: 'not-a-range' });
    expect(invalid.error).not.toBeNull();
    expect(invalid.data).toBeNull();
  });
});
