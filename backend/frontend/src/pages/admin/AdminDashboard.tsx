import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';

interface Stats {
    totalUsers: number;
    totalQuizzes: number;
    totalMCQs: number;
    totalAttempts: number;
}

interface RecentResult {
    _id: string;
    userId: { username: string };
    quizId: { title: string };
    score: number;
    totalMarks: number;
    passed: boolean;
    submittedAt: string;
}

const AdminDashboard: React.FC = () => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [recentResults, setRecentResults] = useState<RecentResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/admin/dashboard/stats')
            .then(res => {
                setStats(res.data.stats);
                setRecentResults(res.data.recentResults);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const statCards = [
        {
            label: 'Total Students',
            value: stats?.totalUsers ?? 0,
            iconClass: 'primary',
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            ),
        },
        {
            label: 'Total Quizzes',
            value: stats?.totalQuizzes ?? 0,
            iconClass: 'accent',
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            ),
        },
        {
            label: 'MCQ Bank Size',
            value: stats?.totalMCQs ?? 0,
            iconClass: 'warning',
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
            ),
        },
        {
            label: 'Total Attempts',
            value: stats?.totalAttempts ?? 0,
            iconClass: 'info',
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
            ),
        },
    ];

    return (
        <AdminLayout title="Dashboard">
            {loading ? (
                <div className="loading-overlay">
                    <div className="loading-spinner" />
                    Loading dashboard...
                </div>
            ) : (
                <>
                    {/* Stats */}
                    <div className="grid-4 mb-6">
                        {statCards.map((s) => (
                            <div className="stat-card" key={s.label}>
                                <div className={`stat-icon ${s.iconClass}`}>{s.icon}</div>
                                <div>
                                    <div className="stat-value">{s.value}</div>
                                    <div className="stat-label">{s.label}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Recent results */}
                    <div className="card">
                        <div className="card-header">
                            <h2 className="card-title">Recent Submissions</h2>
                            <a href="/admin/results" className="btn btn-secondary btn-sm">View All</a>
                        </div>
                        <div className="table-scroll-container">
                            {recentResults.length === 0 ? (
                                <div className="empty-state">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                                    </svg>
                                    <div className="empty-state-title">No submissions yet</div>
                                    <div className="empty-state-desc">Results will appear here once students start taking quizzes.</div>
                                </div>
                            ) : (
                                <table>
                                    <thead>
                                        <tr>
                                            <th className="col-student-name">Student</th>
                                            <th className="col-quiz-name">Quiz</th>
                                            <th className="col-status">Score</th>
                                            <th className="col-status">Status</th>
                                            <th className="col-time">Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentResults.map((r) => (
                                            <tr key={r._id}>
                                                <td><strong>{r.userId?.username}</strong></td>
                                                <td>{r.quizId?.title}</td>
                                                <td>{r.score} / {r.totalMarks}</td>
                                                <td>
                                                    <span className={`badge ${r.passed ? 'badge-success' : 'badge-danger'}`}>
                                                        {r.passed ? 'PASS' : 'FAIL'}
                                                    </span>
                                                </td>
                                                <td className="text-muted text-sm">
                                                    {new Date(r.submittedAt).toLocaleDateString('en-US', {
                                                        month: 'short', day: 'numeric', year: 'numeric',
                                                        hour: '2-digit', minute: '2-digit'
                                                    })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </>
            )}
        </AdminLayout>
    );
};

export default AdminDashboard;
