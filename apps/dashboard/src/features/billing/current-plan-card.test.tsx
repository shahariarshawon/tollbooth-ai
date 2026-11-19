import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CurrentPlanCard } from './current-plan-card';
import type { BillingSummary } from '@/types/api';

const mockUseAuth = jest.fn();
jest.mock('@/features/auth/auth-provider', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('CurrentPlanCard', () => {
  const fakeSummary: BillingSummary = {
    currentPlan: {
      name: 'Startup Tier',
      code: 'STARTUP',
      monthlyPrice: 99,
      description: 'Standard plan for growing teams',
      features: ['Up to 100 RPM', 'Custom budget caps', 'Audit log retention'],
      status: 'ACTIVE',
    },
    monthlyLimit: 500,
    currentUsage: 125,
    remainingBudget: 375,
    estimatedCost: 150,
    totalTokens: 500000,
    providerBreakdown: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders current plan details and features', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'user-1', isDemo: false } });
    render(
      <CurrentPlanCard
        summary={fakeSummary}
        canManage={true}
        onChangePlan={jest.fn()}
        onAdjustLimits={jest.fn()}
      />,
    );

    expect(screen.getByText('Startup Tier')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    expect(screen.getByText('$99')).toBeInTheDocument();
    expect(screen.getByText('Standard plan for growing teams')).toBeInTheDocument();
    expect(screen.getByText('Up to 100 RPM')).toBeInTheDocument();
    expect(screen.getByText('Custom budget caps')).toBeInTheDocument();
  });

  it('allows plan change and budget adjustment for regular tenant managers', async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({ user: { id: 'user-1', isDemo: false } });
    const onChangePlan = jest.fn();
    const onAdjustLimits = jest.fn();

    render(
      <CurrentPlanCard
        summary={fakeSummary}
        canManage={true}
        onChangePlan={onChangePlan}
        onAdjustLimits={onAdjustLimits}
      />,
    );

    const changeBtn = screen.getByRole('button', { name: /change plan tier/i });
    expect(changeBtn).toBeInTheDocument();
    await user.click(changeBtn);
    expect(onChangePlan).toHaveBeenCalledTimes(1);

    const adjustBtn = screen.getByRole('button', { name: /adjust spending guardrails/i });
    expect(adjustBtn).toBeInTheDocument();
    await user.click(adjustBtn);
    expect(onAdjustLimits).toHaveBeenCalledTimes(1);
  });

  it('shows demo badge and disables mutation controls in demo workspaces', () => {
    mockUseAuth.mockReturnValue({ user: { id: 'demo-user', isDemo: true } });
    const onChangePlan = jest.fn();
    const onAdjustLimits = jest.fn();

    render(
      <CurrentPlanCard
        summary={fakeSummary}
        canManage={true}
        onChangePlan={onChangePlan}
        onAdjustLimits={onAdjustLimits}
      />,
    );

    expect(screen.getByText(/synthetic demo/i)).toBeInTheDocument();
    expect(
      screen.getByText(/plan changes and budget adjustments are read-only in the demo workspace/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change plan tier/i })).not.toBeInTheDocument();
  });
});
