/**
 * ExportTriggerButton — shared button shell for PDF report triggers.
 * triggers. Presentation-only: shows a spinner while the pipeline is busy and
 * forwards the press; readiness gating lives in the caller.
 */

import { Button, ButtonIcon, ButtonSpinner, ButtonText } from '@/components/ui/button';
import { ReceiptIcon } from '@/components/ui/icon';

type ExportTriggerButtonProps = {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'outline';
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

export function ExportTriggerButton({
  label,
  onPress,
  busy = false,
  disabled = false,
  variant = 'default',
  accessibilityLabel,
  accessibilityHint,
}: ExportTriggerButtonProps) {
  return (
    <Button
      variant={variant}
      size="default"
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy }}
    >
      {busy ? <ButtonSpinner /> : <ButtonIcon as={ReceiptIcon} />}
      <ButtonText>{label}</ButtonText>
    </Button>
  );
}
