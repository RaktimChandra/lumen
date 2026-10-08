import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@lumen/shared';
import { Link } from 'expo-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, type TextInput } from 'react-native';
import type { z } from 'zod';
import { api, ApiError, errorMessage } from '@/api/client';
import { session } from '@/auth/session';
import { useSession } from '@/auth/useSession';
import { Button, Text, TextField } from '@/components/ui';
import { AuthScreen, Notice } from '@/features/AuthForm';
import { usePalette } from '@/theme';

const SESSION_NOTICES = {
  expired: 'Your session expired. Please sign in again.',
  revoked: 'You were signed out of this device. Please sign in again.',
} as const;

export default function LoginScreen() {
  const p = usePalette();
  const { endReason } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const form = useForm<LoginInput, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await api.auth.login(values);
      api.resetSessionState();
      await session.signIn(result.user, result.accessToken, result.refreshToken);
    } catch (error) {
      if (error instanceof ApiError && error.details.length) {
        for (const d of error.details)
          if (d.path === 'email' || d.path === 'password')
            form.setError(d.path, { message: d.message });
      } else setFormError(errorMessage(error));
    }
  });

  const notice = formError ? (
    <Notice tone="red">{formError}</Notice>
  ) : endReason === 'expired' || endReason === 'revoked' ? (
    <Notice tone="amber">{SESSION_NOTICES[endReason]}</Notice>
  ) : null;

  return (
    <AuthScreen
      title="Sign in"
      subtitle="Use the same account as Lumen on the web."
      notice={notice}
      footer={
        <Text tone="inkMuted">
          New to Lumen?{' '}
          <Link
            href="/register"
            style={{ color: p.violet, fontFamily: 'InstrumentSans_500Medium' }}
          >
            Create an account
          </Link>
        </Text>
      }
    >
      <Controller
        control={form.control}
        name="email"
        render={({ field }) => (
          <TextField
            label="Email"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
        )}
      />
      <Controller
        control={form.control}
        name="password"
        render={({ field }) => (
          <TextField
            ref={passwordRef}
            label="Password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            right={
              <Pressable
                onPress={() => setShowPassword((v) => !v)}
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                hitSlop={8}
                style={{ padding: 10 }}
              >
                {showPassword ? (
                  <EyeOff size={18} color={p.inkFaint} />
                ) : (
                  <Eye size={18} color={p.inkFaint} />
                )}
              </Pressable>
            }
          />
        )}
      />
      <Button
        title="Sign in"
        variant="primary"
        loading={isSubmitting}
        onPress={() => void submit()}
        style={{ marginTop: 8 }}
      />
    </AuthScreen>
  );
}
