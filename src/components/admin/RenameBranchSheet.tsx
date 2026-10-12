import { useState } from 'react';

import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button, ButtonText } from '@/components/ui/button';
import { HStack } from '@/components/ui/hstack';
import { Input, InputField } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useRenameBranch } from '@/hooks/useAdminLocations';

type RenameBranchSheetProps = {
  branchId: string;
  currentName: string;
  onClose: () => void;
};

// Mounted only while open, so every new edit starts with the current name.
export function RenameBranchSheet({ branchId, currentName, onClose }: RenameBranchSheetProps) {
  const [name, setName] = useState(currentName);
  const rename = useRenameBranch();
  const trimmedName = name.trim();
  const canSave = !!trimmedName && trimmedName !== currentName && !rename.isPending;
  const close = () => {
    if (!rename.isPending) onClose();
  };
  const save = () => {
    if (!canSave) return;
    rename.mutate({ id: branchId, name: trimmedName }, { onSuccess: onClose });
  };

  return (
    <BottomSheet open title="Şube Adını Düzenle" onClose={close} maxHeight={360}>
      <VStack space="lg">
        <VStack space="sm">
          <Text size="sm" bold className="text-foreground">Şube adı</Text>
          <Input className="bg-card" isInvalid={!trimmedName}>
            <InputField
              value={name}
              onChangeText={(value) => {
                setName(value);
                if (rename.isError) rename.reset();
              }}
              editable={!rename.isPending}
              placeholder="Şube adı"
              accessibilityLabel="Şube adı"
              returnKeyType="done"
              onSubmitEditing={save}
            />
          </Input>
          {!trimmedName ? <Text size="sm" className="text-destructive">Şube adı boş bırakılamaz.</Text> : null}
        </VStack>
        {rename.isError ? (
          <Text size="sm" className="text-destructive">{rename.error?.message ?? 'Şube adı kaydedilemedi. Tekrar deneyin.'}</Text>
        ) : null}
        <HStack space="md">
          <Button variant="outline" disabled={rename.isPending} onPress={close} style={{ flex: 1 }}>
            <ButtonText>Vazgeç</ButtonText>
          </Button>
          <Button disabled={!canSave} onPress={save} style={{ flex: 1 }}>
            <ButtonText>{rename.isPending ? 'Kaydediliyor…' : 'Kaydet'}</ButtonText>
          </Button>
        </HStack>
      </VStack>
    </BottomSheet>
  );
}
