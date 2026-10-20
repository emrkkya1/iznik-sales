import { memo, useCallback } from 'react';
import { FlatList } from 'react-native';
import { Box } from '@/components/ui/box';
import { useReceiptDraftStore, type DraftEntry } from '@/store/receiptDraft';
import type { BranchProductWithPrice } from '@/types';
import { ProductCard } from './product-card';

const EMPTY_ENTRY: DraftEntry = { delivered: 0, returned: 0 };
export const PRODUCT_GRID_GAP = 12;
export const PRODUCT_GRID_PADDING = 16;

const DraftProductCell = memo(function DraftProductCell({ product, width }: { product: BranchProductWithPrice; width: number }) {
  const entry = useReceiptDraftStore(s => s.entries[product.productId] ?? EMPTY_ENTRY);
  const setDelivered = useReceiptDraftStore(s => s.setDelivered);
  const setReturned = useReceiptDraftStore(s => s.setReturned);
  const onDeliveredChange = useCallback((quantity: number) => setDelivered(product.productId, quantity), [product.productId, setDelivered]);
  const onReturnedChange = useCallback((quantity: number) => setReturned(product.productId, quantity), [product.productId, setReturned]);
  return (
    <Box style={{ width }}>
      <ProductCard name={product.productName} imageUrl={product.productImageUrl}
        price={product.currentPrice} delivered={entry.delivered} returned={entry.returned}
        onDeliveredChange={onDeliveredChange} onReturnedChange={onReturnedChange} />
    </Box>
  );
});

// The parent may subscribe to totals/the entire draft; cells subscribe only to
// their own entry. Keep the viewport virtualized as catalogs grow.
export const ReceiptProductGrid = memo(function ReceiptProductGrid({ products, columns, cardWidth }: {
  products: BranchProductWithPrice[]; columns: number; cardWidth: number;
}) {
  const renderItem = useCallback(({ item }: { item: BranchProductWithPrice }) => (
    <DraftProductCell product={item} width={cardWidth} />
  ), [cardWidth]);
  return (
    <FlatList
      key={columns}
      style={{ flex: 1 }}
      data={products}
      numColumns={columns}
      keyExtractor={product => product.productId}
      renderItem={renderItem}
      columnWrapperStyle={columns > 1 ? { gap: PRODUCT_GRID_GAP, marginBottom: PRODUCT_GRID_GAP } : undefined}
      contentContainerStyle={{ padding: PRODUCT_GRID_PADDING }}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={columns * 3}
      maxToRenderPerBatch={columns * 2}
      windowSize={5}
    />
  );
});
