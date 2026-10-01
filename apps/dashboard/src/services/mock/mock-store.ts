import type { ApiKey, DashboardOverview, Project } from '@/types/api';

/**
 * In-memory stand-in for backend endpoints that do not exist yet (projects, API keys, dashboard
 * statistics). It resets on page reload. Delete this folder when the real endpoints ship.
 */

const daysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

export const mockProjects: Project[] = [
  {
    id: 'p-support',
    name: 'Customer Support AI',
    description: 'Support chatbot for customer tickets',
    status: 'ACTIVE',
    createdAt: daysAgo(60),
    updatedAt: daysAgo(12),
  },
  {
    id: 'p-assistant',
    name: 'Internal Assistant',
    description: 'Employee knowledge base assistant',
    status: 'ACTIVE',
    createdAt: daysAgo(34),
    updatedAt: daysAgo(3),
  },
  {
    id: 'p-docs',
    name: 'Document Analyzer',
    description: null,
    status: 'ARCHIVED',
    createdAt: daysAgo(90),
    updatedAt: daysAgo(40),
  },
];

export const mockApiKeys: ApiKey[] = [
  {
    id: 'k-1',
    projectId: 'p-support',
    projectName: 'Customer Support AI',
    name: 'Production',
    keyPrefix: 'tb_live_a1b2c3',
    permissions: ['chat:completions'],
    rateLimit: 600,
    status: 'ACTIVE',
    createdAt: daysAgo(45),
    lastUsedAt: daysAgo(0),
  },
  {
    id: 'k-2',
    projectId: 'p-assistant',
    projectName: 'Internal Assistant',
    name: 'Staging',
    keyPrefix: 'tb_live_d4e5f6',
    permissions: ['chat:completions', 'models:read'],
    rateLimit: null,
    status: 'ACTIVE',
    createdAt: daysAgo(20),
    lastUsedAt: daysAgo(2),
  },
  {
    id: 'k-3',
    projectId: 'p-docs',
    projectName: 'Document Analyzer',
    name: 'Old experiment',
    keyPrefix: 'tb_live_778899',
    permissions: ['chat:completions'],
    rateLimit: 60,
    status: 'REVOKED',
    createdAt: daysAgo(80),
    lastUsedAt: daysAgo(41),
  },
];

/** Deterministic pseudo-random sequence so charts do not jump on every refetch. */
function sequence(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

export function buildOverview(): DashboardOverview {
  const random = sequence(42);
  const days = Array.from({ length: 30 }, (_, index) => {
    const date = new Date(Date.now() - (29 - index) * 86_400_000);
    return date.toISOString().slice(0, 10);
  });
  const requestVolume = days.map((date, index) => ({
    date,
    requests: Math.round(3_000 + index * 110 + random() * 1_400),
  }));
  const costTrend = days.map((date, index) => ({
    date,
    cost: Math.round((18 + index * 0.9 + random() * 9) * 100) / 100,
  }));

  return {
    // Mirrors the gateway: Gemini serves traffic, the others are implemented but switched off.
    providers: [
      { id: 'gemini', name: 'Google Gemini', status: 'ACTIVE' },
      { id: 'openai', name: 'OpenAI', status: 'AVAILABLE' },
      { id: 'anthropic', name: 'Anthropic', status: 'AVAILABLE' },
    ],
    stats: {
      totalRequests: requestVolume.reduce((sum, day) => sum + day.requests, 0),
      totalTokens: 48_250_000,
      currentSpend: Math.round(costTrend.reduce((sum, day) => sum + day.cost, 0) * 100) / 100,
      activeProjects: mockProjects.filter((project) => project.status === 'ACTIVE').length,
    },
    requestVolume,
    costTrend,
    modelUsage: [
      { label: 'gemini-2.0-flash', value: 71_200 },
      { label: 'gemini-2.0-flash-lite', value: 38_400 },
      { label: 'gemini-2.5-flash', value: 24_900 },
      { label: 'gemini-2.5-pro', value: 6_300 },
    ],
    providerUsage: [{ label: 'Google Gemini', value: 140_800 }],
  };
}
