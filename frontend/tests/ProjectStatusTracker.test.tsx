import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProjectStatusTracker from '../src/ProjectStatusTracker';
import { FakeEventSource } from './support/fakeEventSource';
import { installFakeProjectsApi, type FakeProject } from './support/fakeProjectsApi';

// Chart.js needs a real canvas, which jsdom lacks. Render the numbers it receives instead.
vi.mock('react-chartjs-2', () => ({
  Doughnut: ({ data }: { data: { datasets: { data: number[] }[] } }) => (
    <div data-testid="status-chart">{data.datasets[0].data.join(',')}</div>
  ),
}));

// The URLs h.i passes in as props; deliberately not the defaults.
const API = 'http://api.test';
const SSE = 'http://sse.test/events';

const seed: FakeProject[] = [
  { id: 1, name: 'Alpha', status: 'pending' },
  { id: 2, name: 'Beta', status: 'in_progress' },
  { id: 3, name: 'Gamma', status: 'completed' },
];

function renderDashboard(props: { apiUrl?: string; sseUrl?: string } = { apiUrl: API, sseUrl: SSE }) {
  return render(<ProjectStatusTracker {...props} />);
}

function statCard(label: string) {
  return screen.getByText(label, { selector: 'p' }).nextElementSibling;
}

function row(name: string) {
  return screen.getByRole('cell', { name }).closest('tr')!;
}

describe('ProjectStatusTracker', () => {
  it('loads projects and stats from the API the host passes in', async () => {
    installFakeProjectsApi(API, seed);
    renderDashboard();

    expect(screen.getByRole('status')).toHaveTextContent('Loading projects…');

    expect(await screen.findByRole('cell', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.queryByText('Loading projects…')).not.toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(4); // header + 3 projects

    expect(statCard('Total Projects')).toHaveTextContent('3');
    expect(statCard('Pending')).toHaveTextContent('1');
    expect(statCard('In Progress')).toHaveTextContent('1');
    expect(statCard('Completed')).toHaveTextContent('1');
    expect(screen.getByTestId('status-chart')).toHaveTextContent('1,1,1');

    expect(within(row('Beta')).getByText('In Progress', { selector: '.badge' })).toBeInTheDocument();
    expect(FakeEventSource.latest().url).toBe(SSE);
  });

  it('falls back to the standalone URLs when no props are given', async () => {
    const api = installFakeProjectsApi('http://localhost:8011', seed);
    renderDashboard({});

    await screen.findByRole('cell', { name: 'Alpha' });
    expect(api.requests[0].url).toBe('http://localhost:8011/api/projects');
    expect(FakeEventSource.latest().url).toBe('http://localhost:8012/events');
  });

  it('changes a status through the API and shows the result', async () => {
    const user = userEvent.setup();
    const api = installFakeProjectsApi(API, seed);
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Change status of Alpha' }), 'completed');

    await waitFor(() => expect(statCard('Completed')).toHaveTextContent('2'));
    expect(statCard('Pending')).toHaveTextContent('0');
    expect(within(row('Alpha')).getByText('Completed', { selector: '.badge' })).toBeInTheDocument();
    expect(screen.getByTestId('status-chart')).toHaveTextContent('0,1,2');

    const post = api.requests.find((r) => r.method === 'POST')!;
    expect(post.url).toBe(`${API}/api/projects/1/status`);
    expect(post.body).toEqual({ status: 'completed' });
    expect(post.headers.get('Content-Type')).toBe('application/json');
    expect(post.headers.get('Accept')).toBe('application/json');
    expect(api.projects[0].status).toBe('completed');
  });

  it('shows the API error when a status change fails, and recovers on the next one', async () => {
    const user = userEvent.setup();
    installFakeProjectsApi(API, [{ id: 1, name: 'Alpha', status: 'pending' }]);
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });

    // Delete the project behind the dashboard's back, so the update returns 404.
    vi.mocked(fetch).mockImplementationOnce(async () =>
      new Response(JSON.stringify({ message: 'No query results for model' }), { status: 404 }),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Change status of Alpha' }), 'completed');

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not update project #1. No query results for model');
    expect(screen.getByRole('combobox', { name: 'Change status of Alpha' })).toBeEnabled();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Change status of Alpha' }), 'in_progress');
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(statCard('In Progress')).toHaveTextContent('1');
  });

  it('shows an error when the API cannot be reached', async () => {
    installFakeProjectsApi('http://somewhere-else.test', seed);
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent(`Could not load projects from ${API}.`);
    expect(screen.queryByText('Loading projects…')).not.toBeInTheDocument();
    expect(statCard('Total Projects')).toHaveTextContent('0');
  });

  it('shows the server message when the API answers with an error', async () => {
    const api = installFakeProjectsApi(API, seed);
    api.failNextList(500);
    renderDashboard();

    expect(await screen.findByRole('alert')).toHaveTextContent('Server Error');
  });

  it('lists live events and re-syncs from the API when one arrives', async () => {
    const api = installFakeProjectsApi(API, seed);
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });
    expect(screen.getByText('Listening for live events from Kafka...')).toBeInTheDocument();

    // Another user changed Beta; the SSE hub forwards the Kafka event.
    api.setStatus(2, 'completed');
    act(() => {
      FakeEventSource.latest().emit({ project_id: 2, name: 'Beta', status: 'completed', timestamp: '2026-11-10T12:00:00Z' });
    });

    const feed = screen.getByRole('heading', { name: 'Recent SSE Events' }).parentElement!;
    expect(within(feed).getByText('#2')).toBeInTheDocument();
    expect(within(feed).getByText('2026-11-10T12:00:00Z')).toBeInTheDocument();
    await waitFor(() => expect(statCard('Completed')).toHaveTextContent('2'));
  });

  it('shows external events by their external id and keeps only the 5 latest', async () => {
    installFakeProjectsApi(API, seed);
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });

    act(() => {
      for (let i = 1; i <= 7; i++) {
        FakeEventSource.latest().emit({ external_id: `ext-${i}`, status: 'pending', timestamp: `t${i}` });
      }
    });

    const feed = screen.getByRole('heading', { name: 'Recent SSE Events' }).parentElement!;
    expect(within(feed).getAllByRole('listitem')).toHaveLength(5);
    expect(within(feed).getAllByRole('listitem')[0]).toHaveTextContent('ext-7');
    expect(within(feed).queryByText('ext-2')).not.toBeInTheDocument();
  });

  it('ignores a malformed event but still re-syncs', async () => {
    const api = installFakeProjectsApi(API, seed);
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });
    const before = api.listCalls();

    act(() => FakeEventSource.latest().emit('not json'));

    expect(screen.getByText('Listening for live events from Kafka...')).toBeInTheDocument();
    await waitFor(() => expect(api.listCalls()).toBe(before + 1));
  });

  it('warns while live updates are disconnected and clears the warning on reconnect', async () => {
    installFakeProjectsApi(API, seed);
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });

    act(() => FakeEventSource.latest().fail());
    expect(screen.getByText(`Live updates are disconnected from ${SSE}. Reconnecting…`)).toBeInTheDocument();

    act(() => FakeEventSource.latest().open());
    expect(screen.queryByText(/Live updates are disconnected/)).not.toBeInTheDocument();
  });

  it('closes the live connection when the host unmounts it', async () => {
    installFakeProjectsApi(API, seed);
    const { unmount } = renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });

    const source = FakeEventSource.latest();
    unmount();

    expect(source.closed).toBe(true);
  });
});
