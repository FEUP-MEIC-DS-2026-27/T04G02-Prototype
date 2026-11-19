import { describe, expect, it } from 'vitest';
import { summariseMemberProgress } from '../src/memberProgress';
import type { Milestone } from '../src/projectAlerts';

const milestone = (status: Milestone['status'], assignee?: string | null): Milestone => ({
  title: 'M',
  status,
  assignee,
});

describe('summariseMemberProgress', () => {
  it('returns nothing when there are no milestones', () => {
    expect(summariseMemberProgress([])).toEqual([]);
  });

  it('returns nothing when no milestone has an assignee', () => {
    const milestones = [milestone('achieved'), milestone('not_achieved', null), milestone('achieved', '   ')];

    expect(summariseMemberProgress(milestones)).toEqual([]);
  });

  it('counts the achieved and total milestones of each member', () => {
    const milestones = [
      milestone('achieved', 'Ana'),
      milestone('not_achieved', 'Ana'),
      milestone('achieved', 'Bruno'),
    ];

    expect(summariseMemberProgress(milestones)).toEqual([
      { name: 'Ana', achieved: 1, total: 2 },
      { name: 'Bruno', achieved: 1, total: 1 },
    ]);
  });

  it('sorts members by name and puts the unassigned milestones last', () => {
    const milestones = [
      milestone('not_achieved'),
      milestone('achieved', 'Rui'),
      milestone('achieved', 'Ana'),
      milestone('not_achieved', null),
    ];

    expect(summariseMemberProgress(milestones)).toEqual([
      { name: 'Ana', achieved: 1, total: 1 },
      { name: 'Rui', achieved: 1, total: 1 },
      { name: null, achieved: 0, total: 2 },
    ]);
  });

  it('ignores the whitespace around a name', () => {
    const milestones = [milestone('achieved', 'Ana'), milestone('not_achieved', '  Ana ')];

    expect(summariseMemberProgress(milestones)).toEqual([{ name: 'Ana', achieved: 1, total: 2 }]);
  });

  it('does not change the milestones it is given', () => {
    const milestones = [milestone('achieved', ' Ana '), milestone('not_achieved')];
    const copy = structuredClone(milestones);

    summariseMemberProgress(milestones);

    expect(milestones).toEqual(copy);
  });
});
