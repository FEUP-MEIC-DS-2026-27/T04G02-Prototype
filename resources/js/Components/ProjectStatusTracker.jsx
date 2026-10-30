import React, { useEffect, useState } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

export function ProjectStatusTracker() {
    const [projects, setProjects] = useState([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, in_progress: 0, completed: 0 });
    const [events, setEvents] = useState([]);

    const fetchProjects = async () => {
        try {
            const res = await fetch('/api/projects');
            const data = await res.json();
            setProjects(data.projects || []);
            setStats(data.stats || { total: 0, pending: 0, in_progress: 0, completed: 0 });
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

    // Chart Data
    const doughnutData = {
        labels: ['Pending', 'In Progress', 'Completed'],
        datasets: [
            {
                data: [stats.pending, stats.in_progress, stats.completed],
                backgroundColor: ['#eab308', '#2563eb', '#16a34a'],
                borderWidth: 2,
                borderColor: '#ffffff',
            },
        ],
    };

    const statusBadge = (status) => {
        const styles = {
            pending: { bg: '#fef9c3', color: '#854d0e', label: 'Pending' },
            in_progress: { bg: '#dbeafe', color: '#1e40af', label: 'In Progress' },
            completed: { bg: '#dcfce7', color: '#166534', label: 'Completed' },
        };
        const s = styles[status] || styles.pending;
        return (
            <span style={{
                backgroundColor: s.bg,
                color: s.color,
                padding: '0.25rem 0.6rem',
                borderRadius: '12px',
                fontSize: '0.8rem',
                fontWeight: '600'
            }}>
                {s.label}
            </span>
        );
    };

    return (
        <div style={{ padding: '2rem', fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '1100px', margin: '0 auto', color: '#1f2937' }}>
            <h1 style={{ marginBottom: '1.5rem', fontWeight: '700' }}>Project Dashboard</h1>

            {/* 1. Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '2rem' }}>
                <div style={cardStyle}>
                    <small style={labelStyle}>Total Projects</small>
                    <div style={countStyle}>{stats.total}</div>
                </div>
                <div style={cardStyle}>
                    <small style={labelStyle}>Pending</small>
                    <div style={{ ...countStyle, color: '#ca8a04' }}>{stats.pending}</div>
                </div>
                <div style={cardStyle}>
                    <small style={labelStyle}>In Progress</small>
                    <div style={{ ...countStyle, color: '#2563eb' }}>{stats.in_progress}</div>
                </div>
                <div style={cardStyle}>
                    <small style={labelStyle}>Completed</small>
                    <div style={{ ...countStyle, color: '#16a34a' }}>{stats.completed}</div>
                </div>
            </div>

            {/* 2. Chart & SSE Feed */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '2rem' }}>
                {/* Doughnut Chart */}
                <div style={panelStyle}>
                    <h3 style={titleStyle}>Status Breakdown</h3>
                    <div style={{ height: '220px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <Doughnut data={doughnutData} options={{ maintainAspectRatio: false }} />
                    </div>
                </div>

                {/* Live Event Stream */}
                <div style={panelStyle}>
                    <h3 style={titleStyle}>Recent SSE Events</h3>
                    {events.length === 0 ? (
                        <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Listening for live events from Kafka...</p>
                    ) : (
                        <ul style={{ listStyleType: 'none', padding: 0, margin: 0 }}>
                            {events.map((evt, idx) => (
                                <li key={idx} style={{ padding: '0.6rem 0', borderBottom: '1px solid #f3f4f6', fontSize: '0.875rem' }}>
                                    ⚡ Project <strong>{evt.project_id != null ? `#${evt.project_id}` : evt.external_id}</strong> updated to{' '}
                                    <span style={{ color: '#2563eb', fontWeight: '600' }}>{evt.status}</span>
                                    <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{evt.timestamp}</div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* 3. Project Inventory Table */}
            <div style={panelStyle}>
                <h3 style={titleStyle}>Project Inventory</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', marginTop: '1rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid #e5e7eb', color: '#6b7280', fontSize: '0.85rem' }}>
                            <th style={cellStyle}>ID</th>
                            <th style={cellStyle}>Project Name</th>
                            <th style={cellStyle}>Status</th>
                            <th style={cellStyle}>Change Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {projects.map((p) => (
                            <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={cellStyle}>#{p.id}</td>
                                <td style={{ ...cellStyle, fontWeight: '500' }}>{p.name}</td>
                                <td style={cellStyle}>{statusBadge(p.status)}</td>
                                <td style={cellStyle}>
                                    <select
                                        value={p.status}
                                        onChange={(e) => handleStatusChange(p.id, e.target.value)}
                                        style={selectStyle}
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
    );
}

// Styling Objects
const cardStyle = {
    padding: '1.25rem',
    borderRadius: '10px',
    border: '1px solid #e5e7eb',
    textAlign: 'center',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
};

const panelStyle = {
    padding: '1.5rem',
    borderRadius: '10px',
    border: '1px solid #e5e7eb',
    backgroundColor: '#ffffff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
};

const labelStyle = {
    color: '#6b7280',
    fontSize: '0.85rem',
    fontWeight: '500'
};

const countStyle = {
    fontSize: '2rem',
    fontWeight: '700',
    marginTop: '0.25rem'
};

const titleStyle = {
    margin: '0 0 1rem 0',
    fontSize: '1.1rem',
    fontWeight: '600',
    color: '#111827'
};

const cellStyle = {
    padding: '0.75rem',
    fontSize: '0.9rem'
};

const selectStyle = {
    padding: '0.35rem 0.6rem',
    borderRadius: '6px',
    border: '1px solid #d1d5db',
    backgroundColor: '#fff',
    cursor: 'pointer',
    fontSize: '0.85rem'
};
