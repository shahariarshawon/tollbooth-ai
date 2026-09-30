import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Logo } from '@/components/ui/navbar';
import { LoginForm } from '@/features/auth/login-form';

export const metadata: Metadata = { title: 'Sign in' };

/** Only allow redirects back into the dashboard, so a crafted link cannot send users elsewhere. */
function safeRedirect(next: string | undefined): string {
  return next && next.startsWith('/dashboard') && !next.startsWith('//') ? next : '/dashboard';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <Logo />
      <Card className="w-full max-w-sm">
        <CardHeader className="gap-1 p-6 pb-4">
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <CardDescription>Use your Tollbooth AI account to continue.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 pt-0">
          <LoginForm redirectTo={safeRedirect(next)} />
        </CardContent>
      </Card>
    </main>
  );
}
