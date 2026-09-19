import { Image } from 'expo-image';

import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { ArchiveIcon, Icon, EditIcon, PackageIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { formatCurrency } from '@/utils/formatters';

type BranchProductCardProps = {
  name: string;
  imageUrl: string | null;
  price: number;
  isActive: boolean;
  // Optional general card action used by the catalog screen. Branch Hub does
  // not provide this, so its card body remains inert.
  onPress?: () => void;
  // Dedicated destructive action for deactivating the product at this branch.
  onDeactivatePress?: () => void;
  // Tap on the pen icon — typically opens the price-edit sheet.
  onEditPress?: () => void;
  className?: string;
  priceLabel?: string;
  archived?: boolean;
  archiveLabel?: string;
  onArchivePress?: () => void;
};

// Visual sibling of src/components/domain/product-card.tsx but with a price
// row + pen icon below the image instead of a quantity stepper. Used by the
// Ürünler & Fiyatlar tab.
//
// Tap zones:
//   - archive icon, top-left → onDeactivatePress
//   - pen icon               → onEditPress (open price-edit sheet)
export function BranchProductCard({
  name,
  imageUrl,
  price,
  isActive,
  onPress,
  onDeactivatePress,
  onEditPress,
  className,
  priceLabel,
  archived = false,
  archiveLabel,
  onArchivePress,
}: BranchProductCardProps) {
  const enabled = isActive;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      className={`w-full overflow-hidden rounded-xl border border-border bg-card ${
        enabled ? '' : 'opacity-40'
      } ${className ?? ''}`}
    >
      <Box className="relative">
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            contentFit="cover"
            transition={200}
            style={{ width: '100%', height: 96 }}
          />
        ) : (
          <Box className="h-24 items-center justify-center bg-muted">
            <Icon as={PackageIcon} size="xl" className="text-muted-foreground" />
          </Box>
        )}
        {onDeactivatePress ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onDeactivatePress();
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`${name} ürününü şubede pasife al`}
            className="absolute left-2 top-2 items-center justify-center rounded-md bg-card p-1.5"
          >
            <Icon as={ArchiveIcon} size="sm" className="text-destructive" />
          </Pressable>
        ) : null}
      </Box>

      <VStack space="sm" className="p-3">
        <HStack className="items-center justify-between">
          <Text size="sm" bold numberOfLines={1} className="flex-1 text-foreground">
            {name}
          </Text>
          {archived ? (
            <Text size="xs" bold className="text-muted-foreground">
              Arşivlenmiş
            </Text>
          ) : null}
        </HStack>

        {priceLabel ? <Text size="xs" className="text-muted-foreground">{priceLabel}</Text> : null}

        <Box style={{ height: 28 }}>
          <HStack className="h-full items-center justify-between">
            <Text size="sm" bold className="text-foreground">{formatCurrency(price)}</Text>
            {onEditPress ? (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                  onEditPress();
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Fiyatı düzenle"
                className="items-center justify-center rounded-md p-1"
              >
                <Icon as={EditIcon} size="sm" className="text-primary" />
              </Pressable>
            ) : null}
          </HStack>
        </Box>
        {onArchivePress && archiveLabel ? (
          <Pressable
            onPress={(e) => {
              e.stopPropagation();
              onArchivePress();
            }}
            accessibilityRole="button"
            accessibilityLabel={`${name} ürününü ${archiveLabel.toLocaleLowerCase('tr-TR')}`}
            className="items-center rounded-md bg-muted py-1.5"
          >
            <Text size="xs" bold className={archived ? 'text-primary' : 'text-destructive'}>
              {archiveLabel}
            </Text>
          </Pressable>
        ) : null}
      </VStack>
    </Pressable>
  );
}

// Slim variant for products that are not yet activated for this branch.
// Shows the product image + name with an "+ Aktifleştir" CTA on the right.
// Tapping the card opens the activation sheet. Whole card is dimmed
// (matches the delivery flow's disabled state for unavailable products).
type InactiveBranchProductCardProps = {
  name: string;
  imageUrl: string | null;
  onPress: () => void;
  className?: string;
};

export function InactiveBranchProductCard({
  name,
  imageUrl,
  onPress,
  className,
}: InactiveBranchProductCardProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} ürününü aktifleştir`}
      className={`w-full overflow-hidden rounded-xl border border-border bg-card opacity-40 ${
        className ?? ''
      }`}
    >
      <Box className="relative">
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            contentFit="cover"
            transition={200}
            style={{ width: '100%', height: 96 }}
          />
        ) : (
          <Box className="h-24 items-center justify-center bg-muted">
            <Icon as={PackageIcon} size="xl" className="text-muted-foreground" />
          </Box>
        )}
      </Box>

      <VStack space="sm" className="p-3">
        <Text size="sm" bold numberOfLines={1} className="text-foreground">
          {name}
        </Text>
        <Box className="h-7 items-center justify-center rounded-md bg-accent">
          <Text size="xs" bold className="text-accent-foreground">
            + Aktifleştir
          </Text>
        </Box>
      </VStack>
    </Pressable>
  );
}
