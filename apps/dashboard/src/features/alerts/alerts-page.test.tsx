import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Alert } from '@/types/api';
import { AlertsPage } from './alerts-page';

const alerts: Alert[] = [
  {
    id: 'a1',
    type: 'BUDGET_LIMIT',
    message: 'Monthly budget reached',
    severity: 'CRITICAL',
    status: 'UNREAD',
    createdAt: '2026-09-30T00:00:00.000Z',
    readAt: null,
  },
  {
    id: 'a2',
    type: 'PROVIDER_ERROR',
    message: 'Gemini timed out',
    severity: 'WARNING',
    status: 'READ',
    createdAt: '2026-09-29T00:00:00.000Z',
    readAt: '2026-09-29T01:00:00.000Z',
  },
];

const mutate = jest.fn();
const mocks = {
  alerts: {
    data: { data: alerts, total: 2, limit: 20, offset: 0 },
    isPending: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  },
};

jest.mock('./hooks', () => ({
  ALERTS_PAGE_SIZE: 20,
  useAlerts: () => mocks.alerts,
  useMarkAlertRead: () => ({ mutate, isPending: false, variables: undefined }),
}));

describe('AlertsPage', () => {
  beforeEach(() => {
    mutate.mockClear();
    mocks.alerts = {
      data: { data: alerts, total: 2, limit: 20, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    };
  });

  it('shows alert list: severity, message and date', () => {
    render(<AlertsPage />);

    expect(screen.getByText('Monthly budget reached')).toBeInTheDocument();
    expect(screen.getByText('Gemini timed out')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Warning')).toBeInTheDocument();
  });

  it('shows read/unread status for each alert', () => {
    render(<AlertsPage />);

    expect(screen.getByText('Unread')).toBeInTheDocument();
    expect(screen.getByText('Read')).toBeInTheDocument();
  });

  it('mark as read: clicking the action on an unread alert calls the mutation with its id', async () => {
    render(<AlertsPage />);

    await userEvent.click(screen.getByRole('button', { name: 'Mark as read' }));

    expect(mutate).toHaveBeenCalledWith('a1');
    // The already-read alert has no such button.
    expect(screen.getAllByRole('button', { name: 'Mark as read' })).toHaveLength(1);
  });

  it('shows an empty state when there are no alerts', () => {
    mocks.alerts = {
      data: { data: [], total: 0, limit: 20, offset: 0 },
      isPending: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    };
    render(<AlertsPage />);

    expect(screen.getByText('No alerts')).toBeInTheDocument();
  });
});
