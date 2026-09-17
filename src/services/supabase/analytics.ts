import type { AnalyticsRepository } from '@/services/contracts';

import { parseBranchAnalyticsPage } from './analyticsSchema';
import { parseBranchesReportSnapshot } from './branchesReportSchema';
import { supabaseClient } from './supabaseClient';

function omitEmpty<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[key as keyof T] = value as T[keyof T];
  }
  return out;
}

export const supabaseAnalyticsRepository: AnalyticsRepository = {
  async listBranches(filters, pagination) {
    const params = omitEmpty({
      p_search: filters.search,
      p_status: filters.status ?? 'all',
      p_date_from: filters.dateFrom,
      p_date_to: filters.dateTo,
      p_days_of_week: filters.daysOfWeek,
      p_city_id: filters.cityId,
      p_district_id: filters.districtId,
      p_sort_by: filters.sortBy ?? 'name',
      p_sort_dir: filters.sortDir ?? 'asc',
      p_limit: pagination.limit,
      p_offset: pagination.offset,
    });

    const { data, error } = await supabaseClient.rpc(
      'list_branches_analytics',
      params,
    );
    if (error) throw error;
    return parseBranchAnalyticsPage(data);
  },

  async getBranchesReport(filters) {
    const params = omitEmpty({
      p_search: filters.search,
      p_status: filters.status ?? 'all',
      p_date_from: filters.dateFrom,
      p_date_to: filters.dateTo,
      p_days_of_week: filters.daysOfWeek,
      p_city_id: filters.cityId,
      p_district_id: filters.districtId,
      p_sort_by: filters.sortBy ?? 'name',
      p_sort_dir: filters.sortDir ?? 'asc',
      p_product_ids: filters.productIds ?? undefined,
    });

    const { data, error } = await supabaseClient.rpc(
      'report_branches_pdf',
      params,
    );
    if (error) throw error;
    return parseBranchesReportSnapshot(data);
  },
};
