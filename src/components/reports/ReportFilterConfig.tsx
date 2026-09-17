import { useMemo, useState } from 'react';
import { Modal, Pressable as NativePressable, ScrollView, View } from 'react-native';

import { ProductCard } from '@/components/domain/product-card';
import { Button, ButtonIcon, ButtonText } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { DayOfWeekPicker } from '@/components/ui/day-of-week-picker';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { HStack } from '@/components/ui/hstack';
import { CloseIcon, FilterIcon, Icon } from '@/components/ui/icon';
import { Input, InputField } from '@/components/ui/input';
import { Pressable } from '@/components/ui/pressable';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useCities, useDistricts, useProducts } from '@/hooks';
import type { DayOfWeek, Product } from '@/types';
import { getIstanbulToday } from '@/utils/dates';

export type ReportFilters = {
  dateFrom: string | null;
  dateTo: string | null;
  daysOfWeek: DayOfWeek[] | null;
  productIds: string[] | null;
  search?: string;
  cityId?: string;
  districtId?: string;
};

type Preset = '30d' | '90d' | 'custom';

function presetRange(preset: Exclude<Preset, 'custom'>, today: string) {
  const [year, month, day] = today.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day - (preset === '30d' ? 29 : 89)));
  return { dateFrom: start.toISOString().slice(0, 10), dateTo: today };
}

type ReportFilterConfigProps = {
  includeProducts?: boolean;
  includeBranches?: boolean;
  onCreate: (filters: ReportFilters) => void;
};

export function ReportFilterConfig({
  includeProducts = false,
  includeBranches = false,
  onCreate,
}: ReportFilterConfigProps) {
  const today = getIstanbulToday();
  const [preset, setPreset] = useState<Preset>('30d');
  const [customFrom, setCustomFrom] = useState<string | null>(null);
  const [customTo, setCustomTo] = useState<string | null>(null);
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>([]);
  const [productIds, setProductIds] = useState<string[] | null>(null);
  const [productsOpen, setProductsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [cityId, setCityId] = useState<string | undefined>();
  const [districtId, setDistrictId] = useState<string | undefined>();

  const { dateFrom, dateTo } = useMemo(() => {
    if (preset === 'custom') return { dateFrom: customFrom, dateTo: customTo };
    return presetRange(preset, today);
  }, [customFrom, customTo, preset, today]);
  const dateError = !!dateFrom && !!dateTo && dateFrom > dateTo
    ? 'Başlangıç tarihi bitişten sonra olamaz.'
    : !!dateTo && dateTo > today
      ? 'Bitiş tarihi gelecekte olamaz.'
      : null;

  const cities = useCities();
  const districts = useDistricts(cityId ?? null);
  const cityOptions: DropdownOption<string>[] = (cities.data ?? []).map((city) => ({ value: city.id, label: city.name }));
  const districtOptions: DropdownOption<string>[] = (districts.data ?? []).map((district) => ({ value: district.id, label: district.name }));

  return (
    <VStack space="lg">
      {includeBranches ? (
        <VStack space="sm">
          <Text size="sm" bold className="text-foreground">Şube Filtreleme</Text>
          <Input className="bg-card"><InputField value={search} onChangeText={setSearch} placeholder="Şube adı" accessibilityLabel="Şube adı filtresi" /></Input>
          <Dropdown value={cityId ?? null} onChange={(value) => { setCityId(value); setDistrictId(undefined); }} options={cityOptions} placeholder="İl seçin" emptyLabel="İl bulunamadı" loading={cities.isLoading} />
          <Dropdown value={districtId ?? null} onChange={setDistrictId} options={districtOptions} placeholder={cityId ? 'İlçe seçin' : 'Önce il seçin'} emptyLabel="İlçe bulunamadı" loading={districts.isLoading} disabled={!cityId} />
        </VStack>
      ) : null}

      <VStack space="sm">
        <Text size="sm" bold className="text-foreground">Dönem</Text>
        <HStack space="xs">
          {(['30d', '90d', 'custom'] as const).map((key) => (
            <Pressable
              key={key}
              onPress={() => setPreset(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: preset === key }}
              className={`rounded-full border border-border px-3 py-1.5 ${preset === key ? 'bg-primary' : 'bg-muted'}`}
            >
              <Text size="xs" bold={preset === key} className={preset === key ? 'text-primary-foreground' : 'text-foreground'}>
                {key === '30d' ? 'Son 30 Gün' : key === '90d' ? 'Son 90 Gün' : 'Özel Aralık'}
              </Text>
            </Pressable>
          ))}
        </HStack>
        {preset === 'custom' ? (
          <HStack space="sm">
            <View style={{ flex: 1 }}><DateField label="Başlangıç" value={customFrom} onChange={setCustomFrom} placeholder="Tarih seçin" /></View>
            <View style={{ flex: 1 }}><DateField label="Bitiş" value={customTo} onChange={setCustomTo} placeholder="Tarih seçin" /></View>
          </HStack>
        ) : null}
        {dateError ? <Text size="xs" className="text-destructive">{dateError}</Text> : null}
      </VStack>

      <VStack space="xs">
        <Text size="sm" bold className="text-foreground">Haftanın Günleri</Text>
        <DayOfWeekPicker value={daysOfWeek} onChange={setDaysOfWeek} />
      </VStack>

      {includeProducts ? (
        <VStack space="xs">
          <Text size="sm" bold className="text-foreground">Ürün Filtreleme</Text>
          <Button variant="outline" size="default" onPress={() => setProductsOpen(true)}>
            <ButtonIcon as={FilterIcon} />
            <ButtonText>{productIds ? `${productIds.length} ürün seçili` : 'Tüm ürünler seçili'}</ButtonText>
          </Button>
        </VStack>
      ) : null}

      <Button
        variant="default"
        size="default"
        disabled={!!dateError}
        onPress={() => onCreate({
          dateFrom,
          dateTo,
          daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : null,
          productIds,
          search: search.trim() || undefined,
          cityId,
          districtId,
        })}
      >
        <ButtonText>PDF Rapor Oluştur</ButtonText>
      </Button>

      {includeProducts && productsOpen ? <ProductFilterSidebar onClose={() => setProductsOpen(false)} selectedIds={productIds} onChange={setProductIds} /> : null}
    </VStack>
  );
}

function ProductFilterSidebar({ onClose, selectedIds, onChange }: { onClose: () => void; selectedIds: string[] | null; onChange: (ids: string[] | null) => void }) {
  const products = useProducts();
  const activeProducts = useMemo(
    () => (products.data ?? []).filter((product) => product.isActive),
    [products.data],
  );
  const activeProductIds = useMemo(
    () => activeProducts.map((product) => product.id),
    [activeProducts],
  );
  const [draft, setDraft] = useState<string[] | null>(selectedIds);
  const selected = draft ?? activeProductIds;

  const toggle = (id: string) => setDraft((current) => {
    const currentIds = current ?? activeProductIds;
    return currentIds.includes(id)
      ? currentIds.filter((currentId) => currentId !== id)
      : [...currentIds, id];
  });
  const apply = () => {
    onChange(selected.length === 0 || selected.length === activeProducts.length ? null : selected);
    onClose();
  };

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
        <NativePressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }} onPress={onClose} />
        <View style={{ width: 400, maxWidth: '92%', backgroundColor: '#FFFFFF', padding: 16 }}>
          <HStack className="items-center justify-between border-b border-border pb-3">
            <Text size="md" bold className="text-foreground">Ürün Filtreleme</Text>
            <Pressable onPress={onClose} accessibilityLabel="Ürün filtresini kapat"><Icon as={CloseIcon} className="text-muted-foreground" /></Pressable>
          </HStack>
          {products.isLoading ? <Spinner label="Ürünler yükleniyor" /> : (
            <ScrollView contentContainerStyle={{ paddingVertical: 12, gap: 8 }}>
              {activeProducts.map((product) => <ProductFilterCard key={product.id} product={product} selected={selected.includes(product.id)} onPress={() => toggle(product.id)} />)}
            </ScrollView>
          )}
          <Button size="default" onPress={apply}><ButtonText>Uygula</ButtonText></Button>
        </View>
      </View>
    </Modal>
  );
}

function ProductFilterCard({ product, selected, onPress }: { product: Product; selected: boolean; onPress: () => void }) {
  return (
    <ProductCard
      mode="selection"
      name={product.name}
      imageUrl={product.imageUrl}
      selected={selected}
      onSelectedChange={() => onPress()}
      delivered={0}
      returned={0}
      price={0}
      onDeliveredChange={() => undefined}
      onReturnedChange={() => undefined}
    />
  );
}
