import { Modal, Pressable } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Box } from './box';
import { Button, ButtonText } from './button';
import { HStack } from './hstack';
import { Text } from './text';
import { VStack } from './vstack';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Onayla',
  cancelLabel = 'İptal',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      transparent
      visible={open}
      animationType="none"
      onRequestClose={onCancel}
    >
      <Animated.View entering={FadeIn.duration(160)} style={{ flex: 1 }}>
        <Pressable
          className="flex-1 items-center justify-center bg-black/50 p-8"
          onPress={onCancel}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <Animated.View entering={ZoomIn.duration(180)}>
              <Box className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
                <VStack space="md">
                  <Text size="lg" bold className="text-foreground">
                    {title}
                  </Text>
                  {message ? (
                    <Text size="sm" className="text-muted-foreground">
                      {message}
                    </Text>
                  ) : null}
                  <HStack space="sm" className="justify-end">
                    <Button variant="outline" onPress={onCancel}>
                      <ButtonText>{cancelLabel}</ButtonText>
                    </Button>
                    <Button
                      variant={destructive ? 'destructive' : 'default'}
                      onPress={onConfirm}
                    >
                      <ButtonText>{confirmLabel}</ButtonText>
                    </Button>
                  </HStack>
                </VStack>
              </Box>
            </Animated.View>
          </Pressable>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}
