import { render, screen, within } from '@testing-library/react';
import { CardGridSkeleton } from '@/components/ui/states';
import { DashboardStats } from './dashboard-stats';

const stats = {
  totalRequests: 123_456,
  totalTokens: 48_250_000,
  currentSpend: 1234.5,
  activeProjects: 3,
};

describe('DashboardStats', () => {
  it('shows the four headline cards with formatted values', () => {
    render(<DashboardStats stats={stats} />);

    const expected: [string, string][] = [
      ['Total AI Requests', '123,456'],
      ['Total Tokens', '48.3M'],
      ['Current Spending', '$1,235'],
      ['Active Projects', '3'],
    ];
    for (const [title, value] of expected) {
      const card = screen.getByText(title).closest('div[class*="rounded-xl"]') as HTMLElement;
      expect(card).not.toBeNull();
      expect(within(card).getByText(value)).toBeInTheDocument();
    }
  });

  it('renders exactly four cards', () => {
    render(<DashboardStats stats={stats} />);
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(4);
  });

  it('handles an empty account', () => {
    render(
      <DashboardStats
        stats={{ totalRequests: 0, totalTokens: 0, currentSpend: 0, activeProjects: 0 }}
      />,
    );
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.getAllByText('0').length).toBeGreaterThanOrEqual(3);
  });

  it('has a matching loading skeleton', () => {
    render(<CardGridSkeleton />);
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});
