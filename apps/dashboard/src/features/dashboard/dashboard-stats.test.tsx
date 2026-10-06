import { render, screen, within } from '@testing-library/react';
import { DashboardStats } from './dashboard-stats';

const stats = {
  requests: 123_456,
  tokens: 48_250_000,
  cost: 1234.5,
  errorRate: 0.034,
  p95LatencyMs: 1820,
  activeProjects: 3,
  activeApiKeys: 7,
};

const card = (title: string) =>
  screen.getByText(title).closest('div[class*="rounded-xl"]') as HTMLElement;

describe('DashboardStats', () => {
  it('shows the headline cards with formatted values', () => {
    render(<DashboardStats stats={stats} periodDays={30} />);

    const expected: [string, string][] = [
      ['Requests', '123,456'],
      ['Tokens', '48.3M'],
      ['Spend', '$1,235'],
      ['Error rate', '3.4%'],
      ['p95 latency', '1,820 ms'],
      ['Active projects', '3'],
    ];
    for (const [title, value] of expected) {
      expect(within(card(title)).getByText(value)).toBeInTheDocument();
    }
    expect(screen.getByText('7 active API keys')).toBeInTheDocument();
  });

  it('omits the spend card for a role without billing access, and keeps the rest', () => {
    render(<DashboardStats stats={{ ...stats, cost: null }} periodDays={30} />);
    expect(screen.queryByText('Spend')).not.toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(5);
  });

  it('handles an account with no traffic', () => {
    render(
      <DashboardStats
        stats={{
          requests: 0,
          tokens: 0,
          cost: 0,
          errorRate: 0,
          p95LatencyMs: null,
          activeProjects: 0,
          activeApiKeys: 1,
        }}
        periodDays={30}
      />,
    );
    expect(within(card('Error rate')).getByText('0%')).toBeInTheDocument();
    expect(within(card('p95 latency')).getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('1 active API key')).toBeInTheDocument();
  });

  it('names the period it covers', () => {
    render(<DashboardStats stats={stats} periodDays={7} />);
    expect(screen.getAllByText('Last 7 days').length).toBeGreaterThan(0);
  });
});
