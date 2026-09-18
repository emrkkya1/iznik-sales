import { useMemo, useState } from 'react';
import { ScrollView, type DimensionValue, useWindowDimensions, View } from 'react-native';

import { BranchProductCard } from '@/components/admin/BranchProductCard';
import { FormSheet, type FormField } from '@/components/admin/FormSheet';
import { Box } from '@/components/ui/box';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Input, InputField } from '@/components/ui/input';
import { PlusIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { QueryError } from '@/components/ui/query-error';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import {
  useCatalogProducts,
  useCreateCatalogProduct,
  useSetCatalogProductArchived,
  useSetCatalogProductDefaultPrice,
} from '@/hooks';
import type { CatalogProduct } from '@/types';

type CatalogFilter = 'active' | 'archived' | 'all';

const createFields: FormField[] = [
  { name: 'name', label: 'Ürün Adı', type: 'text', required: true, placeholder: 'Örn. Köy Ekmeği' },
  { name: 'price', label: 'Varsayılan Fiyat', type: 'numeric', required: true, placeholder: '0,00' },
];

export function ProductsScreen() {
  const { width } = useWindowDimensions();
  const products = useCatalogProducts(true);
  const createProduct = useCreateCatalogProduct();
  const setPrice = useSetCatalogProductDefaultPrice();
  const setArchived = useSetCatalogProductArchived();
  const [filter, setFilter] = useState<CatalogFilter>('active');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [priceTarget, setPriceTarget] = useState<CatalogProduct | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CatalogProduct | null>(null);

  const visibleProducts = useMemo(() => (products.data ?? []).filter((product) => {
    if (filter === 'active' && product.isArchived) return false;
    if (filter === 'archived' && !product.isArchived) return false;
    return product.name.toLocaleLowerCase('tr-TR').includes(search.trim().toLocaleLowerCase('tr-TR'));
  }), [filter, products.data, search]);
  const columns = width >= 1100 ? 5 : width >= 800 ? 4 : 2;
  const cardWidth = `${100 / columns}%` as DimensionValue;

  if (products.isLoading) return <Spinner label="Ürünler yükleniyor" />;
  if (products.isError) return <QueryError title="Ürünler yüklenemedi" onRetry={() => products.refetch()} />;

  return (
    <Box style={{ flex: 1 }} className="bg-background">
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        <VStack space="sm">
          <Text size="xl" bold className="text-foreground">Ürünler</Text>
          <Text size="sm" className="text-muted-foreground">
            {visibleProducts.length} ürün gösteriliyor
          </Text>
        </VStack>

        <Input className="bg-card">
          <InputField value={search} onChangeText={setSearch} placeholder="Ürün ara" accessibilityLabel="Ürün ara" />
        </Input>

        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {([['active', 'Aktif'], ['archived', 'Arşivlenmiş'], ['all', 'Tümü']] as const).map(([value, label]) => (
            <Pressable key={value} onPress={() => setFilter(value)} className={`rounded-full border border-border px-3 py-1.5 ${filter === value ? 'bg-primary' : 'bg-muted'}`}>
              <Text size="xs" bold className={filter === value ? 'text-primary-foreground' : 'text-foreground'}>{label}</Text>
            </Pressable>
          ))}
          <Button size="sm" onPress={() => setCreateOpen(true)} className="ml-auto">
            <ButtonIcon as={PlusIcon} />
            <ButtonText>Yeni Ürün</ButtonText>
          </Button>
        </View>

        {visibleProducts.length === 0 ? (
          <ErrorState title="Ürün bulunamadı" message={search ? 'Aramanızı değiştirin veya temizleyin.' : undefined} />
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {visibleProducts.map((product) => (
              <Box key={product.id} style={{ width: cardWidth, padding: 6 }}>
                <BranchProductCard
                  name={product.name}
                  imageUrl={product.imageUrl}
                  price={product.defaultPrice}
                  isActive
                  archived={product.isArchived}
                  priceLabel="Varsayılan fiyat"
                  onPress={() => setPriceTarget(product)}
                  onEditPress={() => setPriceTarget(product)}
                  archiveLabel={product.isArchived ? 'Arşivden çıkar' : 'Arşivle'}
                  onArchivePress={() => setArchiveTarget(product)}
                />
              </Box>
            ))}
          </View>
        )}
      </ScrollView>

      <FormSheet
        open={createOpen}
        title="Yeni Ürün"
        fields={createFields}
        submitLabel="Oluştur"
        onCancel={() => setCreateOpen(false)}
        isSubmitting={createProduct.isPending}
        serverError={createProduct.error?.message}
        onSubmit={async (values) => {
          const price = Number(String(values.price).replace(',', '.'));
          if (!Number.isFinite(price) || price < 0) return;
          await createProduct.mutateAsync({ name: String(values.name).trim(), defaultPrice: price });
          setCreateOpen(false);
        }}
      />

      <FormSheet
        open={!!priceTarget}
        title="Varsayılan Fiyatı Düzenle"
        fields={[{ name: 'price', label: 'Yeni Varsayılan Fiyat', type: 'numeric', required: true, defaultValue: String(priceTarget?.defaultPrice ?? '') }]}
        submitLabel="Kaydet"
        onCancel={() => setPriceTarget(null)}
        isSubmitting={setPrice.isPending}
        serverError={setPrice.error?.message}
        onSubmit={async (values) => {
          if (!priceTarget) return;
          const price = Number(String(values.price).replace(',', '.'));
          if (!Number.isFinite(price) || price < 0) return;
          await setPrice.mutateAsync({ productId: priceTarget.id, defaultPrice: price });
          setPriceTarget(null);
        }}
      />

      <BottomSheet open={!!archiveTarget} title={archiveTarget?.isArchived ? 'Ürün arşivden çıkarılsın mı?' : 'Ürün arşivlensin mi?'} onClose={() => setArchiveTarget(null)}>
        <VStack space="md">
          <Text size="sm" className="text-muted-foreground">
            {archiveTarget?.isArchived
              ? 'Ürün yeni eklenen şubelere yeniden otomatik eklenecektir.'
              : 'Arşivlenen ürün yeni eklenen şubelere otomatik eklenmeyecektir, varolan şubelerden kaldırılmayacaktır.'}
          </Text>
          <Button
            variant={archiveTarget?.isArchived ? 'default' : 'destructive'}
            disabled={setArchived.isPending}
            onPress={async () => {
              if (!archiveTarget) return;
              await setArchived.mutateAsync({ productId: archiveTarget.id, archived: !archiveTarget.isArchived });
              setArchiveTarget(null);
            }}
          >
            <ButtonText>{archiveTarget?.isArchived ? 'Arşivden çıkar' : 'Arşivle'}</ButtonText>
          </Button>
        </VStack>
      </BottomSheet>
    </Box>
  );
}
