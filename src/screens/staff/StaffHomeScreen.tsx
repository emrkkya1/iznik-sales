import { useMemo, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

import { BranchSelector } from '@/components/domain/branch-selector';
import { CheckoutSummary } from '@/components/domain/checkout-summary';
import { PaymentReceivedInput } from '@/components/domain/payment-received-input';
import { ReceiptProductGrid, PRODUCT_GRID_GAP, PRODUCT_GRID_PADDING } from '@/components/domain/receipt-product-grid';
import { FinancialRecoveryAction } from '@/components/domain/financial-recovery-action';
import { Amount } from '@/components/ui/amount';
import { BalanceAmount } from '@/components/ui/balance-amount';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { HStack } from '@/components/ui/hstack';
import { Icon, EditIcon } from '@/components/ui/icon';
import { MutationButton } from '@/components/ui/mutation-button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { ResultState } from '@/components/ui/result-state';
import { ScrollView } from '@/components/ui/scroll-view';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useBranches, useBranchProducts, useEditPrefill } from '@/hooks';
import { useBranchBalance } from '@/hooks/useLedger';
import { useCreateDelivery, useUpdateDelivery } from '@/hooks/useMutations';
import { useReceiptDraftStore } from '@/store/receiptDraft';
import type { ReceiptSummary } from '@/types';
import { formatDateForDisplay } from '@/utils/dates';
import { getUserMessage } from '@/utils/errors';
import { computeReceiptPreview } from '@/utils/receiptPreview';

const PHASES = ['Şube Seçimi', 'Ürün Seçimi', 'Gözden Geçirme'] as const;

export function StaffHomeScreen() {
  const draft = useReceiptDraftStore();
  const createDelivery = useCreateDelivery();
  const updateDelivery = useUpdateDelivery();
  const branchProducts = useBranchProducts(draft.branchId, draft.date);
  const branchBalance = useBranchBalance(draft.branchId);
  const branches = useBranches(draft.districtId);

  const editingDeliveryId = draft.editingDeliveryId;
  const { delivery: editingDelivery, branch: editingBranch, isReady: editReady } = useEditPrefill(editingDeliveryId);

  const [receipt, setReceipt] = useState<ReceiptSummary | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [phase, setPhase] = useState<1 | 2 | 3>(1);
  const [gridWidth, setGridWidth] = useState(0);

  const products = useMemo(
    () => branchProducts.data ?? [],
    [branchProducts.data],
  );

  const preview = useMemo(
    () =>
      computeReceiptPreview(
        products,
        draft.entries,
        draft.paymentAmount,
        // DB now stores cash in hand directly (cash-flow convention).
        branchBalance.data ?? 0,
      ),
    [products, draft.entries, draft.paymentAmount, branchBalance.data],
  );

  const branchName =
    branches.data?.find((b) => b.id === draft.branchId)?.name ?? 'Şube';

  const columns = gridWidth >= 1000 ? 5 : gridWidth >= 700 ? 4 : 3;
  const cardWidth =
    gridWidth > 0
      ? (gridWidth - PRODUCT_GRID_PADDING * 2 - PRODUCT_GRID_GAP * (columns - 1)) / columns
      : 220;

  const handleGridLayout = (e: LayoutChangeEvent) => {
    setGridWidth(e.nativeEvent.layout.width);
  };

  const items = Object.entries(draft.entries)
    .filter(
      ([, entry]) => entry.delivered > 0 || entry.returned > 0,
    )
    .map(([productId, entry]) => ({
      productId,
      deliveredQuantity: entry.delivered,
      returnedQuantity: entry.returned,
    }));

  const canSubmit = !!draft.branchId && items.length > 0 && (!editingDeliveryId || editReady);
  const isEditing = !!editingDeliveryId;
  const pending = createDelivery.isPending || updateDelivery.isPending;

  const canAdvance =
    (phase === 1 && !!draft.branchId) || (phase === 2 && items.length > 0);

  const finishWithReceipt = (summary: ReceiptSummary) => {
    const current = useReceiptDraftStore.getState();
    // An older completion must not erase a different draft entered elsewhere.
    if (current.entries === draft.entries && current.branchId === draft.branchId
      && current.date === draft.date && current.paymentAmount === draft.paymentAmount
      && current.editingDeliveryId === draft.editingDeliveryId) {
      current.rememberLast();
      current.reset();
    }
    setRecovered(false);
    setReceipt(summary);
    setPhase(1);
  };

  const handleSubmit = () => {
    if (!draft.branchId || items.length === 0) return;
    if (editingDeliveryId && (!editReady || useReceiptDraftStore.getState().prefilledDeliveryId !== editingDeliveryId)) return;

    if (isEditing && editingDeliveryId) {
      updateDelivery.mutate(
        { deliveryId: editingDeliveryId, items, date: draft.date },
        { onSuccess: finishWithReceipt },
      );
      return;
    }

    createDelivery.mutate(
      {
        branchId: draft.branchId,
        items,
        paymentAmount: draft.paymentAmount,
        paymentType: 'field_collection',
        date: draft.date,
      },
      { onSuccess: finishWithReceipt },
    );
  };

  const cancelEdit = () => {
    if (pending) return;
    draft.setEditingDeliveryId(null);
    draft.clear();
    setPhase(1);
  };

  const recoveredReceipt = (summary: ReceiptSummary) => {
    setReceipt(summary);
    setRecovered(true);
    setPhase(1);
  };
  const recoveryActions = <VStack space="sm">
    <FinancialRecoveryAction visible={createDelivery.hasPendingOperation || createDelivery.requiresRecovery} busy={pending}
      label="Önceki teslimatı kontrol et" recover={() => createDelivery.recover({ onSuccess: recoveredReceipt })} />
    <FinancialRecoveryAction visible={updateDelivery.hasPendingOperation || updateDelivery.requiresRecovery} busy={pending}
      label="Önceki düzenlemeyi kontrol et" recover={() => updateDelivery.recover({ onSuccess: recoveredReceipt })} />
  </VStack>;

  if (isEditing && !editReady && !receipt) {
    const failed = editingDelivery.isError || editingBranch.isError
      || (editingDelivery.isSuccess && !editingDelivery.data)
      || (editingBranch.isSuccess && !editingBranch.data);
    return (
      <Box style={{ flex: 1 }} className="bg-background p-4">
        {recoveryActions}
        {failed ? <ErrorState message="Düzenlenecek kayıt yüklenemedi." onRetry={() => {
          void editingDelivery.refetch();
          if (editingDelivery.data?.id === editingDeliveryId && editingDelivery.data.branchId) void editingBranch.refetch();
        }} /> : <Spinner label="Düzenlenecek kayıt yükleniyor…" />}
        <Button variant="outline" onPress={cancelEdit}><ButtonText>İptal</ButtonText></Button>
      </Box>
    );
  }

  if (receipt) {
    return (
      <ResultState
        title={recovered ? 'Önceki Kayıt Doğrulandı' : 'Kayıt Tamamlandı'}
        subtitle={recovered ? 'Önceki işlem tamamlandı. Taslağınız korunmuştur.' : 'Teslimat başarıyla kaydedildi.'}
        action={
          <Button
            variant="outline"
            size="lg"
            onPress={() => {
              setReceipt(null);
              setPhase(1);
            }}
          >
              <ButtonText>{recovered ? 'Taslağa Dön' : 'Yeni Kayıt'}</ButtonText>
          </Button>
        }
      >
        <VStack space="xs" className="w-full rounded-xl border border-border bg-card p-4">
          <HStack className="items-center justify-between">
            <Text size="sm" className="text-muted-foreground">
              {receipt.branchName}
            </Text>
            <Text size="sm" className="text-muted-foreground">
              {receipt.date}
            </Text>
          </HStack>
          <HStack className="items-center justify-between">
            <Text size="sm" className="text-muted-foreground">
              Tahsilat
            </Text>
            <Amount size="sm" value={receipt.paymentAmount} tone="muted" />
          </HStack>
          <HStack className="items-center justify-between">
            <Text size="sm" className="text-muted-foreground">
              İşlem Sonrası Bakiye
            </Text>
            <BalanceAmount value={receipt.newBalance} size="sm" bold showLabel />
          </HStack>
        </VStack>
      </ResultState>
    );
  }

  return (
    <Box style={{ flex: 1 }} className="bg-background p-4">
      <VStack space="sm" style={{ flex: 1 }}>
        {recoveryActions}
        {isEditing ? (
          <HStack className="items-center justify-between rounded-lg bg-info px-4 py-2">
            <HStack space="sm" className="items-center">
              <Icon as={EditIcon} size="sm" className="text-info-foreground" />
              <Text size="sm" bold className="text-info-foreground">
                Kayıt Düzenleniyor
              </Text>
              {editingDelivery.data?.date ? (
                <Text size="sm" className="text-info-foreground">
                  · {formatDateForDisplay(editingDelivery.data.date)}
                </Text>
              ) : null}
            </HStack>
            <Button variant="ghost" size="sm" onPress={cancelEdit}>
              <ButtonText className="text-info-foreground">İptal</ButtonText>
            </Button>
          </HStack>
        ) : null}

        <ProgressBar steps={3} current={phase - 1} />
        <Text size="sm" className="text-muted-foreground">
          {PHASES[phase - 1]}
        </Text>

        <Box style={{ flex: 1 }}>
          {phase === 1 ? (
            <Box style={{ flex: 1 }} className="items-center justify-center">
              <VStack space="lg" style={{ width: 480 }}>
                <BranchSelector
                  value={{
                    cityId: draft.cityId,
                    districtId: draft.districtId,
                    branchId: draft.branchId,
                  }}
                  onChange={draft.applyPath}
                />
                <DateField
                  label="Tarih"
                  value={draft.date}
                  onChange={(next) => {
                    if (next) draft.setDate(next);
                  }}
                />
              </VStack>
            </Box>
          ) : phase === 2 ? (
            <Box style={{ flex: 1 }}>
              <HStack className="mb-3 items-center justify-end">
                <Amount size="lg" bold value={preview.requiredAmount} />
              </HStack>

              <Box style={{ flex: 1 }} onLayout={handleGridLayout}>
                {branchProducts.isLoading ? (
                  <Spinner label="Ürünler yükleniyor…" />
                ) : branchProducts.isError ? (
                  <ErrorState
                    message="Ürünler yüklenemedi."
                    onRetry={() => branchProducts.refetch()}
                  />
                ) : products.length === 0 ? (
                  <EmptyState
                    title="Ürün bulunamadı"
                    subtitle="Bu şubeye ait aktif fiyatlı ürün yok."
                  />
                ) : (
                  <ReceiptProductGrid products={products} columns={columns} cardWidth={cardWidth} />
                )}
              </Box>
            </Box>
          ) : (
            <ScrollView>
              <VStack space="lg">
                <PaymentReceivedInput
                  value={draft.paymentAmount}
                  onChange={draft.setPaymentAmount}
                />

                <CheckoutSummary
                  branchName={branchName}
                  preview={preview}
                  paymentAmount={draft.paymentAmount}
                  loadingBalance={branchBalance.isLoading}
                />

                {createDelivery.isError || updateDelivery.isError ? (
                  <Text size="sm" className="text-destructive">
                    {getUserMessage(isEditing ? updateDelivery.error : createDelivery.error)}
                  </Text>
                ) : null}
              </VStack>
            </ScrollView>
          )}
        </Box>

        <HStack className="items-center justify-between">
          <Button
            variant="outline"
            disabled={phase === 1 || pending}
            onPress={() => setPhase((p) => (p - 1) as 1 | 2 | 3)}
          >
            <ButtonText>Geri</ButtonText>
          </Button>

          {phase < 3 ? (
            <Button
              disabled={!canAdvance}
              onPress={() => setPhase((p) => (p + 1) as 1 | 2 | 3)}
            >
              <ButtonText>İleri</ButtonText>
            </Button>
          ) : (
            <MutationButton
              size="lg"
              disabled={!canSubmit || pending}
              onPress={handleSubmit}
            >
              <ButtonText>
                {pending ? 'Kaydediliyor…' : isEditing ? 'Güncelle' : 'Kaydet'}
              </ButtonText>
            </MutationButton>
          )}
        </HStack>
      </VStack>
    </Box>
  );
}
