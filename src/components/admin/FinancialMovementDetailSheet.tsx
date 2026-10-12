import { BottomSheet } from '@/components/ui/bottom-sheet';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import type { FinancialEvent, FinancialSnapshot } from '@/services/supabase/financialMovementSchema';
import { formatDateForDisplay, formatDateTime } from '@/utils/dates';
import { formatCurrency } from '@/utils/formatters';
import { changedFinancialFields, financialActorLabel, financialEventTitle } from '@/utils/financialMovements';

export function FinancialSnapshotDetails({ snapshot, title }: { snapshot: FinancialSnapshot; title?: string }) {
  return (
    <VStack space="md" className="rounded-xl border border-border bg-card p-4">
      <HStack space="md" className="items-center justify-between">
        <VStack space="xs" style={{ flex: 1 }}>
          <Text size="sm" bold className={title === 'Sonra' ? 'text-info' : 'text-muted-foreground'}>{title ?? (snapshot.paymentType ? 'Tahsilat' : 'Teslimat toplamı')}</Text>
          <Text size="xs" className="text-muted-foreground">{formatDateForDisplay(snapshot.date)}{snapshot.paymentType ? ` · ${snapshot.paymentType === 'bank_transfer' ? 'Havale' : 'Nakit'}` : ''}</Text>
        </VStack>
        <Text size="lg" bold>{formatCurrency(snapshot.amount)}</Text>
      </HStack>
      {snapshot.items.map(item => (
        <HStack key={item.productId} space="md" className="items-center justify-between border-t border-border pt-3">
          <VStack space="xs" style={{ flex: 1 }}>
            <Text size="sm" bold>{item.productName}</Text>
            <Text size="xs" className="text-muted-foreground">Teslim: {item.deliveredQuantity} · İade: {item.returnedQuantity} · Birim: {formatCurrency(item.unitPrice)}</Text>
          </VStack>
          <Text size="sm" bold>{formatCurrency((item.deliveredQuantity - item.returnedQuantity) * item.unitPrice)}</Text>
        </HStack>
      ))}
      {snapshot.payments.map(payment => <Text key={payment.id} size="sm" className="text-info">Tahsilat: {formatCurrency(payment.amount)} · {payment.paymentType === 'bank_transfer' ? 'Havale' : 'Nakit'}</Text>)}
      {snapshot.deleted ? <Text size="sm" bold className="text-destructive">Silindi</Text> : null}
    </VStack>
  );
}

export function FinancialMovementDetailSheet({ event, onClose }: { event: FinancialEvent; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const changed = changedFinancialFields(event.before, event.after);
  return (
    <BottomSheet open title={financialEventTitle(event)} onClose={onClose} maxHeight={640} contentPadding={16}>
      <VStack space="md">
        <HStack space="md" className="items-center justify-between">
          <VStack space="xs" style={{ flex: 1 }}>
            <Text size="lg" bold>{event.branchName}</Text>
            <Text size="sm">{financialActorLabel(event)}</Text>
          </VStack>
          <Text size="xs" className="text-muted-foreground">{formatDateTime(event.occurredAt)}</Text>
        </HStack>
        {event.action === 'create' || event.action === 'baseline' ? <Text size="sm" className="text-muted-foreground">Bu hareketin güncel hali gösteriliyor. Düzenlemeler ve silme işlemleri ayrı geçmiş satırlarında yer alır.</Text> : null}
        {event.legacy && event.action !== 'baseline' ? <Text size="sm" className="text-muted-foreground">Bu eski işlem için yalnızca önceki tarih ve tutar saklanmıştır. Ürün detayları ve işlem sonrası durum bilinmiyor.</Text> : null}
        {changed.length ? <Box className="rounded-lg bg-info/10 p-3"><Text size="sm" className="text-info">Değişen alanlar: {changed.join(', ')}</Text></Box> : null}
        {event.reason ? <Box className="rounded-lg bg-destructive/10 p-3"><Text size="sm" className="text-destructive">Silme nedeni: {event.reason}</Text></Box> : null}
        <Box style={{ flexDirection: width >= 768 && event.before && event.after ? 'row' : 'column', gap: 16, alignItems: 'stretch' }}>
          {event.before ? <Box style={width >= 768 && event.after ? { flex: 1 } : undefined}><FinancialSnapshotDetails snapshot={event.before} title="Önce" /></Box> : null}
          {event.after ? <Box style={width >= 768 && event.before ? { flex: 1 } : undefined}><FinancialSnapshotDetails snapshot={event.after} title={event.before ? 'Sonra' : undefined} /></Box> : null}
        </Box>
      </VStack>
    </BottomSheet>
  );
}
import { useWindowDimensions } from 'react-native';
import { Box } from '@/components/ui/box';
