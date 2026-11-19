import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/services/api-error';
import { StartDemoButton } from './start-demo-button';

const replace = jest.fn();
const startDemo = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
jest.mock('./auth-provider', () => ({ useAuth: () => ({ startDemo }) }));

describe('StartDemoButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the explore demo workspace button', () => {
    render(<StartDemoButton />);
    expect(screen.getByRole('button', { name: /explore demo workspace/i })).toBeInTheDocument();
  });

  it('starts a demo session and navigates to /dashboard upon click', async () => {
    const user = userEvent.setup();
    startDemo.mockResolvedValueOnce({
      id: 'demo-user-1',
      isDemo: true,
      role: 'TENANT_ADMIN',
    });

    render(<StartDemoButton />);
    await user.click(screen.getByRole('button', { name: /explore demo workspace/i }));

    await waitFor(() => {
      expect(startDemo).toHaveBeenCalledTimes(1);
      expect(replace).toHaveBeenCalledWith('/dashboard');
    });
  });

  it('displays rate limiting error message on 429 status', async () => {
    const user = userEvent.setup();
    startDemo.mockRejectedValueOnce(new ApiError('Rate limit exceeded', 429));

    render(<StartDemoButton />);
    await user.click(screen.getByRole('button', { name: /explore demo workspace/i }));

    expect(
      await screen.findByText(
        'Too many demo sessions right now. Please try again in a few minutes.',
      ),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('displays demo disabled message on 404 status', async () => {
    const user = userEvent.setup();
    startDemo.mockRejectedValueOnce(new ApiError('Not found', 404));

    render(<StartDemoButton />);
    await user.click(screen.getByRole('button', { name: /explore demo workspace/i }));

    expect(
      await screen.findByText('The demo is not enabled on this deployment.'),
    ).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('displays database unseeded message on 503 status', async () => {
    const user = userEvent.setup();
    startDemo.mockRejectedValueOnce(new ApiError('The demo workspace is not set up', 503));

    render(<StartDemoButton />);
    await user.click(screen.getByRole('button', { name: /explore demo workspace/i }));

    expect(
      await screen.findByText(
        'The demo workspace is not set up in the database. Run "pnpm db:seed:demo" to initialize sample data.',
      ),
    ).toBeInTheDocument();
  });

  it('displays unreachable backend message on 502 status', async () => {
    const user = userEvent.setup();
    startDemo.mockRejectedValueOnce(new ApiError('Bad Gateway', 502));

    render(<StartDemoButton />);
    await user.click(screen.getByRole('button', { name: /explore demo workspace/i }));

    expect(
      await screen.findByText(
        'The backend control plane is currently unreachable (502). Please verify the backend service is running.',
      ),
    ).toBeInTheDocument();
  });
});
