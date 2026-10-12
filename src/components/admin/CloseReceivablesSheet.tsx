import { useRef, useState } from 'react';
import { ScrollView } from 'react-native';

import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { HStack } from '@/components/ui/hstack';
import { Sheet } from '@/components/ui/sheet';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useCloseReceivables } from '@/hooks/useCloseReceivables';
import type { PaymentType } from '@/types';
import { getIstanbulToday } from '@/utils/dates';
import { formatBalanceAmount } from '@/utils/formatters';
import { getReceivablesTotal, type ReceivableBranch } from '@/utils/receivables';

const OPTIONS: DropdownOption<PaymentType>[] = [
  { value: 'field_collection', label: 'Nakit' },
  { value: 'bank_transfer', label: 'Havale' },
];
const amountFormatter = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type CloseReceivablesSheetProps = {
  branches: ReceivableBranch[];
  skippedCount: number;
  onClose: () => void;
  onSuccess: () => void;
};

export function CloseReceivablesSheet({ branches, skippedCount, onClose, onSuccess }: CloseReceivablesSheetProps) {
  const [paymentType, setPaymentType] = useState<PaymentType>('field_collection');
  const payment = useCloseReceivables();
  const submitting = useRef(false);
  const close = () => {
    if (!payment.isPending && !submitting.current) onClose();
  };
  const submit = () => {
    if (!branches.length || payment.isPending || submitting.current) return;
    submitting.current = true;
    payment.mutate({
      branches: branches.map(branch => ({ branchId: branch.branchId, expectedAmount: branch.amount })),
      paymentType,
      date: getIstanbulToday(),
    }, { onSuccess, onSettled: () => { submitting.current = false; } });
  };

  return (
    <Sheet open title="Emin misiniz?" onClose={close}>
      <Box style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
          {branches.map(branch => (
            <HStack key={branch.branchId} space="md" className="items-center justify-between">
              <Text size="sm" style={{ flex: 1 }} className="text-muted-foreground">{branch.name}</Text>
              <Text size="sm" className="text-muted-foreground">{formatBalanceAmount(branch.amount)}</Text>
            </HStack>
          ))}
          {skippedCount > 0 ? <Text size="xs" className="text-muted-foreground">Alacağı olmayan {skippedCount} şube atlanacak.</Text> : null}
        </ScrollView>
        <VStack space="md" className="p-4">
          <VStack space="sm">
            <Text size="sm" className="text-muted-foreground">Ödeme Tipi</Text>
            <Dropdown value={paymentType} onChange={setPaymentType} options={OPTIONS} disabled={payment.isPending} />
          </VStack>
          {payment.isError ? <Text size="sm" className="text-destructive">{payment.error?.message ?? 'Ödemeler kaydedilemedi. Tekrar deneyin.'}</Text> : null}
          <Text size="sm" bold className="text-foreground">Toplam {amountFormatter.format(getReceivablesTotal(branches))} ₺ alınacak.</Text>
          <Button className="bg-info" disabled={!branches.length || payment.isPending} onPress={submit}>
            <ButtonText className="text-info-foreground">{payment.isPending ? 'Kaydediliyor…' : 'Alacak Kapat'}</ButtonText>
          </Button>
          <Button variant="outline" disabled={payment.isPending} onPress={close}>
            <ButtonText>Vazgeç</ButtonText>
          </Button>
        </VStack>
      </Box>
    </Sheet>
  );
}
