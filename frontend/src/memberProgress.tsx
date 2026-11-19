import type { Milestone } from './projectAlerts';

/** How many of a project's milestones one member has achieved. */
export interface MemberProgress {
    /** The member's name, or null for milestones nobody is responsible for. */
    name: string | null;
    achieved: number;
    total: number;
}

const assigneeOf = (m: Milestone): string | null => m.assignee?.trim() || null;

/**
 * Groups a project's milestones by who is responsible for them.
 *
 * Returns an empty list when no milestone has an assignee, so the dashboard has nothing
 * to show. Members are sorted by name, with the unassigned milestones last.
 */
export function summariseMemberProgress(milestones: Milestone[]): MemberProgress[] {
    if (!milestones.some((m) => assigneeOf(m) !== null)) return [];

    const byName = new Map<string | null, MemberProgress>();
    for (const m of milestones) {
        const name = assigneeOf(m);
        const entry = byName.get(name) ?? { name, achieved: 0, total: 0 };
        entry.total += 1;
        if (m.status === 'achieved') entry.achieved += 1;
        byName.set(name, entry);
    }

    return [...byName.values()].sort((a, b) => {
        if (a.name === null) return 1;
        if (b.name === null) return -1;
        return a.name.localeCompare(b.name);
    });
}