import React, { useEffect, useMemo, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const emptyStats = { total: 0, pending: 0, in_progress: 0, completed: 0 };
const statusOptions = [['pending', 'Pending'], ['in_progress', 'In Progress'], ['completed', 'Completed']];
const statusLabels = Object.fromEntries(statusOptions);

export function ProjectStatusTracker() {
    const [projects, setProjects] = useState([]);
    const [stats, setStats] = useState(emptyStats);
    const [myStats, setMyStats] = useState(emptyStats);
    const [activeTab, setActiveTab] = useState('all');
    // const [currentUser, setCurrentUser] = useState(null);
    const [events, setEvents] = useState([]);

    const fetchProjects = async () => {
        try {
            const res = await fetch('/api/projects');
            const data = await res.json();
            setProjects(data.projects || []);
            setStats(data.stats || emptyStats);
            // setCurrentUser(data.current_user || null);
            setMyStats(data.my_stats || emptyStats);
        } catch (err) {
            console.error('Error fetching project data:', err);
        }
    };

    const handleStatusChange = async (id, newStatus) => {
        try {
            await fetch(`/api/projects/${id}/status`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ status: newStatus }),
            });
        } catch (err) {
            console.error('Error updating status:', err);
        }
    };

    useEffect(() => {
        fetchProjects();

        // Connect to SSE Hub
        const eventSource = new EventSource('http://localhost:3001/events');

        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            setEvents((prev) => [data, ...prev.slice(0, 4)]); // Keep top 5 latest events

            fetchProjects(); // Re-sync metric state & chart data
        };

        eventSource.onerror = (err) => {
            console.error('SSE Error:', err);
            eventSource.close();
        };

        return () => eventSource.close();
    }, []);

    function DoughnutData({ title, stats }) {
        const isEmpty = stats.pending + stats.in_progress + stats.completed === 0;
        const data = {
            labels: isEmpty ? ['No projects'] : ['Pending', 'In Progress', 'Completed'],
            datasets: [{
                data: isEmpty ? [1] : [stats.pending, stats.in_progress, stats.completed],
                backgroundColor: isEmpty ? ['#c5c5c5'] : ['#eab308', '#2563eb', '#16a34a'],
                borderWidth: 2,
                borderColor: '#ffffff',
            }],
        };

        return <section className="table"><h2 className="table_title">{title}</h2><div className="chart"><Doughnut data={data} options={{ maintainAspectRatio: false }} /></div></section>;
    }

    function StatusBadge({ status }) {
        return <span className={`status-badge status-badge-${status}`}>{statusLabels[status] || statusLabels.pending}</span>;
    }

    function StatCard({ label, value, variant = '' }) {
        return <article className="stat-card">
            <small>{label}</small>
            <strong className={`stat-card_value stat-card_value-${variant}`}>{value}</strong>
        </article>;
    }

    const visibleProjects = useMemo(
        () => activeTab === 'my' ? projects.filter((project) => project.can_update) : projects,
        [activeTab, projects],
    );

    return (
        <main className="dashboard">
            <h1 className="dashboard_heading">Project Dashboard</h1>
            <section>
                <h2 className="section-title">All Projects</h2>
                <div className="stats-grid">
                    <StatCard label="Total Projects" value={stats.total} />
                    <StatCard label="Pending" value={stats.pending} variant="pending" />
                    <StatCard label="In Progress" value={stats.in_progress} variant="progress" />
                    <StatCard label="Completed" value={stats.completed} variant="completed" />
                </div>
            </section>
            <section>
                <h2 className="section-title">My Projects</h2>
                <div className="stats-grid">
                    <StatCard label="Total Projects" value={myStats.total} />
                    <StatCard label="Pending" value={myStats.pending} variant="pending" />
                    <StatCard label="In Progress" value={myStats.in_progress} variant="progress" />
                    <StatCard label="Completed" value={myStats.completed} variant="completed" />
                </div>
            </section>

            <div className="dashboard_charts">
                <DoughnutData title="All Projects Status" stats={stats} />
                <DoughnutData title="My Projects Status" stats={myStats} />
            </div>

            <section className="table table-events">
                <h2 className="table_title">Recent SSE Events</h2>
                {events.length === 0 ? (
                    <p className="muted">Listening for live events from Kafka...</p>
                ) : (
                    <ul className="event-list">
                        {events.map((evt, idx) => (
                            <li className="event-list_item" key={idx}>
                                ⚡ Project <strong>{evt.project_id != null ? `#${evt.project_id}` : evt.external_id}</strong> updated to{' '}
                                <span style={{ color: '#2563eb', fontWeight: '600' }}>{evt.status}</span>
                                <time className="event-list_time">{evt.timestamp}</time>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section className="table">
                <h2 className="table_title">Project Inventory</h2>
                <div className="tabs" role="tablist" aria-label="Project list">
                    <button 
                        className={activeTab === 'all' ? 'tab tab-active' : 'tab'} 
                        onClick={() => setActiveTab('all')} role="tab" aria-selected={activeTab === 'all'} type="button">
                        All Projects ({projects.length})
                    </button>
                    <button 
                        className={activeTab === 'my' ? 'tab tab-active' : 'tab'} 
                        onClick={() => setActiveTab('my')} role="tab" aria-selected={activeTab === 'my'} type="button">
                        My Projects ({myStats.total})
                    </button>
                </div>
                <div className="table-wrapper">
                    <table className="project-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Project Name</th>
                                <th>Owner</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visibleProjects.map((project) => (
                                <tr key={project.id}>
                                    <td>#{project.id}</td>
                                    <td className="project-table_name">{project.name}</td>
                                    <td>{project.owner?.name || 'Anonym'}</td>
                                    <td>
                                        {activeTab === 'my' ? (
                                            <select 
                                                className="status-select" 
                                                value={project.status} 
                                                onChange={(event) => handleStatusChange(project.id, event.target.value)}>
                                                {statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                            </select>
                                        ) : (
                                            <StatusBadge status={project.status} />
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                { visibleProjects.length === 0 && <p className="muted"><br></br> You don't own projects. </p> }
            </section>
        </main>
    );
}
