export type AlertLevel = 'red' | 'yellow' | 'green';

export const WARNING_DAYS = 30;
export const CRITICAL_DAYS = 7;

export interface Milestone {
    title: string;
    deadline?: string | null;
    status: 'achieved' | 'not_achieved';
}

export interface AlertInput {
    deadline?: string | null;
    milestones?: Milestone[];
}

export interface ProjectAlert {
    level: AlertLevel;
    messages: string[];
    /** Smaller = more urgent (negative = overdue). Infinity when nothing is dated. */
    urgencyDays: number;
}

const RANK: Record<AlertLevel, number> = { red: 0, yellow: 1, green: 2 };
const MS_PER_DAY = 86_400_000;

const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
const compare = (a: number, b: number) => (a === b ? 0 : a < b ? -1 : 1);

/** Whole calendar days from today until a 'YYYY-MM-DD' date (negative = in the past). */
export function daysUntil(isoDate: string, today: Date = new Date()): number {
    const [y, m, d] = isoDate.slice(0, 10).split('-').map(Number);
    const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((Date.UTC(y, m - 1, d) - todayUtc) / MS_PER_DAY);
}


export function computeAlert(input: AlertInput, today: Date = new Date()): ProjectAlert {
    const all = input.milestones ?? [];
   if (all.length > 0 && all.every((m) => m.status === 'achieved')) {
       return { level: 'green', messages: ['All milestones achieved'], urgencyDays: Infinity };
   }
    const messages: string[] = [];
    let level: AlertLevel = 'green';
    let urgencyDays = Infinity;
    const raise = (l: AlertLevel) => {
        if (RANK[l] < RANK[level]) level = l;
    };


    // Deadline do projeto
    if (input.deadline) {
        const d = daysUntil(input.deadline, today);
        if (!Number.isNaN(d)) {
            urgencyDays = d;
            raise(levelForDays(d));
            if (d < 0) {
                messages.push(`Overdue by ${plural(-d)}`);
            } else {
                const left = d === 0 ? 'due today' : `${plural(d)} left`;
                messages.push(`Deadline ${input.deadline.slice(0, 10)} · ${left}`);
            }
        }
    }

    // Milestones: as achieved nunca contam
    for (const m of input.milestones ?? []) {
        if (m.status === 'achieved' || !m.deadline) continue;
        const d = daysUntil(m.deadline, today);
        if (Number.isNaN(d)) continue;

        const l = levelForDays(d);
        raise(l);
        urgencyDays = Math.min(urgencyDays, d);

        if (l !== 'green') {
            const when = d < 0 ? `overdue by ${plural(-d)}` : d === 0 ? 'due today' : `${plural(d)} left`;
            messages.push(`Milestone "${m.title}": ${when}`);
        }
    }

    return { level, messages, urgencyDays };
}
/** Red first, then yellow, then green; within a colour, the most urgent date first. */
export function sortByAlert<T extends AlertInput & { name: string }>(projects: T[], today: Date = new Date()) {
    return projects
        .map((project) => ({ project, alert: computeAlert(project, today) }))
        .sort(
            (a, b) =>
                compare(RANK[a.alert.level], RANK[b.alert.level]) ||
                compare(a.alert.urgencyDays, b.alert.urgencyDays) ||
                a.project.name.localeCompare(b.project.name),
        );
}
export type MilestoneState = 'completed' | 'overdue' | 'upcoming';

export function milestoneInfo(m: Milestone, today: Date = new Date()): { state: MilestoneState; timeLabel: string } {
    if (m.status === 'achieved') return { state: 'completed', timeLabel: '—' };
    if (!m.deadline) return { state: 'upcoming', timeLabel: 'No deadline' };
    const d = daysUntil(m.deadline, today);
    if (d < 0) return { state: 'overdue', timeLabel: `Overdue by ${plural(-d)}` };
    return { state: 'upcoming', timeLabel: d === 0 ? 'Due today' : `${plural(d)} left` };
}
function levelForDays(d: number): AlertLevel {
    if (d <= CRITICAL_DAYS) return 'red'; // inclui atrasadas (d < 0)
    if (d <= WARNING_DAYS) return 'yellow';
    return 'green';
}