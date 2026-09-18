import { useState } from 'react';
import { View } from 'react-native';

import { ProductCard } from '@/components/domain/product-card';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Input, InputField } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useCatalogProducts } from '@/hooks';
import type { BranchProductSelection } from '@/types';

type CreateBranchSheetProps = {
  open: boolean;
  districtId: string;
  openingBalancesLocked: boolean;
  isSubmitting: boolean;
  serverError?: string;
  onClose: () => void;
  onSubmit: (input: { name: string; openingBalance: number; products: BranchProductSelection[] }) => Promise<void>;
};

export function CreateBranchSheet({
  open,
  districtId,
  openingBalancesLocked,
  isSubmitting,
  serverError,
  onClose,
  onSubmit,
}: CreateBranchSheetProps) {
  const products = useCatalogProducts();
  const [name, setName] = useState('');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [wasOpen, setWasOpen] = useState(false);

  if (open && !wasOpen && products.data) {
    setWasOpen(true);
    setName('');
    setOpeningBalance('0');
    setSelections(Object.fromEntries(products.data.map((product) => [product.id, product.defaultPrice])));
  }
  if (!open && wasOpen) setWasOpen(false);

  const selectedCount = Object.keys(selections).length;
  const setSelected = (productId: string, selected: boolean, defaultPrice: number) => {
    setSelections((current) => {
      if (selected) return { ...current, [productId]: current[productId] ?? defaultPrice };
      const { [productId]: _removed, ...remaining } = current;
      return remaining;
    });
  };

  const submit = async () => {
    const balance = Number(openingBalance.replace(',', '.'));
    const productsInput = Object.entries(selections).map(([productId, price]) => ({ productId, price }));
    if (!name.trim() || !Number.isFinite(balance) || balance < 0 || productsInput.length === 0 || productsInput.some((product) => product.price < 0)) return;
    await onSubmit({ name: name.trim(), openingBalance: balance, products: productsInput });
  };

  return (
    <BottomSheet open={open} title="Yeni Şube" onClose={onClose} maxHeight={760}>
      <VStack space="lg">
        <VStack space="sm">
          <Text size="sm" bold className="text-foreground">Şube Bilgileri</Text>
          <Input className="bg-card"><InputField value={name} onChangeText={setName} placeholder="Şube adı" accessibilityLabel="Şube adı" /></Input>
          {!openingBalancesLocked ? (
            <Input className="bg-card"><InputField value={openingBalance} onChangeText={setOpeningBalance} placeholder="Açılış bakiyesi" keyboardType="decimal-pad" accessibilityLabel="Açılış bakiyesi" /></Input>
          ) : null}
        </VStack>

        <VStack space="sm">
          <Text size="sm" bold className="text-foreground">Ürünler · {selectedCount} seçili</Text>
          <Text size="xs" className="text-muted-foreground">Yeni şube seçilen ürünleri bu başlangıç fiyatlarıyla alır. Sonradan şubeye özel fiyat verebilirsiniz.</Text>
          {products.isLoading ? <Spinner label="Ürünler yükleniyor" /> : null}
          {products.isError ? <ErrorState title="Ürünler yüklenemedi" message="Şube oluşturmak için ürünler yeniden yüklenmelidir." /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {(products.data ?? []).map((product) => {
              const selected = product.id in selections;
              return (
                <Box key={product.id} style={{ width: '50%', padding: 4 }}>
                  <VStack space="xs">
                    <ProductCard
                      mode="selection"
                      name={product.name}
                      imageUrl={product.imageUrl}
                      selected={selected}
                      onSelectedChange={(value) => setSelected(product.id, value, product.defaultPrice)}
                      delivered={0}
                      returned={0}
                      price={product.defaultPrice}
                      onDeliveredChange={() => undefined}
                      onReturnedChange={() => undefined}
                    />
                    {selected ? (
                      <Input className="bg-card">
                        <InputField
                          value={String(selections[product.id])}
                          onChangeText={(value) => setSelections((current) => ({ ...current, [product.id]: Number(value.replace(',', '.')) }))}
                          keyboardType="decimal-pad"
                          accessibilityLabel={`${product.name} başlangıç fiyatı`}
                        />
                      </Input>
                    ) : null}
                  </VStack>
                </Box>
              );
            })}
          </View>
        </VStack>

        {serverError ? <Text size="sm" className="text-destructive">{serverError}</Text> : null}
        <Button disabled={isSubmitting || !name.trim() || selectedCount === 0 || products.isLoading || products.isError} onPress={() => void submit()}>
          <ButtonText>{isSubmitting ? 'Oluşturuluyor…' : 'Şube Oluştur'}</ButtonText>
        </Button>
      </VStack>
    </BottomSheet>
  );
}
