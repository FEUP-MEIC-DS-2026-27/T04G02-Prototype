import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProjectStatusTracker from '../src/ProjectStatusTracker';
import { FakeEventSource } from './support/fakeEventSource';
import { installFakeProjectsApi, type FakeProject } from './support/fakeProjectsApi';
import { createBarOptions, createStatusDistributionData } from '../src/ProjectStatusTracker';


// Chart.js needs a real canvas, which jsdom lacks. Render the numbers it receives instead.
vi.mock('react-chartjs-2', () => {
  const fake = (type: string) =>
    ({ data }: { data: { datasets: { data: number[] }[] } }) => (
      <div data-testid="status-chart" data-chart-type={type}>
        {data.datasets[0].data.join(',')}
      </div>
    );
  return { Doughnut: fake('doughnut'), Bar: fake('bar') };
});

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

    expect(screen.getByText('Loading projects…').closest('[role="status"]')).not.toBeNull();

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
    const api = installFakeProjectsApi('http://localhost:8340', seed);
    renderDashboard({});

    await screen.findByRole('cell', { name: 'Alpha' });
    expect(api.requests[0].url).toBe('http://localhost:8340/api/projects');
    expect(FakeEventSource.latest().url).toBe('http://localhost:8341/events');
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

  it('describes changes from projects-service with their original status, and removals', async () => {
    installFakeProjectsApi(API, seed);
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });

    act(() => {
      FakeEventSource.latest().emit({
        project_id: 4, external_id: 'INE-25-0001', status: 'completed', source_status: 'Cancelled',
        source: 'projects-service', timestamp: 't1',
      });
      FakeEventSource.latest().emit({
        external_id: 'INE-25-0002', deleted: true, source: 'projects-service', timestamp: 't2',
      });
    });

    const feed = screen.getByRole('heading', { name: 'Recent SSE Events' }).parentElement!;
    const [removed, updated] = within(feed).getAllByRole('listitem');
    expect(removed).toHaveTextContent('INE-25-0002');
    expect(removed).toHaveTextContent('removed');
    expect(updated).toHaveTextContent('#4');
    expect(updated).toHaveTextContent('updated to completed (Cancelled)');
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
  it('switches the status chart between bar and donut, keeping the same data', async () => {
    const user = userEvent.setup();
    installFakeProjectsApi(API, seed);
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });

    // Default is bar.
    expect(screen.getByRole('button', { name: 'Bar' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Donut' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('status-chart')).toHaveAttribute('data-chart-type', 'bar');

    await user.click(screen.getByRole('button', { name: 'Donut' }));
    expect(screen.getByRole('button', { name: 'Donut' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('status-chart')).toHaveAttribute('data-chart-type', 'doughnut');
    expect(screen.getByTestId('status-chart')).toHaveTextContent('1,1,1');

    await user.click(screen.getByRole('button', { name: 'Bar' }));
    expect(screen.getByTestId('status-chart')).toHaveAttribute('data-chart-type', 'bar');
    expect(screen.getByTestId('status-chart')).toHaveTextContent('1,1,1');
  });
  it('builds chart data from stats and a percentage tooltip', () => {
  const stats = { total: 4, pending: 1, in_progress: 1, completed: 2 };
  expect(createStatusDistributionData(stats).datasets[0].data).toEqual([1, 1, 2]);

  const label = createBarOptions(stats).plugins.tooltip.callbacks.label;
  expect(label({ raw: 2 })).toBe(' 2 projects (50%)');
  expect(label({ raw: 0 })).toBe(' 0 projects (0%)');
});

it('does not divide by zero when there are no projects', () => {
  const empty = { total: 0, pending: 0, in_progress: 0, completed: 0 };
  expect(createBarOptions(empty).plugins.tooltip.callbacks.label({ raw: 0 })).toBe(' 0 projects (0%)');
});
});
