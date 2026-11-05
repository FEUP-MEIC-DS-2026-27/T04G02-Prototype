import { useCallback, useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import ErrorMessage from './ErrorMessage';
import Loading from './Loading';

ChartJS.register(ArcElement, Tooltip, Legend);

// Part of the contract with VA3: bump this when the props below change incompatibly.
export const contractVersion = 1;

// The browser calls the project status services directly. The host can pass other
// URLs as props, and standalone builds can set them at build time.
const DEFAULT_API_URL: string = import.meta.env.PUBLIC_PROJECTS_API_URL ?? 'http://localhost:8011';
const DEFAULT_SSE_URL: string = import.meta.env.PUBLIC_PROJECTS_SSE_URL ?? 'http://localhost:8012/events';

interface ProjectStatusTrackerProps {
    apiUrl?: string;
    sseUrl?: string;
}

type ProjectStatus = 'pending' | 'in_progress' | 'completed';

interface Project {
    id: number;
    name: string;
    status: ProjectStatus;
}

interface Stats {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
}

/** A message from the SSE hub (one Kafka event). */
interface StatusEvent {
    project_id?: number | null;
    external_id?: string;
    name?: string;
    status: string;
    timestamp: string;
}

type LiveState = 'connecting' | 'live' | 'reconnecting';

const emptyStats: Stats = { total: 0, pending: 0, in_progress: 0, completed: 0 };

const badgeStyles: Record<ProjectStatus, { bg: string; text: string; label: string }> = {
    pending: { bg: 'bg-warning-subtle', text: 'text-warning-emphasis', label: 'Pending' },
    in_progress: { bg: 'bg-primary-subtle', text: 'text-primary-emphasis', label: 'In Progress' },
    completed: { bg: 'bg-success-subtle', text: 'text-success-emphasis', label: 'Completed' },
};

function StatusBadge({ status }: { status: ProjectStatus }) {
    const s = badgeStyles[status] ?? badgeStyles.pending;
    return (
        <span className={`badge ${s.bg} ${s.text} rounded-pill px-3 py-2`}>
            {s.label}
        </span>
    );
}

/** Throws a readable message when the API answers with an error status. */
async function readJson<T>(res: Response, what: string): Promise<T> {
    if (!res.ok) {
        const problem = await res.json().catch(() => null);
        throw new Error(problem?.message ?? `${what} failed: ${res.status}`);
    }
    return res.json() as Promise<T>;
}

// Bootstrap classes only. The stylesheet comes from the host (integrated) or from
// bootstrap.tsx (standalone), and the host owns the router.
export default function ProjectStatusTracker({ apiUrl = DEFAULT_API_URL, sseUrl = DEFAULT_SSE_URL }: ProjectStatusTrackerProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [stats, setStats] = useState<Stats>(emptyStats);
    const [events, setEvents] = useState<StatusEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [updateError, setUpdateError] = useState<string | null>(null);
    const [updatingId, setUpdatingId] = useState<number | null>(null);
    const [live, setLive] = useState<LiveState>('connecting');

    const fetchProjects = useCallback(async (signal?: AbortSignal) => {
        try {
            const res = await fetch(`${apiUrl}/api/projects`, { signal });
            const data = await readJson<{ projects?: Project[]; stats?: Stats }>(res, 'GET /api/projects');
            setProjects(data.projects ?? []);
            setStats(data.stats ?? emptyStats);
            setLoadError(null);
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;
            setLoadError(`Could not load projects from ${apiUrl}. ${(err as Error).message}`);
        } finally {
            if (!signal?.aborted) setLoading(false);
        }
    }, [apiUrl]);

    const handleStatusChange = async (id: number, newStatus: ProjectStatus) => {
        setUpdatingId(id);
        setUpdateError(null);
        try {
            const res = await fetch(`${apiUrl}/api/projects/${id}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ status: newStatus }),
            });
            await readJson(res, `POST /api/projects/${id}/status`);
            // Refresh now instead of waiting for the SSE event, so the page is right even if live updates are down.
            await fetchProjects();
        } catch (err) {
            setUpdateError(`Could not update project #${id}. ${(err as Error).message}`);
        } finally {
            setUpdatingId(null);
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
                // Ignore a malformed event, but still re-sync below.
            }
            fetchProjects(controller.signal); // Re-sync metric state & chart data
        };
        eventSource.onerror = () => setLive('reconnecting');

        return () => {
            controller.abort();
            eventSource.close();
        };
    }, [fetchProjects, sseUrl]);

    // Chart Data
    const doughnutData = {
        labels: ['Pending', 'In Progress', 'Completed'],
        datasets: [
            {
                data: [stats.pending, stats.in_progress, stats.completed],
                backgroundColor: ['#ffc107', '#0d6efd', '#198754'], // Bootstrap warning, primary, success
                borderWidth: 2,
                borderColor: '#ffffff',
            },
        ],
    };

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
                            <h3 className="h5 mb-4">Status Breakdown</h3>
                            <div className="d-flex justify-content-center" style={{ height: '220px' }}>
                                <Doughnut data={doughnutData} options={{ maintainAspectRatio: false }} />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="col-12 col-lg-6">
                    <div className="card h-100">
                        <div className="card-body">
                            <h3 className="h5 mb-3">Recent SSE Events</h3>
                            {events.length === 0 ? (
                                <p className="text-secondary small">Listening for live events from Kafka...</p>
                            ) : (
                                <ul className="list-group list-group-flush">
                                    {events.map((evt, idx) => (
                                        <li key={idx} className="list-group-item px-0 py-2 small border-bottom">
                                            ⚡ Project <strong>{evt.project_id != null ? `#${evt.project_id}` : evt.external_id}</strong> updated to{' '}
                                            <span className="text-primary fw-semibold">{evt.status}</span>
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
                                    <th scope="col" className="fw-medium small">ID</th>
                                    <th scope="col" className="fw-medium small">Project Name</th>
                                    <th scope="col" className="fw-medium small">Status</th>
                                    <th scope="col" className="fw-medium small">Change Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projects.map((p) => (
                                    <tr key={p.id}>
                                        <td className="text-secondary">#{p.id}</td>
                                        <td className="fw-medium">{p.name}</td>
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
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    );
}
