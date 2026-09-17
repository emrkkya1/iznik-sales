import { useState } from 'react';

import { DateTimePicker } from '@expo/ui/community/datetime-picker';

import { Box } from '@/components/ui/box';
import { CloseIcon, Icon, CalendarIcon } from '@/components/ui/icon';
import { Pressable } from '@/components/ui/pressable';
import { HStack } from '@/components/ui/hstack';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import {
  formatDateForDisplay,
  formatIsoDate,
  parseIsoDate,
} from '@/utils/dates';

type DateFieldProps = {
  // YYYY-MM-DD. `null` means "no date selected" and renders a placeholder.
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
};

export function DateField({
  value,
  onChange,
  label,
  placeholder = 'Tarih seçin',
  disabled = false,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <VStack space="xs">
      {label ? (
        <Text size="md" bold className="text-center text-foreground">
          {label}
        </Text>
      ) : null}

      <HStack
        className={`flex-row items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 ${
          disabled ? 'opacity-50' : ''
        }`}
        pointerEvents={disabled ? 'none' : 'auto'}
      >
        <Pressable
          onPress={() => {
            if (!disabled) setOpen(true);
          }}
          className="flex-1 flex-row items-center gap-2"
          accessibilityRole="button"
          accessibilityLabel={value ? formatDateForDisplay(value) : placeholder}
        >
          <Icon as={CalendarIcon} size="sm" className="text-muted-foreground" />
          <Text
            size="sm"
            className={value ? 'text-foreground' : 'text-muted-foreground'}
            numberOfLines={1}
          >
            {value ? formatDateForDisplay(value) : placeholder}
          </Text>
        </Pressable>
        {value ? (
          <Pressable
            onPress={() => onChange(null)}
            accessibilityRole="button"
            accessibilityLabel="Tarihi temizle"
            hitSlop={8}
          >
            <Box className="h-6 w-6 items-center justify-center rounded-full bg-muted">
              <Icon as={CloseIcon} size="xs" className="text-muted-foreground" />
            </Box>
          </Pressable>
        ) : null}
      </HStack>

      {open ? (
        <DateTimePicker
          value={value ? parseIsoDate(value) : new Date()}
          mode="date"
          presentation="dialog"
          positiveButton={{ label: 'Tamam' }}
          negativeButton={{ label: 'İptal' }}
          onValueChange={(_event, date) => {
            setOpen(false);
            onChange(formatIsoDate(date));
          }}
          onDismiss={() => setOpen(false)}
        />
      ) : null}
    </VStack>
  );
}
