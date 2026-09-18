import { useRef, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { ActionMenu, type ActionMenuItem } from '@/components/admin/ActionMenu';
import { Box } from '@/components/ui/box';
import { ErrorState } from '@/components/ui/error-state';
import { HStack } from '@/components/ui/hstack';
import { Icon, MoreVerticalIcon, TruckIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { ReportFilterConfig } from '@/components/reports/ReportFilterConfig';
import { ExportSheet } from '@/components/reports/ExportSheet';
import { ExportTriggerButton } from '@/components/reports/ExportTriggerButton';
import { useBranchHubReportExport } from '@/hooks/useBranchHubReportExport';
import { useBranchHubSummary, useSetBranchActive } from '@/hooks';
import { formatCount } from '@/utils/formatCount';
import { formatRelativeDate } from '@/utils/formatRelativeDate';

import { ActiveBadge } from '../../components/admin/ActiveBadge';
import { KpiCard } from '../../components/admin/KpiCard';
import { SummaryCard } from '../../components/admin/SummaryCard';
import { DetailsTab } from './branch-hub/DetailsTab';
import { MovementsTab } from './branch-hub/MovementsTab';
import { ProductsTab } from './branch-hub/ProductsTab';

type TabKey = 'products' | 'movements' | 'details';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'products', label: 'Ürünler & Fiyatlar' },
  { key: 'movements', label: 'Hareketler' },
  { key: 'details', label: 'Detaylar' },
];

function pickFirst(v: string | string[] | undefined): string | null {
  if (v === undefined) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export function BranchHubScreen() {
  const params = useLocalSearchParams<{ branchId: string | string[] }>();
  const branchId = pickFirst(params.branchId);

  const [activeTab, setActiveTab] = useState<TabKey>('products');
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; height: number } | null>(null);
  const menuRef = useRef<View>(null);

  const summary = useBranchHubSummary(branchId);
  const setBranchActive = useSetBranchActive();
  const report = useBranchHubReportExport();

  const data = summary.data;
  const isLoading = summary.isLoading;
  const deliveredReturnedDisplay = data
    ? `${formatCount(data.deliveredQty)} / ${formatCount(data.returnedQty)}`
    : null;

  if (!branchId) {
    return <ErrorState title="Şube bulunamadı" message="Geçersiz şube kimliği." />;
  }

  const handleMenuPress = () => {
    menuRef.current?.measureInWindow((_x, y, _w, height) => {
      setMenuAnchor({ top: y, height });
    });
  };

  const closeMenu = () => setMenuAnchor(null);

  const menuItems: ActionMenuItem[] = data
    ? [
        {
          label: data.isActive ? 'Pasife Al' : 'Aktifleştir',
          onPress: () =>
            setBranchActive.mutate({
              id: branchId,
              isActive: !data.isActive,
            }),
        },
      ]
    : [];

  return (
    <Box style={{ flex: 1 }} className="bg-background">
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 96,
          gap: 16,
        }}
      >
        <HStack space="md" className="items-center">
          <Text size="2xl" bold className="text-foreground">
            {data?.name ?? '…'}
          </Text>
          {data ? <ActiveBadge isActive={data.isActive} /> : null}
          <Text
            size="sm"
            className="flex-1 text-muted-foreground"
            numberOfLines={1}
          >
            {data ? `${data.cityName} / ${data.districtName}` : '…'}
          </Text>
          {data ? (
            <ExportTriggerButton
               label="PDF Rapor"
              variant="outline"
              busy={report.isBusy}
              disabled={isLoading}
              onPress={report.open}
              accessibilityLabel="Şube raporunu PDF olarak hazırla"
              accessibilityHint="Dönem seçip bu şubenin detaylı raporunu PDF olarak oluşturur"
            />
          ) : null}
          {data ? (
            <Pressable
              ref={menuRef}
              onPress={handleMenuPress}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Şübe işlem menüsü"
              className="items-center justify-center rounded-md p-1"
            >
              <Icon as={MoreVerticalIcon} size="md" className="text-muted-foreground" />
            </Pressable>
          ) : null}
        </HStack>

        <HStack space="md" className="items-stretch">
          <SummaryCard
            title="Güncel Bakiye"
            // Canonical convention (M20): positive = Alacak (they owe us),
            // negative = Borç (we owe them). BalanceAmount handles colour
            // and label so we never show a leading "-".
            value={data?.currentBalance ?? null}
            format="currency"
            colorCoded
            showBalanceLabel
            isLoading={isLoading}
          />
          <KpiCard
            icon={TruckIcon}
            title="Verilen / Alınan"
            value={deliveredReturnedDisplay}
            format="count"
            isLoading={isLoading}
          />
          <SummaryCard
            title="İade Oranı"
            value={data?.returnRate ?? null}
            format="percent"
            emptyLabel="Veri yok"
            isLoading={isLoading}
          />
          <SummaryCard
            title="Son İşlem"
            value={formatRelativeDate(data?.lastMovementDate ?? null)}
            format="text"
            isLoading={isLoading}
          />
        </HStack>

        <Box className="flex-row border-b border-border">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                className={`flex-1 items-center border-b-2 py-3 ${
                  active ? 'border-primary' : 'border-transparent'
                }`}
              >
                <Text
                  size="sm"
                  bold={active}
                  className={active ? 'text-primary' : 'text-muted-foreground'}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </Box>

        {activeTab === 'products' ? <ProductsTab branchId={branchId} /> : null}
        {activeTab === 'movements' ? <MovementsTab branchId={branchId} /> : null}
        {activeTab === 'details' ? <DetailsTab branchId={branchId} /> : null}
      </ScrollView>

      <ExportSheet
        reportType="branch-detail"
        isOpen={report.isOpen}
        onClose={report.close}
        state={report.state}
        reportLabel={`Şube Raporu${data ? ` — ${data.name}` : ''}`}
        contents={['Şube kimlik bilgileri', 'Dönem KPI\'ları ve bakiye kırılımı', 'Ürün performansı', 'Hareket defteri']}
        configSlot={
          <ReportFilterConfig
            includeProducts
            onCreate={(filters) => void report.trigger({
              branchId,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
              filters,
            })}
          />
        }
        onShare={() => void report.share()}
        onReturnToFilters={report.reset}
        onRetry={report.retry}
      />

      <ActionMenu
        open={!!menuAnchor && !!data}
        onClose={closeMenu}
        items={menuItems}
        anchor={menuAnchor}
      />
    </Box>
  );
}
