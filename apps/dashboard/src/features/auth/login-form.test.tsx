import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/services/api-error';
import { LoginForm } from './login-form';

const replace = jest.fn();
const login = jest.fn();

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
jest.mock('./auth-provider', () => ({ useAuth: () => ({ login }) }));

async function fill(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

describe('LoginForm', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires both fields before calling the API', async () => {
    render(<LoginForm />);
    await fill('', '');

    expect(await screen.findByText('Email is required')).toBeInTheDocument();
    expect(screen.getByText('Password is required')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('rejects a malformed email', async () => {
    render(<LoginForm />);
    await fill('not-an-email', 'secret');

    expect(await screen.findByText('Enter a valid email address')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('signs in and redirects to the requested page', async () => {
    login.mockResolvedValue({ id: 'u1' });
    render(<LoginForm redirectTo="/dashboard/users" />);
    await fill('ada@acme.com', 'Sup3rSecret');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard/users'));
    expect(login).toHaveBeenCalledWith({ email: 'ada@acme.com', password: 'Sup3rSecret' });
  });

  it('shows a generic message for wrong credentials and does not redirect', async () => {
    login.mockRejectedValue(new ApiError('Invalid email or password', 401));
    render(<LoginForm />);
    await fill('ada@acme.com', 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.');
    expect(replace).not.toHaveBeenCalled();
  });

  it('explains rate limiting', async () => {
    login.mockRejectedValue(new ApiError('Too many requests', 429));
    render(<LoginForm />);
    await fill('ada@acme.com', 'whatever');

    expect(await screen.findByRole('alert')).toHaveTextContent(/too many sign-in attempts/i);
  });

  it('disables the button and shows progress while signing in', async () => {
    let finish: (value: unknown) => void = () => undefined;
    login.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    render(<LoginForm />);
    await fill('ada@acme.com', 'Sup3rSecret');

    const button = await screen.findByRole('button', { name: /signing in/i });
    expect(button).toBeDisabled();

    finish({ id: 'u1' });
    await waitFor(() => expect(replace).toHaveBeenCalled());
  });
});
