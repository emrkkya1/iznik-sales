import { useState } from 'react';
import { Image, Platform } from 'react-native';

import { Box } from '@/components/ui/box';
import { Button, ButtonText, ButtonSpinner } from '@/components/ui/button';
import { Divider } from '@/components/ui/divider';
import { Heading } from '@/components/ui/heading';
import {
  Input,
  InputField,
  InputIcon,
  InputSlot,
} from '@/components/ui/input';
import { KeyboardAvoidingView } from '@/components/ui/keyboard-avoiding-view';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { EyeIcon, EyeOffIcon, LockIcon, MailIcon } from '@/components/ui/icon';
import { useSignIn } from '@/hooks/useSignIn';
import { getUserMessage } from '@/utils/errors';

export function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const signIn = useSignIn();

  const handleSubmit = () => {
    if (!email.trim() || !password) return;
    signIn.mutate({ email: email.trim(), password });
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <Box className="flex-1 items-center justify-center bg-background p-8">
        <Box className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
          <VStack space="2xl">
            <VStack space="lg" className="items-center">
              <Image
                source={require('../../../assets/images/iznik-firin-logo.jpg')}
                accessibilityLabel="Tarihi İznik Fırını logosu"
                resizeMode="contain"
                style={{ height: 112, width: 112 }}
              />
              <VStack space="sm" className="items-center">
                <Heading size="xl" bold className="text-foreground">
                  Tarihi İznik Fırını
                </Heading>
                <Text size="sm" className="text-center text-muted-foreground">
                  Devam etmek için hesabınızla giriş yapın.
                </Text>
              </VStack>
            </VStack>

            <VStack space="lg">
              <VStack space="sm">
                <Text size="sm" className="text-foreground">
                  E-posta
                </Text>
                <Input>
                  <InputSlot>
                    <InputIcon as={MailIcon} className="text-muted-foreground" />
                  </InputSlot>
                  <InputField
                    placeholder="ornek@iznikfirini.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                    value={email}
                    onChangeText={setEmail}
                  />
                </Input>
              </VStack>

              <VStack space="sm">
                <Text size="sm" className="text-foreground">
                  Şifre
                </Text>
                <Input>
                  <InputSlot>
                    <InputIcon as={LockIcon} className="text-muted-foreground" />
                  </InputSlot>
                  <InputField
                    placeholder="••••••••"
                    secureTextEntry={!showPassword}
                    autoComplete="password"
                    value={password}
                    onChangeText={setPassword}
                    onSubmitEditing={handleSubmit}
                  />
                  <InputSlot onPress={() => setShowPassword((v) => !v)}>
                    <InputIcon
                      as={showPassword ? EyeOffIcon : EyeIcon}
                      className="text-muted-foreground"
                    />
                  </InputSlot>
                </Input>
              </VStack>

              {signIn.isError ? (
                <Text size="sm" className="text-destructive">
                  {getUserMessage(signIn.error)}
                </Text>
              ) : null}
            </VStack>

            <VStack space="md">
              <Button
                onPress={handleSubmit}
                disabled={signIn.isPending || !email.trim() || !password}
                size="lg"
              >
                {signIn.isPending ? <ButtonSpinner /> : null}
                <ButtonText>Giriş Yap</ButtonText>
              </Button>

              <Divider />

              <Text size="xs" className="text-center text-muted-foreground">
                Yardım için yöneticinize başvurun.
              </Text>
            </VStack>
          </VStack>
        </Box>
      </Box>
    </KeyboardAvoidingView>
  );
}
