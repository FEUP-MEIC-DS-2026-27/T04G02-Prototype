import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dayLabel, monthLabel } from '../src/calendar';
import { isDeadlineInRange } from '../src/deadlineFilter';
import ProjectStatusTracker from '../src/ProjectStatusTracker';
import { FakeEventSource } from './support/fakeEventSource';
import { installFakeProjectsApi, type FakeProject } from './support/fakeProjectsApi';

// Chart.js needs a real canvas, which jsdom lacks.
vi.mock('react-chartjs-2', () => {
  const fake = ({ data }: { data: { datasets: { data: number[] }[] } }) => (
    <div data-testid="status-chart">{data.datasets[0].data.join(',')}</div>
  );
  return { Doughnut: fake, Bar: fake };
});

const API = 'http://api.test';
const SSE = 'http://sse.test/events';

const seed: FakeProject[] = [
  { id: 1, name: 'October', status: 'completed', programme: 'FCT', deadline: '2026-10-15' },
  { id: 2, name: 'Early December', status: 'active', programme: 'FCT', deadline: '2026-12-01' },
  { id: 3, name: 'Late December', status: 'planned', programme: 'Horizon Europe', deadline: '2026-12-31T00:00:00.000000Z' },
  { id: 4, name: 'Undated', status: 'planned', programme: 'FCT', deadline: null },
];

async function renderDashboard() {
  installFakeProjectsApi(API, seed);
  render(<ProjectStatusTracker apiUrl={API} sseUrl={SSE} />);
  await screen.findByRole('cell', { name: 'October' });
}

const from = () => screen.getByRole('combobox', { name: 'Deadline from' });
const to = () => screen.getByRole('combobox', { name: 'Deadline to' });

/** Picks a date in the field's calendar, or clears it when the value is ''. */
async function setDate(field: HTMLElement, value: string) {
  const user = userEvent.setup();
  await user.click(field);
  const calendar = within(screen.getByRole('dialog'));
  if (!value) return user.click(calendar.getByRole('button', { name: 'Clear' }));
  for (let i = 0; i < 24 && !calendar.queryByRole('grid', { name: monthLabel(value) }); i += 1) {
    const shown = new Date(`1 ${calendar.getByRole('grid').getAttribute('aria-label')} UTC`);
    const direction = shown < new Date(value) ? 'Next month' : 'Previous month';
    await user.click(calendar.getByRole('button', { name: direction }));
  }
  await user.click(calendar.getByRole('button', { name: dayLabel(value) }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 24, 12) });
  return () => { vi.useRealTimers(); };
});
const statCard = (label: string) => screen.getByText(label, { selector: 'p' }).nextElementSibling;
const shownNames = () => {
  const inventory = screen.getByRole('heading', { name: 'Project Inventory' }).parentElement!;
  return within(inventory)
    .queryAllByRole('cell', { name: (_, el) => el.classList.contains('fw-medium') })
    .map((cell) => cell.textContent)
    .sort(); // rows are ranked by alert level
};

describe('isDeadlineInRange', () => {
  it.each([
    ['2026-12-01', '', '', true],
    [null, '', '', true],
    [undefined, '', '', true],
    [null, '2026-01-01', '', false],
    [undefined, '', '2026-12-31', false],
    ['2026-12-01', '2026-12-01', '', true],
    ['2026-12-01', '2026-12-02', '', false],
    ['2026-12-01', '', '2026-12-01', true],
    ['2026-12-01', '', '2026-11-30', false],
    ['2026-12-31T00:00:00.000000Z', '2026-12-31', '2026-12-31', true],
    ['2026-12-01', '2026-12-31', '2026-11-01', false],
  ])('deadline %s, from "%s" to "%s": %s', (deadline, start, end, expected) => {
    expect(isDeadlineInRange(deadline, { from: start, to: end })).toBe(expected);
  });
});

describe('deadline filter', () => {
  it('shows every project until a date is chosen, including the ones without a deadline', async () => {
    await renderDashboard();

    expect(from()).toHaveTextContent('Any date');
    expect(to()).toHaveTextContent('Any date');
    expect(shownNames()).toEqual(['Early December', 'Late December', 'October', 'Undated']);
  });

  it('filters the inventory, totals and chart, with both ends included', async () => {
    await renderDashboard();

    await setDate(from(), '2026-12-01');
    await setDate(to(), '2026-12-31');

    expect(shownNames()).toEqual(['Early December', 'Late December']);
    expect(screen.getByText(/^Showing/)).toHaveTextContent('Showing 2 of 4 projects.');
    expect(statCard('Total Projects')).toHaveTextContent('2');
    expect(statCard('Planned')).toHaveTextContent('1');
    expect(statCard('Active')).toHaveTextContent('1');
    expect(statCard('Completed')).toHaveTextContent('0');
    expect(screen.getByTestId('status-chart')).toHaveTextContent('1,1,0,0,0');
  });

  it('accepts only a start or only an end date', async () => {
    await renderDashboard();

    await setDate(from(), '2026-12-02');
    expect(shownNames()).toEqual(['Late December']);

    await setDate(from(), '');
    await setDate(to(), '2026-12-01');
    expect(shownNames()).toEqual(['Early December', 'October']);
  });

  it('combines with the programme filter', async () => {
    const user = userEvent.setup();
    await renderDashboard();

    await user.selectOptions(screen.getByRole('combobox', { name: 'Funding programme' }), 'FCT');
    await setDate(from(), '2026-12-01');

    expect(shownNames()).toEqual(['Early December']);
  });

  it('explains a reversed range, and stops once it is fixed', async () => {
    await renderDashboard();

    await setDate(from(), '2026-12-31');
    await setDate(to(), '2026-12-01');
    expect(screen.getByRole('alert')).toHaveTextContent('"Deadline from" must be on or before "Deadline to".');
    expect(from()).toBeInvalid();
    expect(to()).toBeInvalid();
    expect(to()).toHaveAccessibleDescription(/must be on or before/);
    expect(shownNames()).toEqual([]);
    expect(screen.getAllByText('No projects match these filters.')).toHaveLength(2); // chart and table

    await setDate(to(), '2026-12-31');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(from()).toBeValid();
    expect(shownNames()).toEqual(['Late December']);
  });

  it('only shows live events for the projects in the range', async () => {
    await renderDashboard();
    act(() => {
      FakeEventSource.latest().emit({ project_id: 1, status: 'completed', timestamp: 't1' });
      FakeEventSource.latest().emit({ project_id: 3, status: 'planned', timestamp: 't2' });
    });
    const feed = () => screen.getByRole('heading', { name: 'Recent SSE Events' }).parentElement!;
    expect(within(feed()).getAllByRole('listitem')).toHaveLength(2);

    await setDate(from(), '2026-12-01');

    expect(within(feed()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(feed()).getByText('#3')).toBeInTheDocument();
  });

  it('is reset by Clear filters', async () => {
    const user = userEvent.setup();
    await renderDashboard();
    await setDate(from(), '2026-12-01');
    await setDate(to(), '2026-12-31');

    await user.click(screen.getByRole('button', { name: 'Clear filters' }));

    expect(from()).toHaveTextContent('Any date');
    expect(to()).toHaveTextContent('Any date');
    expect(shownNames()).toHaveLength(seed.length);
  });
});
