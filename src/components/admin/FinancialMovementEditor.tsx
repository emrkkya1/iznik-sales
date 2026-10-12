import { useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button, ButtonText } from '@/components/ui/button';
import { DateField } from '@/components/ui/date-field';
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { QueryError } from '@/components/ui/query-error';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useChangeFinancialMovement, useCurrentFinancialMovement } from '@/hooks/useFinancialMovements';
import { useBranchProducts } from '@/hooks/useProducts';
import type { CurrentFinancialMovement, FinancialEvent } from '@/services/supabase/financialMovementSchema';
import type { PaymentType } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { parseMovementNumber } from '@/utils/financialMovements';
import { FinancialSnapshotDetails } from './FinancialMovementDetailSheet';

const PAYMENT_OPTIONS: DropdownOption<PaymentType>[] = [
  { value: 'field_collection', label: 'Nakit' }, { value: 'bank_transfer', label: 'Havale' },
];

type Props = { event: FinancialEvent; action: 'edit' | 'delete'; onClose: () => void; onSaved?: () => void };
export function FinancialMovementEditor(props: Props) {
  const current = useCurrentFinancialMovement(props.event.kind, props.event.recordId);
  if (current.isLoading) return <BottomSheet open title="Hareket yükleniyor" onClose={props.onClose}><Spinner /></BottomSheet>;
  if (current.isError || !current.data) return <BottomSheet open title="Hareket yüklenemedi" onClose={props.onClose}><QueryError onRetry={() => current.refetch()} /></BottomSheet>;
  // Freeze the fetched version for this editor. Background invalidation must
  // never replace a dirty form or defeat optimistic concurrency checking.
  return <LoadedEditor {...props} initial={current.data} />;
}

function LoadedEditor({ event, action, onClose, onSaved, initial }: Props & { initial: CurrentFinancialMovement }) {
  const [base] = useState(initial);
  const [date, setDate] = useState<string | null>(base.snapshot.date);
  const [amount, setAmount] = useState(String(base.snapshot.amount));
  const [paymentType, setPaymentType] = useState<PaymentType>(base.snapshot.paymentType ?? 'field_collection');
  const [reason, setReason] = useState('');
  const [items, setItems] = useState(base.snapshot.items.map(item => ({ ...item, delivered: String(item.deliveredQuantity), returned: String(item.returnedQuantity) })));
  const [payments, setPayments] = useState(base.snapshot.payments.length ? base.snapshot.payments.map(payment => ({ id: payment.id as string | null, amount: String(payment.amount), paymentType: payment.paymentType })) : [{ id: null as string | null, amount: '0', paymentType: 'field_collection' as PaymentType }]);
  const [product, setProduct] = useState<string | null>(null);
  const mutation = useChangeFinancialMovement();
  const submitting = useRef(false);
  const products = useBranchProducts(event.kind === 'delivery' && action === 'edit' ? event.branchId : null, date ?? base.snapshot.date);
  const hasNewProducts = items.some(item => !base.snapshot.items.some(original => original.productId === item.productId));
  const invalid = !date || (event.kind === 'payment' ? parseMovementNumber(amount) === null || Number(amount.replace(',', '.')) <= 0
    : !items.length || items.some(item => parseMovementNumber(item.delivered) === null || parseMovementNumber(item.returned) === null)
      || payments.some(payment => parseMovementNumber(payment.amount) === null)
      || (hasNewProducts && (products.isFetching || products.isError)));
  const close = () => { if (!submitting.current && !mutation.isPending) onClose(); };
  const submit = () => {
    if (submitting.current || mutation.isPending || (action === 'edit' ? invalid : !reason.trim())) return;
    submitting.current = true;
    const patch = action === 'delete' ? { reason: reason.trim() } : event.kind === 'payment'
      ? { date: date!, amount: parseMovementNumber(amount)!, paymentType }
      : { date: date!, items: items.map(item => ({ product_id: item.productId, delivered_quantity: parseMovementNumber(item.delivered)!, returned_quantity: parseMovementNumber(item.returned)! })),
        payments: payments.map(payment => ({ id: payment.id, amount: parseMovementNumber(payment.amount)!, paymentType: payment.paymentType })) };
    mutation.mutate({ kind: event.kind, id: event.recordId, action, version: base.version, patch }, {
      onSuccess: result => {
        onClose();
        if (result.changed) onSaved?.();
      },
      onSettled: () => { submitting.current = false; },
    });
  };
  const busy = mutation.isPending;
  const productOptions = (products.data ?? []).filter(entry => !items.some(item => item.productId === entry.productId)).map(entry => ({ value: entry.productId, label: `${entry.productName} · ${formatCurrency(entry.currentPrice)}` }));
  return (
    <BottomSheet open title={action === 'delete' ? 'Hareketi sil' : 'Hareketi düzenle'} onClose={close} maxHeight={720}>
      <VStack space="lg">
        <Text size="lg" bold>{event.branchName}</Text>
        <Text size="sm" className="text-muted-foreground">{event.action !== 'create' ? 'Kaydın güncel hali üzerinde işlem yapıyorsunuz. Geçmiş hareket değiştirilmeyecek.' : 'Bu işlem ayrıca yeni bir geçmiş hareketi oluşturacak.'}</Text>
        {action === 'delete' ? <>
          <FinancialSnapshotDetails snapshot={base.snapshot} />
          <Text size="sm" className="text-destructive">{event.kind === 'delivery' ? 'Teslimat ve bağlı tahsilatları silinecek. Şube bakiyesi ve ürün toplamları yeniden hesaplanacak.' : 'Tahsilat silinecek ve şube bakiyesi yeniden hesaplanacak.'} Bu kayıt geçmişte görünmeye devam edecek.</Text>
          <Text size="sm" bold>Silme nedeni</Text>
          <Input><InputField value={reason} onChangeText={setReason} editable={!busy} maxLength={1000} accessibilityLabel="Silme nedeni" placeholder="Neden siliniyor?" /></Input>
        </> : <>
          <Text size="sm" bold>İşlem tarihi</Text>
          <DateField value={date} onChange={setDate} disabled={busy} />
          {event.kind === 'payment' ? <>
            <Text size="sm" bold>Miktar (₺)</Text>
            <Input><InputField value={amount} onChangeText={setAmount} editable={!busy} keyboardType="decimal-pad" accessibilityLabel="Tahsilat miktarı" /></Input>
            <Dropdown value={paymentType} onChange={setPaymentType} options={PAYMENT_OPTIONS} disabled={busy} />
          </> : <>
            <Text size="sm" className="text-muted-foreground">Mevcut ürünlerin kayıtlı birim fiyatları korunur. Yeni ürünler seçilen tarihin fiyatıyla eklenir.</Text>
            {items.map((item, index) => <VStack key={item.productId} space="sm" className="rounded-xl border border-border p-3">
              <HStack className="items-center justify-between">
                <Text bold size="sm" style={{ flex: 1 }}>{item.productName} · {formatCurrency(base.snapshot.items.some(original => original.productId === item.productId) ? item.unitPrice : products.data?.find(entry => entry.productId === item.productId)?.currentPrice ?? item.unitPrice)}</Text>
                <Button size="sm" variant="outline" disabled={busy || items.length === 1} onPress={() => setItems(current => current.filter((_, i) => i !== index))}><ButtonText>Ürünü kaldır</ButtonText></Button>
              </HStack>
              <HStack space="md">
                <VStack space="xs" style={{ flex: 1 }}><Text size="xs">Teslim</Text><Input><InputField value={item.delivered} onChangeText={value => setItems(current => current.map((line, i) => i === index ? { ...line, delivered: value } : line))} editable={!busy} keyboardType="decimal-pad" accessibilityLabel={`${item.productName} teslim miktarı`} /></Input></VStack>
                <VStack space="xs" style={{ flex: 1 }}><Text size="xs">İade</Text><Input><InputField value={item.returned} onChangeText={value => setItems(current => current.map((line, i) => i === index ? { ...line, returned: value } : line))} editable={!busy} keyboardType="decimal-pad" accessibilityLabel={`${item.productName} iade miktarı`} /></Input></VStack>
              </HStack>
            </VStack>)}
            <HStack space="md" className="items-center">
              <VStack style={{ flex: 1 }}><Dropdown value={product} onChange={setProduct} options={productOptions} placeholder="Eklenecek ürün" disabled={busy} loading={products.isLoading} /></VStack>
              <Button variant="outline" disabled={busy || !product} onPress={() => {
                const entry = products.data?.find(value => value.productId === product);
                if (entry) setItems(current => [...current, { productId: entry.productId, productName: entry.productName, deliveredQuantity: 0, returnedQuantity: 0, unitPrice: entry.currentPrice, delivered: '0', returned: '0' }]);
                setProduct(null);
              }}><ButtonText>Ürün ekle</ButtonText></Button>
            </HStack>
            {products.isError ? <Text size="sm" className="text-destructive">Ürünler yüklenemedi. Mevcut ürünleri düzenleyebilirsiniz.</Text> : null}
            <Text size="sm" bold>Bağlı tahsilatlar</Text>
            <Text size="xs" className="text-muted-foreground">Bir tahsilatı kaldırmak için miktarını 0 yapın.</Text>
            {payments.map((payment, index) => <HStack key={payment.id ?? 'new'} space="md" className="items-center">
              <Input style={{ flex: 1 }}><InputField value={payment.amount} onChangeText={value => setPayments(current => current.map((line, i) => i === index ? { ...line, amount: value } : line))} keyboardType="decimal-pad" editable={!busy} accessibilityLabel={`Bağlı tahsilat ${index + 1}`} /></Input>
              <VStack style={{ flex: 1 }}><Dropdown value={payment.paymentType} options={PAYMENT_OPTIONS} disabled={busy} onChange={value => setPayments(current => current.map((line, i) => i === index ? { ...line, paymentType: value } : line))} /></VStack>
            </HStack>)}
          </>}
          {invalid ? <Text size="sm" className="text-destructive">Tarih ve miktarları kontrol edin. Miktarlar negatif olamaz ve en fazla iki ondalık basamak içerebilir.</Text> : null}
        </>}
        {mutation.isError ? <Text size="sm" className="text-destructive">{mutation.error?.message ?? 'İşlem kaydedilemedi.'}</Text> : null}
        <HStack space="md">
          <Button style={{ flex: 1 }} variant="outline" disabled={busy} onPress={close}><ButtonText>Vazgeç</ButtonText></Button>
          <Button style={{ flex: 1 }} className={action === 'delete' ? 'bg-destructive' : 'bg-primary'} disabled={busy || (action === 'delete' ? !reason.trim() : invalid)} onPress={submit}><ButtonText>{busy ? 'Kaydediliyor…' : action === 'delete' ? 'Sil' : 'Kaydet'}</ButtonText></Button>
        </HStack>
      </VStack>
    </BottomSheet>
  );
}
