import { render, screen, within } from '@testing-library/react';
import type { ProviderStatusRow } from '@tollbooth/shared';
import { BudgetCard } from './budget-card';
import { ProviderHealthCard } from './provider-health';

const provider = (overrides: Partial<ProviderStatusRow>): ProviderStatusRow => ({
  id: 'gemini',
  name: 'Google Gemini',
  enabled: true,
  circuit: 'CLOSED',
  health: 'HEALTHY',
  recentRequests: 12,
  recentFailures: 0,
  ...overrides,
});

const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

describe('ProviderHealthCard', () => {
  it('says each state in words, not colour alone', () => {
    render(
      <ProviderHealthCard
        providers={[
          provider({}),
          provider({ id: 'openai', name: 'OpenAI', circuit: 'OPEN', health: 'DOWN' }),
          provider({ id: 'anthropic', name: 'Anthropic', enabled: false, health: 'DISABLED' }),
        ]}
      />,
    );
    expect(within(row('Google Gemini')).getByText('Healthy')).toBeInTheDocument();
    expect(within(row('OpenAI')).getByText('Down')).toBeInTheDocument();
    expect(within(row('OpenAI')).getByText(/Circuit open/)).toBeInTheDocument();
    expect(within(row('Anthropic')).getByText('Disabled')).toBeInTheDocument();
  });

  it('shows recent calls and failures, and admits when the circuit state is unknown', () => {
    render(
      <ProviderHealthCard
        providers={[
          provider({ circuit: null, recentRequests: 20, recentFailures: 3, health: 'DEGRADED' }),
        ]}
      />,
    );
    const item = row('Google Gemini');
    expect(within(item).getByText(/Circuit unknown/)).toBeInTheDocument();
    expect(within(item).getByText(/20 calls, 3 failed/)).toBeInTheDocument();
    expect(within(item).getByText('Degraded')).toBeInTheDocument();
  });

  it('has an empty state when no provider is configured', () => {
    render(<ProviderHealthCard providers={[]} />);
    expect(screen.getByText('No providers configured')).toBeInTheDocument();
  });
});

describe('BudgetCard', () => {
  const budget = (spentUsd: number) => ({
    limitUsd: 100,
    spentUsd,
    utilization: spentUsd / 100,
  });

  it('exposes the utilisation to assistive technology', () => {
    render(<BudgetCard budget={budget(42)} />);
    const bar = screen.getByRole('progressbar', { name: 'Monthly budget used' });
    expect(bar).toHaveAttribute('aria-valuenow', '42');
    expect(bar).toHaveAttribute('aria-valuetext', '42% of the monthly budget used');
    expect(screen.getByText('42% used · On track')).toBeInTheDocument();
  });

  it('warns in words as the limit approaches, and caps the bar at 100%', () => {
    const { rerender } = render(<BudgetCard budget={budget(80)} />);
    expect(screen.getByText('80% used · Approaching the limit')).toBeInTheDocument();
    rerender(<BudgetCard budget={budget(95)} />);
    expect(screen.getByText('95% used · Nearly spent')).toBeInTheDocument();
    rerender(<BudgetCard budget={budget(140)} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByText('140% used · Nearly spent')).toBeInTheDocument();
  });
});
