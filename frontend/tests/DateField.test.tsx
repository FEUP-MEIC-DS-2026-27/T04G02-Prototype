import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addMonths, dayLabel, monthWeeks, todayIso } from '../src/calendar';
import DateField from '../src/DateField';

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <DateField id="due" label="Due" value={value} onChange={setValue} />
      <button type="button">Elsewhere</button>
    </>
  );
}

const field = () => screen.getByRole('combobox', { name: 'Due' });
const calendar = () => within(screen.getByRole('dialog', { name: 'Choose due' }));
const day = (iso: string) => calendar().getByRole('button', { name: dayLabel(iso) });

async function openCalendar(initial = '') {
  const user = userEvent.setup();
  render(<Harness initial={initial} />);
  await user.click(field());
  return user;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 24, 12) });
  return () => { vi.useRealTimers(); };
});

describe('calendar arithmetic', () => {
  it('starts weeks on Monday and covers the whole month', () => {
    const weeks = monthWeeks('2026-11-24'); // 1 November 2026 is a Sunday
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(weeks[5]).toEqual(['2026-11-30', null, null, null, null, null, null]);
  });

  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-12-15', 1, '2027-01-15'],
    ['2026-01-15', -1, '2025-12-15'],
    ['2028-02-29', 12, '2029-02-28'],
  ])('%s plus %i months is %s', (from, months, expected) => {
    expect(addMonths(from, months)).toBe(expected);
  });

  it("uses the viewer's date for today", () => {
    expect(todayIso(new Date(2026, 10, 24, 0, 5))).toBe('2026-11-24');
    expect(todayIso(new Date(2026, 10, 24, 23, 55))).toBe('2026-11-24');
  });
});

describe('DateField', () => {
  it('opens on today when no date is chosen', async () => {
    await openCalendar();

    expect(field()).toHaveAttribute('aria-expanded', 'true');
    expect(calendar().getByRole('grid', { name: 'November 2026' })).toBeInTheDocument();
    expect(day('2026-11-24')).toHaveFocus();
    expect(day('2026-11-24')).toHaveAttribute('aria-current', 'date');
    expect(calendar().getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('opens on the chosen date and marks it', async () => {
    await openCalendar('2027-02-10');

    expect(day('2027-02-10')).toHaveFocus();
    expect(calendar().getByRole('gridcell', { selected: true })).toHaveTextContent('10');
  });

  it('chooses a day with the mouse, closes and returns the focus', async () => {
    const user = await openCalendar();

    await user.click(calendar().getByRole('button', { name: 'Next month' }));
    expect(calendar().getByRole('button', { name: 'Next month' })).toHaveFocus();
    await user.click(day('2026-12-01'));

    expect(field()).toHaveTextContent('2026-12-01');
    expect(field()).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves with the keyboard', async () => {
    const user = await openCalendar();

    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(day('2026-12-02')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(day('2026-11-30')).toHaveFocus();
    await user.keyboard('{End}{PageDown}');
    expect(day('2027-01-06')).toHaveFocus();
    await user.keyboard('{Shift>}{PageUp}{/Shift}{ArrowLeft}{ArrowUp}');
    expect(day('2025-12-29')).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(field()).toHaveTextContent('2025-12-29');
  });

  it('closes without changing the date on Escape, on an outside click and when tabbing away', async () => {
    const user = await openCalendar('2026-12-01');
    await user.keyboard('{ArrowRight}{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(field()).toHaveFocus();

    await user.click(field());
    await user.click(document.body);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await user.click(field());
    await user.tab(); // Today
    await user.tab(); // Clear
    await user.tab();
    expect(screen.getByRole('button', { name: 'Elsewhere' })).toHaveFocus();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(field()).toHaveTextContent('2026-12-01');
  });

  it('has Today and Clear shortcuts', async () => {
    const user = await openCalendar();

    await user.click(calendar().getByRole('button', { name: 'Today' }));
    expect(field()).toHaveTextContent('2026-11-24');

    await user.click(field());
    await user.click(calendar().getByRole('button', { name: 'Clear' }));
    expect(field()).toHaveTextContent('Any date');
  });
});
