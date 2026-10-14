import { useState, type ReactNode } from 'react';
import {
  type DimensionValue,
  Modal,
  Pressable,
  ScrollView,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Box } from './box';
import { Button, ButtonText } from './button';
import { HStack } from './hstack';
import { Text } from './text';

type BottomSheetProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  // Preferred cap; always clamped to the safe viewport height.
  maxHeight?: number;
  // When true, wraps children in a ScrollView so content scrolls inside the
  // sheet when it overflows. Set false when the consumer needs its own
  // KeyboardAvoidingView / ScrollView (e.g. the form sheet).
  scrollable?: boolean;
  // Optional padding for the content container. Defaults to 24px all sides.
  contentPadding?: number;
  // Pushes the sheet up from the bottom so dropdown popovers anchored
  // below their triggers have more visible space. Accepts any RN
  // DimensionValue ('12%', 80, etc.).
  topOffset?: DimensionValue;
};

// Shared bottom-sheet primitive.
//
// Visual contract:
//   - Slides up from below (animationType="slide")
//   - Title on the left, "Kapat" button on the right
//   - Fixed header separated from the scrollable body by a thin divider
//   - Tap on the scrim (outside the sheet) closes
//   - Content can never push the header or its close button off-screen
export function BottomSheet({
  open,
  title,
  onClose,
  children,
  maxHeight,
  scrollable = true,
  contentPadding = 24,
  topOffset,
}: BottomSheetProps) {
  const { height: viewportHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(64);

  // Resolve topOffset (DimensionValue) into a numeric bottom margin so
  // the sheet slides up from the viewport's bottom edge by that amount.
  function resolveTopOffset(): number {
    if (topOffset === undefined) return 0;
    if (typeof topOffset === 'number') return topOffset;
    if (typeof topOffset === 'string' && topOffset.endsWith('%')) {
      const pct = Number(topOffset.slice(0, -1));
      if (!Number.isNaN(pct)) {
        return Math.round((viewportHeight * pct) / 100);
      }
    }
    return 0;
  }

  // A caller's cap must never exceed the actual viewport (notably a tablet
  // in landscape). Reserve the safe area and a visible strip of backdrop.
  const availableHeight = Math.max(0, viewportHeight - insets.top - insets.bottom - 16);
  const requestedHeight = maxHeight ?? viewportHeight - Math.max(0, resolveTopOffset());
  const sheetMaxHeight = Math.min(availableHeight, Math.max(headerHeight, requestedHeight));
  const bodyMaxHeight = Math.max(0, sheetMaxHeight - headerHeight);

  return (
    <Modal
      transparent
      visible={open}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'flex-end',
          paddingBottom: insets.bottom,
        }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
             maxHeight: sheetMaxHeight,
             flexShrink: 1,
          }}
        >
          <Box
            className="w-full rounded-t-2xl border-t border-border bg-card"
            style={{ flexShrink: 1, maxHeight: sheetMaxHeight, overflow: 'hidden' }}
          >
            <HStack
              style={{ flexShrink: 0 }}
              onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}
              className="items-center justify-between border-b border-border px-4 py-3"
            >
              <Text size="lg" bold numberOfLines={2} style={{ flex: 1 }} className="pr-3 text-foreground">
                {title}
              </Text>
              <Button variant="ghost" size="sm" onPress={onClose}>
                <ButtonText>Kapat</ButtonText>
              </Button>
            </HStack>

            {scrollable ? (
              <ScrollView
                style={{ flexGrow: 0, flexShrink: 1, minHeight: 0, maxHeight: bodyMaxHeight }}
                contentContainerStyle={{
                  padding: contentPadding,
                  gap: 12,
                }}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : (
              <Box
                style={{
                  padding: contentPadding,
                }}
              >
                {children}
              </Box>
            )}
          </Box>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
