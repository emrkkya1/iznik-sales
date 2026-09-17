import type { AdminLocationRepository } from '@/services/contracts';
import type {
  Branch,
  BranchHubDetails,
  BranchWithContext,
  City,
  CityWithCounts,
  CreateBranchInput,
  CreateCityInput,
  CreateDistrictInput,
  District,
  DistrictWithCounts,
  MovementRow,
} from '@/types';

import { supabaseClient } from './supabaseClient';
import { parseBranchHubReport } from './branchHubReportSchema';

export const supabaseAdminLocationRepository: AdminLocationRepository = {
  async listCitiesWithCounts() {
    const { data, error } = await supabaseClient.rpc('list_cities_with_counts');
    if (error) throw error;
    return (data ?? []) as unknown as CityWithCounts[];
  },

  async listDistrictsWithCounts(cityId) {
    const { data, error } = await supabaseClient.rpc(
      'list_districts_with_counts',
      { p_city_id: cityId },
    );
    if (error) throw error;
    return (data ?? []) as unknown as DistrictWithCounts[];
  },

  async listBranchesWithContext(districtId) {
    const { data, error } = await supabaseClient.rpc(
      'list_branches_with_context',
      { p_district_id: districtId },
    );
    if (error) throw error;
    return (data ?? []) as unknown as BranchWithContext[];
  },

  async createCity(input: CreateCityInput) {
    const { data, error } = await supabaseClient.rpc('create_city', {
      p_name: input.name,
    });
    if (error) throw error;
    return {
      id: data,
      name: input.name,
    } satisfies City;
  },

  async createDistrict(input: CreateDistrictInput) {
    const { data, error } = await supabaseClient.rpc('create_district', {
      p_city_id: input.cityId,
      p_name: input.name,
    });
    if (error) throw error;
    return {
      id: data,
      cityId: input.cityId,
      name: input.name,
    } satisfies District;
  },

  async createBranch(input: CreateBranchInput) {
    const { data, error } = await supabaseClient.rpc('create_branch', {
      p_district_id: input.districtId,
      p_name: input.name,
      p_opening_balance: input.openingBalance,
      p_is_active: input.isActive,
    });
    if (error) throw error;
    return {
      id: data,
      districtId: input.districtId,
      name: input.name,
      openingBalance: input.openingBalance,
      isActive: input.isActive,
    } satisfies Branch;
  },

  async setCityActive(id, isActive) {
    const { error } = await supabaseClient.rpc('set_city_active', {
      p_city_id: id,
      p_is_active: isActive,
    });
    if (error) throw error;
  },

  async setDistrictActive(id, isActive) {
    const { error } = await supabaseClient.rpc('set_district_active', {
      p_district_id: id,
      p_is_active: isActive,
    });
    if (error) throw error;
  },

  async setBranchActive(id, isActive) {
    const { error } = await supabaseClient.rpc('set_branch_active', {
      p_branch_id: id,
      p_is_active: isActive,
    });
    if (error) throw error;
  },

  async setOpeningBalancesLocked(locked) {
    const { error } = await supabaseClient.rpc('set_opening_balances_locked', {
      p_locked: locked,
    });
    if (error) throw error;
  },

  async getOpeningBalancesLocked() {
    const { data, error } = await supabaseClient.rpc(
      'get_opening_balances_locked',
    );
    if (error) throw error;
    return data as unknown as boolean;
  },

  async getBranchHubDetails(branchId) {
    const { data, error } = await supabaseClient.rpc('get_branch_hub_details', {
      p_branch_id: branchId,
    });
    if (error) throw error;
    return data as unknown as BranchHubDetails;
  },

  async listDeliveriesWithPayments(branchId, limit = 50, offset = 0) {
    const { data, error } = await supabaseClient.rpc(
      'list_deliveries_with_payments',
      {
        p_branch_id: branchId,
        p_limit: limit,
        p_offset: offset,
      },
    );
    if (error) throw error;
    return (data ?? []) as unknown as MovementRow[];
  },

  async getBranchHubReport(branchId, dateFrom, dateTo, filters = {}) {
    const { data, error } = await supabaseClient.rpc('report_branch_hub_pdf', {
      p_branch_id: branchId,
      p_date_from: dateFrom ?? undefined,
      p_date_to: dateTo ?? undefined,
      p_days_of_week: filters.daysOfWeek ?? undefined,
      p_product_ids: filters.productIds ?? undefined,
    });
    if (error) throw error;
    return parseBranchHubReport(data);
  },
};
