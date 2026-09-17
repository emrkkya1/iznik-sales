import { Box } from '@/components/ui/box';
import { HStack } from '@/components/ui/hstack';
import { Pressable } from '@/components/ui/pressable';
import { Text } from '@/components/ui/text';

import type { DayOfWeek } from '@/types';

// Display order is weekly (Monday → Sunday) because that's how operators
// think. The `value` field maps to JS Date.getDay() (0=Sun..6=Sat) so the
// array can be passed straight to the RPC.
export const DAYS_OF_WEEK: readonly {
  value: DayOfWeek;
  short: string;
  label: string;
}[] = [
  { value: 1, short: 'Pt', label: 'Pazartesi' },
  { value: 2, short: 'Sa', label: 'Salı' },
  { value: 3, short: 'Ça', label: 'Çarşamba' },
  { value: 4, short: 'Pe', label: 'Perşembe' },
  { value: 5, short: 'Cu', label: 'Cuma' },
  { value: 6, short: 'Ct', label: 'Cumartesi' },
  { value: 0, short: 'Pz', label: 'Pazar' },
];

type DayOfWeekPickerProps = {
  value: DayOfWeek[];
  onChange: (next: DayOfWeek[]) => void;
  /** When true, all chips are muted and taps no-op (used during loading). */
  disabled?: boolean;
  className?: string;
};

// 7-chip horizontal selector. Multi-select. Tap toggles inclusion.
export function DayOfWeekPicker({
  value,
  onChange,
  disabled = false,
  className,
}: DayOfWeekPickerProps) {
  function toggle(d: DayOfWeek) {
    if (disabled) return;
    const set = new Set(value);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    // Emit in display order so the wire payload remains deterministic.
    onChange(DAYS_OF_WEEK.map((day) => day.value).filter((v) => set.has(v as DayOfWeek)));
  }

  return (
    <HStack space="xs" className={className}>
      {DAYS_OF_WEEK.map((day) => {
        const isActive = value.includes(day.value);
        return (
          <Pressable
            key={day.value}
            onPress={() => toggle(day.value)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={day.label}
            accessibilityState={{ selected: isActive, disabled }}
          >
            <Box
              className={`h-11 w-11 items-center justify-center rounded-full border ${
                isActive
                  ? 'border-primary bg-primary'
                  : 'border-border bg-surface-muted'
              }`}
            >
              <Text
                size="xs"
                bold
                className={isActive ? 'text-primary-foreground' : 'text-surface-muted-foreground'}
              >
                {day.short}
              </Text>
            </Box>
          </Pressable>
        );
      })}
    </HStack>
  );
}
