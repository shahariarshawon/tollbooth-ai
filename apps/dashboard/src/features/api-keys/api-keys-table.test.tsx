import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ApiKey } from '@/types/api';
import { ApiKeysTable } from './api-keys-table';
import { SecretRevealDialog } from './secret-reveal-dialog';

const active: ApiKey = {
  id: 'k1',
  projectId: 'p1',
  projectName: 'Customer Support AI',
  name: 'Production',
  keyPrefix: 'tb_live_a1b2c3',
  permissions: ['chat:completions', 'models:read'],
  rateLimit: 600,
  status: 'ACTIVE',
  createdAt: '2026-01-15T10:00:00.000Z',
  lastUsedAt: null,
};
const revoked: ApiKey = {
  ...active,
  id: 'k2',
  name: 'Old key',
  rateLimit: null,
  status: 'REVOKED',
};

describe('ApiKeysTable', () => {
  it('lists each key with project, permissions, rate limit and status', () => {
    render(<ApiKeysTable keys={[active, revoked]} />);

    const row = screen.getByText('Production').closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('Customer Support AI');
    expect(row).toHaveTextContent('chat:completions');
    expect(row).toHaveTextContent('models:read');
    expect(row).toHaveTextContent('600 / min');
    expect(row).toHaveTextContent('Active');
    expect(screen.getByText('Old key').closest('tr')).toHaveTextContent('Plan default');
    expect(screen.getByText('Old key').closest('tr')).toHaveTextContent('Revoked');
  });

  it('shows only a key prefix and never anything that looks like a full key', () => {
    const { container } = render(<ApiKeysTable keys={[active]} />);

    expect(screen.getByText('tb_live_a1b2c3...')).toBeInTheDocument();
    // A full key is tb_live_ followed by 40 hex characters.
    expect(container.textContent).not.toMatch(/tb_live_[0-9a-f]{20,}/);
  });

  it('renders no actions when the user has neither permission', () => {
    render(<ApiKeysTable keys={[active]} />);
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
  });

  it('offers rotate and revoke to users who may, and reports the chosen key', async () => {
    const onRotate = jest.fn();
    const onRevoke = jest.fn();
    render(<ApiKeysTable keys={[active]} onRotate={onRotate} onRevoke={onRevoke} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Production' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Revoke key' }));
    expect(onRevoke).toHaveBeenCalledWith(active);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Production' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Rotate key' }));
    expect(onRotate).toHaveBeenCalledWith(active);
  });

  it('offers only the actions the user holds', async () => {
    render(<ApiKeysTable keys={[active]} onRotate={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Production' }));
    expect(await screen.findByRole('menuitem', { name: 'Rotate key' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Revoke key' })).not.toBeInTheDocument();
  });

  it('offers nothing on a revoked key', () => {
    render(<ApiKeysTable keys={[revoked]} onRotate={jest.fn()} onRevoke={jest.fn()} />);
    expect(screen.queryByRole('button', { name: /actions for/i })).not.toBeInTheDocument();
  });
});

describe('SecretRevealDialog', () => {
  const issued = { apiKey: active, secret: `tb_live_${'ab12'.repeat(10)}` };

  it('shows the key with a one-time warning and closes on Done', async () => {
    const onClose = jest.fn();
    render(<SecretRevealDialog issued={issued} onClose={onClose} />);

    expect(screen.getByTestId('api-key-secret')).toHaveTextContent(issued.secret);
    expect(screen.getByText(/will not be shown again/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('copies the key to the clipboard', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<SecretRevealDialog issued={issued} onClose={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy key' }));
    expect(writeText).toHaveBeenCalledWith(issued.secret);
    expect(await screen.findByText('Copied to clipboard.')).toBeInTheDocument();
  });
});
