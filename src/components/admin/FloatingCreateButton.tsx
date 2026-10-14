import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, ButtonIcon } from '@/components/ui/button';
import { PlusIcon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

type FloatingCreateButtonProps = {
  label: string;
  onPress: () => void;
};

// Floating bottom-right action button (FAB style with icon + label).
//
// Workaround: we pass the label through a plain RN `Text` instead of the
// gluestack `ButtonText`. There's a bug in `@gluestack-ui/core/button`'s
// ButtonText that truncates any label containing the Turkish character
// "Ş" (e.g. "Yeni Şehir" → "+ Yeni "), regardless of button width. Using
// RN's native Text here avoids the buggy wrapper while still inheriting
// the Button's flex layout and icon.
export function FloatingCreateButton({ label, onPress }: FloatingCreateButtonProps) {
  const insets = useSafeAreaInsets();

  return (
    <Button
      onPress={onPress}
      size="default"
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-full shadow-lg"
      style={{
        position: 'absolute',
        bottom: Math.max(insets.bottom, 24),
        right: 24,
      }}
    >
      <ButtonIcon as={PlusIcon} />
      <Text size="sm" bold className="ml-2 text-primary-foreground">
        {label}
      </Text>
    </Button>
  );
}
