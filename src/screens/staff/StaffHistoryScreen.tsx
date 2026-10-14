import { useState } from 'react';
import { FlatList } from 'react-native';
import { useRouter } from 'expo-router';

import { MovementDetailSheet } from '@/components/admin/MovementDetailSheet';
import { Amount } from '@/components/ui/amount';
import { Box } from '@/components/ui/box';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { HStack } from '@/components/ui/hstack';
import { Icon, EditIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useMyDeliveries } from '@/hooks';
import { useReceiptDraftStore } from '@/store/receiptDraft';
import type { DeliveryWithBranch, MovementRow } from '@/types';
import { canEditDelivery, formatTime } from '@/utils/dates';

// Adapt a staff DeliveryWithBranch row into the MovementRow shape the
// shared MovementDetailSheet consumes. The list query doesn't include the
// embedded payment, so payment is left null — the sheet still lazy-loads
// the full delivery via useDelivery(id) and shows products + payment
// details inside.
function toMovementRow(d: DeliveryWithBranch): MovementRow {
  return {
    kind: 'delivery',
    id: d.id,
    date: d.date,
    amount: d.totalSalesAmount,
    isDeleted: d.deletedAt !== null,
    createdAt: d.createdAt,
    payment: null,
  };
}

export function StaffHistoryScreen() {
  const router = useRouter();
  const deliveries = useMyDeliveries();
  const setEditingDeliveryId = useReceiptDraftStore(
    (s) => s.setEditingDeliveryId,
  );
  const [selected, setSelected] = useState<DeliveryWithBranch | null>(null);
  const [pending, setPending] = useState<DeliveryWithBranch | null>(null);

  const startEdit = (delivery: DeliveryWithBranch) => {
    setSelected(null);
    setPending(null);
    setEditingDeliveryId(delivery.id);
    router.push('/home');
  };

  if (deliveries.isLoading) {
    return <Spinner label="Yükleniyor…" />;
  }

  if (deliveries.isError) {
    return (
      <ErrorState
        message="Kayıtlar yüklenemedi."
        onRetry={() => deliveries.refetch()}
      />
    );
  }

  const items = deliveries.data ?? [];

  return (
    <Box style={{ flex: 1 }} className="bg-background">
      <FlatList
        data={items}
        keyExtractor={(d) => d.id}
        style={{ backgroundColor: '#FFFFFF' }}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 8,
          paddingBottom: 24,
          backgroundColor: '#FFFFFF',
        }}
        ItemSeparatorComponent={null}
        ListEmptyComponent={
          <EmptyState
            title="Bugün kayıt yok"
            subtitle="Henüz bugüne ait teslimat kaydınız bulunmuyor."
          />
        }
        renderItem={({ item }) => {
          const editable = canEditDelivery(item.date);
          return (
            <Pressable
              onPress={() => setSelected(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.branchName} detayı`}
              className="flex-row items-center justify-between border-b border-border py-4"
            >
              <VStack space="xs" className="flex-1 pr-3">
                <Text
                  size="md"
                  bold
                  numberOfLines={1}
                  className="text-foreground"
                >
                  {item.branchName}
                </Text>
                <HStack space="sm" className="items-center">
                  <Text size="xs" className="text-muted-foreground">
                    {formatTime(item.createdAt)}
                  </Text>
                  {editable ? null : (
                    <>
                      <Text size="xs" className="text-muted-foreground">
                        ·
                      </Text>
                      <Text size="xs" className="text-muted-foreground">
                        Düzenleme kapandı
                      </Text>
                    </>
                  )}
                </HStack>
              </VStack>

              <HStack space="sm" className="items-center">
                <Amount size="sm" value={item.totalSalesAmount} />
                {editable ? (
                  // Inner Pressable with stopPropagation so tapping the
                  // chevron opens the ConfirmDialog instead of also
                  // opening the sheet behind it.
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation?.();
                      setPending(item);
                    }}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Kaydı düzenle"
                    className="items-center justify-center rounded-md p-1"
                  >
                    <Icon
                      as={EditIcon}
                      size="md"
                      className="text-muted-foreground"
                    />
                  </Pressable>
                ) : null}
              </HStack>
            </Pressable>
          );
        }}
      />

      <MovementDetailSheet
        item={selected ? toMovementRow(selected) : null}
        title={selected?.branchName}
        onClose={() => setSelected(null)}
      />

      <ConfirmDialog
        open={!!pending}
        title="Kaydı Düzenle"
        message="Bu kayıt düzenlenecek ve değişiklik denetim kaydına işlenecek. Devam etmek istiyor musunuz?"
        confirmLabel="Düzenle"
        onConfirm={() => pending && startEdit(pending)}
        onCancel={() => setPending(null)}
      />
    </Box>
  );
}
