/**
 * ExportSheet — shared right drawer for all PDF exports (Summary, Şubeler,
 * Şube Detay). Renders one of four stages driven by a `ReportExportState`:
 *
 *   idle     → optional `configSlot` (Branch Hub period picker)
 *   fetching / rendering → spinner + step indicator
 *   ready    → native receipt (metadata + contents + Paylaş / Kaydet)
 *   error    → stage-specific message + Tekrar Dene / Kapat
 *
 * Native receipt only — no WebView preview. Critical fill regions use inline
 * `style={{ flex: 1 }}` (NativeWind v5 flex caveat per AGENTS.md).
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { CheckIcon, CloseIcon, Icon, MailIcon, ShareIcon } from '@/components/ui/icon';
import { HStack } from '@/components/ui/hstack';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import type { ReportExportState } from '@/hooks/useReportExport';
import { EmailReportSheet } from './EmailReportSheet';

type ExportSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  state: ReportExportState;
  reportLabel: string;
  /** Bullet list shown in the ready receipt ("İçindekiler"). */
  contents?: readonly string[];
  /** Rendered in the idle stage (period configuration). */
  configSlot?: ReactNode;
  onShare: () => void;
  /** Returns a completed report to its filter/configuration step. */
  onReturnToFilters: () => void;
  onRetry: () => void;
  reportType: 'summary' | 'branches' | 'branch-detail';
};

const PANEL_WIDTH = 440;
const ANIM_DURATION = 220;

export function ExportSheet({
  isOpen,
  onClose,
  state,
  reportLabel,
  contents,
  configSlot,
  onShare,
  onReturnToFilters,
  onRetry,
  reportType,
}: ExportSheetProps) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const width = Math.min(PANEL_WIDTH, Math.round(windowWidth * 0.92));
  const [translateX] = useState(() => new Animated.Value(width));

  useEffect(() => {
    if (isOpen) {
      translateX.setValue(width);
      Animated.timing(translateX, {
        toValue: 0,
        duration: ANIM_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    }
  }, [isOpen, translateX, width]);

  const title =
    state.status === 'fetching'
      ? 'Veriler hazırlanıyor'
      : state.status === 'rendering'
        ? 'PDF oluşturuluyor'
        : state.status === 'error'
          ? 'Rapor oluşturulamadı'
          : state.status === 'ready'
            ? 'PDF hazır'
            : reportLabel;

  return (
    <Modal
      transparent
      visible={isOpen}
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Paneli kapat"
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', paddingTop: insets.top }}
        />
        <Animated.View
          accessibilityViewIsModal
          style={{
            width,
            backgroundColor: '#FFFFFF',
            borderLeftWidth: 1,
            borderLeftColor: '#F0EADE',
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + 16,
            transform: [{ translateX }],
          }}
        >
          <View style={{ flex: 1 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingBottom: 12,
                borderBottomWidth: 1,
                borderBottomColor: '#F0EADE',
              }}
            >
              <Text size="md" bold className="text-foreground">
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={`${reportLabel} panelini kapat`}
                hitSlop={8}
                style={{ padding: 4 }}
              >
                <Icon as={CloseIcon} size="md" className="text-muted-foreground" />
              </Pressable>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
            >
              <StageBody
                state={state}
                reportLabel={reportLabel}
                contents={contents}
                configSlot={configSlot}
                onShare={onShare}
                onReturnToFilters={onReturnToFilters}
                onRetry={onRetry}
                reportType={reportType}
              />
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function StageBody({
  state,
  reportLabel,
  contents,
  configSlot,
  onShare,
  onReturnToFilters,
  onRetry,
  reportType,
}: {
  state: ReportExportState;
  reportLabel: string;
  contents?: readonly string[];
  configSlot?: ReactNode;
  onShare: () => void;
  onReturnToFilters: () => void;
  onRetry: () => void;
  reportType: 'summary' | 'branches' | 'branch-detail';
}) {
  if (state.status === 'idle') {
    return configSlot ? <>{configSlot}</> : null;
  }

  if (state.status === 'fetching' || state.status === 'rendering') {
    const step = state.status === 'fetching' ? '1 / 2' : '2 / 2';
    const label =
      state.status === 'fetching'
        ? 'Rapor verileri alınıyor'
        : 'PDF oluşturuluyor';
    return (
      <VStack space="md" className="items-center px-4 py-10">
        <Spinner />
        <Text size="sm" className="text-foreground" style={{ textAlign: 'center' }}>
          {label}
        </Text>
        <Text size="xs" className="text-muted-foreground" style={{ textAlign: 'center' }}>
          {`Adım ${step}`}
        </Text>
        <Text
          size="xs"
          className="text-muted-foreground"
          style={{ textAlign: 'center' }}
          accessibilityLiveRegion="polite"
        >
          Bu işlem birkaç saniye sürebilir.
        </Text>
      </VStack>
    );
  }

  if (state.status === 'error') {
    return (
      <VStack space="md" className="px-2 py-4">
        <Text size="sm" bold className="text-destructive">
          {reportLabel} oluşturulamadı
        </Text>
        <Text size="xs" className="text-muted-foreground">
          {state.message || 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.'}
        </Text>
        <Button variant="default" size="default" onPress={onRetry}>
          <ButtonText>Tekrar Dene</ButtonText>
        </Button>
      </VStack>
    );
  }

  // ready
  return (
    <ReadyBody
      state={state}
      reportLabel={reportLabel}
      contents={contents}
      onShare={onShare}
      onReturnToFilters={onReturnToFilters}
      reportType={reportType}
    />
  );
}

function ReadyBody({
  state,
  reportLabel,
  contents,
  onShare,
  onReturnToFilters,
  reportType,
}: {
  state: Extract<ReportExportState, { status: 'ready' }>;
  reportLabel: string;
  contents?: readonly string[];
  onShare: () => void;
  onReturnToFilters: () => void;
  reportType: 'summary' | 'branches' | 'branch-detail';
}) {
  const [emailOpen, setEmailOpen] = useState(false);
  return (
    <VStack space="md">
      <VStack space="xs" className="items-center py-2">
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: '#006093',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon as={CheckIcon} size="lg" className="text-info-foreground" />
        </View>
        <Text size="md" bold className="text-foreground">
          PDF hazır
        </Text>
        <Text size="xs" className="text-muted-foreground" style={{ textAlign: 'center' }}>
          {`${state.contextLabel ?? 'Rapor'} · ${state.pageCount ?? 0} Sayfa`}
        </Text>
      </VStack>

      {contents && contents.length > 0 ? (
        <VStack space="xs" className="rounded-xl border border-border bg-card p-4">
          <Text size="xs" bold className="text-muted-foreground">
            İçindekiler
          </Text>
          {contents.map((item) => (
            <Text key={item} size="xs" className="text-foreground">
              {`· ${item}`}
            </Text>
          ))}
        </VStack>
      ) : null}

      {state.shareError ? (
        <Text size="xs" className="text-destructive">
          {state.shareError}
        </Text>
      ) : null}

      <HStack space="sm" className="w-full">
        <Button
          variant="default"
          size="lg"
          className="px-3"
          style={{ flex: 1 }}
          onPress={onShare}
          disabled={state.shareBusy}
          accessibilityState={{ busy: state.shareBusy }}
        >
          {state.shareBusy ? <ButtonSpinner /> : <ButtonIcon as={ShareIcon} />}
          <ButtonText numberOfLines={1}>Paylaş / Kaydet</ButtonText>
        </Button>
        <Button variant="default" size="lg" className="px-3" style={{ flex: 1 }} onPress={() => setEmailOpen(true)}>
          <ButtonIcon as={MailIcon} />
          <ButtonText numberOfLines={1}>E-posta ile gönder</ButtonText>
        </Button>
      </HStack>

      <Button variant="outline" size="default" onPress={onReturnToFilters} className="w-full">
        <ButtonText className="w-full text-center" numberOfLines={1}>
          Yeniden Oluştur
        </ButtonText>
      </Button>
      {emailOpen ? <EmailReportSheet
        open
        onClose={() => setEmailOpen(false)}
        state={state}
        reportType={reportType}
        reportLabel={reportLabel}
      /> : null}
    </VStack>
  );
}
