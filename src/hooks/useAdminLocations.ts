import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { services } from '@/services';
import type {
  BranchHubDetails,
  CreateBranchInput,
  CreateCityInput,
  CreateDistrictInput,
  UpdateOpeningBalanceInput,
} from '@/types';
import { instrumentQuery, logMutation, summarizeResult } from '@/utils/logger';

import { useBranchBalance } from './useLedger';
import { BRANCH_ANALYTICS_QUERY_KEY } from './useBranchesAnalytics';

const REFERENCE_STALE_MS = 5 * 60_000;
const TRANSACTIONAL_STALE_MS = 60_000;

// ---------- Queries ----------

export function useCitiesWithCounts() {
  return useQuery({
    queryKey: ['admin', 'cities', 'with-counts'],
    queryFn: instrumentQuery(
      'list_cities_with_counts',
      () => services.adminLocations.listCitiesWithCounts(),
      summarizeResult,
    ),
    staleTime: REFERENCE_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useDistrictsWithCounts(cityId: string | null) {
  return useQuery({
    queryKey: ['admin', 'districts', 'with-counts', cityId],
    queryFn: instrumentQuery(
      'list_districts_with_counts',
      () => services.adminLocations.listDistrictsWithCounts(cityId as string),
      summarizeResult,
    ),
    enabled: !!cityId,
    staleTime: REFERENCE_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useBranchesWithContext(districtId: string | null) {
  return useQuery({
    queryKey: ['admin', 'branches', 'with-context', districtId],
    queryFn: instrumentQuery(
      'list_branches_with_context',
      () =>
        services.adminLocations.listBranchesWithContext(districtId as string),
      summarizeResult,
    ),
    enabled: !!districtId,
    staleTime: TRANSACTIONAL_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useOpeningBalancesLocked() {
  return useQuery({
    queryKey: ['admin', 'app-config', 'opening-balances-locked'],
    queryFn: instrumentQuery(
      'get_opening_balances_locked',
      () => services.adminLocations.getOpeningBalancesLocked(),
    ),
    staleTime: TRANSACTIONAL_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

export function useBranchHubDetails(branchId: string | null | undefined) {
  return useQuery({
    queryKey: ['admin', 'branch-hub', 'details', branchId],
    queryFn: instrumentQuery(
      'get_branch_hub_details',
      () => services.adminLocations.getBranchHubDetails(branchId as string),
    ),
    enabled: !!branchId,
    staleTime: TRANSACTIONAL_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

// PR-6.2: useInfiniteQuery variant for paginated "load more" UX on the
// Branch Hub Hareketler tab. Each page is cached under the same key so
// flipping between tabs preserves loaded pages.
export function useBranchMovementsInfinite(
  branchId: string | null | undefined,
  limit = 50,
) {
  return useInfiniteQuery({
    queryKey: ['admin', 'branch-movements', branchId, limit],
    initialPageParam: 0,
    queryFn: instrumentQuery(
      'list_deliveries_with_payments',
      (ctx) =>
        services.adminLocations.listDeliveriesWithPayments(
          branchId as string,
          limit,
          (ctx?.pageParam as number | undefined) ?? 0,
        ),
      summarizeResult,
    ),
    staleTime: TRANSACTIONAL_STALE_MS,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      if (!lastPage || lastPage.length < limit) return undefined;
      return lastPageParam + limit;
    },
  });
}

// Composite for Branch Hub summary cards: details + current balance (via existing ledger hook).
export function useBranchHubSummary(branchId: string | null | undefined) {
  const details = useBranchHubDetails(branchId);
  const balance = useBranchBalance(branchId ?? null);

  if (!details.data || balance.data === undefined) {
    return {
      data: undefined,
      isLoading: details.isLoading || balance.isLoading,
      isError: details.isError || balance.isError,
      refetch: () => {
        details.refetch();
        balance.refetch();
      },
    };
  }

  return {
    data: {
      currentBalance: balance.data,
      ...(details.data as BranchHubDetails),
    },
    isLoading: false,
    isError: details.isError || balance.isError,
    refetch: () => {
      details.refetch();
      balance.refetch();
    },
  };
}

// ---------- Mutations ----------

function invalidateCities(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin', 'cities'] });
}

function invalidateDistricts(
  queryClient: ReturnType<typeof useQueryClient>,
  cityId: string,
) {
  queryClient.invalidateQueries({
    queryKey: ['admin', 'districts', 'with-counts', cityId],
  });
  queryClient.invalidateQueries({ queryKey: ['admin', 'cities'] });
}

function invalidateBranches(
  queryClient: ReturnType<typeof useQueryClient>,
  districtId: string,
) {
  queryClient.invalidateQueries({
    queryKey: ['admin', 'branches', 'with-context', districtId],
  });
  queryClient.invalidateQueries({ queryKey: ['admin', 'districts'] });
  queryClient.invalidateQueries({ queryKey: BRANCH_ANALYTICS_QUERY_KEY });
}

function invalidateAppConfig(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['admin', 'app-config'] });
}

export function useCreateCity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCityInput) =>
      services.adminLocations.createCity(input),
    onMutate: (input) => logMutation('create_city', 'start', { input }),
    onSuccess: (data) => {
      logMutation('create_city', 'success', { id: data.id });
      invalidateCities(queryClient);
    },
    onError: (error) => logMutation('create_city', 'error', error),
  });
}

export function useCreateDistrict() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDistrictInput) =>
      services.adminLocations.createDistrict(input),
    onMutate: (input) => logMutation('create_district', 'start', { input }),
    onSuccess: (data, variables) => {
      logMutation('create_district', 'success', { id: data.id });
      invalidateDistricts(queryClient, variables.cityId);
    },
    onError: (error) => logMutation('create_district', 'error', error),
  });
}

export function useCreateBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBranchInput) =>
      services.adminLocations.createBranch(input),
    onMutate: (input) => logMutation('create_branch', 'start', { input }),
    onSuccess: (data, variables) => {
      logMutation('create_branch', 'success', { id: data.id });
      invalidateBranches(queryClient, variables.districtId);
    },
    onError: (error) => logMutation('create_branch', 'error', error),
  });
}

export function useSetCityActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      services.adminLocations.setCityActive(id, isActive),
    onMutate: (vars) => logMutation('set_city_active', 'start', vars),
    onSuccess: (_data, vars) => {
      logMutation('set_city_active', 'success', { id: vars.id });
      invalidateCities(queryClient);
    },
    onError: (error) => logMutation('set_city_active', 'error', error),
  });
}

export function useSetDistrictActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      services.adminLocations.setDistrictActive(id, isActive),
    onMutate: (vars) => logMutation('set_district_active', 'start', vars),
    onSuccess: (_data, vars) => {
      logMutation('set_district_active', 'success', { id: vars.id });
      queryClient.invalidateQueries({ queryKey: ['admin', 'districts'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'cities'] });
    },
    onError: (error) => logMutation('set_district_active', 'error', error),
  });
}

export function useSetBranchActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      services.adminLocations.setBranchActive(id, isActive),
    onMutate: (vars) => logMutation('set_branch_active', 'start', vars),
    onSuccess: (_data, vars) => {
      logMutation('set_branch_active', 'success', { id: vars.id });
      queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] });
      queryClient.invalidateQueries({ queryKey: BRANCH_ANALYTICS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['admin', 'districts'] });
      queryClient.invalidateQueries({
        queryKey: ['admin', 'branch-hub', 'details', vars.id],
      });
    },
    onError: (error) => logMutation('set_branch_active', 'error', error),
  });
}

export function useSetOpeningBalancesLocked() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (locked: boolean) =>
      services.adminLocations.setOpeningBalancesLocked(locked),
    onMutate: (locked) => logMutation('set_opening_balances_locked', 'start', { locked }),
    onSuccess: (_data, locked) => {
      logMutation('set_opening_balances_locked', 'success', { locked });
      invalidateAppConfig(queryClient);
    },
    onError: (error) => logMutation('set_opening_balances_locked', 'error', error),
  });
}

export function useRenameBranch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      services.adminLocations.renameBranch(id, name),
    onMutate: (input) => logMutation('rename_branch', 'start', input),
    onSuccess: async (_data, input) => {
      logMutation('rename_branch', 'success', input);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'branch-hub', 'details', input.id] }),
        queryClient.invalidateQueries({ queryKey: BRANCH_ANALYTICS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['branches'] }),
        queryClient.invalidateQueries({ queryKey: ['branch-location', input.id] }),
        queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
        queryClient.invalidateQueries({ queryKey: ['reports'] }),
      ]);
    },
    onError: (error) => logMutation('rename_branch', 'error', error),
  });
}

export function useUpdateOpeningBalance() {
  const queryClient = useQueryClient();
  return useMutation({
    retry: false,
    mutationFn: (input: UpdateOpeningBalanceInput) => services.adminLocations.updateOpeningBalance(input),
    onMutate: (input) => logMutation('update_branch_opening_balance', 'start', input),
    onSuccess: async (_data, input) => {
      logMutation('update_branch_opening_balance', 'success', input);
      await Promise.all([
        ['admin', 'branches'], ['admin', 'branch-hub', 'details', input.branchId],
        ['balance', input.branchId], BRANCH_ANALYTICS_QUERY_KEY, ['reports'],
        ['branches'], ['branch-location', input.branchId],
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
    onError: async (error, input) => {
      logMutation('update_branch_opening_balance', 'error', error);
      // Refresh even after an ambiguous failure: the write may have committed,
      // or another admin may have corrected the opening balance first.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'branch-hub', 'details', input.branchId] }),
        queryClient.invalidateQueries({ queryKey: ['balance', input.branchId] }),
        queryClient.invalidateQueries({ queryKey: ['admin', 'app-config'] }),
      ]);
    },
  });
}
