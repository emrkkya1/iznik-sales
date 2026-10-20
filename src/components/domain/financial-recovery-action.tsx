import { useRef, useState } from 'react';
import { Button, ButtonText } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { getUserMessage } from '@/utils/errors';

export function FinancialRecoveryAction({ visible, busy, label, recover }: {
  visible: boolean; busy: boolean; label: string; recover: () => Promise<unknown>;
}) {
  const submitting = useRef(false);
  const [error, setError] = useState<unknown>(null);
  if (!visible) return null;
  const submit = async () => {
    if (busy || submitting.current) return;
    submitting.current = true;
    setError(null);
    try { await recover(); } catch (failure) { setError(failure); }
    finally { submitting.current = false; }
  };
  return <VStack space="xs">
    <Text size="sm" className="text-muted-foreground">Bu seçenek yalnızca önceki işlemi tamamlar veya doğrular; ayrı bir yeni kayıt oluşturmaz.</Text>
    <Button variant="outline" disabled={busy} onPress={() => void submit()}><ButtonText>{label}</ButtonText></Button>
    {error ? <Text size="sm" className="text-destructive">{getUserMessage(error)}</Text> : null}
  </VStack>;
}
