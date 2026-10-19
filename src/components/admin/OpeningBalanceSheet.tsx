import { useRef, useState } from 'react';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button, ButtonText } from '@/components/ui/button';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useOpeningBalancesLocked, useUpdateOpeningBalance } from '@/hooks/useAdminLocations';
import { getUserMessage } from '@/utils/errors';
import { formatBalanceAmount, getBalanceLabel } from '@/utils/formatters';
import { parseOpeningBalance } from '@/utils/parseOpeningBalance';

type Direction = 'receivable' | 'payable';
const DIRECTIONS: DropdownOption<Direction>[] = [
  { value: 'receivable', label: 'Alacak — Şube bize borçlu' },
  { value: 'payable', label: 'Borç — Biz şubeye borçluyuz' },
];

type OpeningBalanceSheetProps = {
  branchId: string;
  openingBalance: number;
  onClose: () => void;
};

// Freeze the version the admin started editing, even if the details refetch.
export function OpeningBalanceSheet({ branchId, openingBalance, onClose }: OpeningBalanceSheetProps) {
  const [initialBalance] = useState(openingBalance);
  const [amountText, setAmountText] = useState(Math.abs(initialBalance).toFixed(2).replace('.', ','));
  const [direction, setDirection] = useState<Direction>(initialBalance < 0 ? 'payable' : 'receivable');
  const submitting = useRef(false);
  const lock = useOpeningBalancesLocked();
  const update = useUpdateOpeningBalance();
  const amount = parseOpeningBalance(amountText);
  const newBalance = amount === null ? null : direction === 'payable' ? -amount : amount;
  const canSave = lock.data === false && !lock.isError && newBalance !== null && newBalance !== initialBalance && !update.isPending;
  const close = () => {
    if (!submitting.current && !update.isPending) onClose();
  };
  const save = () => {
    if (!canSave || newBalance === null || submitting.current) return;
    submitting.current = true;
    update.mutate({ branchId, openingBalance: newBalance, expectedOpeningBalance: initialBalance }, {
      onSuccess: onClose,
      onSettled: () => { submitting.current = false; },
    });
  };

  return (
    <BottomSheet open title="Açılış Bakiyesini Düzenle" onClose={close} maxHeight={560}>
      <VStack space="lg">
        <Text size="sm" className="text-muted-foreground">
          Mevcut açılış: {formatBalanceAmount(initialBalance)} {getBalanceLabel(initialBalance) ?? ''}
        </Text>
        <Text size="sm" className="text-muted-foreground">
          Bu işlem başlangıç bakiyesini düzeltir. Güncel bakiye aynı fark kadar değişir; satış ve tahsilat kayıtları değişmez.
        </Text>
        {lock.isPending ? <Text size="sm" className="text-muted-foreground">Kilit durumu kontrol ediliyor…</Text> : null}
        {lock.data === true ? <Text size="sm" className="text-destructive">Açılış bakiyeleri kilitli. Değişiklik yapılamaz.</Text> : null}
        {lock.isError ? (
          <VStack space="sm">
            <Text size="sm" className="text-destructive">Kilit durumu yüklenemedi.</Text>
            <Button variant="outline" onPress={() => void lock.refetch()}><ButtonText>Tekrar Dene</ButtonText></Button>
          </VStack>
        ) : null}
        <VStack space="sm">
          <Text size="sm" bold className="text-foreground">Açılış tutarı (₺)</Text>
          <Input className="bg-card" isInvalid={amount === null}>
            <InputField
              value={amountText}
              onChangeText={(value) => { setAmountText(value); if (update.isError) update.reset(); }}
              keyboardType="decimal-pad"
              placeholder="0,00"
              accessibilityLabel="Açılış tutarı"
              editable={lock.data === false && !lock.isError && !update.isPending}
              returnKeyType="done"
              onSubmitEditing={save}
            />
          </Input>
          {amount === null ? <Text size="sm" className="text-destructive">Sıfır veya daha büyük, en fazla iki ondalık basamaklı bir tutar girin.</Text> : null}
        </VStack>
        <VStack space="sm">
          <Text size="sm" bold className="text-foreground">Bakiye yönü</Text>
          <Dropdown
            value={direction}
            options={DIRECTIONS}
            onChange={(value) => { setDirection(value); if (update.isError) update.reset(); }}
            disabled={lock.data !== false || lock.isError || update.isPending}
          />
        </VStack>
        {update.isError ? (
          <Text size="sm" className="text-destructive">
            {update.error instanceof Error ? update.error.message : getUserMessage(update.error)}
          </Text>
        ) : null}
        <HStack space="md">
          <Button variant="outline" disabled={update.isPending} onPress={close} style={{ flex: 1 }}><ButtonText>Vazgeç</ButtonText></Button>
          <Button disabled={!canSave} onPress={save} style={{ flex: 1 }}><ButtonText>{update.isPending ? 'Kaydediliyor…' : 'Kaydet'}</ButtonText></Button>
        </HStack>
      </VStack>
    </BottomSheet>
  );
}
