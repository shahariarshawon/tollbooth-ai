'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, Mail, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/services/api-error';
import { useAuth } from './auth-provider';

const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof loginSchema>;

function messageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'Invalid email or password.';
    if (error.status === 429)
      return 'Too many sign-in attempts. Please wait a few minutes and try again.';
    return error.message;
  }
  return 'Something went wrong. Please try again.';
}

function demoMessageFor(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429)
      return 'Too many demo sessions right now. Please try again in a few minutes.';
    if (error.status === 404) return 'The demo is not enabled on this deployment.';
    if (error.status === 503)
      return 'The demo workspace is not set up in the database. Run "pnpm db:seed:demo" to initialize sample data.';
    if (error.status === 502)
      return 'The backend control plane is currently unreachable (502). Please verify the backend service is running.';
  }
  return 'Could not start the demo. Please try again.';
}

export function LoginForm({ redirectTo = '/dashboard' }: { redirectTo?: string }) {
  const auth = useAuth() as {
    login: (values: LoginValues) => Promise<unknown>;
    startDemo?: () => Promise<unknown>;
  };
  const router = useRouter();
  const [formError, setFormError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [demoStarting, setDemoStarting] = React.useState(false);
  const [demoError, setDemoError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await auth.login(values);
      router.replace(redirectTo);
    } catch (error) {
      setFormError(messageFor(error));
    }
  });

  const handleStartDemo = async () => {
    if (!auth.startDemo) return;
    setDemoError(null);
    setDemoStarting(true);
    try {
      await auth.startDemo();
      router.replace(redirectTo);
    } catch (cause) {
      setDemoError(demoMessageFor(cause));
      setDemoStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <div className="relative">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              aria-invalid={errors.email ? true : undefined}
              className="pl-9"
              {...register('email')}
            />
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </Field>

        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              className="pl-9 pr-10"
              {...register('password')}
            />
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>

        {formError && (
          <p
            role="alert"
            className="rounded-lg border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive animate-fade-in"
          >
            {formError}
          </p>
        )}

        <Button
          type="submit"
          loading={isSubmitting}
          className="mt-1 h-10 w-full font-semibold shadow-sm transition-all hover:shadow"
        >
          {isSubmitting ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      {/* Prominent One-Click Demo Box */}
      <div className="relative my-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Or explore immediately</span>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-xl border border-blue-500/20 bg-blue-50/50 p-4 dark:border-blue-500/30 dark:bg-blue-950/20">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleStartDemo()}
          loading={demoStarting}
          className="h-10 w-full border-blue-600/40 bg-white font-medium text-blue-700 shadow-xs hover:bg-blue-50 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
        >
          <Sparkles className="size-4 text-blue-600 dark:text-blue-400" />
          Explore Demo — No Account Required
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Instant read-only workspace with 30 days of generated sample traffic.
        </p>
        {demoError && (
          <p
            role="alert"
            className="rounded border border-destructive/20 bg-destructive/10 p-2 text-center text-xs text-destructive"
          >
            {demoError}
          </p>
        )}
      </div>
    </div>
  );
}
