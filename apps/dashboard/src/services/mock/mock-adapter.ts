import { AxiosError, AxiosHeaders } from 'axios';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { ApiKey, Project } from '@/types/api';
import { buildOverview, mockApiKeys, mockProjects } from './mock-store';

/** Paths the backend does not serve yet. Everything else goes to the real control plane. */
const MOCKED_PATHS = [/^\/projects(\/|$)/, /^\/api-keys(\/|$)/, /^\/dashboard\//];

export function shouldMock(config: InternalAxiosRequestConfig): boolean {
  if (process.env.NEXT_PUBLIC_MOCK_API === 'false') return false;
  return MOCKED_PATHS.some((pattern) => pattern.test(config.url ?? ''));
}

type Body = Record<string, unknown>;
type Handler = (match: RegExpMatchArray, body: Body, query: Body) => unknown;

class MockHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const nowIso = (): string => new Date().toISOString();
const newId = (): string => `m-${Math.random().toString(36).slice(2, 10)}`;

function randomHex(bytes: number): string {
  const values = new Uint8Array(bytes);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(values);
  else values.forEach((_, index) => (values[index] = Math.floor(Math.random() * 256)));
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

function requireString(body: Body, field: string): string {
  const value = body[field];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new MockHttpError(400, `${field} should not be empty`);
  }
  return value.trim();
}

function findOrFail<T extends { id: string }>(items: T[], id: string | undefined): T {
  const item = items.find((candidate) => candidate.id === id);
  if (!item) throw new MockHttpError(404, 'Not found');
  return item;
}

function issueKey(apiKey: ApiKey) {
  const secret = `tb_live_${randomHex(20)}`;
  apiKey.keyPrefix = secret.slice(0, 14);
  return { apiKey: { ...apiKey }, secret };
}

const routes: { method: string; pattern: RegExp; handle: Handler }[] = [
  { method: 'get', pattern: /^\/dashboard\/overview$/, handle: () => buildOverview() },

  { method: 'get', pattern: /^\/projects$/, handle: () => [...mockProjects] },
  {
    method: 'post',
    pattern: /^\/projects$/,
    handle: (_m, body) => {
      const project: Project = {
        id: newId(),
        name: requireString(body, 'name'),
        description: typeof body.description === 'string' ? body.description : null,
        status: 'ACTIVE',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      mockProjects.unshift(project);
      return project;
    },
  },
  {
    method: 'patch',
    pattern: /^\/projects\/([^/]+)$/,
    handle: (match, body) => {
      const project = findOrFail(mockProjects, match[1]);
      if (body.name !== undefined) project.name = requireString(body, 'name');
      if (body.description !== undefined) project.description = String(body.description) || null;
      if (body.status === 'ACTIVE' || body.status === 'ARCHIVED') project.status = body.status;
      project.updatedAt = nowIso();
      mockApiKeys
        .filter((key) => key.projectId === project.id)
        .forEach((key) => (key.projectName = project.name));
      return { ...project };
    },
  },
  {
    method: 'delete',
    pattern: /^\/projects\/([^/]+)$/,
    handle: (match) => {
      const project = findOrFail(mockProjects, match[1]);
      if (mockApiKeys.some((key) => key.projectId === project.id && key.status === 'ACTIVE')) {
        throw new MockHttpError(409, 'Revoke the API keys of this project before deleting it');
      }
      mockProjects.splice(mockProjects.indexOf(project), 1);
      return null;
    },
  },

  { method: 'get', pattern: /^\/api-keys$/, handle: () => [...mockApiKeys] },
  {
    method: 'post',
    pattern: /^\/api-keys$/,
    handle: (_m, body) => {
      const project = findOrFail(mockProjects, requireString(body, 'projectId'));
      const rateLimit = typeof body.rateLimit === 'number' ? body.rateLimit : null;
      const apiKey: ApiKey = {
        id: newId(),
        projectId: project.id,
        projectName: project.name,
        name: requireString(body, 'name'),
        keyPrefix: '',
        permissions: Array.isArray(body.permissions) ? (body.permissions as string[]) : [],
        rateLimit,
        status: 'ACTIVE',
        createdAt: nowIso(),
        lastUsedAt: null,
      };
      const issued = issueKey(apiKey);
      mockApiKeys.unshift(apiKey);
      return issued;
    },
  },
  {
    method: 'post',
    pattern: /^\/api-keys\/([^/]+)\/rotate$/,
    handle: (match) => {
      const apiKey = findOrFail(mockApiKeys, match[1]);
      if (apiKey.status === 'REVOKED')
        throw new MockHttpError(409, 'A revoked key cannot be rotated');
      return issueKey(apiKey);
    },
  },
  {
    method: 'post',
    pattern: /^\/api-keys\/([^/]+)\/revoke$/,
    handle: (match) => {
      const apiKey = findOrFail(mockApiKeys, match[1]);
      apiKey.status = 'REVOKED';
      return { ...apiKey };
    },
  },
];

function parseBody(data: unknown): Body {
  if (typeof data === 'string' && data) return JSON.parse(data) as Body;
  return (data as Body | undefined) ?? {};
}

export async function mockAdapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  await new Promise((resolve) => setTimeout(resolve, 250));

  const url = config.url ?? '';
  const method = (config.method ?? 'get').toLowerCase();
  const respond = (status: number, data: unknown): AxiosResponse => ({
    data,
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config,
    request: {},
  });

  try {
    for (const route of routes) {
      const match = url.match(route.pattern);
      if (route.method !== method || !match) continue;
      // Clone so callers can never mutate the store through a returned reference.
      const result = route.handle(match, parseBody(config.data), (config.params as Body) ?? {});
      return respond(200, result === null ? null : (JSON.parse(JSON.stringify(result)) as unknown));
    }
    throw new MockHttpError(404, 'Not found');
  } catch (error) {
    const status = error instanceof MockHttpError ? error.status : 500;
    const message = error instanceof MockHttpError ? error.message : 'Mock API error';
    throw new AxiosError(
      message,
      String(status),
      config,
      {},
      respond(status, { statusCode: status, message, error: 'Mock' }),
    );
  }
}
