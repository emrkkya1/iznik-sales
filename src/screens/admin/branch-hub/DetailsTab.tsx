import type { ReactNode } from 'react';

import { BalanceAmount } from '@/components/ui/balance-amount';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useBranchHubSummary } from '@/hooks';
import { formatDateForDisplay } from '@/utils/dates';
import { formatCount } from '@/utils/formatCount';
import { formatBalanceAmount, getBalanceLabel } from '@/utils/formatters';
import { formatRelativeDate } from '@/utils/formatRelativeDate';

type DetailsTabProps = {
  branchId: string;
};

type RowProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'info' | 'destructive' | 'muted';
};

function Row({ label, value, hint, tone = 'muted' }: RowProps) {
  const hintClass =
    tone === 'info'
      ? 'text-info'
      : tone === 'destructive'
        ? 'text-destructive'
        : 'text-muted-foreground';
  return (
    <Box className="border-b border-border py-3">
      <HStack className="items-center justify-between">
        <Text size="sm" className="text-muted-foreground">
          {label}
        </Text>
        <Text size="sm" bold className="text-foreground">
          {value}
        </Text>
      </HStack>
      {hint ? (
        <Text size="xs" className={`mt-1 ${hintClass}`}>
          {hint}
        </Text>
      ) : null}
    </Box>
  );
}

function formatReturnRate(rate: number | null): string {
  if (rate === null) return 'Veri yok';
  return `%${rate.toFixed(1).replace(/\.0$/, '')}`;
}

function formatBalanceCell(value: number | null): ReactNode {
  if (value === null) return '—';
  const label = getBalanceLabel(value);
  return (
    <HStack space="xs" className="items-baseline">
      <Text size="sm" bold className="text-foreground">
        {formatBalanceAmount(value)}
      </Text>
      {label ? (
        <Text size="xs" className="text-muted-foreground">
          {label}
        </Text>
      ) : null}
    </HStack>
  );
}

function formatDeltaCell(delta: number): ReactNode {
  // Canonical: positive delta = Alacak (sales > payments), negative =
  // Borç. Show abs amount + label, never a signed number.
  const label = getBalanceLabel(delta);
  return (
    <HStack space="xs" className="items-baseline">
      <Text size="sm" bold className="text-foreground">
        {formatBalanceAmount(delta)}
      </Text>
      {label ? (
        <Text size="xs" className="text-muted-foreground">
          {label}
        </Text>
      ) : null}
    </HStack>
  );
}

// Read-only metadata panel. Cards above already surface the headline
// numbers (bakiye, return rate, delivered/returned, last movement) so
// here we focus on long-form context: location, opening history, audit
// log count, and a balance breakdown (açılış → current) so the admin can
// see how the bakiye was derived without leaving the screen.
export function DetailsTab({ branchId }: DetailsTabProps) {
  const summary = useBranchHubSummary(branchId);

  if (summary.isLoading || !summary.data) {
    return <Spinner label="Yükleniyor…" />;
  }

  const d = summary.data;
  const delta =
    typeof d.currentBalance === 'number' && typeof d.openingBalance === 'number'
      ? d.currentBalance - d.openingBalance
      : null;

  const deltaTone: RowProps['tone'] =
    delta === null
      ? 'muted'
      : delta > 0
        ? 'info'
        : delta < 0
          ? 'destructive'
          : 'muted';

  return (
    <Box className="m-6 rounded-2xl border border-border bg-card p-4">
      <VStack space="xs">
        <Text size="md" bold className="pb-2 text-foreground">
          Şube Bilgileri
        </Text>
        <Row label="Şehir / İlçe" value={`${d.cityName} / ${d.districtName}`} />
        <Row
          label="Açılış Bakiyesi"
          value={formatBalanceCell(d.openingBalance)}
          hint="Şubenin başlangıç bakiyesi; sonradan yapılan açılış düzeltmelerini içerir."
        />
        <Row
          label="Açılış Tarihi"
          value={formatDateForDisplay(d.branchCreatedAt)}
        />
        <Row
          label="Aktif Ürün"
          value={`${formatCount(d.activeProductCount)} / ${formatCount(d.totalProductCount)}`}
          hint="Ürünün şubede aktif / toplam katalog"
        />
        <Row
          label="Son İşlem"
          value={formatRelativeDate(d.lastMovementDate)}
          hint={
            d.lastMovementDate
              ? formatDateForDisplay(d.lastMovementDate)
              : undefined
          }
        />
        <Row label="Denetim Kaydı Sayısı" value={formatCount(d.auditCount)} />

        <Text size="md" bold className="pb-2 pt-4 text-foreground">
          Hareket Özeti
        </Text>
        <Row
          label="Verilen Ürün"
          value={`${formatCount(d.deliveredQty)} adet`}
          hint="Tüm zamanlar"
        />
        <Row
          label="Alınan Ürün"
          value={`${formatCount(d.returnedQty)} adet`}
          hint="Tüm zamanlar"
        />
        <Row
          label="İade Oranı"
          value={formatReturnRate(d.returnRate)}
          hint={
            d.returnRate === null
              ? 'Hiç teslimat kaydı yok'
              : `${formatCount(d.returnedQty)} / ${formatCount(d.deliveredQty)}`
          }
        />

        <Text size="md" bold className="pb-2 pt-4 text-foreground">
          Bakiye Kırılımı
        </Text>
        <Row label="Açılış" value={formatBalanceCell(d.openingBalance)} />
        <Row
          label="Net Değişim"
          value={delta === null ? '—' : formatDeltaCell(delta)}
          tone={deltaTone}
          hint="Satışlar − Tahsilatlar"
        />
        <Row
          label="Güncel Bakiye"
          value={
            <BalanceAmount value={d.currentBalance ?? 0} size="sm" bold />
          }
          hint="Açılış + Net Değişim"
        />
      </VStack>
    </Box>
  );
}
