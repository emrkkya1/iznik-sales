import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';

import { useReportRecipients, useSendReportEmail } from '@/hooks';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Box } from '@/components/ui/box';
import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { CheckIcon, Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import type { ReportExportState } from '@/hooks/useReportExport';

type Props = {
  open: boolean;
  onClose: () => void;
  state: Extract<ReportExportState, { status: 'ready' }>;
  reportType: 'summary' | 'branches' | 'branch-detail';
  reportLabel: string;
};

export function EmailReportSheet({ open, onClose, state, reportType, reportLabel }: Props) {
  const recipientsQuery = useReportRecipients();
  const send = useSendReportEmail();
  const recipients = useMemo(
    () => recipientsQuery.data?.filter((recipient) => recipient.isEnabled) ?? [],
    [recipientsQuery.data],
  );
  const [sendAll, setSendAll] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  const selectedIds = useMemo(
    () => sendAll ? recipients.map((recipient) => recipient.id) : selected,
    [recipients, selected, sendAll],
  );
  const toggle = (id: string) => {
    if (sendAll) return;
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };
  const submit = () => {
    if (!selectedIds.length) return;
    send.mutate({ uri: state.uri, fileName: state.fileName, reportType, reportLabel, recipientIds: selectedIds }, {
      onSuccess: () => onClose(),
    });
  };

  return (
    <BottomSheet open={open} title="Raporu e-posta ile gönder" onClose={onClose} maxHeight={620}>
      <VStack space="md">
        <Text size="sm" className="text-muted-foreground">
          Rapor, seçtiğiniz kayıtlı alıcılara PDF eki olarak gönderilir.
        </Text>
        <Pressable onPress={() => {
          if (sendAll) setSelected(recipients.map((recipient) => recipient.id));
          setSendAll((value) => !value);
        }} accessibilityRole="checkbox" accessibilityState={{ checked: sendAll }}>
          <HStack space="sm" className="items-center border-b border-border py-3">
            <Box className={sendAll ? 'h-5 w-5 items-center justify-center rounded-md bg-primary' : 'h-5 w-5 items-center justify-center rounded-md border border-border bg-background'}>
              {sendAll ? <Icon as={CheckIcon} size="2xs" className="text-primary-foreground" /> : null}
            </Box>
            <VStack space="xs" style={{ flex: 1 }}>
              <Text size="sm" bold className="text-foreground">Bütün alıcılara gönder</Text>
              <Text size="xs" className="text-muted-foreground">{`${recipients.length} etkin alıcı seçili`}</Text>
            </VStack>
          </HStack>
        </Pressable>
        <VStack space="xs" className="border-b border-border px-1 py-2">
          <Text size="xs" bold className={sendAll ? 'px-2 text-muted-foreground/70' : 'px-2 text-muted-foreground'}>ALICILAR</Text>
          {recipientsQuery.isLoading ? <Text size="sm" className="text-muted-foreground">Alıcılar yükleniyor…</Text> : null}
          {!recipientsQuery.isLoading && recipients.length === 0 ? <Text size="sm" className="text-muted-foreground">Ayarlar’dan önce bir alıcı ekleyin.</Text> : null}
          {recipients.map((recipient) => {
            const checked = selectedIds.includes(recipient.id);
            return (
              <Pressable key={recipient.id} disabled={sendAll} onPress={() => toggle(recipient.id)} accessibilityRole="checkbox" accessibilityState={{ checked, disabled: sendAll }}>
                <HStack space="sm" className="items-center border-t border-border px-2 py-3">
                  <Box className={sendAll
                    ? 'h-5 w-5 items-center justify-center rounded-md border border-border bg-muted'
                    : checked
                      ? 'h-5 w-5 items-center justify-center rounded-md bg-primary'
                      : 'h-5 w-5 items-center justify-center rounded-md border border-border bg-background'}>
                    {checked ? <Icon as={CheckIcon} size="2xs" className={sendAll ? 'text-muted-foreground' : 'text-primary-foreground'} /> : null}
                  </Box>
                  <Text size="sm" className={sendAll ? 'text-muted-foreground/70' : 'text-foreground'}>{recipient.email}</Text>
                </HStack>
              </Pressable>
            );
          })}
        </VStack>
        {send.error ? <Text size="xs" className="text-destructive">{send.error instanceof Error ? send.error.message : 'E-posta gönderilemedi.'}</Text> : null}
        <Button size="lg" onPress={submit} disabled={!selectedIds.length || send.isPending}>
          {send.isPending ? <ButtonSpinner /> : null}
          <ButtonText>{send.isPending ? 'Gönderiliyor…' : 'Gönder'}</ButtonText>
        </Button>
      </VStack>
    </BottomSheet>
  );
}
