import React, { useEffect, useMemo, useState } from 'react';
import UserLayout from '../../components/Layout/UserLayout';
import api from '../../utils/api';

interface SubjectReport {
    subject: string;
    totalQuestionsAttempted: number;
    correctAnswers: number;
    incorrectAnswers: number;
    accuracyPercentage: number;
    averageScore: number;
    strongAreas: string[];
    weakAreas: string[];
    progressTrend: { date: string; accuracy: number }[];
}

const Sparkline = ({ points }: { points: { accuracy: number }[] }) => {
    const values = points.length ? points.map((point) => point.accuracy) : [0];
    const width = 160;
    const height = 48;
    const step = values.length > 1 ? width / (values.length - 1) : width;
    const d = values.map((value, index) => {
        const x = index * step;
        const y = height - (value / 100) * height;
        return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ');
    return (
        <svg className="report-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <path d={d} />
        </svg>
    );
};

const PerformanceReports: React.FC = () => {
    const [subjects, setSubjects] = useState<SubjectReport[]>([]);
    const [charts, setCharts] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get('/user/reports/subjects')
            .then((res) => {
                setSubjects(res.data.subjects || []);
                setCharts(res.data.charts || {});
            })
            .catch((err) => setError(err.response?.data?.message || 'Could not load performance reports. Please try again.'))
            .finally(() => setLoading(false));
    }, []);

    const completion = charts.completionStatistics || { attempted: 0, correct: 0, incorrect: 0, accuracy: 0 };
    const topSubjects = useMemo(() => subjects.slice(0, 6), [subjects]);

    return (
        <UserLayout>
            <div className="learning-page">
                <section className="learning-hero">
                    <div>
                        <p className="learning-kicker">Performance Intelligence</p>
                        <h1>Performance Reports</h1>
                        <p>Track subject accuracy, completion, strong areas, and weak areas across released results and personal practice.</p>
                    </div>
                </section>

                {error && <div className="alert alert-error">{error}</div>}

                {loading ? (
                    <div className="loading-overlay"><div className="loading-spinner" />Loading performance reports...</div>
                ) : subjects.length === 0 ? (
                    <div className="learning-empty card">No report data yet. Complete quizzes or practice sessions to build your analytics.</div>
                ) : (
                    <>
                        <div className="report-summary-grid">
                            <div><span>Total Attempted</span><strong>{completion.attempted}</strong></div>
                            <div><span>Correct Answers</span><strong>{completion.correct}</strong></div>
                            <div><span>Incorrect Answers</span><strong>{completion.incorrect}</strong></div>
                            <div><span>Overall Accuracy</span><strong>{completion.accuracy}%</strong></div>
                        </div>

                        <section className="report-chart-grid">
                            <div className="report-panel">
                                <h2>Category Distribution</h2>
                                {(charts.categoryDistribution || []).slice(0, 8).map((item: any) => (
                                    <div className="report-bar-row" key={item.label}>
                                        <span>{item.label}</span>
                                        <div><i style={{ width: `${completion.attempted ? (item.value / completion.attempted) * 100 : 0}%` }} /></div>
                                        <strong>{item.value}</strong>
                                    </div>
                                ))}
                            </div>
                            <div className="report-panel">
                                <h2>Performance Comparison</h2>
                                {(charts.performanceComparison || []).slice(0, 8).map((item: any) => (
                                    <div className="report-bar-row" key={item.label}>
                                        <span>{item.label}</span>
                                        <div><i className="accent" style={{ width: `${item.value}%` }} /></div>
                                        <strong>{item.value}%</strong>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="subject-report-grid">
                            {topSubjects.map((subject) => (
                                <article className="subject-report-card" key={subject.subject}>
                                    <div className="subject-report-header">
                                        <div>
                                            <h2>{subject.subject}</h2>
                                            <p>{subject.totalQuestionsAttempted} questions attempted</p>
                                        </div>
                                        <div className="subject-accuracy">{subject.accuracyPercentage}%</div>
                                    </div>
                                    <Sparkline points={subject.progressTrend} />
                                    <div className="subject-report-stats">
                                        <div><span>Correct</span><strong>{subject.correctAnswers}</strong></div>
                                        <div><span>Incorrect</span><strong>{subject.incorrectAnswers}</strong></div>
                                        <div><span>Avg Score</span><strong>{subject.averageScore}%</strong></div>
                                    </div>
                                    <div className="subject-area-row">
                                        <div>
                                            <span>Strong Areas</span>
                                            <strong>{subject.strongAreas.length ? subject.strongAreas.join(', ') : 'Building'}</strong>
                                        </div>
                                        <div>
                                            <span>Weak Areas</span>
                                            <strong>{subject.weakAreas.length ? subject.weakAreas.join(', ') : 'None flagged'}</strong>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </section>
                    </>
                )}
            </div>
        </UserLayout>
    );
};

export default PerformanceReports;
