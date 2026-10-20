import { useRef, useState } from 'react';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button, ButtonText } from '@/components/ui/button';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useRecordManualPayment } from '@/hooks/useMutations';
import type { PaymentType } from '@/types';
import { getIstanbulToday } from '@/utils/dates';
import { parsePaymentAmount } from '@/utils/parsePaymentAmount';
import { FinancialRecoveryAction } from '@/components/domain/financial-recovery-action';
import { getUserMessage } from '@/utils/errors';

const PAYMENT_OPTIONS: DropdownOption<PaymentType>[] = [
  { value: 'field_collection', label: 'Nakit' },
  { value: 'bank_transfer', label: 'Havale' },
];

type ManualPaymentSheetProps = {
  branchId: string;
  onClose: () => void;
};

// Mounted only while open: each new collection starts with an empty amount.
export function ManualPaymentSheet({ branchId, onClose }: ManualPaymentSheetProps) {
  const [amountText, setAmountText] = useState('');
  const [paymentType, setPaymentType] = useState<PaymentType>('field_collection');
  const submittingRef = useRef(false);
  const payment = useRecordManualPayment();
  const amount = parsePaymentAmount(amountText);
  const invalidAmount = amountText.trim() !== '' && amount === null;
  const close = () => {
    if (!submittingRef.current && !payment.isPending) onClose();
  };
  const submit = () => {
    if (amount === null || submittingRef.current || payment.isPending) return;
    // Synchronous guard covers a second tap before React renders pending state.
    submittingRef.current = true;
    payment.mutate({ branchId, amount, paymentType, date: getIstanbulToday() }, {
      onSuccess: onClose,
      onSettled: () => { submittingRef.current = false; },
    });
  };

  return (
    <BottomSheet open title="Ödeme Al" onClose={close} maxHeight={460}>
      <VStack space="lg">
        <FinancialRecoveryAction visible={payment.hasPendingOperation || payment.requiresRecovery} busy={payment.isPending}
          label="Önceki tahsilatı kontrol et" recover={() => payment.recover({ onSuccess: onClose })} />
        <VStack space="sm">
          <Text size="sm" bold className="text-foreground">Miktar (₺)</Text>
          <Input className="bg-card" isInvalid={invalidAmount}>
            <InputField
              value={amountText}
              onChangeText={(value) => {
                setAmountText(value);
                if (payment.isError) payment.reset();
              }}
              keyboardType="decimal-pad"
              placeholder="0,00"
              accessibilityLabel="Miktar"
              editable={!payment.isPending}
              returnKeyType="done"
              onSubmitEditing={submit}
            />
          </Input>
          {invalidAmount ? <Text size="sm" className="text-destructive">Sıfırdan büyük, en fazla iki ondalık basamaklı bir miktar girin.</Text> : null}
        </VStack>
        <VStack space="sm">
          <Text size="sm" bold className="text-foreground">Ödeme Tipi</Text>
          <Dropdown
            value={paymentType}
            onChange={(value) => {
              setPaymentType(value);
              if (payment.isError) payment.reset();
            }}
            options={PAYMENT_OPTIONS}
            disabled={payment.isPending}
          />
        </VStack>
        {payment.isError ? (
          <Text size="sm" className="text-destructive">{getUserMessage(payment.error)}</Text>
        ) : null}
        <HStack space="md">
          <Button variant="outline" disabled={payment.isPending} onPress={close} style={{ flex: 1 }}>
            <ButtonText>Vazgeç</ButtonText>
          </Button>
          <Button disabled={amount === null || payment.isPending} onPress={submit} style={{ flex: 1 }}>
            <ButtonText>{payment.isPending ? 'Kaydediliyor…' : 'Ödeme Al'}</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </BottomSheet>
  );
}
