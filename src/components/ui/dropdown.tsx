import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, useWindowDimensions, type View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getDropdownPlacement } from '@/utils/dropdownPlacement';

import { Box } from '@/components/ui/box';
import { ChevronDownIcon, Icon } from '@/components/ui/icon';
import { Spinner } from '@/components/ui/spinner';
import { Text } from '@/components/ui/text';

export type DropdownOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type DropdownProps<T extends string> = {
  value: T | null;
  onChange: (value: T) => void;
  options: DropdownOption<T>[];
  placeholder?: string;
  emptyLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

// Render the popover in its own overlay, not inside the trigger's scroll
// container: zIndex cannot escape a ScrollView's clipping boundary.
// Placement is measured and bounded here so every consumer (including
// bottom sheets) gets upward flipping, safe-area limits, and scrolling.
export function Dropdown<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Seçin…',
  emptyLabel = 'Seçenek yok',
  loading = false,
  disabled = false,
  className,
}: DropdownProps<T>) {
  const [anchor, setAnchor] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const triggerRef = useRef<View | null>(null);
  const wantsOpen = useRef(false);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);
  const open = anchor !== null && !disabled && !loading;
  if ((disabled || loading) && anchor !== null) setAnchor(null);
  const close = useCallback(() => {
    wantsOpen.current = false;
    setAnchor(null);
  }, []);
  const measureTrigger = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      if (wantsOpen.current && width > 0 && height > 0) setAnchor({ x, y, width, height });
    });
  }, []);

  useEffect(() => {
    if (disabled || loading) wantsOpen.current = false;
  }, [disabled, loading]);

  useEffect(() => {
    if (wantsOpen.current) measureTrigger();
  }, [window.width, window.height, measureTrigger]);

  useEffect(() => {
    // The sheet may move when its keyboard closes; re-anchor after that move.
    const listener = Keyboard.addListener('keyboardDidHide', () => {
      if (wantsOpen.current) measureTrigger();
    });
    return () => listener.remove();
  }, [measureTrigger]);

  const selected = options.find((option) => option.value === value) ?? null;

  const placement = anchor ? getDropdownPlacement(anchor, {
    width: viewport?.width ?? window.width,
    height: viewport?.height ?? window.height,
    ...insets,
  }, contentHeight ?? (options.length ? options.length * 44 + 2 : 56)) : null;

  const handleSelect = (next: T) => {
    close();
    onChange(next);
  };

  return (
    <Box className="relative">
      <Pressable
        ref={triggerRef}
        onPress={() => {
          if (disabled || loading) return;
          if (wantsOpen.current) { close(); return; }
          wantsOpen.current = true;
          setViewport(null);
          setContentHeight(null);
          Keyboard.dismiss();
          measureTrigger();
        }}
        disabled={disabled || loading}
        accessibilityRole="button"
        accessibilityLabel={selected ? selected.label : placeholder}
        accessibilityState={{ expanded: open, disabled: !!disabled }}
        className={`h-10 flex-row items-center justify-between rounded-md border bg-card px-3 ${
          disabled
            ? 'border-border opacity-50'
            : open
              ? 'border-primary'
              : 'border-border'
        } ${className ?? ''}`}
      >
        <Text
          size="sm"
          numberOfLines={1}
          className={selected ? 'text-foreground' : 'text-muted-foreground'}
        >
          {selected ? selected.label : placeholder}
        </Text>
        {loading ? (
          <Spinner size="small" />
        ) : (
          <Icon as={ChevronDownIcon} size="sm" className="text-muted-foreground" />
        )}
      </Pressable>

      <Modal
        transparent
        visible={open}
        animationType="none"
        presentationStyle="overFullScreen"
        onRequestClose={close}
        onShow={measureTrigger}
      >
        <Box
          style={{ flex: 1 }}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setViewport({ width, height });
            if (wantsOpen.current) measureTrigger();
          }}
        >
          {/* A window-sized backdrop replaces the old fixed 1000px overflow. */}
          <Pressable
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
            onPress={close}
            accessibilityRole="button"
            accessibilityLabel="Dropdown menüsünü kapat"
          />
          {placement ? (
          <Box
            accessibilityRole="menu"
            style={{
              position: 'absolute',
              ...placement,
              overflow: 'hidden',
            }}
            className="rounded-xl border border-border bg-card"
          >
            <ScrollView
              style={{ flexGrow: 0, flexShrink: 1 }}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={(_width, height) => setContentHeight(height + 2)}
            >
              {loading ? (
                <Box className="items-center py-4">
                  <Spinner size="small" />
                </Box>
              ) : options.length === 0 ? (
                <Box className="items-center py-4">
                  <Text size="sm" className="text-muted-foreground">
                    {emptyLabel}
                  </Text>
                </Box>
              ) : (
                options.map((option) => {
                  const isSelected = option.value === value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() => !option.disabled && handleSelect(option.value)}
                      disabled={option.disabled}
                      accessibilityRole="menuitem"
                      accessibilityState={{
                        selected: isSelected,
                        disabled: !!option.disabled,
                      }}
                      className={`flex-row items-center justify-between px-3 py-2 ${
                        isSelected
                          ? 'bg-accent'
                          : 'bg-card data-[pressed=true]:bg-accent'
                      }`}
                    >
                      <Text
                        size="sm"
                        bold={isSelected}
                        numberOfLines={1}
                        className="text-foreground"
                      >
                        {option.label}
                      </Text>
                      {isSelected ? (
                        <Text size="xs" className="text-muted-foreground">
                          Seçili
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </Box>
          ) : null}
        </Box>
      </Modal>
    </Box>
  );
}
