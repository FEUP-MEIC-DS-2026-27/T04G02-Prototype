import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProjectStatusTracker from '../src/ProjectStatusTracker';
import { FakeEventSource } from './support/fakeEventSource';
import { installFakeProjectsApi, type FakeProject } from './support/fakeProjectsApi';

vi.mock('react-chartjs-2', () => {
  const fake = ({ data }: { data: { datasets: { data: number[] }[] } }) => (
    <div data-testid="status-chart">{data.datasets[0].data.join(',')}</div>
  );
  return { Doughnut: fake, Bar: fake };
});

const API = 'http://api.test';
const SSE = 'http://sse.test/events';

// Same data as h.i's browser test for this page: padded and blank programmes included.
const seed: FakeProject[] = [
  { id: 101, name: 'Horizon planned', status: 'planned', programme: ' Horizon Europe ' },
  { id: 102, name: 'Horizon active', status: 'active', programme: 'Horizon Europe' },
  { id: 103, name: 'FCT completed', status: 'completed', programme: 'FCT' },
  { id: 104, name: 'Unassigned planned', status: 'planned', programme: null },
  { id: 105, name: 'Unassigned completed', status: 'completed', programme: '   ' },
];
const allNames = seed.map((p) => p.name);

async function renderDashboard() {
  const api = installFakeProjectsApi(API, seed);
  render(<ProjectStatusTracker apiUrl={API} sseUrl={SSE} />);
  await screen.findByRole('cell', { name: 'Horizon planned' });
  return api;
}

const programmeFilter = () => screen.getByRole('combobox', { name: 'Funding programme' });
const projectFilter = () => screen.getByRole('combobox', { name: 'Project' });
const statCard = (label: string) => screen.getByText(label, { selector: 'p' }).nextElementSibling;
const inventory = () => screen.getByRole('heading', { name: 'Project Inventory' }).parentElement!;

function expectProjects(names: string[], [total, planned, active, completed]: number[]) {
  const shown = within(inventory()).queryAllByRole('cell', { name: (_, el) => el.classList.contains('fw-medium') })
    .map((cell) => cell.textContent);
  // Rows are ranked by alert level, so compare them as a set.
  expect([...shown].sort()).toEqual([...names].sort());
  expect(screen.getByText(/^Showing/)).toHaveTextContent(`Showing ${names.length} of ${seed.length} projects.`);
  expect(statCard('Total Projects')).toHaveTextContent(String(total));
  expect(statCard('Planned')).toHaveTextContent(String(planned));
  expect(statCard('Active')).toHaveTextContent(String(active));
  expect(statCard('Completed')).toHaveTextContent(String(completed));
}

describe('ProjectStatusTracker filters', () => {
  it('lists the trimmed programmes in order, then Unassigned', async () => {
    await renderDashboard();

    const options = within(programmeFilter()).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['All programmes', 'FCT', 'Horizon Europe', 'Unassigned']);
    expectProjects(allNames, [5, 2, 1, 2]);
  });

  it('filters the inventory, totals and chart by programme', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    await user.selectOptions(programmeFilter(), 'Horizon Europe');
    expectProjects(['Horizon planned', 'Horizon active'], [2, 1, 1, 0]);
    expect(screen.getByTestId('status-chart')).toHaveTextContent('1,1,0,0,0');

    await user.selectOptions(programmeFilter(), 'Unassigned');
    expectProjects(['Unassigned planned', 'Unassigned completed'], [2, 1, 0, 1]);
    expect(within(inventory()).getAllByText('Unassigned', { selector: 'td' })).toHaveLength(2);
  });

  it('combines the programme and project filters, and says when nothing matches', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    await user.selectOptions(programmeFilter(), 'Horizon Europe');
    await user.selectOptions(projectFilter(), '102');
    expectProjects(['Horizon active'], [1, 0, 1, 0]);

    await user.selectOptions(programmeFilter(), 'FCT');
    expectProjects([], [0, 0, 0, 0]);
    expect(screen.getAllByText('No projects match these filters.')).toHaveLength(2); // chart and table
    expect(screen.queryByTestId('status-chart')).not.toBeInTheDocument();
  });

  it('clears both filters', async () => {
    const user = userEvent.setup();
    await renderDashboard();
    await user.selectOptions(programmeFilter(), 'FCT');
    await user.selectOptions(projectFilter(), '103');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(programmeFilter()).toHaveValue('');
    expect(projectFilter()).toHaveValue('');
    expectProjects(allNames, [5, 2, 1, 2]);
  });

  it('keeps every project in the project filter, whatever the programme', async () => {
    const user = userEvent.setup();
    await renderDashboard();
    await user.selectOptions(programmeFilter(), 'FCT');

    expect(within(projectFilter()).getAllByRole('option')).toHaveLength(seed.length + 1);
  });

  it('only shows live events for the filtered projects', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    act(() => {
      FakeEventSource.latest().emit({ project_id: 101, status: 'completed', timestamp: 't1' });
      FakeEventSource.latest().emit({ project_id: 103, status: 'planned', timestamp: 't2' });
    });
    const feed = () => screen.getByRole('heading', { name: 'Recent SSE Events' }).parentElement!;
    expect(within(feed()).getAllByRole('listitem')).toHaveLength(2);

    await user.selectOptions(programmeFilter(), 'FCT');
    expect(within(feed()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(feed()).getByText('#103')).toBeInTheDocument();
  });

  it('keeps deleted projects in the live events while filtering', async () => {
    const user = userEvent.setup();
    await renderDashboard();
    await user.selectOptions(programmeFilter(), 'FCT');

    act(() => {
      FakeEventSource.latest().emit({ project_id: 101, status: 'completed', timestamp: 't1' });
      FakeEventSource.latest().emit({ external_id: 'INE-25-0009', deleted: true, timestamp: 't2' });
    });

    const feed = screen.getByRole('heading', { name: 'Recent SSE Events' }).parentElement!;
    expect(within(feed).getAllByRole('listitem')).toHaveLength(1);
    expect(within(feed).getByText('INE-25-0009')).toBeInTheDocument();
  });

  it('hides the programme filter when no project has a programme', async () => {
    installFakeProjectsApi(API, [
      { id: 1, name: 'Imported', status: 'active', programme: null },
      { id: 2, name: 'Also imported', status: 'planned' },
    ]);
    render(<ProjectStatusTracker apiUrl={API} sseUrl={SSE} />);
    await screen.findByRole('cell', { name: 'Imported' });

    expect(screen.queryByRole('combobox', { name: 'Funding programme' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Project' })).toBeInTheDocument();
  });
});

describe('ProjectStatusTracker behind the h.i gateway', () => {
  it('uses the apiPath prop for loading and updating', async () => {
    const user = userEvent.setup();
    const api = installFakeProjectsApi('', seed, '/api/project-status');
    render(<ProjectStatusTracker apiUrl="" apiPath="/api/project-status" sseUrl="/api/project-status/events" />);
    await screen.findByRole('cell', { name: 'Horizon planned' });

    await user.selectOptions(screen.getByRole('combobox', { name: 'Change status of FCT completed' }), 'planned');

    await waitFor(() => expect(api.projects.find((p) => p.id === 103)?.status).toBe('planned'));
    expect(api.requests.map((r) => `${r.method} ${r.url}`)).toEqual(expect.arrayContaining([
      'GET /api/project-status',
      'POST /api/project-status/103/status',
    ]));
    expect(FakeEventSource.latest().url).toBe('/api/project-status/events');
  });
});
