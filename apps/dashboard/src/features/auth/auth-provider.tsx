'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { setTenantScope } from '@/lib/tenant-scope';
import { setUnauthorizedHandler } from '@/services/api-client';
import { authService } from '@/services/auth.service';
import type { LoginInput } from '@/services/auth.service';
import type { SessionUser } from '@/types/api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: SessionUser | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);
const SESSION_KEY = ['session'] as const;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const session = useQuery({
    queryKey: SESSION_KEY,
    queryFn: authService.getSession,
    staleTime: Infinity,
    retry: false,
  });

  const endSession = React.useCallback(async () => {
    await authService.logout().catch(() => undefined);
    queryClient.clear();
    setTenantScope(null);
    queryClient.setQueryData(SESSION_KEY, null);
    router.replace('/login');
  }, [queryClient, router]);

  // When the proxy reports the session is gone for good, sign out everywhere in the UI once.
  React.useEffect(() => {
    let ending = false;
    setUnauthorizedHandler(() => {
      if (ending) return;
      ending = true;
      void endSession();
    });
    return () => setUnauthorizedHandler(undefined);
  }, [endSession]);

  const login = React.useCallback(
    async (input: LoginInput) => {
      const user = await authService.login(input);
      queryClient.setQueryData(SESSION_KEY, user);
      return user;
    },
    [queryClient],
  );

  const user = session.data ?? null;
  const status: AuthStatus = session.isPending
    ? 'loading'
    : user
      ? 'authenticated'
      : 'unauthenticated';

  const value = React.useMemo(
    () => ({ user, status, login, logout: endSession }),
    [user, status, login, endSession],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
