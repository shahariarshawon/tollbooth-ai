import { render, screen } from '@testing-library/react';
import { NotificationBell } from './notification-bell';

const mocks = { unread: { data: [] as unknown[] } };
jest.mock('./hooks', () => ({ useUnreadAlerts: () => mocks.unread }));

describe('NotificationBell', () => {
  it('shows no badge when there are no unread alerts', () => {
    mocks.unread = { data: [] };
    render(<NotificationBell />);

    expect(screen.getByRole('link', { name: 'Alerts' })).toBeInTheDocument();
  });

  it('shows the unread count as a badge', () => {
    mocks.unread = { data: [1, 2, 3] };
    render(<NotificationBell />);

    expect(screen.getByRole('link', { name: 'Alerts, 3 unread' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('caps the badge at 9+', () => {
    mocks.unread = { data: Array.from({ length: 15 }) };
    render(<NotificationBell />);

    expect(screen.getByText('9+')).toBeInTheDocument();
  });
});
