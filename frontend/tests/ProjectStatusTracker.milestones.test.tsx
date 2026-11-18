import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProjectStatusTracker from '../src/ProjectStatusTracker';
import { milestoneInfo, sortByAlert, type Milestone, type ProjectAlert } from '../src/projectAlerts';
import { FakeEventSource } from './support/fakeEventSource';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';



const alertOf = (level: ProjectAlert['level'], messages: string[] = []): ProjectAlert => ({
  level,
  messages,
  urgencyDays: 0,
});
const defaultInfo = (m: Milestone) =>
  ({ state: m.status === 'achieved' ? 'completed' : 'upcoming', timeLabel: '' }) as Info;

beforeEach(() => {
  vi.mocked(sortByAlert).mockReset();
  vi.mocked(milestoneInfo).mockReset();
  vi.mocked(sortByAlert).mockImplementation(
    (list) => list.map((project) => ({ project, alert: alertOf('green') })) as Ranked,
  );
  vi.mocked(milestoneInfo).mockImplementation(defaultInfo);
});

afterEach(() => {
  vi.unstubAllGlobals();
});
vi.mock('react-chartjs-2', () => {
  const fake = (type: string) =>
    ({ data }: { data: { datasets: { data: number[] }[] } }) => (
      <div data-testid="status-chart" data-chart-type={type}>
        {data.datasets[0].data.join(',')}
      </div>
    );
  return { Doughnut: fake('doughnut'), Bar: fake('bar') };
});

// The alert and milestone rules have their own tests. Here only the wiring is under test.
vi.mock('../src/projectAlerts', () => ({
  sortByAlert: vi.fn(),
  milestoneInfo: vi.fn(),
}));

const API = 'http://api.test';
const SSE = 'http://sse.test/events';

interface TestProject {
  id: number;
  name: string;
  status: string;
  deadline?: string | null;
  milestones?: Milestone[];
}

interface Recorded {
  url: string;
  method: string;
  body?: { status?: string; milestones?: Milestone[] };
}

/** Minimal in-memory version of the Laravel API: list, status and milestones. */
function installApi(initial: TestProject[]) {
  const projects = structuredClone(initial);
  const requests: Recorded[] = [];
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
  const count = (s: string) => projects.filter((p) => p.status === s).length;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });

      if (method === 'GET' && url === `${API}/api/projects`) {
        return reply({
          projects,
          stats: {
            total: projects.length,
            pending: count('pending'),
            in_progress: count('in_progress'),
            completed: count('completed'),
          },
        });
      }

      const match = url.match(/\/api\/projects\/(\d+)\/(status|milestones)$/);
      const project = projects.find((p) => p.id === Number(match?.[1]));
      if (method === 'POST' && match && project) {
        if (match[2] === 'status') project.status = body.status;
        else project.milestones = body.milestones;
        return reply({ message: 'ok', data: project });
      }
      return reply({ message: 'Not found' }, 404);
    }),
  );

  return { projects, requests };
}

type Ranked = ReturnType<typeof sortByAlert>;
type Info = ReturnType<typeof milestoneInfo>;

beforeEach(() => {
vi.mocked(sortByAlert).mockImplementation(
  (list) => list.map((project) => ({ project, alert: alertOf('green') })),
);

vi.mocked(sortByAlert).mockImplementation(
  (list) => [...list].reverse().map((project) => ({ project, alert: alertOf('green') })),
);
});

const renderDashboard = () => render(<ProjectStatusTracker apiUrl={API} sseUrl={SSE} />);

const row = (name: string) => screen.getByRole('cell', { name }).closest('tr')!;
const milestoneRow = (title: string) => screen.getByRole('cell', { name: title }).closest('tr')!;
const milestoneTitles = (projectId: number) =>
  within(document.getElementById(`milestones-${projectId}`)!)
    .getAllByRole('row')
    .slice(1) // header
    .map((r) => (r as HTMLTableRowElement).cells[0].textContent);

const withMilestones: TestProject[] = [
  {
    id: 1,
    name: 'Alpha',
    status: 'in_progress',
    deadline: '2026-12-31T00:00:00.000000Z',
    milestones: [
      { title: 'Launch', deadline: '2026-12-01', status: 'not_achieved' },
      { title: 'Design', deadline: '2026-10-01', status: 'not_achieved' },
    ],
  },
  { id: 2, name: 'Beta', status: 'pending', deadline: null, milestones: [] },
  { id: 3, name: 'Gamma', status: 'completed' }, // no milestones field at all
];

async function loaded() {
  const user = userEvent.setup();
  const api = installApi(withMilestones);
  const view = renderDashboard();
  await screen.findByRole('cell', { name: 'Alpha' });
  return { user, api, ...view };
}

describe('deadline column', () => {
  it('shows only the date part, or a dash when there is no deadline', async () => {
    await loaded();

    expect(within(row('Alpha')).getByText('2026-12-31')).toBeInTheDocument();
    expect(within(row('Beta')).getByText('—')).toBeInTheDocument();
  });
});

describe('alerts', () => {

  it('shows the alert level as an icon and the messages as a tooltip', async () => {
    vi.mocked(sortByAlert).mockImplementation(
      (list) =>
        list.map((project) => ({
          project,
          alert:
            project.name === 'Alpha'
              ? { level: 'red', messages: ['Deadline passed', '1 milestone overdue'] }
              : { level: 'green', messages: [] },
        })) as Ranked,
    );
    await loaded();

    const badge = row('Alpha').querySelector('.badge[title]');
    expect(badge).toHaveAttribute('title', 'Deadline passed\n1 milestone overdue');
    expect(badge).toHaveTextContent('🔴');

    expect(within(row('Beta')).getByText('🟢')).toBeInTheDocument();
    expect(row('Beta').querySelector('.badge[title]')).toBeNull();
  });
});

describe('milestones', () => {
  it('starts collapsed and expands and collapses from the toggle button', async () => {
    const { user } = await loaded();
    expect(screen.queryByRole('cell', { name: 'Design' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show milestones of Alpha' }));
    const hide = screen.getByRole('button', { name: 'Hide milestones of Alpha' });
    expect(hide).toHaveAttribute('aria-expanded', 'true');
    expect(hide).toHaveAttribute('aria-controls', 'milestones-1');
    expect(screen.getByRole('cell', { name: 'Design' })).toBeInTheDocument();

    await user.click(hide);
    expect(screen.queryByRole('cell', { name: 'Design' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show milestones of Alpha' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('says so when a project has no milestones, empty or missing', async () => {
    const { user } = await loaded();

    await user.click(screen.getByRole('button', { name: 'Show milestones of Beta' }));
    await user.click(screen.getByRole('button', { name: 'Show milestones of Gamma' }));

    expect(screen.getAllByText('No milestones for this project.')).toHaveLength(2);
  });

  it('sorts milestones by deadline and puts the ones without a deadline last', async () => {
    const api = installApi([
      {
        id: 1,
        name: 'Alpha',
        status: 'pending',
        milestones: [
          { title: 'Launch', deadline: null, status: 'not_achieved' },
          { title: 'Review', deadline: '2026-12-01', status: 'not_achieved' },
          { title: 'Design', deadline: '2026-10-01', status: 'not_achieved' },
        ],
      },
    ]);
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });
    expect(api.requests).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Show milestones of Alpha' }));

    expect(milestoneTitles(1)).toEqual(['Design', 'Review', 'Launch']);
  });

  it('renders the state and time label that milestoneInfo returns', async () => {
    vi.mocked(milestoneInfo).mockImplementation(
  (m) =>
    (({
      Launch: { state: 'overdue', timeLabel: '3 days late' },
      Design: { state: 'upcoming', timeLabel: 'in 5 days' },
    }) as Record<string, Info>)[m.title] ?? defaultInfo(m),
);
    const { user } = await loaded();
    await user.click(screen.getByRole('button', { name: 'Show milestones of Alpha' }));

    const late = milestoneRow('Launch');
    expect(within(late).getByText('Overdue')).toHaveClass('bg-danger-subtle');
    expect(within(late).getByText('3 days late')).toHaveClass('text-danger');

    const soon = milestoneRow('Design');
    expect(within(soon).getByText('Pending')).toHaveClass('bg-secondary-subtle');
    expect(within(soon).getByText('in 5 days')).toHaveClass('text-secondary');
  });

  it('shows an achieved milestone with a checked checkbox', async () => {
    const api = installApi([
      { id: 1, name: 'Alpha', status: 'pending', milestones: [{ title: 'Design', status: 'achieved' }] },
    ]);
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });
    await user.click(screen.getByRole('button', { name: 'Show milestones of Alpha' }));

    expect(within(milestoneRow('Design')).getByText('Achieved')).toHaveClass('bg-success-subtle');
    expect(screen.getByRole('checkbox', { name: 'Mark Design as achieved' })).toBeChecked();
    expect(api.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
  });

  it('sends the whole list with only the ticked milestone changed, keeping the original order', async () => {
    const { user, api } = await loaded();
    await user.click(screen.getByRole('button', { name: 'Show milestones of Alpha' }));
    // Design is shown first (earlier deadline) but is index 1 in the stored list.
    expect(milestoneTitles(1)).toEqual(['Design', 'Launch']);

    await user.click(screen.getByRole('checkbox', { name: 'Mark Design as achieved' }));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Mark Design as achieved' })).toBeChecked());
    const post = api.requests.find((r) => r.method === 'POST')!;
    expect(post.url).toBe(`${API}/api/projects/1/milestones`);
    expect(post.body).toEqual({
      milestones: [
        { title: 'Launch', deadline: '2026-12-01', status: 'not_achieved' },
        { title: 'Design', deadline: '2026-10-01', status: 'achieved' },
      ],
    });
    expect(screen.getByRole('checkbox', { name: 'Mark Launch as achieved' })).not.toBeChecked();
  });

  it('sends not_achieved when a milestone is unticked', async () => {
    const api = installApi([
      { id: 1, name: 'Alpha', status: 'pending', milestones: [{ title: 'Design', status: 'achieved' }] },
    ]);
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });
    await user.click(screen.getByRole('button', { name: 'Show milestones of Alpha' }));

    await user.click(screen.getByRole('checkbox', { name: 'Mark Design as achieved' }));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Mark Design as achieved' })).not.toBeChecked());
    expect(api.requests.find((r) => r.method === 'POST')!.body).toEqual({
      milestones: [{ title: 'Design', status: 'not_achieved' }],
    });
  });

  it('disables the checkbox while its request is in flight', async () => {
    const { user } = await loaded();
    await user.click(screen.getByRole('button', { name: 'Show milestones of Alpha' }));

    let release!: () => void;
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = () => resolve(new Response('{}', { status: 200 })))),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Mark Design as achieved' }));

    expect(screen.getByRole('checkbox', { name: 'Mark Design as achieved' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: 'Mark Launch as achieved' })).toBeEnabled();

    await act(async () => release());
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Mark Design as achieved' })).toBeEnabled());
  });

  it('shows the API error when a milestone update fails and leaves the checkbox as it was', async () => {
    const { user } = await loaded();
    await user.click(screen.getByRole('button', { name: 'Show milestones of Alpha' }));

    vi.mocked(fetch).mockImplementationOnce(
      async () => new Response(JSON.stringify({ message: 'The milestones.0.title field is required.' }), { status: 422 }),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Mark Design as achieved' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update milestone of project #1. The milestones.0.title field is required.',
    );
    expect(screen.getByRole('checkbox', { name: 'Mark Design as achieved' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Mark Design as achieved' })).toBeEnabled();
  });

  it('keeps a project expanded after its status changes', async () => {
    const { user } = await loaded();
    await user.click(screen.getByRole('button', { name: 'Show milestones of Alpha' }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Change status of Alpha' }), 'completed');

    await waitFor(() => expect(within(row('Alpha')).getByText('Completed', { selector: '.badge' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Hide milestones of Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Design' })).toBeInTheDocument();
  });
});

describe('status updates', () => {
  it('falls back to a generic message when the error response is not JSON', async () => {
    const { user } = await loaded();

    vi.mocked(fetch).mockImplementationOnce(async () => new Response('Oops', { status: 500 }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Change status of Alpha' }), 'completed');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not update project #1. POST /api/projects/1/status failed: 500',
    );
  });

  it('disables only the select of the project being updated', async () => {
    const { user } = await loaded();

    let release!: () => void;
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise<Response>((resolve) => (release = () => resolve(new Response('{}', { status: 200 })))),
    );
    await user.selectOptions(screen.getByRole('combobox', { name: 'Change status of Alpha' }), 'completed');

    expect(screen.getByRole('combobox', { name: 'Change status of Alpha' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Change status of Beta' })).toBeEnabled();

    await act(async () => release());
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Change status of Alpha' })).toBeEnabled());
  });
});

describe('live connection', () => {
  it('closes the old connection and opens a new one when sseUrl changes', async () => {
    installApi(withMilestones);
    const { rerender } = renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });
    const first = FakeEventSource.latest();

    rerender(<ProjectStatusTracker apiUrl={API} sseUrl="http://sse2.test/events" />);

    expect(first.closed).toBe(true);
    expect(FakeEventSource.latest().url).toBe('http://sse2.test/events');
  });
}); // <-- Close 'live connection' here

describe('live events', () => {
  it('describes what changed when the event has no status', async () => {
    installApi(withMilestones);
    renderDashboard();
    await screen.findByRole('cell', { name: 'Alpha' });

    act(() => {
      FakeEventSource.latest().emit({ project_id: 1, name: 'Alpha', milestones: [], timestamp: 't1' });
      FakeEventSource.latest().emit({ project_id: 1, name: 'Alpha', deadline: '2026-12-31', timestamp: 't2' });
    });

    const feed = screen.getByRole('heading', { name: 'Recent SSE Events' }).parentElement!;
    const items = within(feed).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Project #1 deadline updated');
    expect(items[1]).toHaveTextContent('Project #1 milestones updated');
    expect(items[0]).not.toHaveTextContent('updated to');
  });
});