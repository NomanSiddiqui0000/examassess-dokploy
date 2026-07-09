import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';

interface Result {
    _id: string;
    userId: { _id: string; username: string };
    quizId: { _id: string; title: string; numberOfQuestions: number; marksPerQuestion: number; passingMarks: number };
    score: number;
    totalMarks: number;
    passed: boolean;
    timeTaken: number;
    submittedAt: string;
}

interface Quiz {
    _id: string;
    title: string;
}

interface User {
    _id: string;
    username: string;
}

const ResultsView: React.FC = () => {
    const [results, setResults] = useState<Result[]>([]);
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterQuiz, setFilterQuiz] = useState('');
    const [filterUser, setFilterUser] = useState('');

    useEffect(() => {
        Promise.all([
            api.get('/admin/results'),
            api.get('/admin/quizzes'),
            api.get('/admin/users'),
        ]).then(([r, q, u]) => {
            setResults(r.data);
            setQuizzes(q.data);
            setUsers(u.data.filter((u: any) => u.role === 'user'));
        }).catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const fetchFiltered = () => {
        setLoading(true);
        const params: any = {};
        if (filterQuiz) params.quizId = filterQuiz;
        if (filterUser) params.userId = filterUser;
        api.get('/admin/results', { params })
            .then(res => setResults(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchFiltered(); }, [filterQuiz, filterUser]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}m ${s}s`;
    };

    return (
        <AdminLayout title="Results">
            <div className="card">
                <div className="card-header">
                    <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
                        <select
                            className="form-select"
                            style={{ width: 'auto', minWidth: 180 }}
                            value={filterQuiz}
                            onChange={e => setFilterQuiz(e.target.value)}
                        >
                            <option value="">All Quizzes</option>
                            {quizzes.map(q => <option key={q._id} value={q._id}>{q.title}</option>)}
                        </select>
                        <select
                            className="form-select"
                            style={{ width: 'auto', minWidth: 180 }}
                            value={filterUser}
                            onChange={e => setFilterUser(e.target.value)}
                        >
                            <option value="">All Students</option>
                            {users.map(u => <option key={u._id} value={u._id}>{u.username}</option>)}
                        </select>
                    </div>
                    <span className="badge badge-neutral">{results.length} result{results.length !== 1 ? 's' : ''}</span>
                </div>

                {loading ? (
                    <div className="loading-overlay"><div className="loading-spinner" />Loading results...</div>
                ) : (
                    <div className="table-scroll-container">
                        {results.length === 0 ? (
                            <div className="empty-state">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                                </svg>
                                <div className="empty-state-title">No results found</div>
                                <div className="empty-state-desc">Results will appear here once students complete quizzes.</div>
                            </div>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th className="col-student-name">Student</th>
                                        <th className="col-quiz-name">Quiz</th>
                                        <th className="col-status">Score</th>
                                        <th className="col-status">Percentage</th>
                                        <th className="col-status">Status</th>
                                        <th className="col-time">Time Taken</th>
                                        <th className="col-date">Submitted</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map(r => (
                                        <tr key={r._id}>
                                            <td><strong>{r.userId?.username}</strong></td>
                                            <td>{r.quizId?.title}</td>
                                            <td>{r.score} / {r.totalMarks}</td>
                                            <td>
                                                <span style={{ fontWeight: 600, color: r.passed ? 'var(--color-accent)' : 'var(--color-danger)' }}>
                                                    {r.totalMarks > 0 ? Math.round((r.score / r.totalMarks) * 100) : 0}%
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge ${r.passed ? 'badge-success' : 'badge-danger'}`}>
                                                    {r.passed ? 'PASS' : 'FAIL'}
                                                </span>
                                            </td>
                                            <td className="text-muted text-sm">{formatTime(r.timeTaken)}</td>
                                            <td className="text-muted text-sm">
                                                {new Date(r.submittedAt).toLocaleDateString('en-US', {
                                                    month: 'short', day: 'numeric', year: 'numeric',
                                                })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>
        </AdminLayout>
    );
};

export default ResultsView;
