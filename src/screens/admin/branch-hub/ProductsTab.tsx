import { useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';

import {
  BranchProductCard,
  InactiveBranchProductCard,
} from '@/components/admin/BranchProductCard';
import { FormSheet, type FormField } from '@/components/admin/FormSheet';
import { Box } from '@/components/ui/box';
import { ErrorState } from '@/components/ui/error-state';
import { QueryError } from '@/components/ui/query-error';
import { Spinner } from '@/components/ui/spinner';
import { getIstanbulToday } from '@/utils/dates';

import {
  useActivateBranchProduct,
  useBranchProductsWithStatus,
  useSetBranchProductActive,
  useSetBranchProductPrice,
} from '@/hooks';
import type { BranchProductWithStatus } from '@/types';

const COLUMN_GAP = 12;
const GRID_PADDING = 16;
const EDIT_PRICE_TITLE = 'Fiyatı Düzenle';

type ProductsTabProps = {
  branchId: string;
};

export function ProductsTab({ branchId }: ProductsTabProps) {
  const products = useBranchProductsWithStatus(branchId);
  const setPrice = useSetBranchProductPrice();
  const setActive = useSetBranchProductActive();
  const activate = useActivateBranchProduct();

  const [gridWidth, setGridWidth] = useState(0);
  const [editTarget, setEditTarget] = useState<{
    branchProductId: string;
    currentPrice: number;
    productName: string;
  } | null>(null);
  const [activateTarget, setActivateTarget] = useState<{
    productId: string;
    productName: string;
    imageUrl: string | null;
  } | null>(null);

  const columns = gridWidth >= 1000 ? 5 : gridWidth >= 700 ? 4 : 3;
  const cardWidth =
    gridWidth > 0
      ? (gridWidth - GRID_PADDING * 2 - COLUMN_GAP * (columns - 1)) / columns
      : 220;

  const handleGridLayout = (e: LayoutChangeEvent) => {
    setGridWidth(e.nativeEvent.layout.width);
  };

  const handleEditPress = (item: BranchProductWithStatus) => {
    if (item.currentPrice === null) return;
    setEditTarget({
      branchProductId: item.branchProductId!,
      currentPrice: item.currentPrice,
      productName: item.productName,
    });
  };

  const handleDeactivate = (item: BranchProductWithStatus) => {
    if (!item.branchProductId) return;
    setActive.mutate({
      branchProductId: item.branchProductId,
      isActive: false,
    });
  };

  const handleActivatePress = (item: BranchProductWithStatus) => {
    setActivateTarget({
      productId: item.productId,
      productName: item.productName,
      imageUrl: item.productImageUrl,
    });
  };

  const editFields: FormField[] = editTarget
    ? [
        {
          name: 'price',
          label: 'Yeni Fiyat',
          type: 'numeric',
          required: true,
          defaultValue: String(editTarget.currentPrice),
        },
      ]
    : [];

  const activateFields: FormField[] = [
    {
      name: 'price',
      label: 'Açılış Fiyatı',
      type: 'numeric',
      required: true,
      placeholder: '0,00',
    },
  ];

  if (products.isLoading) return <Spinner label="Ürünler yükleniyor…" />;
  if (products.isError) {
    return (
      <QueryError
        onRetry={() => products.refetch()}
        title="Ürünler yüklenemedi"
      />
    );
  }

  const items = products.data ?? [];
  if (items.length === 0) {
    return (
      <ErrorState
        title="Katalog boş"
        message="Henüz hiç aktif ürün tanımlı değil."
      />
    );
  }

  return (
    <Box onLayout={handleGridLayout}>
      <Box
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          paddingHorizontal: GRID_PADDING,
          gap: COLUMN_GAP,
        }}
      >
        {items.map((item) => (
          <Box key={item.productId} style={{ width: cardWidth }}>
            {item.isActivatedForBranch ? (
                <BranchProductCard
                name={item.productName}
                imageUrl={item.productImageUrl}
                price={item.currentPrice ?? 0}
                  isActive
                  archived={item.isArchived}
                onPress={() => handleDeactivate(item)}
                onEditPress={() => handleEditPress(item)}
              />
            ) : (
              <InactiveBranchProductCard
                name={item.productName}
                imageUrl={item.productImageUrl}
                onPress={() => handleActivatePress(item)}
              />
            )}
          </Box>
        ))}
      </Box>

      <FormSheet
        open={!!editTarget}
        title={EDIT_PRICE_TITLE}
        fields={editFields}
        onSubmit={async (values) => {
          if (!editTarget) return;
          const price = Number(values.price);
          if (!Number.isFinite(price) || price <= 0) return;
          await setPrice.mutateAsync({
            branchProductId: editTarget.branchProductId,
            price,
            effectiveFrom: getIstanbulToday(),
          });
          setEditTarget(null);
        }}
        onCancel={() => setEditTarget(null)}
        isSubmitting={setPrice.isPending}
        serverError={setPrice.error?.message}
      />

      <FormSheet
        open={!!activateTarget}
        title="Ürünü Aktifleştir"
        fields={activateFields}
        onSubmit={async (values) => {
          if (!activateTarget) return;
          const price = Number(values.price);
          if (!Number.isFinite(price) || price <= 0) return;
          await activate.mutateAsync({
            branchId,
            productId: activateTarget.productId,
            price,
            effectiveFrom: getIstanbulToday(),
          });
          setActivateTarget(null);
        }}
        onCancel={() => setActivateTarget(null)}
        isSubmitting={activate.isPending}
        serverError={activate.error?.message}
      />
    </Box>
  );
}
