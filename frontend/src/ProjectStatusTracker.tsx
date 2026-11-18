import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Doughnut,Bar } from 'react-chartjs-2';
import ErrorMessage from './ErrorMessage';
import Loading from './Loading';
import { milestoneInfo, sortByAlert, type AlertLevel, type Milestone, type MilestoneState, type ProjectAlert } from './projectAlerts';
ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// Part of the contract with VA3: bump this when the props below change incompatibly.
export const contractVersion = 1;

// The browser calls the project status services directly. The host can pass other
// URLs as props, and standalone builds can set them at build time.
const DEFAULT_API_URL: string = import.meta.env.PUBLIC_PROJECTS_API_URL ?? 'http://localhost:8340';
const DEFAULT_SSE_URL: string = import.meta.env.PUBLIC_PROJECTS_SSE_URL ?? 'http://localhost:8341/events';

interface ProjectStatusTrackerProps {
    /** Origin of the project status API ('' for the same origin as the page). */
    apiUrl?: string;
    /** Path of the projects resource on that origin. Through the h.i gateway it is /api/project-status. */
    apiPath?: string;
    sseUrl?: string;
}

type ProjectStatus = 'pending' | 'in_progress' | 'completed';
interface Project {
    id: number;
    name: string;
    status: ProjectStatus;
    programme?: string | null;
    deadline?: string | null;
    milestones?: Milestone[];
}
export interface Stats {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
}

interface Project {
    id: number;
    name: string;
    status: ProjectStatus;
    grant_deadline?: string | null;
    milestones?: Milestone[];
}

/** A message from the SSE hub (one Kafka event). */
interface StatusEvent {
    project_id?: number | null;
    external_id?: string;
    name?: string;
    status?: string;
    milestones?: Milestone[];
    deadline?: string | null;
    timestamp: string;
}

type LiveState = 'connecting' | 'live' | 'reconnecting';
type ChartType = 'doughnut' | 'bar';


const chartTypes: { value: ChartType; label: string }[] = [
    { value: 'doughnut', label: 'Donut' },
    { value: 'bar', label: 'Bar' },
];
const emptyStats: Stats = { total: 0, pending: 0, in_progress: 0, completed: 0 };
const formatDeadline = (d?: string | null) => (d ? d.slice(0, 10) : '—');
const UNASSIGNED = '__unassigned__';
const programmeName = (p: Project) => p.programme?.trim() || '';
function describeEvent(evt: StatusEvent): string {
    if (evt.status) return `updated to ${evt.status}`;
    if (evt.milestones) return 'milestones updated';
    if ('deadline' in evt) return 'deadline updated';
    return 'updated';
}
const badgeStyles: Record<ProjectStatus, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-warning-subtle', text: 'text-warning-emphasis', label: 'Pending' },
    in_progress: { bg: 'bg-primary-subtle', text: 'text-primary-emphasis', label: 'In Progress' },
    completed: { bg: 'bg-success-subtle', text: 'text-success-emphasis', label: 'Completed' },
};


export function createStatusDistributionOptions(stats: Stats) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom' as const,
            },
            tooltip: {
                callbacks: {
                    label: (context: { label?: string; raw?: unknown }) => {
                        const value = Number(context.raw ?? 0);
                        const percentage =
                            stats.total === 0
                                ? 0
                                : Math.round((value / stats.total) * 100);

                        return ` Amount: ${value} (${percentage}%)`;
                    },
                },
            },
        },
    };
}

function StatusBadge({ status }: { status: ProjectStatus }) {
    const s = badgeStyles[status] ?? badgeStyles.pending;
    return (
        <span className={`badge ${s.bg} ${s.text} rounded-pill px-3 py-2`}>
            {s.label}
        </span>
    );
}
/* const alertStyles: Record<AlertLevel, { bg: string; text: string; label: string; icon: string }> = {
    red: { bg: 'bg-danger-subtle', text: 'text-danger-emphasis', label: 'Red', icon: '🔴' },
    yellow: { bg: 'bg-warning-subtle', text: 'text-warning-emphasis', label: 'Yellow', icon: '🟡' },
    green: { bg: 'bg-success-subtle', text: 'text-success-emphasis', label: 'Green', icon: '🟢' },
}; */
const alertStyles: Record<AlertLevel, { icon: string }> = {
    red: {icon: '🔴' },
    yellow: {icon: '🟡' },
    green: {  icon: '🟢' },
};
/*
function AlertBadge({ alert }: { alert: ProjectAlert }) {
    const s = alertStyles[alert.level];
    return (
        <div>
            <span className={`badge ${s.bg} ${s.text} rounded-pill px-3 py-2`}>
                <span aria-hidden="true">{s.icon}</span> {s.label}
            </span>
            {alert.messages.map((m) => (
                <div key={m} className="small text-secondary mt-1">{m}</div>
            ))}
        </div>
    );
}*/
function AlertBadge({ alert }: { alert: ProjectAlert }) {
    const s = alertStyles[alert.level];
    return (
        <span
            className={`badge rounded-pill px-3 py-2`}
            title={alert.messages.join('\n') || undefined}
        >
            <span aria-hidden="true">{s.icon}</span> 
        </span>
    );
}
const milestoneStyles: Record<MilestoneState, { bg: string; text: string; label: string }> = {
    completed: { bg: 'bg-success-subtle', text: 'text-success-emphasis', label: 'Achieved' },
    overdue: { bg: 'bg-danger-subtle', text: 'text-danger-emphasis', label: 'Overdue' },
    upcoming: { bg: 'bg-secondary-subtle', text: 'text-secondary-emphasis', label: 'Pending' },
};

const indexedMilestones = (p: Project) =>
    (p.milestones ?? [])
        .map((m, index) => ({ m, index }))
        .sort((a, b) => (a.m.deadline || '9999').localeCompare(b.m.deadline || '9999'));
/** Throws a readable message when the API answers with an error status. */
async function readJson<T>(res: Response, what: string): Promise<T> {
    if (!res.ok) {
        const problem = await res.json().catch(() => null);
        throw new Error(problem?.message ?? `${what} failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
}
export function createStatusDistributionData(stats: Stats) {
    return {
        labels: ['Pending', 'In Progress', 'Completed'],
        datasets: [
            {
                data: [stats.pending, stats.in_progress, stats.completed],
                backgroundColor: ['#ffc107', '#0d6efd', '#198754'],
                borderColor: '#ffffff',
                borderWidth: 2,
            },
        ],
    };
}

function createTooltip(stats: Stats) {
    return {
        callbacks: {
            label: (context: { label?: string; raw?: unknown }) => {
                const value = Number(context.raw ?? 0);
                const percentage = stats.total === 0 ? 0 : Math.round((value / stats.total) * 100);
                return ` Amount: ${value} (${percentage}%)`;
            },
        },
    };
}

export function createDoughnutOptions(stats: Stats) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' as const }, tooltip: createTooltip(stats) },
    };
}

export function createBarOptions(stats: Stats) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: createTooltip(stats) },
        scales: {
            y: { beginAtZero: true, ticks: { precision: 0 } }, // counts are whole numbers
        },
    };
}

// Bootstrap classes only. The stylesheet comes from the host (integrated) or from
// bootstrap.tsx (standalone), and the host owns the router.
export default function ProjectStatusTracker({ apiUrl = DEFAULT_API_URL, apiPath = '/api/projects', sseUrl = DEFAULT_SSE_URL }: ProjectStatusTrackerProps) {
    const projectsUrl = `${apiUrl}${apiPath}`;
    const [projects, setProjects] = useState<Project[]>([]);
    const [programme, setProgramme] = useState('');
    const [selectedProjectId, setSelectedProjectId] = useState('');
    const [events, setEvents] = useState<StatusEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<number | null>(null);
    const [live, setLive] = useState<LiveState>('connecting');
    const [chartType, setChartType] = useState<ChartType>('bar');
    const programmes = useMemo(() => [...new Set(projects.map(programmeName).filter(Boolean))].sort(), [projects]);
    const filteredProjects = useMemo(() => projects.filter((p) =>
        (!programme || (programme === UNASSIGNED ? !programmeName(p) : programmeName(p) === programme))
        && (!selectedProjectId || String(p.id) === selectedProjectId)), [projects, programme, selectedProjectId]);
    // Totals follow the filters, so they are counted here rather than taken from the API's stats.
    const stats = useMemo(() => filteredProjects.reduce<Stats>((result, p) => {
        result.total += 1;
        if (p.status in badgeStyles) result[p.status] += 1;
        return result;
    }, { ...emptyStats }), [filteredProjects]);
    const rankedProjects = useMemo(() => sortByAlert(filteredProjects), [filteredProjects]);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
const [updatingMilestone, setUpdatingMilestone] = useState<string | null>(null);

const toggleExpanded = (id: number) =>
    setExpanded((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
    });
    const fetchProjects = useCallback(async (signal?: AbortSignal) => {
        try {
            const res = await fetch(projectsUrl, { signal });
            const data = await readJson<{ projects?: Project[] }>(res, `GET ${apiPath}`);
            setProjects(data.projects ?? []);
            setLoadError(null);
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;
            setLoadError(`Could not load projects from ${apiUrl}. ${(err as Error).message}`);
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [apiUrl, apiPath, projectsUrl]);

    const handleStatusChange = async (id: number, newStatus: ProjectStatus) => {
        setUpdatingId(id);
        setUpdateError(null);
        try {
            const res = await fetch(`${projectsUrl}/${id}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ status: newStatus }),
            });
            await readJson(res, `POST ${apiPath}/${id}/status`);
            // Refresh now instead of waiting for the SSE event, so the page is right even if live updates are down.
            await fetchProjects();
        } catch (err) {
            setUpdateError(`Could not update project #${id}. ${(err as Error).message}`);
        } finally {
            setUpdatingId(null);
        }
    };
const handleMilestoneToggle = async (project: Project, index: number, achieved: boolean) => {
    const key = `${project.id}:${index}`;
    setUpdatingMilestone(key);
    setUpdateError(null);
    try {
        const milestones = (project.milestones ?? []).map((m, i) =>
i === index ? { ...m, status: achieved ? ('achieved' as const) : ('not_achieved' as const) } : m,        );
        const res = await fetch(`${projectsUrl}/${project.id}/milestones`, {
            method: 'POST', // confirma o verbo e o caminho em routes/api.php
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ milestones }),
        });
        await readJson(res, `POST ${apiPath}/${project.id}/milestones`);
        await fetchProjects();
    } catch (err) {
        setUpdateError(`Could not update milestone of project #${project.id}. ${(err as Error).message}`);
    } finally {
        setUpdatingMilestone(null);
    }
};

    useEffect(() => {
        const controller = new AbortController();
        fetchProjects(controller.signal);

        // EventSource reconnects by itself after an error, so the connection is not closed here.
        const eventSource = new EventSource(sseUrl);
        eventSource.onopen = () => setLive('live');
        eventSource.onmessage = (event: MessageEvent<string>) => {
            try {
                const data = JSON.parse(event.data) as StatusEvent;
                setEvents((prev) => [data, ...prev.slice(0, 4)]); // Keep the 5 latest events
            } catch {
            }
            fetchProjects(controller.signal); // Re-sync metric state & chart data
        };
        eventSource.onerror = () => setLive('reconnecting');

        return () => {
            controller.abort();
            eventSource.close();
        };
    }, [fetchProjects, sseUrl]);

    const filtering = programme !== '' || selectedProjectId !== '';
    const filteredIds = new Set(filteredProjects.map((p) => p.id));
    const visibleEvents = filtering
        ? events.filter((evt) => evt.project_id != null && filteredIds.has(evt.project_id))
        : events;

    // Chart Data
    const statusDistributionData = createStatusDistributionData(stats);
    const doughnutOptions = createDoughnutOptions(stats);
    const barOptions = createBarOptions(stats);
    //const statusDistributionOptions = createStatusDistributionOptions(stats);
    // Chart Data
    return (
        <section aria-labelledby="project-status-title">
            <header className="mb-4">
                <h2 id="project-status-title" className="h3">
                    Project status
                </h2>
                <p className="text-secondary mb-0">
                    Live overview of project execution and status changes.
                </p>
            </header>

            <div className="card mb-4">
                <div className="card-body">
                    <div className="row g-3 align-items-end">
                        <div className="col-12 col-md-6 col-xl-3">
                            <label htmlFor="project-programme" className="form-label">Funding programme</label>
                            <select id="project-programme" className="form-select" value={programme}
                                onChange={(e) => setProgramme(e.target.value)} disabled={loading}>
                                <option value="">All programmes</option>
                                {programmes.map((name) => <option key={name} value={name}>{name}</option>)}
                                <option value={UNASSIGNED}>Unassigned</option>
                            </select>
                        </div>
                        <div className="col-12 col-md-6 col-xl-3">
                            <label htmlFor="project-filter" className="form-label">Project</label>
                            <select id="project-filter" className="form-select" value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                disabled={loading || projects.length === 0}>
                                <option value="">All projects</option>
                                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </div>
                        <div className="col-auto">
                            <button type="button" className="btn btn-outline-secondary"
                                onClick={() => { setProgramme(''); setSelectedProjectId(''); }}>
                                Clear filters
                            </button>
                        </div>
                    </div>
                    <p className="small text-secondary mt-3 mb-0" role="status">
                        Showing {filteredProjects.length} of {projects.length} projects.
                    </p>
                </div>
            </div>

            {loading && <Loading message="Loading projects…" />}
            {loadError && (
                <div className="mb-4">
                    <ErrorMessage message={loadError} />
                </div>
            )}
            {updateError && (
                <div className="mb-4">
                    <ErrorMessage message={updateError} />
                </div>
            )}
            {live === 'reconnecting' && (
                <div className="alert alert-warning small" role="status">
                    Live updates are disconnected from {sseUrl}. Reconnecting…
                </div>
            )}

            {/* 1. Metric Cards */}
            <div className="row row-cols-1 row-cols-sm-2 row-cols-xl-4 g-3 mb-4">
                <div className="col">
                    <div className="card h-100">
                        <div className="card-body text-center">
                            <p className="small text-secondary fw-medium mb-1">Total Projects</p>
                            <p className="h3 mb-0">{stats.total}</p>
                        </div>
                    </div>
                </div>
                <div className="col">
                    <div className="card h-100">
                        <div className="card-body text-center">
                            <p className="small text-secondary fw-medium mb-1">Pending</p>
                            <p className="h3 text-warning mb-0">{stats.pending}</p>
                        </div>
                    </div>
                </div>
                <div className="col">
                    <div className="card h-100">
                        <div className="card-body text-center">
                            <p className="small text-secondary fw-medium mb-1">In Progress</p>
                            <p className="h3 text-primary mb-0">{stats.in_progress}</p>
                        </div>
                    </div>
                </div>
                <div className="col">
                    <div className="card h-100">
                        <div className="card-body text-center">
                            <p className="small text-secondary fw-medium mb-1">Completed</p>
                            <p className="h3 text-success mb-0">{stats.completed}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Chart & SSE Feed */}
            <div className="row g-3 mb-4">
                <div className="col-12 col-lg-6">
                    <div className="card h-100">
                        <div className="card-body">
                            <div className="d-flex justify-content-between align-items-center mb-4">
                                <h3 className="h5 mb-0">Status Distribution</h3>
                                <div className="btn-group btn-group-sm" role="group" aria-label="Chart type">
                                    {chartTypes.map((t) => (
                                        <button
                                            key={t.value}
                                            type="button"
                                            className={`btn ${chartType === t.value ? 'btn-secondary' : 'btn-outline-secondary'}`}
                                            aria-pressed={chartType === t.value}
                                            onClick={() => setChartType(t.value)}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="d-flex justify-content-center" style={{ height: '220px' }}>
                                {stats.total === 0 && !loading ? (
                                    <p className="text-secondary">No projects match these filters.</p>
                                ) : chartType === 'bar' ? (
                                    <Bar data={statusDistributionData} options={barOptions} />
                                ) : (
                                    <Doughnut data={statusDistributionData} options={doughnutOptions} />
                                )}
                            </div>
                        </div>
                    </div>




                </div>

                <div className="col-12 col-lg-6">
                    <div className="card h-100">
                        <div className="card-body">
                            <h3 className="h5 mb-3">Recent SSE Events</h3>
                            {visibleEvents.length === 0 ? (
                                <p className="text-secondary small">Listening for live events from Kafka...</p>
                            ) : (
                                <ul className="list-group list-group-flush">
                                    {visibleEvents.map((evt, idx) => (
                                      <li key={idx} className="list-group-item px-0 py-2 small border-bottom">
                                        ⚡ Project <strong>{evt.project_id != null ? `#${evt.project_id}` : evt.external_id}</strong>{' '}
                                        <span className="text-primary fw-semibold">{describeEvent(evt)}</span>
                                        <div className="text-secondary mt-1" style={{ fontSize: '0.75rem' }}>{evt.timestamp}</div>
                                    </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Project Inventory Table */}
            <div className="card">
                <div className="card-body">
                    <h3 className="h5 mb-3">Project Inventory</h3>
                    <div className="table-responsive">
                        <table className="table table-hover align-middle mb-0">
                            <thead className="table-light text-secondary">
                                <tr>
                                     <th scope="col" style={{ width: '2rem' }}><span className="visually-hidden">Milestones</span></th>
                                        <th scope="col" className="fw-medium small">ID</th>
                                                                        
                                  
                                    <th scope="col" className="fw-medium small">Project Name</th>
                                    <th scope="col" className="fw-medium small">Programme</th>
                                    <th scope="col" className="fw-medium small">Deadline</th> 
                                    <th scope="col" className="fw-medium small">Alert</th>  
                                    <th scope="col" className="fw-medium small">Status</th>
                                    <th scope="col" className="fw-medium small">Change Status</th>
                                </tr>
                            </thead>
                            <tbody>
                               {rankedProjects.map(({ project: p, alert }) => {
    const open = expanded.has(p.id);
    const milestones = indexedMilestones(p);
    return (
        <Fragment key={p.id}>
            <tr>
                <td>
                    <button
                        type="button"
                        className="btn btn-sm btn-link p-0 text-decoration-none"
                        aria-expanded={open}
                        aria-controls={`milestones-${p.id}`}
                        aria-label={`${open ? 'Hide' : 'Show'} milestones of ${p.name}`}
                        onClick={() => toggleExpanded(p.id)}
                    >
                        {open ? '▾' : '▸'}
                    </button>
                </td>
    <td className="text-secondary">#{p.id}</td>
    <td className="fw-medium">{p.name}</td>
    <td>{programmeName(p) || 'Unassigned'}</td>
    <td className="text-nowrap">{formatDeadline(p.deadline)}</td>
    <td><AlertBadge alert={alert} /></td>
    <td><StatusBadge status={p.status} /></td>
    <td>
        <select
            value={p.status}
            onChange={(e) => handleStatusChange(p.id, e.target.value as ProjectStatus)}
            disabled={updatingId === p.id}
            aria-label={`Change status of ${p.name}`}
            className="form-select form-select-sm w-auto"
        >
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
        </select>
    </td>

            </tr>
            {open && (
                <tr id={`milestones-${p.id}`}>
                    <td colSpan={8} className="bg-body-tertiary">
                        {milestones.length === 0 ? (
                            <p className="text-secondary small mb-0">No milestones for this project.</p>
                        ) : (
                            <table className="table table-sm align-middle mb-0">
                                <thead>
                                    <tr className="small text-secondary">
                                        <th scope="col">Milestone</th>
                                        <th scope="col">Due</th>
                                        <th scope="col">Status</th>
                                        <th scope="col">Time</th>
                                        <th scope="col">Achieved</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {milestones.map(({ m, index }) => {
                                        const info = milestoneInfo(m);
                                        const s = milestoneStyles[info.state];
                                        const key = `${p.id}:${index}`;
                                        return (
                                            <tr key={index}>
                                                <td className="fw-medium">{m.title}</td>
                                                <td className="text-nowrap">{formatDeadline(m.deadline)}</td>
                                                <td><span className={`badge ${s.bg} ${s.text} rounded-pill`}>{s.label}</span></td>
                                                <td className={info.state === 'overdue' ? 'text-danger' : 'text-secondary'}>{info.timeLabel}</td>
                                                <td>
                                                  <input
    type="checkbox"
    className="form-check-input"
    checked={m.status === 'achieved'}
    disabled={updatingMilestone === key}
    aria-label={`Mark ${m.title} as achieved`}
    onChange={(e) => handleMilestoneToggle(p, index, e.target.checked)}
/>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </td>
                </tr>
            )}
        </Fragment>
    );
})}
                                {!loading && filteredProjects.length === 0 && (
                                    <tr>
                                        <td colSpan={8} className="text-secondary text-center">No projects match these filters.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    );
}
