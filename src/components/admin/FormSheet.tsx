import { useMemo, useState } from 'react';

import { Box } from '@/components/ui/box';
import { Button, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { KeyboardAvoidingView } from '@/components/ui/keyboard-avoiding-view';
import { ScrollView } from '@/components/ui/scroll-view';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Pressable } from '@/components/ui/pressable';
import { CheckIcon, Icon } from '@/components/ui/icon';

export type FormField =
  | {
      name: string;
      label: string;
      type: 'text';
      required?: boolean;
      placeholder?: string;
      defaultValue?: string;
    }
  | {
      name: string;
      label: string;
      type: 'numeric';
      required?: boolean;
      placeholder?: string;
      defaultValue?: string;
    }
  | {
      name: string;
      label: string;
      type: 'boolean';
      required?: false;
      defaultValue?: boolean;
    }
  | {
      name: string;
      label: string;
      type: 'checkbox';
      required?: false;
      defaultValue?: boolean;
    };

export type FormSheetValues = Record<string, string | boolean>;

type FormSheetProps = {
  open: boolean;
  title: string;
  fields: FormField[];
  submitLabel?: string;
  onSubmit: (values: FormSheetValues) => Promise<void> | void;
  onCancel: () => void;
  initialValues?: FormSheetValues;
  serverError?: string;
  isSubmitting?: boolean;
};

// Generic bottom-anchored form sheet.
//
// Uses the shared BottomSheet primitive for the chrome (header + Kapat +
// safe-area + scrim). Body owns the form fields + server error + submit
// button. The KeyboardAvoidingView wraps the field ScrollView so the Submit
// button stays visible above the soft keyboard.
export function FormSheet({
  open,
  title,
  fields,
  submitLabel = 'Kaydet',
  onSubmit,
  onCancel,
  initialValues,
  serverError,
  isSubmitting = false,
}: FormSheetProps) {
  const seedValues = useMemo<FormSheetValues>(() => {
    const seed: FormSheetValues = {};
    for (const field of fields) {
      if (initialValues && field.name in initialValues) {
        seed[field.name] = initialValues[field.name];
      } else if (field.type === 'boolean' || field.type === 'checkbox') {
        seed[field.name] = field.defaultValue ?? false;
      } else {
        seed[field.name] = field.defaultValue ?? '';
      }
    }
    return seed;
  }, [fields, initialValues]);

  const [values, setValues] = useState<FormSheetValues>(seedValues);

  // Reset values to fresh seeds whenever the sheet transitions from closed →
  // open. Per React docs this is acceptable inside render.
  const [wasOpen, setWasOpen] = useState(open);
  if (open && !wasOpen) {
    setWasOpen(true);
    setValues(seedValues);
  }
  if (!open && wasOpen) {
    setWasOpen(false);
  }

  const validity = useMemo(() => {
    const errors: Record<string, string | undefined> = {};
    for (const field of fields) {
      if (field.type === 'boolean' || field.type === 'checkbox') continue;
      const raw = values[field.name];
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (field.required && text === '') {
        errors[field.name] = 'Zorunlu alan';
      } else if (
        field.type === 'numeric' &&
        text !== '' &&
        !/^-?\d+(?:[.,]\d{1,2})?$/.test(text)
      ) {
        errors[field.name] = 'Geçerli bir sayı girin';
      }
    }
    const isValid = Object.values(errors).every((e) => !e);
    return { errors, isValid };
  }, [fields, values]);

  const handleSubmit = async () => {
    if (!validity.isValid || isSubmitting) return;
    await onSubmit(values);
  };

  return (
    <BottomSheet
      open={open}
      title={title}
      onClose={onCancel}
      scrollable={false}
      contentPadding={0}
    >
      <KeyboardAvoidingView behavior="height" style={{ width: '100%' }}>
        <ScrollView
          style={{ maxHeight: 480 }}
          keyboardShouldPersistTaps="handled"
        >
          <VStack space="md" className="p-4">
            {fields.map((field) => {
              if (field.type === 'checkbox') {
                const checked = Boolean(values[field.name]);
                return (
                  <Pressable key={field.name} accessibilityRole="checkbox" accessibilityLabel={field.label}
                    accessibilityState={{ checked, disabled: isSubmitting }} disabled={isSubmitting}
                    onPress={() => setValues(v => ({ ...v, [field.name]: !checked }))}>
                    <HStack space="sm" className="items-center py-2">
                      <Box className={`h-6 w-6 items-center justify-center rounded-md border ${checked ? 'border-primary bg-primary' : 'border-border bg-background'}`}>
                        {checked ? <Icon as={CheckIcon} size="sm" className="text-primary-foreground" /> : null}
                      </Box>
                      <Text size="sm" style={{ flex: 1 }}>{field.label}</Text>
                    </HStack>
                  </Pressable>
                );
              }
              if (field.type === 'boolean') {
                const current = Boolean(values[field.name]);
                return (
                  <HStack
                    key={field.name}
                    className="items-center justify-between"
                  >
                    <Text size="md" className="text-foreground">
                      {field.label}
                    </Text>
                    <HStack space="xs">
                      <Button
                        variant={current ? 'default' : 'outline'}
                        size="sm"
                        onPress={() =>
                          setValues((v) => ({ ...v, [field.name]: true }))
                        }
                      >
                        <ButtonText>Evet</ButtonText>
                      </Button>
                      <Button
                        variant={!current ? 'default' : 'outline'}
                        size="sm"
                        onPress={() =>
                          setValues((v) => ({ ...v, [field.name]: false }))
                        }
                      >
                        <ButtonText>Hayır</ButtonText>
                      </Button>
                    </HStack>
                  </HStack>
                );
              }

              const raw = values[field.name];
              const text = typeof raw === 'string' ? raw : '';
              const error = validity.errors[field.name];

              return (
                <VStack key={field.name} space="xs">
                  <Text size="sm" className="text-foreground">
                    {field.label}
                    {field.required ? (
                      <Text size="sm" className="text-destructive">
                        {' *'}
                      </Text>
                    ) : null}
                  </Text>
                  <Input isInvalid={!!error}>
                    <InputField
                      value={text}
                      onChangeText={(next) =>
                        setValues((v) => ({ ...v, [field.name]: next }))
                      }
                      placeholder={field.placeholder}
                      keyboardType={
                        field.type === 'numeric' ? 'decimal-pad' : 'default'
                      }
                      autoCapitalize="sentences"
                    />
                  </Input>
                  {error ? (
                    <Text size="xs" className="text-destructive">
                      {error}
                    </Text>
                  ) : null}
                </VStack>
              );
            })}
          </VStack>
        </ScrollView>

        {serverError ? (
          <Text size="sm" className="px-4 pb-2 text-destructive">
            {serverError}
          </Text>
        ) : null}

        <Box className="p-4">
          <Button
            onPress={handleSubmit}
            disabled={!validity.isValid || isSubmitting}
            className="w-full"
          >
            <ButtonText>
              {isSubmitting ? 'Kaydediliyor…' : submitLabel}
            </ButtonText>
          </Button>
        </Box>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
