import { render, screen, within } from '@testing-library/react';
import type { ProviderOverview } from '@/types/api';
import { buildOverview } from '@/services/mock/mock-store';
import { ProviderStatus } from './provider-status';

const providers: ProviderOverview[] = [
  { id: 'gemini', name: 'Google Gemini', status: 'ACTIVE' },
  { id: 'openai', name: 'OpenAI', status: 'AVAILABLE' },
  { id: 'anthropic', name: 'Anthropic', status: 'AVAILABLE' },
];

describe('ProviderStatus', () => {
  it('shows Gemini as the active provider', () => {
    render(<ProviderStatus providers={providers} />);
    const active = screen.getByRole('region', { name: 'Active' });
    expect(within(active).getByText('Google Gemini')).toBeInTheDocument();
    expect(within(active).queryByText('OpenAI')).not.toBeInTheDocument();
  });

  it('lists OpenAI and Anthropic as available, not removed', () => {
    render(<ProviderStatus providers={providers} />);
    const available = screen.getByRole('region', { name: 'Available' });
    expect(within(available).getByText('OpenAI')).toBeInTheDocument();
    expect(within(available).getByText('Anthropic')).toBeInTheDocument();
    expect(within(available).queryByText('Google Gemini')).not.toBeInTheDocument();
  });

  it('says so when nothing is active or available', () => {
    render(<ProviderStatus providers={[]} />);
    expect(screen.getAllByText('None')).toHaveLength(2);
  });

  it('follows the data: switching OpenAI on moves it to Active', () => {
    render(
      <ProviderStatus
        providers={providers.map((p) =>
          p.id === 'openai' ? { ...p, status: 'ACTIVE' as const } : p,
        )}
      />,
    );
    const active = screen.getByRole('region', { name: 'Active' });
    expect(within(active).getByText('OpenAI')).toBeInTheDocument();
    expect(within(active).getByText('Google Gemini')).toBeInTheDocument();
  });
});

describe('sample overview data', () => {
  it('has Gemini active and OpenAI and Anthropic available', () => {
    const { providers: sample } = buildOverview();
    expect(sample.find((p) => p.status === 'ACTIVE')?.name).toBe('Google Gemini');
    expect(sample.filter((p) => p.status === 'AVAILABLE').map((p) => p.name)).toEqual([
      'OpenAI',
      'Anthropic',
    ]);
  });

  it('shows Gemini models and no OpenAI traffic', () => {
    const overview = buildOverview();
    expect(overview.modelUsage.every((m) => m.label.startsWith('gemini'))).toBe(true);
    expect(overview.providerUsage.map((p) => p.label)).toEqual(['Google Gemini']);
  });
});
