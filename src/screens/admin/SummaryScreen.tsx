import { useState } from 'react';
import { RefreshControl } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { Box } from '@/components/ui/box';
import { ScrollView } from '@/components/ui/scroll-view';
import { HStack } from '@/components/ui/hstack';
import { BanknoteIcon, ReceiptIcon, TruckIcon } from '@/components/ui/icon';
import {
  useBranchIncome,
  useBranchReturnRate,
  useDailySeries,
  useSummaryKpis,
} from '@/hooks';
import { useSummaryPdfExport } from '@/hooks/useSummaryPdfExport';
import { ExportSheet } from '@/components/reports/ExportSheet';
import { ExportTriggerButton } from '@/components/reports/ExportTriggerButton';
import { ReportFilterConfig } from '@/components/reports/ReportFilterConfig';
import { formatCount } from '@/utils/formatCount';
import type { SummaryRange } from '@/types';

import { DailyChartCard } from '../../components/admin/DailyChartCard';
import { DistributionCard } from '../../components/admin/DistributionCard';
import { KpiCard } from '../../components/admin/KpiCard';
import { RangeSelector } from '../../components/admin/RangeSelector';

const SUMMARY_CONTENTS = [
  'Genel performans ve KPI\'lar',
  'Satış ve iade eğilimleri',
  'Dikkat gerektiren şubeler',
  'Şube performans tablosu',
  'Ürün iadeleri',
] as const;

// RangeSelector is rendered OUTSIDE the ScrollView so it is natively sticky
// on Android without stickyHeaderIndices gymnastics. Each card shows its own
// loading/error inline so the row never shifts height.
export function SummaryScreen() {
  const [range, setRange] = useState<SummaryRange>('week');
  const queryClient = useQueryClient();

  const kpis = useSummaryKpis(range);
  const branchIncome = useBranchIncome(range);
  const branchReturnRate = useBranchReturnRate(range);
  const dailySeries = useDailySeries(range);

  const pdf = useSummaryPdfExport();

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['reports'] });
  };

  const refreshing =
    (kpis.isFetching ||
      branchIncome.isFetching ||
      branchReturnRate.isFetching ||
      dailySeries.isFetching) &&
    (kpis.isPlaceholderData ||
      branchIncome.isPlaceholderData ||
      branchReturnRate.isPlaceholderData ||
      dailySeries.isPlaceholderData);

  const deliveredQty = kpis.data?.deliveredQty ?? null;
  const returnedQty = kpis.data?.returnedQty ?? null;
  const returnRate = kpis.data?.returnRate ?? null;
  const deliveredReturnedDisplay =
    deliveredQty !== null && returnedQty !== null
      ? `${formatCount(deliveredQty)} / ${formatCount(returnedQty)}`
      : null;

  return (
    <Box style={{ flex: 1 }} className="bg-background">
      <Box
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          marginBottom: 24,
          paddingHorizontal: 24,
          paddingTop: 8,
        }}
        className="bg-card"
      >
        <Box style={{ flex: 1, marginRight: 12 }}>
          <RangeSelector value={range} onChange={setRange} />
        </Box>
        <ExportTriggerButton
          label="PDF Rapor"
          variant="outline"
          busy={pdf.isBusy}
          onPress={pdf.open}
          accessibilityLabel="Özet PDF raporu hazırla"
          accessibilityHint="Seçili döneme ait özet raporu PDF olarak oluşturur"
        />
      </Box>

      <ExportSheet
        reportType="summary"
        isOpen={pdf.isOpen}
        onClose={pdf.close}
        state={pdf.state}
        reportLabel="Genel Özet Raporu"
        contents={SUMMARY_CONTENTS}
        configSlot={<ReportFilterConfig onCreate={(filters) => void pdf.trigger({ range, filters })} />}
        onShare={() => void pdf.share()}
        onReturnToFilters={pdf.reset}
        onRetry={pdf.retry}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: 24,
          gap: 16,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshAll} />
        }
      >
        <HStack space="md" className="items-stretch">
          <KpiCard
            icon={BanknoteIcon}
            title="Toplam Satış"
            value={kpis.data?.totalSales ?? null}
            format="currency"
            isLoading={kpis.isLoading}
            isError={kpis.isError}
            onRetry={kpis.refetch}
          />
          <KpiCard
            icon={BanknoteIcon}
            title="Toplam Tahsilat"
            value={kpis.data?.totalCollection ?? null}
            format="currency"
            isLoading={kpis.isLoading}
            isError={kpis.isError}
            onRetry={kpis.refetch}
          />
          <KpiCard
            icon={TruckIcon}
            title="Verilen / Alınan"
            value={deliveredReturnedDisplay}
            format="count"
            isLoading={kpis.isLoading}
            isError={kpis.isError}
            onRetry={kpis.refetch}
          />
          <KpiCard
            icon={ReceiptIcon}
            title="İade Oranı"
            value={returnRate}
            format="percent"
            isLoading={kpis.isLoading}
            isError={kpis.isError}
            onRetry={kpis.refetch}
          />
        </HStack>

        <HStack space="md" className="items-stretch">
          <DistributionCard
            title="Gelir Dağılımı (Şubeler)"
            rows={branchIncome.data ?? []}
            isLoading={branchIncome.isLoading}
            isError={branchIncome.isError}
            onRetry={branchIncome.refetch}
          />
          <DistributionCard
            title="İade Oranı (Şubeler)"
            rows={branchReturnRate.data ?? []}
            isLoading={branchReturnRate.isLoading}
            isError={branchReturnRate.isError}
            onRetry={branchReturnRate.refetch}
          />
        </HStack>

        <DailyChartCard
          series={dailySeries.data}
          isLoading={dailySeries.isLoading}
          isError={dailySeries.isError}
          onRetry={dailySeries.refetch}
        />
      </ScrollView>
    </Box>
  );
}
