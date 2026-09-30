import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryBoundary } from './query-boundary';

type Query = Parameters<typeof QueryBoundary<string[]>>[0]['query'];

const base: Query = {
  data: undefined,
  isPending: false,
  isError: false,
  error: null,
  refetch: jest.fn(),
} as unknown as Query;

const renderBoundary = (query: Partial<Query>) =>
  render(
    <QueryBoundary<string[]>
      query={{ ...base, ...query } as Query}
      loading={<p>loading</p>}
      empty={<p>nothing here</p>}
      isEmpty={(items) => items.length === 0}
    >
      {(items) => (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </QueryBoundary>,
  );

describe('QueryBoundary', () => {
  it('shows the loading state first', () => {
    renderBoundary({ isPending: true });
    expect(screen.getByText('loading')).toBeInTheDocument();
  });

  it('shows the empty state for no data', () => {
    renderBoundary({ data: [] });
    expect(screen.getByText('nothing here')).toBeInTheDocument();
  });

  it('renders content when there is data', () => {
    renderBoundary({ data: ['a', 'b'] });
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('shows the error with a working retry button', async () => {
    const refetch = jest.fn();
    renderBoundary({ isError: true, error: new Error('Boom'), refetch } as Partial<Query>);

    expect(screen.getByRole('alert')).toHaveTextContent('Boom');
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
