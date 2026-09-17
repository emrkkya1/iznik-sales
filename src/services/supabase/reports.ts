import type { ReportsRepository } from '@/services/contracts';
import type {
  DailySeriesResult,
  DistributionRow,
  SummaryKpis,
} from '@/types';

import { supabaseClient } from './supabaseClient';
import { parseSummaryPdfSnapshot } from './summaryPdfSchema';

export const supabaseReportsRepository: ReportsRepository = {
  async getKpis(range) {
    const { data, error } = await supabaseClient.rpc('report_kpis', {
      p_range: range,
    });
    if (error) throw error;
    return data as unknown as SummaryKpis;
  },

  async getProductDistribution(range) {
    const { data, error } = await supabaseClient.rpc(
      'report_product_distribution',
      { p_range: range, p_limit: 100 },
    );
    if (error) throw error;
    return (data ?? []) as unknown as DistributionRow[];
  },

  async getBranchDistribution(range) {
    const { data, error } = await supabaseClient.rpc(
      'report_branch_distribution',
      { p_range: range, p_limit: 100 },
    );
    if (error) throw error;
    return (data ?? []) as unknown as DistributionRow[];
  },

  async getBranchIncome(range) {
    const { data, error } = await supabaseClient.rpc(
      'report_branch_income',
      { p_range: range, p_limit: 100 },
    );
    if (error) throw error;
    return (data ?? []) as unknown as DistributionRow[];
  },

  async getBranchReturnRate(range) {
    const { data, error } = await supabaseClient.rpc(
      'report_branch_return_rate',
      { p_range: range, p_limit: 100 },
    );
    if (error) throw error;
    return (data ?? []) as unknown as DistributionRow[];
  },

  async getDailySeries(range) {
    const { data, error } = await supabaseClient.rpc('report_daily_series', {
      p_range: range,
    });
    if (error) throw error;
    return data as unknown as DailySeriesResult;
  },

  async getSummaryPdfSnapshot(range, filters = {}) {
    // M25 — single atomic RPC; response validated at runtime by Zod (the
    // generated database type is `Json`, so the shape is enforced here).
    const { data, error } = await supabaseClient.rpc('report_summary_pdf', {
      p_range: range,
      p_date_from: filters.dateFrom ?? undefined,
      p_date_to: filters.dateTo ?? undefined,
      p_days_of_week: filters.daysOfWeek ?? undefined,
    });
    if (error) throw error;
    return parseSummaryPdfSnapshot(data);
  },
};
