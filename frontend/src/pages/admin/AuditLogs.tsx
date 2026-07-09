import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';

interface AuditLogEntry {
    _id: string;
    actorUsername: string;
    action: string;
    targetUsername?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    timestamp: string;
}

const ACTION_LABELS: Record<string, string> = {
    CREATE_ADMIN: 'Created admin account',
    UPDATE_ADMIN: 'Updated admin account',
    DELETE_ADMIN: 'Deleted admin account',
    RESET_ADMIN_PASSWORD: 'Reset admin password',
    CHANGE_OWN_PASSWORD: 'Changed own password',
    CHANGE_OWN_USERNAME: 'Changed own username',
};

const ACTION_BADGE: Record<string, string> = {
    CREATE_ADMIN: 'badge-success',
    UPDATE_ADMIN: 'badge-primary',
    DELETE_ADMIN: 'badge-error',
    RESET_ADMIN_PASSWORD: 'badge-warning',
    CHANGE_OWN_PASSWORD: 'badge-info',
    CHANGE_OWN_USERNAME: 'badge-warning',
};

const AuditLogs: React.FC = () => {
    const [logs, setLogs] = useState<AuditLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);

    const fetchLogs = useCallback(async (p: number) => {
        try {
            setLoading(true);
            const res = await api.get(`/admin/audit-logs?page=${p}&limit=20`);
            setLogs(res.data.logs);
            setTotalPages(res.data.totalPages);
            setTotal(res.data.total);
        } catch (err: any) {
            setError(err.message || 'Failed to load audit logs');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchLogs(page); }, [fetchLogs, page]);

    return (
        <AdminLayout title="Audit Logs">
            <div className="page-container">
                <div className="page-header">
                    <div>
                        <h2 className="page-title">Audit Logs</h2>
                        <p className="page-subtitle">{total} total events recorded</p>
                    </div>
                </div>

                {error && <div className="alert alert-error">{error}</div>}

                <div className="card">
                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner" />
                            <p>Loading logs...</p>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="empty-state">
                            <p>No audit events recorded yet.</p>
                        </div>
                    ) : (
                        <div className="table-scroll-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th className="col-time">Timestamp</th>
                                        <th className="col-student-name">Actor</th>
                                        <th className="col-status">Action</th>
                                        <th className="col-student-name">Target</th>
                                        <th className="col-classroom">Details</th>
                                        <th className="col-status">IP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {logs.map((log) => (
                                        <tr key={log._id}>
                                            <td className="text-secondary" style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                                                {new Date(log.timestamp).toLocaleString()}
                                            </td>
                                            <td>
                                                <span className="font-medium">{log.actorUsername}</span>
                                            </td>
                                            <td>
                                                <span className={`badge ${ACTION_BADGE[log.action] || 'badge-primary'}`}>
                                                    {ACTION_LABELS[log.action] || log.action}
                                                </span>
                                            </td>
                                            <td className="text-secondary">
                                                {log.targetUsername || '—'}
                                            </td>
                                            <td className="text-secondary" style={{ fontSize: '0.82rem' }}>
                                                {log.details && Object.keys(log.details).length > 0
                                                    ? Object.entries(log.details)
                                                        .map(([k, v]) => `${k}: ${v}`)
                                                        .join(', ')
                                                    : '—'
                                                }
                                            </td>
                                            <td className="text-secondary" style={{ fontSize: '0.82rem' }}>
                                                {log.ipAddress || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="pagination">
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={page === 1}
                                onClick={() => setPage(p => p - 1)}
                            >
                                ← Prev
                            </button>
                            <span className="pagination-info">Page {page} of {totalPages}</span>
                            <button
                                className="btn btn-ghost btn-sm"
                                disabled={page === totalPages}
                                onClick={() => setPage(p => p + 1)}
                            >
                                Next →
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
};

export default AuditLogs;
