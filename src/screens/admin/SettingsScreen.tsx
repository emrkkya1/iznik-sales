import { useRouter } from 'expo-router';

import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { ChevronRightIcon, Icon, ListIcon, MailIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { ScrollView } from '@/components/ui/scroll-view';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';

function SettingsTile({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ElementType;
  title: string;
  subtitle: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="rounded-2xl border border-border bg-card p-4 active:opacity-70"
    >
      <HStack space="md" className="items-center">
        <Box className="h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Icon as={icon} size="md" className="text-primary" />
        </Box>
        <VStack space="xs" style={{ flex: 1 }}>
          <Text size="md" bold className="text-foreground">
            {title}
          </Text>
          <Text size="xs" className="text-muted-foreground">
            {subtitle}
          </Text>
        </VStack>
        <Icon as={ChevronRightIcon} size="md" className="text-muted-foreground" />
      </HStack>
    </Pressable>
  );
}

// Settings hub. Currently a placeholder — Kayıtlar lives here as a stub
// tile (deep links to /records, which is intentionally removed from the
// bottom nav while the dedicated Kayıtlar screen is scoped to a later
// milestone). The Profile / Kullanıcılar / Açılış Bakiyesi sections
// land here in PR-7.x.
export function SettingsScreen() {
  const router = useRouter();

  return (
    <Box style={{ flex: 1 }} className="bg-background">
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
      <VStack space="md">
        <VStack space="xs">
          <Text size="xl" bold className="text-foreground">
            Ayarlar
          </Text>
          <Text size="sm" className="text-muted-foreground">
            Profil ve şube ayarlarını burada yönetebilirsiniz.
          </Text>
        </VStack>

        <VStack space="sm">
          <SettingsTile
            icon={ListIcon}
            title="Kayıtlar"
            subtitle="Tüm teslimat kayıtları ve geçmiş düzeltmeleri"
            onPress={() => router.push('/records')}
          />
          <SettingsTile
            icon={MailIcon}
            title="E-posta Raporları"
            subtitle="Zamanlanmış PDF raporları ve alıcılar"
            onPress={() => router.push('/email-reports')}
          />
        </VStack>
      </VStack>
      </ScrollView>
    </Box>
  );
}
