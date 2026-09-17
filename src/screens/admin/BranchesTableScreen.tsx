import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, type ListRenderItemInfo } from 'react-native';
import { useRouter } from 'expo-router';

import { Box } from '@/components/ui/box';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import {
  FilterSheet,
  FilterSheetApplyButton,
  FilterSheetResetButton,
} from '@/components/ui/filter-sheet';
import { HStack } from '@/components/ui/hstack';
import { FilterIcon, SearchIcon } from '@/components/ui/icon';
import { Input, InputField, InputIcon, InputSlot } from '@/components/ui/input';
import { Pressable } from '@/components/ui/pressable';
import { QueryError } from '@/components/ui/query-error';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useBranchesAnalytics } from '@/hooks';
import { useBranchesReportExport } from '@/hooks/useBranchesReportExport';
import { ExportSheet } from '@/components/reports/ExportSheet';
import { ExportTriggerButton } from '@/components/reports/ExportTriggerButton';
import { ReportFilterConfig } from '@/components/reports/ReportFilterConfig';
import type {
  BranchAnalyticsFilters,
  BranchAnalyticsRow,
  BranchAnalyticsSortBy,
  BranchAnalyticsSortDir,
} from '@/types';
import { formatDateForDisplay } from '@/utils/dates';
import { formatCount } from '@/utils/formatCount';
import {
  formatBalanceAmount,
  getBalanceColorClass,
  getBalanceLabel,
} from '@/utils/formatters';
import { formatRelativeDate } from '@/utils/formatRelativeDate';

import { BranchFilters } from './branches/BranchFilters';
import { countActiveFilters } from './branches/branchFilters.utils';

type ColumnKey = BranchAnalyticsSortBy | 'location';

type Column = {
  key: ColumnKey;
  label: string;
  flex: number;
  align?: 'left' | 'right';
  sortable?: boolean;
};

const COLUMNS: readonly Column[] = [
  { key: 'name', label: 'Şube', flex: 1.6, sortable: true },
  { key: 'location', label: 'Şehir/İlçe', flex: 1.7, sortable: true },
  { key: 'balance', label: 'Bakiye', flex: 1.1, align: 'right', sortable: true },
  { key: 'return_rate', label: 'İade Oranı', flex: 1, align: 'right', sortable: true },
  { key: 'last_activity', label: 'Son İşlem', flex: 1.2, align: 'right', sortable: true },
];

const EMPTY_FILTERS: BranchAnalyticsFilters = {};

function formatReturnRate(rate: number | null): string {
  if (rate === null) return '—';
  return `%${rate.toFixed(1).replace(/\.0$/, '')}`;
}

function alignClass(align: Column['align']): string {
  return align === 'right' ? 'items-end' : 'items-start';
}

function BranchTableHeader({
  sort,
  onSortChange,
}: {
  sort: { columnKey: BranchAnalyticsSortBy; direction: BranchAnalyticsSortDir };
  onSortChange: (column: BranchAnalyticsSortBy) => void;
}) {
  return (
    <HStack className="mx-6 items-center rounded-t-xl border border-border bg-muted px-3 py-1.5">
      {COLUMNS.map((column) => {
        const active = column.key === sort.columnKey;
        const label = active
          ? `${column.label}, ${sort.direction === 'asc' ? 'artan' : 'azalan'} sıralama`
          : column.label;
        return (
          <Box
            key={column.key}
            style={{ flex: column.flex }}
            className={`${alignClass(column.align)} justify-center`}
          >
            {column.sortable ? (
              <Pressable
                onPress={() => onSortChange(column.key as BranchAnalyticsSortBy)}
                accessibilityRole="button"
                accessibilityLabel={label}
                accessibilityHint="Sıralama yönünü değiştirir"
                className="min-h-8 justify-center"
              >
                <HStack space="xs" className="items-center">
                  <Text size="xs" bold className="text-muted-foreground">
                    {column.label}
                  </Text>
                  {active ? (
                    <Text size="xs" className="text-muted-foreground">
                      {sort.direction === 'asc' ? '▲' : '▼'}
                    </Text>
                  ) : null}
                </HStack>
              </Pressable>
            ) : (
              <Text size="xs" bold className="text-muted-foreground">
                {column.label}
              </Text>
            )}
          </Box>
        );
      })}
    </HStack>
  );
}

export function BranchesTableScreen() {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] =
    useState<BranchAnalyticsFilters>(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] =
    useState<BranchAnalyticsFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<{
    columnKey: BranchAnalyticsSortBy;
    direction: BranchAnalyticsSortDir;
  }>({ columnKey: 'name', direction: 'asc' });

  // 300ms debounced search → query input.
  useEffect(() => {
    const timeout = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(timeout);
  }, [searchInput]);

  const openFilterSheet = useCallback(() => {
    // Sheet açılırken draft, applied + searchInput ile başlar. Search
    // dışındaki filtreler draft.search'i etkilemez; Şube Adı input'u
    // doğrudan searchInput'a bağlı olduğu için tekrar set etmeye gerek
    // yok.
    const { search: _ignored, ...rest } = appliedFilters;
    void _ignored;
    setDraftFilters(rest);
    setFilterSheetOpen(true);
  }, [appliedFilters]);

  const queryFilters: BranchAnalyticsFilters = useMemo(
    () => ({
      ...appliedFilters,
      search: searchQuery || undefined,
      sortBy: sort.columnKey,
      sortDir: sort.direction,
    }),
    [appliedFilters, searchQuery, sort],
  );

  const query = useBranchesAnalytics(queryFilters);
  const rows = useMemo(
    () => query.data?.pages.flatMap((page) => page.rows) ?? [],
    [query.data],
  );
  const totalCount = query.data?.pages[0]?.totalCount ?? 0;

  const report = useBranchesReportExport();
  const reportTrigger = report.trigger;
  const reportBusy = report.isBusy;

  const changeSort = useCallback((columnKey: BranchAnalyticsSortBy) => {
    setSort((current) => ({
      columnKey,
      direction:
        current.columnKey === columnKey && current.direction === 'asc'
          ? 'desc'
          : 'asc',
    }));
  }, []);

  const openBranch = useCallback(
    (row: BranchAnalyticsRow) => {
      router.push({
        pathname: '/branches/[branchId]',
        params: { branchId: row.branchId },
      });
    },
    [router],
  );

  const applyFilters = useCallback(() => {
    // search searchQuery üzerinden yönetildiği için draft.search'i
    // applied'a taşımaya gerek yok; diğer filtreleri uygularız.
    const { search: _ignored, ...rest } = draftFilters;
    void _ignored;
    setAppliedFilters(rest);
    setFilterSheetOpen(false);
  }, [draftFilters]);

  const resetFilters = useCallback(() => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
    setSearchInput('');
    setSearchQuery('');
    setFilterSheetOpen(false);
  }, []);

  // Active-filter rozeti: appliedFilters + anlık searchQuery. searchQuery
  // zaten query'ye bağlı olduğu için Şube Ara'ya yazıldığında artar,
  // silindiğinde azalır.
  const { search: _search, ...appliedWithoutSearch } = appliedFilters;
  void _search;
  const appliedNonSearchCount = countActiveFilters(appliedWithoutSearch);
  const activeCount = appliedNonSearchCount + (searchQuery ? 1 : 0);

  const dateError =
    draftFilters.dateFrom && draftFilters.dateTo &&
    draftFilters.dateFrom > draftFilters.dateTo
      ? 'Başlangıç tarihi bitişten sonra olamaz.'
      : null;

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<BranchAnalyticsRow>) => {
      const balanceLabel = getBalanceLabel(item.currentBalance);
      return (
        <Pressable
          onPress={() => openBranch(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.name}, ${item.cityName}, ${item.districtName}`}
          accessibilityHint="Şube detaylarını açar"
          className="mx-6 border-x border-b border-border bg-card data-[pressed=true]:bg-accent"
        >
          <HStack className="items-center px-3 py-3">
            <Box style={{ flex: 1.6 }} className="items-start justify-center">
              <VStack space="xs">
                <Text size="sm" bold numberOfLines={1} className="text-foreground">
                  {item.name}
                </Text>
                {!item.isActive ? (
                  <Text size="xs" className="text-muted-foreground">
                    Pasif
                  </Text>
                ) : null}
              </VStack>
            </Box>
            <Box style={{ flex: 1.7 }} className="items-start justify-center">
              <Text size="sm" numberOfLines={1} className="text-foreground">
                {`${item.cityName} / ${item.districtName}`}
              </Text>
            </Box>
            <Box style={{ flex: 1.1 }} className="items-end justify-center">
              <VStack space="xs" className="items-end">
                <Text
                  size="sm"
                  bold
                  className={getBalanceColorClass(item.currentBalance)}
                >
                  {formatBalanceAmount(item.currentBalance)}
                </Text>
                {balanceLabel ? (
                  <Text size="xs" className="text-muted-foreground">
                    {balanceLabel}
                  </Text>
                ) : null}
              </VStack>
            </Box>
            <Box style={{ flex: 1 }} className="items-end justify-center">
              <VStack space="xs" className="items-end">
                <Text size="sm" bold className="text-foreground">
                  {formatReturnRate(item.returnRate)}
                </Text>
                <Text size="xs" className="text-muted-foreground">
                  {formatCount(item.returnedQty)}/{formatCount(item.deliveredQty)}
                </Text>
              </VStack>
            </Box>
            <Box style={{ flex: 1.2 }} className="items-end justify-center">
              <VStack space="xs" className="items-end">
                <Text size="sm" className="text-foreground">
                  {formatRelativeDate(item.lastActivityDate)}
                </Text>
                <Text size="xs" className="text-muted-foreground">
                  {item.lastActivityDate
                    ? formatDateForDisplay(item.lastActivityDate)
                    : 'Veri yok'}
                </Text>
              </VStack>
            </Box>
          </HStack>
        </Pressable>
      );
    },
    [openBranch],
  );

  const header = useMemo(
    () => (
      <>
        <VStack space="sm" className="px-6 pb-2 pt-4">
          <HStack className="items-baseline justify-between">
            <Text size="xl" bold className="text-foreground">
              Şubeler
            </Text>
            <Text size="sm" className="text-muted-foreground">
              {query.isLoading
                ? 'Şubeler yükleniyor'
                : `${rows.length} / ${totalCount} şube`}
            </Text>
          </HStack>

          <HStack space="sm" className="items-center">
            <Input className="flex-1 bg-card">
              <InputSlot className="pl-1">
                <InputIcon as={SearchIcon} />
              </InputSlot>
              <InputField
                accessibilityLabel="Şube ara"
                placeholder="Şube ara…"
                value={searchInput}
                onChangeText={setSearchInput}
                returnKeyType="search"
              />
            </Input>
            <Button
              variant={activeCount > 0 ? 'default' : 'outline'}
              size="default"
              onPress={openFilterSheet}
              accessibilityLabel="Filtrele"
            >
              <ButtonIcon as={FilterIcon} />
              <ButtonText>
                Filtrele{activeCount > 0 ? ` · ${activeCount}` : ''}
              </ButtonText>
            </Button>
            <ExportTriggerButton
              label="PDF Rapor"
              variant="outline"
              busy={reportBusy}
              disabled={query.isLoading}
              onPress={report.open}
              accessibilityLabel="Şubeler raporunu PDF olarak hazırla"
              accessibilityHint="Mevcut filtrelere uyan tüm şubeleri PDF raporu olarak oluşturur"
            />
          </HStack>
        </VStack>
        <BranchTableHeader sort={sort} onSortChange={changeSort} />
      </>
    ),
    [
      activeCount,
      changeSort,
      openFilterSheet,
      query.isLoading,
      reportBusy,
      report.open,
      rows.length,
      searchInput,
      sort,
      totalCount,
    ],
  );

  const empty = query.isLoading ? (
    <Spinner label="Şubeler yükleniyor…" />
  ) : query.isError ? (
    <QueryError title="Şubeler yüklenemedi" onRetry={() => void query.refetch()} />
  ) : (
    <EmptyState
      title="Şube bulunamadı"
      subtitle="Filtreleri değiştirip tekrar deneyin."
    />
  );

  const footer = query.isFetchingNextPage ? (
    <Spinner size="small" label="Daha fazla şube yükleniyor…" />
  ) : query.isFetchNextPageError ? (
    <QueryError
      title="Diğer şubeler yüklenemedi"
      onRetry={() => void query.fetchNextPage()}
    />
  ) : (
    <Box className="h-6" />
  );

  return (
    <Box style={{ flex: 1 }} className="bg-background">
      <FlatList
        style={{ flex: 1 }}
        data={rows}
        keyExtractor={(row) => row.branchId}
        renderItem={renderRow}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        onRefresh={() => void query.refetch()}
        refreshing={query.isRefetching && !query.isFetchingNextPage}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            void query.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        initialNumToRender={20}
        windowSize={7}
      />

      <ExportSheet
        isOpen={report.isOpen}
        onClose={report.close}
        state={report.state}
        reportLabel="Şubeler Raporu"
        contents={['Uygulanan filtreler', 'Genel bakış KPI\'ları', 'Filtreye uyan şubelerin tamamı']}
        configSlot={<ReportFilterConfig includeProducts includeBranches onCreate={(filters) => void reportTrigger({
          ...queryFilters,
          search: filters.search,
          cityId: filters.cityId,
          districtId: filters.districtId,
          dateFrom: filters.dateFrom ?? undefined,
          dateTo: filters.dateTo ?? undefined,
          daysOfWeek: filters.daysOfWeek ?? undefined,
          productIds: filters.productIds ?? undefined,
        })} />}
        onShare={() => void report.share()}
        onRetry={report.retry}
      />

      <FilterSheet
        open={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
        // Lift the sheet up so dropdown popovers anchored below their
        // triggers have visible room on tablet landscape.
        topOffset="12%"
        footer={
          <>
            <FilterSheetResetButton onPress={resetFilters} />
            <FilterSheetApplyButton
              onPress={applyFilters}
              disabled={!!dateError}
            />
          </>
        }
      >
        <BranchFilters
          draft={draftFilters}
          onDraftChange={setDraftFilters}
          searchInput={searchInput}
          onSearchInputChange={setSearchInput}
          dateError={dateError}
        />
      </FilterSheet>
    </Box>
  );
}
