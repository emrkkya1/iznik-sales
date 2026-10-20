import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { FlatList } from 'react-native';

import { Amount } from '@/components/ui/amount';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { HStack } from '@/components/ui/hstack';
import { Icon, BanknoteIcon, TruckIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { QueryError } from '@/components/ui/query-error';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useBranchMovementsInfinite } from '@/hooks';
import type { MovementRow } from '@/types';
import { formatDateForDisplay } from '@/utils/dates';
import { formatCurrency } from '@/utils/formatters';
import { loadNextPageIfIdle } from '@/utils/pagination';

import { MovementDetailSheet } from '../../../components/admin/MovementDetailSheet';

type MovementsTabProps = {
  branchId: string;
  header?: ReactElement;
};

const LIMIT = 50;

function Row({
  item,
  onPress,
}: {
  item: MovementRow;
  onPress: () => void;
}) {
  const isDelivery = item.kind === 'delivery';
  const icon = isDelivery ? TruckIcon : BanknoteIcon;
  const title = isDelivery ? 'Teslimat' : 'Tahsilat';

  // Top amount (cash-flow convention, "+ means we got money"):
  //   Delivery  → NET = Alınan - Verilen. Positive when the customer paid
  //                more than the products were worth (overpayment — we have
  //                cash in hand); negative when products exceed payment
  //                (we're missing cash). No tone is applied; the leading "-"
  //                from formatCurrency tells the story on its own.
  //   Payment   → just the payment amount; standalone payments have no
  //                Verilen side, so NET would be a meaningless negative.
  const alinanForDelivery = isDelivery && item.payment ? item.payment.amount : 0;
  const netAmount = isDelivery ? alinanForDelivery - item.amount : item.amount;

  // Subtitle row:
  //   Delivery  → both labels visible when an embedded payment exists;
  //                "Toplam Tutar" alone when there is none.
  //   Payment   → only "Tahsilat" (it's the same number as the top amount,
  //                but it keeps the row's visual rhythm consistent).
  const verilenValue = isDelivery ? item.amount : null;
  const alinanValue =
    isDelivery && item.payment ? item.payment.amount : !isDelivery ? item.amount : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} detayı`}
      className="flex-row items-center justify-between border-b border-border py-3 active:bg-accent"
    >
      <HStack space="sm" className="flex-1 items-center">
        <Box className="h-9 w-9 items-center justify-center rounded-full bg-accent">
          <Icon as={icon} size="sm" className="text-accent-foreground" />
        </Box>
        <VStack space="xs" className="flex-1 pr-3">
          <Text size="sm" bold className="text-foreground">
            {title}
            {item.isDeleted ? (
              <Text size="xs" className="text-muted-foreground">
                {' '}(silindi)
              </Text>
            ) : null}
          </Text>
          <Text size="xs" className="text-muted-foreground">
            {formatDateForDisplay(item.date)}
          </Text>
        </VStack>
      </HStack>
        <VStack space="xs" className="items-end">
          <Amount size="sm" value={netAmount} />
          {(verilenValue !== null || alinanValue !== null) ? (
            <HStack space="sm">
              {verilenValue !== null ? (
                <Text size="xs">
                  <Text size="xs" className="text-muted-foreground">
                    Toplam Tutar:{' '}
                  </Text>
                  <Text size="xs" className="text-foreground">
                    {formatCurrency(verilenValue)}
                  </Text>
                </Text>
              ) : null}
              {alinanValue !== null ? (
                <Text size="xs">
                  <Text size="xs" className="text-muted-foreground">
                    Tahsilat:{' '}
                  </Text>
                  <Text size="xs" className="text-info">
                    {formatCurrency(alinanValue)}
                  </Text>
                </Text>
              ) : null}
            </HStack>
          ) : null}
        </VStack>
    </Pressable>
  );
}

export function MovementsTab({ branchId, header }: MovementsTabProps) {
  const infinite = useBranchMovementsInfinite(branchId, LIMIT);

  const items: MovementRow[] = useMemo(() => infinite.data?.pages.flat() ?? [], [infinite.data?.pages]);

  const [selected, setSelected] = useState<MovementRow | null>(null);
  const renderItem = useCallback(({ item }: { item: MovementRow }) => <Row item={item} onPress={() => setSelected(item)} />, []);

  return (
    <Box style={{ flex: 1 }}>
      <FlatList
        style={{ flex: 1 }}
        data={items}
        renderItem={renderItem}
        keyExtractor={item => `${item.kind}-${item.id}`}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 96 }}
        ListHeaderComponent={header ? <Box className="mb-4">{header}</Box> : null}
        ListEmptyComponent={infinite.isLoading ? <Spinner label="Hareketler yükleniyor…" />
          : infinite.isError ? <QueryError onRetry={() => infinite.refetch()} title="Hareketler yüklenemedi" />
          : <EmptyState title="Hareket yok" subtitle="Bu şube için henüz teslimat veya tahsilat kaydı yok." />}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        ListFooterComponent={infinite.isError && items.length ? (
          <QueryError onRetry={() => infinite.refetch()} title="Hareketler yenilenemedi" />
        ) : infinite.hasNextPage ? (
        <Box className="items-center pt-4">
          <Button
            variant="outline"
            onPress={() => loadNextPageIfIdle(infinite)}
            disabled={infinite.isFetching}
          >
            <ButtonText>
              {infinite.isFetchingNextPage
                ? 'Yükleniyor…'
                : `Daha Fazla Yükle (${items.length})`}
            </ButtonText>
          </Button>
        </Box>
        ) : null}
      />

      <MovementDetailSheet
        item={selected}
        onClose={() => setSelected(null)}
      />
    </Box>
  );
}
