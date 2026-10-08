import { zodResolver } from '@hookform/resolvers/zod';
import {
  LIMITS,
  loginSchema,
  registerSchema,
  type LoginInput,
  type RegisterInput,
} from '@lumen/shared';
import { Check, Eye, EyeOff, Smartphone } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useForm, type FieldValues, type Path, type UseFormSetError } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import type { z } from 'zod';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { api, ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useDocumentTitle, useSession } from '@/lib/hooks';
import { session } from '@/lib/session';

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <div className="spectrum h-[3px] w-full" aria-hidden />
      <div className="flex flex-1 flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-[380px]">
          <Logo className="mb-10" />
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-[15px] text-ink-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 border-t border-line pt-6 text-sm text-ink-muted">{footer}</div>
        </div>
      </div>
      <p className="flex items-center justify-center gap-2 px-5 pb-6 text-center text-[13px] text-ink-faint">
        <Smartphone className="size-4" aria-hidden />
        The same account signs in to the Lumen Android app.
      </p>
    </div>
  );
}

/** Copy server-side field errors onto the form so they appear next to the right input. */
function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly string[],
): boolean {
  if (!(error instanceof ApiError) || error.details.length === 0) return false;
  let applied = false;
  for (const detail of error.details) {
    if (fields.includes(detail.path)) {
      setError(detail.path as Path<T>, { type: 'server', message: detail.message });
      applied = true;
    }
  }
  return applied;
}

function PasswordInput(props: React.ComponentProps<typeof Input>) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-10" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1.5 text-ink-faint hover:text-ink"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function FormAlert({ children, tone = 'red' }: { children: ReactNode; tone?: 'red' | 'amber' }) {
  return (
    <div
      role="alert"
      className={cn(
        'mb-5 rounded-lg border px-3.5 py-3 text-sm',
        tone === 'red'
          ? 'border-red/30 bg-red-soft text-red'
          : 'border-amber/30 bg-amber-soft text-amber',
      )}
    >
      {children}
    </div>
  );
}

const SESSION_MESSAGES = {
  expired: 'Your session expired. Sign in again to continue.',
  revoked: 'You were signed out on this device. Sign in again to continue.',
} as const;

export function LoginPage() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const { endReason } = useSession();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginInput, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await api.auth.login(values);
      api.resetSessionState();
      session.signIn(result.user, result.accessToken);
      navigate('/', { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['email', 'password']))
        setFormError(errorMessage(error));
    }
  });

  const sessionMessage =
    endReason === 'expired' || endReason === 'revoked' ? SESSION_MESSAGES[endReason] : null;

  return (
    <AuthShell
      title="Sign in to Lumen"
      subtitle="Pick up your projects where you left them."
      footer={
        <>
          New to Lumen?{' '}
          <Link
            to="/register"
            className="font-medium text-violet underline-offset-4 hover:underline"
          >
            Create an account
          </Link>
        </>
      }
    >
      {sessionMessage && !formError && <FormAlert tone="amber">{sessionMessage}</FormAlert>}
      {formError && <FormAlert>{formError}</FormAlert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Email" error={errors.email?.message}>
          {(a11y) => (
            <Input
              {...a11y}
              {...form.register('email')}
              type="email"
              autoComplete="email"
              autoFocus
              inputMode="email"
            />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(a11y) => (
            <PasswordInput
              {...a11y}
              {...form.register('password')}
              autoComplete="current-password"
            />
          )}
        </Field>
        <Button type="submit" variant="primary" loading={isSubmitting} className="mt-2 w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}

const PASSWORD_RULES = [
  {
    label: `At least ${LIMITS.password.min} characters`,
    test: (v: string) => v.length >= LIMITS.password.min,
  },
  { label: 'A letter and a number', test: (v: string) => /[A-Za-z]/.test(v) && /\d/.test(v) },
];

export function RegisterPage() {
  useDocumentTitle('Create account');
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RegisterInput, unknown, z.output<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '' },
    mode: 'onTouched',
  });
  const { errors, isSubmitting } = form.formState;
  const password = form.watch('password') ?? '';

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const result = await api.auth.register(values);
      api.resetSessionState();
      session.signIn(result.user, result.accessToken);
      navigate('/', { replace: true });
    } catch (error) {
      if (!applyServerErrors(error, form.setError, ['fullName', 'email', 'password']))
        setFormError(errorMessage(error));
    }
  });

  return (
    <AuthShell
      title="Create your account"
      subtitle="Projects, tasks and progress in one place, on the web and on your phone."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-violet underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {formError && <FormAlert>{formError}</FormAlert>}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Full name" error={errors.fullName?.message}>
          {(a11y) => (
            <Input
              {...a11y}
              {...form.register('fullName')}
              autoComplete="name"
              autoFocus
              maxLength={LIMITS.fullName.max}
            />
          )}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(a11y) => (
            <Input
              {...a11y}
              {...form.register('email')}
              type="email"
              autoComplete="email"
              inputMode="email"
            />
          )}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(a11y) => (
            <PasswordInput {...a11y} {...form.register('password')} autoComplete="new-password" />
          )}
        </Field>
        <ul className="-mt-1 flex flex-col gap-1" aria-label="Password requirements">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(password);
            return (
              <li
                key={rule.label}
                className={cn(
                  'flex items-center gap-2 text-[13px]',
                  met ? 'text-green' : 'text-ink-muted',
                )}
              >
                <Check className={cn('size-3.5', met ? 'opacity-100' : 'opacity-30')} aria-hidden />
                {rule.label}
                <span className="sr-only">{met ? '(met)' : '(not met yet)'}</span>
              </li>
            );
          })}
        </ul>
        <Button type="submit" variant="primary" loading={isSubmitting} className="mt-2 w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
