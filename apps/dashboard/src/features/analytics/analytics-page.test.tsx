import { render, screen } from '@testing-library/react';
import type { UserRole } from '@tollbooth/shared';
import type {
  AnalyticsCost,
  AnalyticsModels,
  AnalyticsOverview,
  AnalyticsUsage,
} from '@/types/api';
import { AnalyticsPage } from './analytics-page';

let user: { role: UserRole } | null = { role: 'TENANT_ADMIN' };
jest.mock('@/features/auth/auth-provider', () => ({ useAuth: () => ({ user }) }));

const overview: AnalyticsOverview = {
  periodDays: 30,
  totalRequests: 1200,
  totalTokens: 340_000,
  totalCost: 12.5,
  activeUsers: 4,
  activeProjects: 2,
};
const usage: AnalyticsUsage = {
  periodDays: 30,
  requestsOverTime: [{ date: '2026-09-30', requests: 100 }],
  tokensOverTime: [{ date: '2026-09-30', tokens: 5000 }],
  providerUsage: [{ label: 'GOOGLE', value: 100 }],
  topProjects: [{ id: 'p1', name: 'Demo project', requests: 100, tokens: 5000 }],
  topApiKeys: [
    { id: 'k1', name: 'Demo key', projectName: 'Demo project', requests: 100, tokens: 5000 },
  ],
};
const models: AnalyticsModels = {
  periodDays: 30,
  models: [
    { provider: 'GOOGLE', model: 'gemini-2.0-flash', requests: 100, tokens: 5000, cost: 1.5 },
  ],
};
const cost: AnalyticsCost = {
  periodDays: 30,
  dailyCost: [{ date: '2026-09-30', cost: 1.5 }],
  monthlyCost: [{ month: '2026-09', cost: 1.5 }],
  providerCostBreakdown: [{ label: 'GOOGLE', value: 1.5 }],
};

const query = <T,>(data: T) => ({
  data,
  isPending: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
});

jest.mock('./hooks', () => ({
  useAnalyticsOverview: () => mocks.overview,
  useAnalyticsUsage: () => mocks.usage,
  useAnalyticsModels: () => mocks.models,
  useAnalyticsCost: () => mocks.cost,
}));

const mocks = {
  overview: query(overview),
  usage: query(usage),
  models: query(models),
  cost: query(cost),
};

describe('AnalyticsPage', () => {
  beforeEach(() => {
    mocks.overview = query(overview);
    mocks.usage = query(usage);
    mocks.models = query(models);
    mocks.cost = query(cost);
  });

  describe('for a role with full access (TENANT_ADMIN)', () => {
    beforeEach(() => {
      user = { role: 'TENANT_ADMIN' };
    });

    it('renders the summary cards with real figures', () => {
      render(<AnalyticsPage />);
      expect(screen.getByText('1,200')).toBeInTheDocument(); // requests
      expect(screen.getByText('$12.50')).toBeInTheDocument(); // cost
    });

    it('renders every chart', () => {
      render(<AnalyticsPage />);
      expect(screen.getByText('Request volume')).toBeInTheDocument();
      expect(screen.getByText('Token usage')).toBeInTheDocument();
      expect(screen.getByText('Cost trend')).toBeInTheDocument();
      expect(screen.getByText('Provider usage')).toBeInTheDocument();
    });

    it('renders every table', () => {
      render(<AnalyticsPage />);
      expect(screen.getByText('Top API keys')).toBeInTheDocument();
      expect(screen.getByText('Top projects')).toBeInTheDocument();
      expect(screen.getByText('Top models')).toBeInTheDocument();
      expect(screen.getAllByText('Demo project').length).toBeGreaterThan(0);
      expect(screen.getByText('gemini-2.0-flash')).toBeInTheDocument();
    });
  });

  describe('permission visibility', () => {
    it('hides the whole page from a role without VIEW_ANALYTICS', () => {
      // No role in the matrix actually lacks VIEW_ANALYTICS today except a signed-out user; this is
      // the page-level gate every other section's visibility sits behind.
      user = null;
      render(<AnalyticsPage />);
      expect(screen.getByText('You do not have access to this page')).toBeInTheDocument();
      expect(screen.queryByText('Usage Analytics')).not.toBeInTheDocument();
    });

    it('DEVELOPER sees usage but not the cost chart or a dollar figure', () => {
      user = { role: 'DEVELOPER' };
      mocks.overview = query({ ...overview, totalCost: null });
      mocks.models = query({ periodDays: 30, models: [{ ...models.models[0]!, cost: null }] });

      render(<AnalyticsPage />);

      expect(screen.getByText('Request volume')).toBeInTheDocument();
      expect(screen.queryByText('Cost trend')).not.toBeInTheDocument();
      expect(screen.queryByText('$12.50')).not.toBeInTheDocument();
    });

    it('FINANCE sees the cost chart and figures', () => {
      user = { role: 'FINANCE' };
      render(<AnalyticsPage />);

      expect(screen.getByText('Cost trend')).toBeInTheDocument();
      expect(screen.getByText('$12.50')).toBeInTheDocument();
    });
  });
});
