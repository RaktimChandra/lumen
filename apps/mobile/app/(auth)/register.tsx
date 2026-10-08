import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterInput } from '@lumen/shared';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { api, ApiError, errorMessage } from '@/api/client';
import { session } from '@/auth/session';
import { Button, Text, TextField } from '@/components/ui';
import { AuthScreen, Notice } from '@/features/AuthForm';
import { usePalette } from '@/theme';

const FIELDS = ['fullName', 'email', 'password'] as const;

export default function RegisterScreen() {
  const p = usePalette();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RegisterInput, unknown, z.output<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '' },
    mode: 'onTouched',
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await api.auth.register(values);
      api.resetSessionState();
      await session.signIn(result.user, result.accessToken, result.refreshToken);
    } catch (error) {
      if (error instanceof ApiError && error.details.length) {
        for (const d of error.details) {
          if ((FIELDS as readonly string[]).includes(d.path))
            form.setError(d.path as (typeof FIELDS)[number], { message: d.message });
        }
      } else setFormError(errorMessage(error));
    }
  });

  return (
    <AuthScreen
      title="Create your account"
      subtitle="One account for Lumen on Android and the web."
      notice={formError ? <Notice tone="red">{formError}</Notice> : null}
      footer={
        <Text tone="inkMuted">
          Already have an account?{' '}
          <Link href="/login" style={{ color: p.violet, fontFamily: 'InstrumentSans_500Medium' }}>
            Sign in
          </Link>
        </Text>
      }
    >
      <Controller
        control={form.control}
        name="fullName"
        render={({ field }) => (
          <TextField
            label="Full name"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.fullName?.message}
            autoComplete="name"
            textContentType="name"
          />
        )}
      />
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
          />
        )}
      />
      <Controller
        control={form.control}
        name="password"
        render={({ field }) => (
          <TextField
            label="Password"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
            hint="At least 8 characters with a letter and a number."
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
          />
        )}
      />
      <Button
        title="Create account"
        variant="primary"
        loading={isSubmitting}
        onPress={() => void submit()}
        style={{ marginTop: 8 }}
      />
    </AuthScreen>
  );
}
