import { useState } from 'react';
import type { ElementType, ReactNode } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, usePathname } from 'expo-router';
import type { Href } from 'expo-router';

import { Box } from '@/components/ui/box';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { HStack } from '@/components/ui/hstack';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { NetworkBanner } from '@/components/ui/network-banner';
import { ChevronDownIcon, Icon, ClockIcon, HomeIcon, UserIcon } from '@/components/ui/icon';
import { useSignOut } from '@/hooks/useSignOut';
import { useAuthStore } from '@/store';
import { formatDateForDisplay, getIstanbulToday } from '@/utils/dates';

const NAV_ITEMS: { href: Href; label: string; icon: ElementType }[] = [
  { href: '/home', label: 'Ana Sayfa', icon: HomeIcon },
  { href: '/history', label: 'Geçmiş', icon: ClockIcon },
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

type StaffShellProps = {
  children: ReactNode;
};

export function StaffShell({ children }: StaffShellProps) {
  const user = useAuthStore((s) => s.user);
  const signOut = useSignOut();
  const pathname = usePathname();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background">
      <Box style={{ flex: 1 }} className="flex-col">
        <HStack className="items-center justify-between border-b border-border bg-background px-4 py-2">
          <HStack space="sm" className="items-center">
            <Box className="h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Text size="sm" bold className="text-primary-foreground">
                İF
              </Text>
            </Box>
            <Text size="sm" bold className="text-foreground">
              Tarihi İznik Fırını
            </Text>
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

        <HStack className="flex-shrink-0 border-t border-border bg-card px-2 py-1">
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
                      active ? 'text-primary-foreground' : 'text-muted-foreground'
                    }
                  />
                  <Text
                    size="xs"
                    bold={active}
                    className={
                      active ? 'text-primary-foreground' : 'text-muted-foreground'
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
