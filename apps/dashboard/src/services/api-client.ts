import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import { getTenantScope } from '@/lib/tenant-scope';
import { ApiError } from './api-error';
import { mockAdapter, shouldMock } from './mock/mock-adapter';

type ErrorBody = { message?: string | string[] };

function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof AxiosError) {
    if (!error.response) {
      return new ApiError('Cannot reach the server. Check your connection and try again.', 0);
    }
    const { status, data } = error.response as { status: number; data?: ErrorBody };
    const message = data?.message;
    if (Array.isArray(message))
      return new ApiError(message[0] ?? 'Invalid request', status, message);
    return new ApiError(message ?? 'Something went wrong. Please try again.', status);
  }
  return new ApiError('Something went wrong. Please try again.', 0);
}

export { ApiError } from './api-error';

let onUnauthorized: (() => void) | undefined;

/** Registered once by the auth provider; called when the session can no longer be refreshed. */
export function setUnauthorizedHandler(handler: (() => void) | undefined): void {
  onUnauthorized = handler;
}

function createHttp(baseURL: string, options: { scoped: boolean }): AxiosInstance {
  const instance = axios.create({
    baseURL,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
    adapter: options.scoped
      ? (config) => (shouldMock(config) ? mockAdapter(config) : defaultAdapter(config))
      : undefined,
  });

  if (options.scoped) {
    instance.interceptors.request.use((config) => {
      const tenantId = getTenantScope();
      if (tenantId) config.headers.set('X-Tenant-Id', tenantId);
      return config;
    });
  }

  instance.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      const apiError = toApiError(error);
      // The server-side proxy already tried to refresh the session. A 401 here is final.
      if (options.scoped && apiError.status === 401) onUnauthorized?.();
      return Promise.reject(apiError);
    },
  );
  return instance;
}

const defaultAdapter = axios.getAdapter(axios.defaults.adapter);

/**
 * Talks to the control plane through the dashboard's own `/api/cp` proxy. The browser never sees a
 * token: the proxy reads the httpOnly session cookie, attaches the JWT, and refreshes it when needed.
 */
export const http = createHttp('/api/cp', { scoped: true });

/** Talks to the dashboard's login, logout and session routes. A 401 here is an ordinary failure. */
export const authHttp = createHttp('/api/auth', { scoped: false });
