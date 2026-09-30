import type { SessionUser } from '@/types/api';
import { authHttp } from './api-client';

export interface LoginInput {
  email: string;
  password: string;
}

export const authService = {
  async login(input: LoginInput): Promise<SessionUser> {
    const { data } = await authHttp.post<{ user: SessionUser }>('/login', input);
    return data.user;
  },

  async logout(): Promise<void> {
    await authHttp.post('/logout');
  },

  /** Mirrors a rename the control plane already accepted into the session cookie. */
  async updateDisplayName(firstName: string, lastName: string): Promise<SessionUser> {
    const { data } = await authHttp.patch<{ user: SessionUser }>('/session', {
      firstName,
      lastName,
    });
    return data.user;
  },

  /** Returns the signed-in user, or null when there is no session. */
  async getSession(): Promise<SessionUser | null> {
    const { data } = await authHttp.get<{ user: SessionUser | null }>('/session');
    return data.user;
  },
};
