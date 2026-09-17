import { useEffect, useState } from 'react';
import { Animated, View } from 'react-native';
import { Image } from 'expo-image';

import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Icon, CloseIcon, PackageIcon, PlusIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { QuantityStepper } from '@/components/ui/stepper';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { formatCurrency } from '@/utils/formatters';

type ProductCardProps = {
  name: string;
  imageUrl: string | null;
  delivered: number;
  returned: number;
  onDeliveredChange: (quantity: number) => void;
  onReturnedChange: (quantity: number) => void;
  price: number;
  className?: string;
  mode?: 'delivery' | 'selection';
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
};

const CARD_HEIGHT = 188;
const INACTIVE_IMAGE_HEIGHT = 116;
const INACTIVE_CONTENT_HEIGHT = CARD_HEIGHT - INACTIVE_IMAGE_HEIGHT;
const ANIMATION_DURATION = 280;

export function ProductCard({
  name,
  imageUrl,
  delivered,
  returned,
  onDeliveredChange,
  onReturnedChange,
  price,
  className,
  mode = 'delivery',
  selected = false,
  onSelectedChange,
}: ProductCardProps) {
  if (mode === 'selection') {
    return (
      <Pressable
        onPress={() => onSelectedChange?.(!selected)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected }}
        className={`w-full overflow-hidden rounded-xl border ${
          selected ? 'border-primary bg-accent' : 'border-border bg-card'
        } ${className ?? ''}`}
      >
        <HStack space="sm" className="items-center p-3">
          <Box className="h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-muted">
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} contentFit="cover" style={{ width: '100%', height: '100%' }} />
            ) : (
              <Icon as={PackageIcon} size="md" className="text-muted-foreground" />
            )}
          </Box>
          <Text size="sm" bold numberOfLines={1} className="flex-1 text-foreground">
            {name}
          </Text>
          <Text size="xs" bold className={selected ? 'text-primary' : 'text-muted-foreground'}>
            {selected ? 'Dahil' : 'Hariç'}
          </Text>
        </HStack>
      </Pressable>
    );
  }

  const isActive = delivered > 0 || returned > 0;

  const handlePress = () => {
    if (!isActive) onDeliveredChange(1);
  };

  const handleClose = () => {
    onDeliveredChange(0);
    onReturnedChange(0);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isActive}
      className={`w-full overflow-hidden rounded-xl border border-border bg-card ${
        isActive ? '' : 'opacity-90'
      } ${className ?? ''}`}
      style={{ height: CARD_HEIGHT }}
    >
      <CardBody
        isActive={isActive}
        name={name}
        imageUrl={imageUrl}
        price={price}
        delivered={delivered}
        returned={returned}
        onDeliveredChange={onDeliveredChange}
        onReturnedChange={onReturnedChange}
        onClose={handleClose}
      />
    </Pressable>
  );
}

function CardBody({
  isActive,
  name,
  imageUrl,
  price,
  delivered,
  returned,
  onDeliveredChange,
  onReturnedChange,
  onClose,
}: {
  isActive: boolean;
  name: string;
  imageUrl: string | null;
  price: number;
  delivered: number;
  returned: number;
  onDeliveredChange: (quantity: number) => void;
  onReturnedChange: (quantity: number) => void;
  onClose: () => void;
}) {
  // The white overlay always spans the full card height. When inactive, it
  // sits pushed down by INACTIVE_IMAGE_HEIGHT so only the bottom strip is
  // visible. Sliding it up to 0 makes the white area "extend upwards" and
  // cover the product image.
  const [overlayTranslateY] = useState(
    () => new Animated.Value(INACTIVE_IMAGE_HEIGHT),
  );

  useEffect(() => {
    Animated.timing(overlayTranslateY, {
      toValue: isActive ? 0 : INACTIVE_IMAGE_HEIGHT,
      duration: ANIMATION_DURATION,
      useNativeDriver: true,
    }).start();
  }, [isActive, overlayTranslateY]);

  return (
    <View style={{ flex: 1, position: 'relative' }}>
      {/* Product image — always rendered behind the overlay. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: INACTIVE_IMAGE_HEIGHT,
        }}
      >
        {imageUrl ? (
          <Image
            source={{ uri: imageUrl }}
            contentFit="cover"
            transition={200}
            style={{ width: '100%', height: INACTIVE_IMAGE_HEIGHT }}
          />
        ) : (
          <Box
            className="items-center justify-center bg-muted"
            style={{ height: INACTIVE_IMAGE_HEIGHT }}
          >
            <Icon
              as={PackageIcon}
              size="xl"
              className="text-muted-foreground"
            />
          </Box>
        )}

        {!isActive ? (
          <Box className="absolute left-2 top-2 rounded-full bg-card px-2 py-0.5 shadow-sm">
            <Text size="2xs" bold className="text-foreground">
              {formatCurrency(price)}
            </Text>
          </Box>
        ) : null}
      </View>

      {/* White overlay — slides up to cover the image. */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: CARD_HEIGHT,
          backgroundColor: '#FFFFFF',
          transform: [{ translateY: overlayTranslateY }],
        }}
      >
        {isActive ? (
          <ActiveBody
            name={name}
            price={price}
            delivered={delivered}
            returned={returned}
            onDeliveredChange={onDeliveredChange}
            onReturnedChange={onReturnedChange}
            onClose={onClose}
          />
        ) : (
          <InactiveBody name={name} />
        )}
      </Animated.View>
    </View>
  );
}

function InactiveBody({ name }: { name: string }) {
  return (
    <VStack
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: INACTIVE_CONTENT_HEIGHT,
      }}
      className="px-3 py-2"
    >
      <Text
        size="sm"
        bold
        numberOfLines={1}
        className="text-foreground"
      >
        {name}
      </Text>

      <Box className="flex-1 items-center justify-center">
        <HStack space="xs" className="items-center">
          <Icon as={PlusIcon} size="sm" className="text-primary" />
          <Text size="xs" bold className="text-primary">
            Ekle
          </Text>
        </HStack>
      </Box>
    </VStack>
  );
}

function ActiveBody({
  name,
  price,
  delivered,
  returned,
  onDeliveredChange,
  onReturnedChange,
  onClose,
}: {
  name: string;
  price: number;
  delivered: number;
  returned: number;
  onDeliveredChange: (quantity: number) => void;
  onReturnedChange: (quantity: number) => void;
  onClose: () => void;
}) {
  return (
    <VStack className="flex-1 px-3 pt-3">
      <HStack className="items-center justify-between">
        <Text size="2xs" bold className="text-foreground">
          {formatCurrency(price)}
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          className="h-6 w-6 items-center justify-center rounded-full bg-muted"
        >
          <Icon as={CloseIcon} size="xs" className="text-muted-foreground" />
        </Pressable>
      </HStack>

      <Text
        size="sm"
        bold
        numberOfLines={1}
        className="mt-1 text-foreground"
      >
        {name}
      </Text>

      <VStack space="xs" className="mt-1.5">
        <QuantityStepper
          label="Verilen:"
          value={delivered}
          onChange={onDeliveredChange}
          min={0}
          compact
        />
        <QuantityStepper
          label="İade Alınan:"
          value={returned}
          onChange={onReturnedChange}
          min={0}
          compact
        />
      </VStack>
    </VStack>
  );
}
