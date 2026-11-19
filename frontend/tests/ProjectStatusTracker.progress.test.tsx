import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import ProjectStatusTracker from '../src/ProjectStatusTracker';
import { FakeEventSource } from './support/fakeEventSource';

// Chart.js needs a real canvas, which jsdom lacks.
vi.mock('react-chartjs-2', () => {
  const fake = (type: string) =>
    ({ data }: { data: { datasets: { data: number[] }[] } }) => (
      <div data-testid="status-chart" data-chart-type={type}>
        {data.datasets[0].data.join(',')}
      </div>
    );
  return { Doughnut: fake('doughnut'), Bar: fake('bar') };
});

const API = 'http://api.test';
const SSE = 'http://sse.test/events';

interface TestMilestone {
  title: string;
  deadline?: string | null;
  status: 'achieved' | 'not_achieved';
  assignee?: string | null;
}

interface TestProject {
  id: number;
  name: string;
  status: string;
  milestones?: TestMilestone[];
}

interface Recorded {
  url: string;
  method: string;
  body?: { milestones?: TestMilestone[] };
}

/** Minimal in-memory version of the Laravel API: list projects and replace milestones. */
function installApi(initial: TestProject[]) {
  const projects = structuredClone(initial);
  const requests: Recorded[] = [];
  const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      requests.push({ url, method, body });

      if (method === 'GET' && url === `${API}/api/projects`) return reply({ projects });

      const match = url.match(/\/api\/projects\/(\d+)\/milestones$/);
      const project = projects.find((p) => p.id === Number(match?.[1]));
      if (method === 'POST' && match && project) {
        project.milestones = body.milestones;
        return reply({ message: 'ok', data: project });
      }
      return reply({ message: 'Not found' }, 404);
    }),
  );

  return { projects, requests };
}

const seed: TestProject[] = [
  {
    id: 1,
    name: 'Alpha',
    status: 'in_progress',
    milestones: [
      { title: 'Design', deadline: '2026-10-01', status: 'achieved', assignee: 'Ana Ribeiro' },
      { title: 'Launch', deadline: '2026-12-01', status: 'not_achieved', assignee: 'Ana Ribeiro' },
      { title: 'Review', deadline: '2026-11-01', status: 'achieved', assignee: 'Bruno Costa' },
      { title: 'Docs', deadline: '2026-12-15', status: 'not_achieved' },
    ],
  },
  {
    id: 2,
    name: 'Beta',
    status: 'pending',
    milestones: [{ title: 'Kickoff', deadline: '2026-12-01', status: 'not_achieved' }],
  },
];

const milestoneRow = (title: string) => screen.getByRole('cell', { name: title }).closest('tr')!;

async function loaded() {
  const user = userEvent.setup();
  const api = installApi(seed);
  render(<ProjectStatusTracker apiUrl={API} sseUrl={SSE} />);
  await screen.findByRole('cell', { name: 'Alpha' });
  return { user, api };
}

async function openAlpha() {
  const view = await loaded();
  await view.user.click(screen.getByRole('button', { name: 'Show milestones of Alpha' }));
  return view;
}

describe('who is responsible for each milestone', () => {
  it('shows a Responsible column with the member of each milestone', async () => {
    await openAlpha();

    const panel = within(document.getElementById('milestones-1')!);
    expect(panel.getByRole('columnheader', { name: 'Responsible' })).toBeInTheDocument();
    expect(within(milestoneRow('Design')).getByText('Ana Ribeiro')).toBeInTheDocument();
    expect(within(milestoneRow('Review')).getByText('Bruno Costa')).toBeInTheDocument();
  });

  it('shows a dash when nobody is responsible for a milestone', async () => {
    await openAlpha();

    expect(within(milestoneRow('Docs')).getByText('—')).toBeInTheDocument();
  });
});

describe('team progress', () => {
  it('summarises the achieved milestones of each member, with the unassigned ones last', async () => {
    await openAlpha();

    const team = screen.getByRole('group', { name: 'Team progress of Alpha' });
    const items = within(team).getAllByRole('listitem');

    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Ana Ribeiro')).toBeInTheDocument();
    expect(within(items[0]).getByText('1 of 2 achieved')).toBeInTheDocument();
    expect(within(items[1]).getByText('Bruno Costa')).toBeInTheDocument();
    expect(within(items[1]).getByText('1 of 1 achieved')).toBeInTheDocument();
    expect(within(items[2]).getByText('Unassigned')).toBeInTheDocument();
    expect(within(items[2]).getByText('0 of 1 achieved')).toBeInTheDocument();
  });

  it('draws a progress bar for each member', async () => {
    await openAlpha();

    const team = screen.getByRole('group', { name: 'Team progress of Alpha' });
    expect(within(team).getByRole('progressbar', { name: 'Progress of Ana Ribeiro' })).toHaveAttribute('aria-valuenow', '50');
    expect(within(team).getByRole('progressbar', { name: 'Progress of Bruno Costa' })).toHaveAttribute('aria-valuenow', '100');
    expect(within(team).getByRole('progressbar', { name: 'Progress of Unassigned' })).toHaveAttribute('aria-valuenow', '0');
  });

  it('has no team summary for a project whose milestones have no assignee', async () => {
    const { user } = await loaded();

    await user.click(screen.getByRole('button', { name: 'Show milestones of Beta' }));

    expect(screen.queryByRole('group', { name: 'Team progress of Beta' })).not.toBeInTheDocument();
    expect(within(milestoneRow('Kickoff')).getByText('—')).toBeInTheDocument();
  });

  it('has a button that says what it does', async () => {
    const { user } = await loaded();

    const button = screen.getByRole('button', { name: 'Show milestones of Alpha' });
    expect(button).toHaveTextContent('Show progress');

    await user.click(button);
    expect(screen.getByRole('button', { name: 'Hide milestones of Alpha' })).toHaveTextContent('Hide progress');
  });

  it('does not highlight the expanded progress row on hover, as it is not clickable', async () => {
    await openAlpha();

    const progressRow = document.getElementById('milestones-1')!;
    expect(progressRow.style.getPropertyValue('--bs-table-hover-bg')).toBe('transparent');
  });

  it('is only shown while the project is expanded', async () => {
    const { user } = await loaded();
    expect(screen.queryByRole('group', { name: 'Team progress of Alpha' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show milestones of Alpha' }));
    expect(screen.getByRole('group', { name: 'Team progress of Alpha' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide milestones of Alpha' }));
    expect(screen.queryByRole('group', { name: 'Team progress of Alpha' })).not.toBeInTheDocument();
  });

  it('keeps every assignee when a milestone is ticked, and updates the summary', async () => {
    const { user, api } = await openAlpha();

    await user.click(screen.getByRole('checkbox', { name: 'Mark Launch as achieved' }));

    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Mark Launch as achieved' })).toBeChecked());
    const post = api.requests.find((r) => r.method === 'POST')!;
    expect(post.url).toBe(`${API}/api/projects/1/milestones`);
    expect(post.body).toEqual({
      milestones: [
        { title: 'Design', deadline: '2026-10-01', status: 'achieved', assignee: 'Ana Ribeiro' },
        { title: 'Launch', deadline: '2026-12-01', status: 'achieved', assignee: 'Ana Ribeiro' },
        { title: 'Review', deadline: '2026-11-01', status: 'achieved', assignee: 'Bruno Costa' },
        { title: 'Docs', deadline: '2026-12-15', status: 'not_achieved' },
      ],
    });
    expect(await screen.findByText('2 of 2 achieved')).toBeInTheDocument();
  });

  it('updates when another member changes a milestone, through the live events', async () => {
    const { api } = await openAlpha();
    expect(screen.getByText('1 of 2 achieved')).toBeInTheDocument();

    // Someone else ticks Launch on the server; the dashboard only hears about it from the hub.
    api.projects[0].milestones![1].status = 'achieved';
    act(() => {
      FakeEventSource.latest().emit({ project_id: 1, name: 'Alpha', milestones: [], timestamp: 't1' });
    });

    expect(await screen.findByText('2 of 2 achieved')).toBeInTheDocument();
    expect(screen.queryByText('1 of 2 achieved')).not.toBeInTheDocument();
  });
});
