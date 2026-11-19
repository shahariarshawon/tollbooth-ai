import { render, screen } from '@testing-library/react';
import DemoPage from './page';
import * as demoModule from '@/lib/server/demo';

jest.mock('@/lib/server/demo');
jest.mock('@/features/auth/start-demo-button', () => ({
  StartDemoButton: () => <button>Mocked Start Demo Button</button>,
}));

describe('DemoPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders interactive workspace introduction when demo is enabled', () => {
    jest.spyOn(demoModule, 'isDemoEnabled').mockReturnValue(true);

    render(<DemoPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Demo workspace' })).toBeInTheDocument();
    expect(
      screen.getByText('A read-only tour of the dashboard, with sample data.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/no sign-up and no password/i)).toBeInTheDocument();
    expect(screen.getByText('Mocked Start Demo Button')).toBeInTheDocument();
  });

  it('renders truthful setup and instructions when demo is disabled on the deployment', () => {
    jest.spyOn(demoModule, 'isDemoEnabled').mockReturnValue(false);

    render(<DemoPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Demo workspace' })).toBeInTheDocument();
    expect(screen.getByText('The demo is not enabled on this deployment.')).toBeInTheDocument();
    expect(screen.getByText(/requires a connected control-plane backend/i)).toBeInTheDocument();
    expect(screen.getByText('pnpm db:seed:demo')).toBeInTheDocument();
  });
});
