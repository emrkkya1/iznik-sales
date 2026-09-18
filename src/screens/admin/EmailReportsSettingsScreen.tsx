import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { Button, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { CheckIcon, Icon } from '@/components/ui/icon';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { ScrollView } from '@/components/ui/scroll-view';
import { VStack } from '@/components/ui/vstack';
import { useAddReportRecipient, useRemoveReportRecipient, useReportEmailSettings, useReportRecipients, useSetReportScheduleMode } from '@/hooks';
import type { ReportScheduleMode } from '@/types';

const modes: { value: ReportScheduleMode; title: string; subtitle: string }[] = [
  { value: 'weekly', title: 'Haftalık', subtitle: 'Her pazartesi, önceki hafta' },
  { value: 'monthly', title: 'Aylık', subtitle: 'Her ayın ilk günü, önceki ay' },
  { value: 'disabled', title: 'Devre dışı', subtitle: 'Otomatik rapor gönderilmez' },
];

export function EmailReportsSettingsScreen() {
  const router = useRouter();
  const settings = useReportEmailSettings();
  const recipients = useReportRecipients();
  const add = useAddReportRecipient();
  const remove = useRemoveReportRecipient();
  const setMode = useSetReportScheduleMode();
  const [email, setEmail] = useState('');

  const addEmail = () => {
    const value = email.trim();
    if (!value) return;
    add.mutate(value, { onSuccess: () => setEmail('') });
  };

  return (
    <Box style={{ flex: 1 }} className="bg-background">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
      <VStack space="md">
        <Button variant="ghost" size="sm" onPress={() => router.back()} className="self-start">
          <ButtonText>‹ Ayarlar</ButtonText>
        </Button>
        <VStack space="xs">
          <Text size="xl" bold className="text-foreground">E-posta Raporları</Text>
          <Text size="sm" className="text-muted-foreground">Otomatik PDF raporlarını ve alıcılarını yönetin.</Text>
        </VStack>

        <VStack space="sm" className="border-t border-border pt-5">
          <Text size="sm" bold className="text-foreground">Zamanlanmış Raporlar</Text>
          {modes.map((mode) => {
            const checked = settings.data?.scheduleMode === mode.value;
            return (
              <Pressable key={mode.value} onPress={() => setMode.mutate(mode.value)} accessibilityRole="radio" accessibilityState={{ checked }}>
                <HStack className="items-center justify-between border-b border-border py-3">
                  <VStack space="xs" style={{ flex: 1 }}><Text size="sm" bold className="text-foreground">{mode.title}</Text><Text size="xs" className="text-muted-foreground">{mode.subtitle}</Text></VStack>
                  <Box className={checked ? 'h-5 w-5 items-center justify-center rounded-full border-2 border-primary bg-primary' : 'h-5 w-5 items-center justify-center rounded-full border border-border bg-background'}>
                    {checked ? <Icon as={CheckIcon} size="2xs" className="text-primary-foreground" /> : null}
                  </Box>
                </HStack>
              </Pressable>
            );
          })}
          {setMode.error ? <Text size="xs" className="text-destructive">Ayar kaydedilemedi.</Text> : null}
        </VStack>

        <VStack space="sm" className="border-t border-border pt-5">
          <Text size="sm" bold className="text-foreground">Alıcılar</Text>
          <HStack space="sm" className="items-center">
            <Input className="flex-1"><InputField value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="ornek@firma.com" /></Input>
            <Button size="default" onPress={addEmail} disabled={!email.trim() || add.isPending}>{add.isPending ? <ButtonSpinner /> : null}<ButtonText>Ekle</ButtonText></Button>
          </HStack>
          {add.error ? <Text size="xs" className="text-destructive">Geçerli ve benzersiz bir e-posta girin.</Text> : null}
          {recipients.data?.map((recipient) => (
            <HStack key={recipient.id} className="items-center justify-between border-t border-border py-3">
              <Text size="sm" className="text-foreground">{recipient.email}</Text>
              <Button variant="ghost" size="sm" onPress={() => remove.mutate(recipient.id)} disabled={remove.isPending}><ButtonText>Sil</ButtonText></Button>
            </HStack>
          ))}
          {!recipients.isLoading && recipients.data?.length === 0 ? <Text size="sm" className="text-muted-foreground">Henüz alıcı eklenmedi.</Text> : null}
        </VStack>
      </VStack>
      </ScrollView>
    </Box>
  );
}
