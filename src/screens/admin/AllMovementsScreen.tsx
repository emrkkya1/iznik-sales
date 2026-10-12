import { useRef, useState } from 'react';
import { FlatList, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActionMenu } from '@/components/admin/ActionMenu';
import { FinancialMovementDetailSheet } from '@/components/admin/FinancialMovementDetailSheet';
import { FinancialMovementEditor } from '@/components/admin/FinancialMovementEditor';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { HStack } from '@/components/ui/hstack';
import { ArchiveIcon, BanknoteIcon, ChevronLeftIcon, EditIcon, Icon, MoreVerticalIcon, TruckIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { QueryError } from '@/components/ui/query-error';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useFinancialMovements } from '@/hooks/useFinancialMovements';
import type { FinancialEvent } from '@/services/supabase/financialMovementSchema';
import { formatDateForDisplay, formatDateTime } from '@/utils/dates';
import { financialActorLabel, financialEventTitle } from '@/utils/financialMovements';
import { formatCurrency } from '@/utils/formatters';

function MovementHistoryRow({ event, onDetails, onMenu }: {
  event: FinancialEvent; onDetails: () => void;
  onMenu: (anchor: { top: number; height: number }) => void;
}) {
  const menuRef = useRef<View>(null);
  const snapshot = event.after ?? event.before;
  const deleted = event.action === 'delete';
  const edited = event.action === 'edit';
  const rowIcon = edited ? EditIcon : deleted ? ArchiveIcon : event.kind === 'delivery' ? TruckIcon : BanknoteIcon;
  const rowIconClass = deleted ? 'text-destructive' : edited || event.kind === 'payment' ? 'text-info' : 'text-primary';
  const amountLabel = edited && event.before && event.after
    ? `${formatCurrency(event.before.amount)} → ${formatCurrency(event.after.amount)}`
    : snapshot ? formatCurrency(snapshot.amount) : '—';
  const paymentLabel = event.kind === 'delivery' && snapshot?.payments.length
    ? `Tahsilat: ${formatCurrency(snapshot.payments.reduce((total, payment) => total + payment.amount, 0))}`
    : event.kind === 'payment' && snapshot?.paymentType
      ? snapshot.paymentType === 'bank_transfer' ? 'Havale' : 'Nakit'
      : null;
  const amountSubtitle = [paymentLabel, !event.canManage ? 'Silindi' : null].filter(Boolean).join(' · ');
  return (
    <HStack space="sm" className="items-center border-b border-border py-2">
      <Pressable style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }} onPress={onDetails} accessibilityRole="button" accessibilityLabel={`${event.branchName}, ${financialEventTitle(event)}, ${event.actorName}`} className="active:bg-accent">
        <Box className="h-8 w-8 items-center justify-center">
          <Icon as={rowIcon} size="md" className={rowIconClass} />
        </Box>
        <VStack space="xs" style={{ flex: 1 }}>
          <HStack space="sm" className="items-center">
            <Text size="sm" bold numberOfLines={1} style={{ flexShrink: 1 }}>{event.branchName}</Text>
            <Text size="xs" bold numberOfLines={1} style={{ flexShrink: 1 }} className={deleted ? 'text-destructive' : edited ? 'text-info' : 'text-muted-foreground'}>{financialEventTitle(event)}</Text>
          </HStack>
          <Text size="xs" numberOfLines={1} className="text-muted-foreground">
            <Text size="xs" className="text-foreground">{financialActorLabel(event)}</Text>
            {' · '}{formatDateTime(event.occurredAt)}{snapshot ? ` · Tarih: ${formatDateForDisplay(snapshot.date)}` : ''}
          </Text>
        </VStack>
        <VStack space="xs" className="items-end">
          <Text size="sm" bold>{amountLabel}</Text>
          <Text size="xs" className={!event.canManage ? 'text-destructive' : event.kind === 'delivery' ? 'text-info' : 'text-muted-foreground'}>
            {amountSubtitle}
          </Text>
        </VStack>
      </Pressable>
      {event.canManage ? <View ref={menuRef} collapsable={false}>
        <Pressable onPress={() => menuRef.current?.measureInWindow((_x, top, _width, height) => onMenu({ top, height }))} accessibilityRole="button" accessibilityLabel={`${event.branchName} hareket seçenekleri`} hitSlop={8} className="items-center justify-center rounded-md p-1">
          <Icon as={MoreVerticalIcon} size="md" className="text-muted-foreground" />
        </Pressable>
      </View> : null}
    </HStack>
  );
}

export function AllMovementsScreen() {
  const listRef = useRef<FlatList<FinancialEvent>>(null);
  const router = useRouter();
  const query = useFinancialMovements();
  const [detail, setDetail] = useState<FinancialEvent | null>(null);
  const [menu, setMenu] = useState<{ event: FinancialEvent; anchor: { top: number; height: number } } | null>(null);
  const [editor, setEditor] = useState<{ event: FinancialEvent; action: 'edit' | 'delete' } | null>(null);
  const rows = [...new Map((query.data?.pages.flatMap(page => page.rows) ?? []).map(row => [row.id, row])).values()];
  return (
    <Box style={{ flex: 1 }} className="bg-background">
      <HStack space="md" className="items-center px-6 py-4">
        <Pressable accessibilityRole="button" accessibilityLabel="Ayarlara dön" onPress={() => router.back()} className="p-2"><Icon as={ChevronLeftIcon} size="lg" /></Pressable>
        <VStack space="xs" style={{ flex: 1 }}><Text size="xl" bold>Tüm Hareketler</Text><Text size="sm" className="text-muted-foreground">Teslimatlar, tahsilatlar ve tüm düzeltmeler</Text></VStack>
        <Button variant="outline" disabled={query.isFetching} onPress={() => query.refetch()}><ButtonText>Yenile</ButtonText></Button>
      </HStack>
      {query.isLoading ? <Spinner label="Hareketler yükleniyor…" /> : query.isError && !rows.length ? <QueryError title="Hareketler yüklenemedi" onRetry={() => query.refetch()} /> : <FlatList
        ref={listRef} style={{ flex: 1 }} data={rows} keyExtractor={row => row.id}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 }}
        ListHeaderComponent={rows.length ? <Box className="border-t border-border" /> : null}
        renderItem={({ item }) => <MovementHistoryRow event={item} onDetails={() => setDetail(item)} onMenu={anchor => setMenu({ event: item, anchor })} />}
        ListEmptyComponent={<EmptyState title="Hareket yok" subtitle="Finansal işlemler burada listelenecek." />}
        ListFooterComponent={<Box className="items-center p-4">
          {query.isFetchNextPageError ? <Text size="sm" className="text-destructive">Sonraki sayfa yüklenemedi. Tekrar deneyin.</Text> : null}
          {query.hasNextPage ? <Button variant="outline" disabled={query.isFetchingNextPage} onPress={() => query.fetchNextPage()}><ButtonText>{query.isFetchingNextPage ? 'Yükleniyor…' : `Daha Fazla Yükle (${rows.length})`}</ButtonText></Button> : null}
        </Box>}
      />}
      <ActionMenu open={!!menu} anchor={menu?.anchor ?? null} onClose={() => setMenu(null)} items={menu ? [
        { label: 'Düzenle', onPress: () => setEditor({ event: menu.event, action: 'edit' }) },
        ...(menu.event.action === 'edit' ? [] : [{ label: 'Sil', destructive: true, onPress: () => setEditor({ event: menu.event, action: 'delete' as const }) }]),
      ] : []} />
      {detail ? <FinancialMovementDetailSheet event={detail} onClose={() => setDetail(null)} /> : null}
      {editor ? <FinancialMovementEditor event={editor.event} action={editor.action} onClose={() => setEditor(null)} onSaved={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })} /> : null}
    </Box>
  );
}
