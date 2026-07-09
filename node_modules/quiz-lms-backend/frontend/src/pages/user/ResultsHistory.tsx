import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserLayout from '../../components/Layout/UserLayout';
import api from '../../utils/api';

interface Result {
    _id: string;
    quizId: { title: string; numberOfQuestions: number; passingMarks: number };
    resultType?: 'assessment' | 'quiz';
    score: number;
    totalMarks: number;
    passed: boolean;
    timeTaken: number;
    submittedAt: string;
    correctAnswers?: number;
    percentage?: number;
}

const ResultsHistory: React.FC = () => {
    const [results, setResults] = useState<Result[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        api.get('/user/results')
            .then(res => setResults(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const formatTime = (s: number) => `${Math.floor(s / 60)}m ${s % 60}s`;

    const passCount = results.filter(r => r.passed).length;
    const avgScore = results.length > 0
        ? Math.round(results.reduce((sum, r) => sum + (r.totalMarks > 0 ? (r.score / r.totalMarks) * 100 : 0), 0) / results.length)
        : 0;

    return (
        <UserLayout>
            <div style={{ marginBottom: 28 }}>
                <h1 style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.75rem', fontWeight: 800, marginBottom: 6 }}>
                    My Results
                </h1>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
                    Your released quiz and classroom assessment results
                </p>
            </div>

            {/* Summary stats */}
            {results.length > 0 && (
                <div className="grid-3 mb-6">
                    <div className="stat-card">
                        <div className="stat-icon primary">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                            </svg>
                        </div>
                        <div>
                            <div className="stat-value">{results.length}</div>
                            <div className="stat-label">Total Attempts</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon accent">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                        </div>
                        <div>
                            <div className="stat-value">{passCount}</div>
                            <div className="stat-label">Quizzes Passed</div>
                        </div>
                    </div>
                    <div className="stat-card">
                        <div className="stat-icon info">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                        </div>
                        <div>
                            <div className="stat-value">{avgScore}%</div>
                            <div className="stat-label">Average Score</div>
                        </div>
                    </div>
                </div>
            )}

            <div className="card">
                {loading ? (
                    <div className="loading-overlay"><div className="loading-spinner" />Loading results...</div>
                ) : results.length === 0 ? (
                    <div className="empty-state" style={{ padding: '80px 40px' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                        <div className="empty-state-title">No results yet</div>
                        <div className="empty-state-desc">Complete a quiz to see your results here.</div>
                        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => navigate('/user/dashboard')}>
                            Go to My Quizzes
                        </button>
                    </div>
                ) : (
                    <div className="table-wrapper" style={{ borderRadius: 0, border: 'none' }}>
                        <table>
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th className="col-quiz-name">Quiz</th>
                                    <th className="col-status">Score</th>
                                    <th className="col-status">Percentage</th>
                                    <th className="col-status">Status</th>
                                    <th className="col-time">Time Taken</th>
                                    <th className="col-date">Date</th>
                                    <th className="col-status">Review</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((r, i) => {
                                    const pct = r.percentage ?? (r.totalMarks > 0 ? Math.round((r.score / r.totalMarks) * 100) : 0);
                                    return (
                                        <tr key={r._id}>
                                            <td className="text-muted text-sm">{i + 1}</td>
                                            <td>
                                                <strong>{r.quizId?.title}</strong>
                                                {r.resultType === 'assessment' && <div className="text-muted text-sm">Classroom Assessment</div>}
                                            </td>
                                            <td>{r.score} / {r.totalMarks}</td>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ flex: 1, height: 6, background: 'var(--color-surface-2)', borderRadius: 3, overflow: 'hidden', minWidth: 60 }}>
                                                        <div style={{ height: '100%', width: `${pct}%`, background: r.passed ? 'var(--color-accent)' : 'var(--color-danger)', borderRadius: 3 }} />
                                                    </div>
                                                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: r.passed ? 'var(--color-accent)' : 'var(--color-danger)', minWidth: 36 }}>
                                                        {pct}%
                                                    </span>
                                                </div>
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
                                            <td>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                                                    onClick={() => navigate(`/user/review/${r._id}`)}
                                                >
                                                    Review
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </UserLayout>
    );
};

export default ResultsHistory;
