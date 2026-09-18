import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, usePathname } from 'expo-router';
import type { Href } from 'expo-router';

import { Box } from '@/components/ui/box';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { HStack } from '@/components/ui/hstack';
import { NetworkBanner } from '@/components/ui/network-banner';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { pruneReportCache } from '@/utils/pdf/render';
import {
  Icon,
  BarChart3Icon,
  ChevronDownIcon,
  ListIcon,
  PackageIcon,
  SettingsIcon,
  StoreIcon,
  UserIcon,
} from '@/components/ui/icon';
import { useSignOut } from '@/hooks/useSignOut';
import { useAuthStore } from '@/store';
import { formatDateForDisplay, getIstanbulToday } from '@/utils/dates';

// Tab order after the admin overhaul:
//   1. Özet            → /summary
//   2. Şubeler         → /branches  (flat, filterable, sortable table)
//   3. Ürünler         → /products   (placeholder)
//   4. Şehirler & İlçe → /cities     (drill-down router)
//   5. Ayarlar         → /settings   (includes a Kayıtlar stub for now)
// Kayıtlar (formerly /records) is reachable via the Ayarlar stub tile.
const NAV_ITEMS: { href: Href; label: string; icon: React.ElementType }[] = [
  { href: '/summary', label: 'Özet', icon: BarChart3Icon },
  { href: '/branches', label: 'Şubeler', icon: StoreIcon },
  { href: '/products', label: 'Ürünler', icon: PackageIcon },
  { href: '/cities', label: 'Şehirler & İlçe', icon: ListIcon },
  { href: '/settings', label: 'Ayarlar', icon: SettingsIcon },
];

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

type AdminShellProps = {
  children: ReactNode;
};

export function AdminShell({ children }: AdminShellProps) {
  const user = useAuthStore((s) => s.user);
  const signOut = useSignOut();
  const pathname = usePathname();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Best-effort cleanup of stale generated PDF reports on app shell mount.
  useEffect(() => {
    void pruneReportCache(['ozet-', 'subeler-', 'sube-detay-']);
  }, []);

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background">
      <Box style={{ flex: 1 }} className="flex-col">
        <HStack className="items-center justify-between border-b border-border bg-background px-6 py-4">
          <HStack space="md" className="items-center">
            <Image
              source={require('../../../assets/images/iznik-firin-logo.jpg')}
              accessibilityLabel="Tarihi İznik Fırını logosu"
              resizeMode="contain"
              style={{ height: 36, width: 36 }}
            />
            <VStack space="xs">
              <Text size="lg" bold className="text-foreground">
                Yönetim Paneli
              </Text>
              <Text size="xs" className="text-muted-foreground">
                Tarihi İznik Fırını
              </Text>
            </VStack>
          </HStack>

          <HStack space="md" className="items-center">
            <Text size="xs" className="text-muted-foreground">
              {formatDateForDisplay(getIstanbulToday())}
            </Text>
            <Pressable
              onPress={() => setConfirmOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Hesap menüsünü aç"
              accessibilityHint="Çıkış seçeneğini açar"
              hitSlop={8}
              className="rounded-full border border-border bg-card p-1"
            >
              <HStack space="xs" className="items-center">
                <Box className="h-8 w-8 items-center justify-center rounded-full bg-accent">
                  {user?.fullName ? (
                    <Text size="xs" bold className="text-accent-foreground">
                      {initials(user.fullName)}
                    </Text>
                  ) : (
                    <Icon as={UserIcon} size="sm" className="text-muted-foreground" />
                  )}
                </Box>
                <Icon as={ChevronDownIcon} size="2xs" className="mr-1 text-muted-foreground" />
              </HStack>
            </Pressable>
          </HStack>
        </HStack>

        <NetworkBanner />

        <Box style={{ flex: 1 }} className="bg-background">
          {children}
        </Box>

        <HStack className="border-t border-border bg-card px-2 py-1 flex-shrink-0">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link key={item.label} href={item.href} asChild>
                <Pressable
                  className={`flex-1 items-center justify-center gap-0.5 rounded-xl px-2 py-1 ${
                    active ? 'bg-primary' : 'bg-transparent'
                  }`}
                >
                  <Icon
                    as={item.icon}
                    size="lg"
                    className={
                      active
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground'
                    }
                  />
                  <Text
                    size="xs"
                    bold={active}
                    className={
                      active
                        ? 'text-primary-foreground'
                        : 'text-muted-foreground'
                    }
                  >
                    {item.label}
                  </Text>
                </Pressable>
              </Link>
            );
          })}
        </HStack>
      </Box>

      <ConfirmDialog
        open={confirmOpen}
        title="Çıkış Yap"
        message="Çıkış yapmak istediğinize emin misiniz?"
        confirmLabel="Çıkış Yap"
        destructive
        onConfirm={() => {
          setConfirmOpen(false);
          signOut.mutate();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </SafeAreaView>
  );
}
