import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';

interface MCQ {
    _id: string;
    questionText: string;
    category?: { _id: string; name: string } | string;
    typeId?: { _id: string; name: string } | string;
    difficulty?: string;
}

interface TestCategory {
    _id: string;
    name: string;
}

interface MCQTypeItem {
    _id: string;
    name: string;
    categoryId?: { _id: string; name: string } | string;
    status: string;
}

interface User {
    _id: string;
    username: string;
    isActive: boolean;
}

interface Quiz {
    _id: string;
    title: string;
    description?: string;
    testCategory?: { _id: string; name: string } | string;
    numberOfQuestions: number;
    duration: number;
    passingMarks: number;
    marksPerQuestion: number;
    attemptLimit: number;
    isActive: boolean;
    enrolledUsers: { _id: string; username: string }[];
    mcqIds: { _id: string; questionText: string }[];
    typeDistribution?: {
        mode: 'none' | 'count' | 'percentage';
        items: { typeId: string; value: number }[];
    };
}

const emptyForm = {
    title: '',
    description: '',
    testCategory: '',
    numberOfQuestions: 1 as number | '',
    duration: 30 as number | '',
    passingMarks: 50 as number | '',
    marksPerQuestion: 1 as number | '',
    attemptLimit: 1 as number | '',
    selectedMCQs: [] as string[],
    randomMCQCount: 0 as number | '',
    enrolledUsers: [] as string[],
    distMode: 'none' as 'none' | 'count' | 'percentage',
    distItems: [] as { typeId: string; value: number | '' }[],
};

const QuizConfiguration: React.FC = () => {
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [allMCQs, setAllMCQs] = useState<MCQ[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [categories, setCategories] = useState<TestCategory[]>([]);
    const [mcqTypes, setMcqTypes] = useState<MCQTypeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editQuiz, setEditQuiz] = useState<Quiz | null>(null);
    const [form, setForm] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [mcqSearch, setMcqSearch] = useState('');
    const [userSearch, setUserSearch] = useState('');

    const fetchAll = () => {
        setLoading(true);
        Promise.all([
            api.get('/admin/quizzes'),
            api.get('/admin/mcqs'),
            api.get('/admin/users'),
            api.get('/admin/test-categories'),
            api.get('/admin/mcq-types?status=active'),
        ]).then(([q, m, u, c, t]) => {
            setQuizzes(q.data);
            setAllMCQs(m.data);
            setAllUsers(u.data.filter((u: any) => u.role === 'user' && u.isActive));
            setCategories(c.data);
            setMcqTypes(t.data);
        }).catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => { fetchAll(); }, []);

    const openCreate = () => {
        setEditQuiz(null);
        setForm({ ...emptyForm, selectedMCQs: [], enrolledUsers: [], distItems: [], distMode: 'none' });
        setMcqSearch('');
        setUserSearch('');
        setError('');
        setShowModal(true);
    };

    const openEdit = (q: Quiz) => {
        setEditQuiz(q);
        const catId = typeof q.testCategory === 'object' && q.testCategory ? q.testCategory._id : (q.testCategory || '');
        const dist = q.typeDistribution;
        setForm({
            title: q.title,
            description: q.description || '',
            testCategory: catId,
            numberOfQuestions: q.numberOfQuestions,
            duration: q.duration,
            passingMarks: q.passingMarks,
            marksPerQuestion: q.marksPerQuestion,
            attemptLimit: q.attemptLimit,
            selectedMCQs: q.mcqIds.map((m: any) => m._id || m),
            randomMCQCount: 0,
            enrolledUsers: q.enrolledUsers.map((u: any) => u._id || u),
            distMode: dist?.mode || 'none',
            distItems: dist?.items?.map(i => ({ typeId: i.typeId, value: i.value })) || [],
        });
        setMcqSearch('');
        setUserSearch('');
        setError('');
        setShowModal(true);
    };

    const toggleMCQ = (id: string) => {
        setForm(f => ({
            ...f,
            selectedMCQs: f.selectedMCQs.includes(id)
                ? f.selectedMCQs.filter(m => m !== id)
                : [...f.selectedMCQs, id],
        }));
    };

    const toggleUser = (id: string) => {
        setForm(f => ({
            ...f,
            enrolledUsers: f.enrolledUsers.includes(id)
                ? f.enrolledUsers.filter(u => u !== id)
                : [...f.enrolledUsers, id],
        }));
    };

    // MCQs filtered by selected category
    const categoryMCQs = form.testCategory
        ? allMCQs.filter(m => {
            const mcqCat = typeof m.category === 'object' && m.category ? m.category._id : m.category;
            return mcqCat === form.testCategory;
        })
        : allMCQs;
    // Total MCQs that will be in the quiz pool (manual + random)
    const totalMCQPool = form.selectedMCQs.length + Number(form.randomMCQCount || 0);
    // Available for random = category MCQs minus manually selected
    const availableForRandom = categoryMCQs.length - form.selectedMCQs.length;

    // MCQ types filtered by selected category
    const categoryTypes = form.testCategory ? mcqTypes.filter(t => {
        const catId = typeof t.categoryId === 'object' && t.categoryId ? t.categoryId._id : t.categoryId;
        return catId === form.testCategory;
    }) : [];

    // Count MCQs per type in the selected category
    const mcqCountByType = (typeId: string): number => {
        return categoryMCQs.filter(m => {
            const mType = typeof m.typeId === 'object' && m.typeId ? m.typeId._id : m.typeId;
            return mType === typeId;
        }).length;
    };

    // Distribution sum
    const distSum = form.distItems.reduce((s, i) => s + (i.value || 0), 0);
    const isDistActive = form.distMode === 'count' || form.distMode === 'percentage';

    // When distribution mode changes, initialize items
    const handleDistModeChange = (mode: 'none' | 'count' | 'percentage') => {
        if (mode === 'none') {
            setForm(f => ({ ...f, distMode: mode, distItems: [] }));
        } else {
            // Initialize items with all active types for this category, value 0
            const items = categoryTypes.map(t => ({ typeId: t._id, value: 0 }));
            setForm(f => ({ ...f, distMode: mode, distItems: items }));
        }
    };

    const updateDistItemValue = (typeId: string, value: number | '') => {
        setForm(f => ({
            ...f,
            distItems: f.distItems.map(i => i.typeId === typeId ? { ...i, value } : i),
        }));
    };

    const handleSave = async () => {
        setError('');
        if (!form.title.trim()) return setError('Quiz title is required');
        if (!form.testCategory) return setError('Please select a test category');
        if (form.numberOfQuestions === '') return setError('Number of questions is required');
        if (form.duration === '') return setError('Duration is required');
        if (form.marksPerQuestion === '') return setError('Marks per question is required');
        if (form.passingMarks === '') return setError('Passing marks is required');
        if (form.attemptLimit === '') return setError('Attempt limit is required');

        if (isDistActive) {
            // Distribution mode validation
            if (form.distItems.length === 0) return setError('Add at least one type to the distribution');
            if (form.distItems.some(i => i.value === '')) {
                return setError('Please enter a value for all MCQ types in the distribution');
            }
            if (form.distMode === 'count' && distSum !== form.numberOfQuestions) {
                return setError(`Distribution count total (${distSum}) must equal number of questions (${form.numberOfQuestions})`);
            }
            if (form.distMode === 'percentage' && Math.abs(distSum - 100) > 0.01) {
                return setError(`Percentage total must equal 100%. Current: ${distSum}%`);
            }
        } else {
            // Manual/random mode validation
            if (form.randomMCQCount === '') return setError('Please specify random MCQ count');
            if (totalMCQPool === 0) return setError('Select at least one MCQ or specify random MCQ count');
            if (Number(form.randomMCQCount) > availableForRandom) {
                return setError(`Random count (${form.randomMCQCount}) exceeds available MCQs (${availableForRandom})`);
            }
            if (Number(form.numberOfQuestions) > totalMCQPool) {
                return setError(`Number of questions (${form.numberOfQuestions}) cannot exceed total MCQ pool (${totalMCQPool})`);
            }
        }
        setSaving(true);
        try {
            const payload: any = {
                title: form.title,
                description: form.description,
                testCategory: form.testCategory,
                numberOfQuestions: Number(form.numberOfQuestions),
                duration: Number(form.duration),
                passingMarks: Number(form.passingMarks),
                marksPerQuestion: Number(form.marksPerQuestion),
                attemptLimit: Number(form.attemptLimit),
                enrolledUsers: form.enrolledUsers,
            };
            if (isDistActive) {
                payload.typeDistribution = {
                    mode: form.distMode,
                    items: form.distItems.map(i => ({ typeId: i.typeId, value: Number(i.value) })),
                };
            } else {
                payload.mcqIds = form.selectedMCQs;
                payload.randomMCQCount = Number(form.randomMCQCount);
                payload.typeDistribution = { mode: 'none', items: [] };
            }
            if (editQuiz) {
                await api.put(`/admin/quizzes/${editQuiz._id}`, payload);
            } else {
                await api.post('/admin/quizzes', payload);
            }
            setShowModal(false);
            fetchAll();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to save quiz');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this quiz? All results will remain.')) return;
        try {
            await api.delete(`/admin/quizzes/${id}`);
            fetchAll();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to delete');
        }
    };

    const handleToggle = async (id: string) => {
        try {
            await api.patch(`/admin/quizzes/${id}/toggle`);
            fetchAll();
        } catch {
            alert('Failed to toggle quiz status');
        }
    };

    const filteredMCQs = categoryMCQs.filter(m =>
        m.questionText.toLowerCase().includes(mcqSearch.toLowerCase())
    );

    const filteredUsers = allUsers.filter(u =>
        u.username.toLowerCase().includes(userSearch.toLowerCase())
    );

    return (
        <AdminLayout title="Quizzes">
            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">All Quizzes</h2>
                    <button className="btn btn-primary" onClick={openCreate} id="create-quiz-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Create Quiz
                    </button>
                </div>

                {loading ? (
                    <div className="loading-overlay"><div className="loading-spinner" />Loading quizzes...</div>
                ) : (
                    <div className="table-scroll-container">
                        {quizzes.length === 0 ? (
                            <div className="empty-state">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
                                </svg>
                                <div className="empty-state-title">No quizzes yet</div>
                                <div className="empty-state-desc">Create your first quiz to get started.</div>
                            </div>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th className="col-quiz-name">Title</th>
                                        <th className="col-classroom">Category</th>
                                        <th className="col-status">Questions</th>
                                        <th className="col-status">MCQ Pool</th>
                                        <th className="col-status">Duration</th>
                                        <th className="col-status">Attempts</th>
                                        <th className="col-status">Status</th>
                                        <th className="col-actions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {quizzes.map(q => (
                                        <tr key={q._id}>
                                            <td>
                                                <div style={{ fontWeight: 600 }}>{q.title}</div>
                                                {q.description && <div className="text-muted text-xs" style={{ marginTop: 2 }}>{q.description}</div>}
                                            </td>
                                            <td>
                                                <span className="badge badge-primary">
                                                    {typeof q.testCategory === 'object' && q.testCategory ? q.testCategory.name : '—'}
                                                </span>
                                            </td>
                                            <td>{q.numberOfQuestions}</td>
                                            <td>
                                                <span className="badge badge-neutral">{q.mcqIds?.length || 0} MCQs</span>
                                            </td>
                                            <td>{q.duration} min</td>
                                            <td>
                                                <span className="badge badge-info">
                                                    {q.attemptLimit === 0 ? 'Unlimited' : `${q.attemptLimit}x`}
                                                </span>
                                            </td>

                                            <td>
                                                <span className={`badge ${q.isActive ? 'badge-success' : 'badge-danger'}`}>
                                                    {q.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className="flex gap-2">
                                                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(q)}>Edit</button>
                                                    <button
                                                        className={`btn btn-sm ${q.isActive ? 'btn-danger' : 'btn-accent'}`}
                                                        onClick={() => handleToggle(q._id)}
                                                    >
                                                        {q.isActive ? 'Disable' : 'Enable'}
                                                    </button>
                                                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(q._id)}>Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal modal-xl" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editQuiz ? 'Edit Quiz' : 'Create New Quiz'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {error && <div className="alert alert-danger mb-4">{error}</div>}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                {/* Basic info */}
                                <div>
                                    <div className="section-label">Basic Information</div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div className="form-group">
                                            <label className="form-label">Quiz Title *</label>
                                            <input className="form-input" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Enter quiz title" />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Test Category *</label>
                                            <select
                                                className="form-select"
                                                value={form.testCategory}
                                                onChange={e => setForm({ ...form, testCategory: e.target.value, selectedMCQs: [], randomMCQCount: 0 })}
                                            >
                                                <option value="">Select a category</option>
                                                {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                            </select>
                                            <span className="form-hint">MCQs and random selection will be filtered by this category</span>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Description</label>
                                            <textarea className="form-textarea" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description..." rows={2} />
                                        </div>
                                    </div>
                                </div>

                                {/* Quiz settings */}
                                <div>
                                    <div className="section-label">Quiz Settings</div>
                                    <div className="form-grid-3">
                                        <div className="form-group">
                                            <label className="form-label">No. of Questions *</label>
                                            <input className="form-input" type="number" min={1} value={form.numberOfQuestions} onChange={e => setForm({ ...form, numberOfQuestions: e.target.value === '' ? '' : +e.target.value })} />
                                            <span className="form-hint">Pool: {totalMCQPool} MCQs</span>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Duration (minutes) *</label>
                                            <input className="form-input" type="number" min={1} value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value === '' ? '' : +e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Marks per Question</label>
                                            <input className="form-input" type="number" min={1} value={form.marksPerQuestion} onChange={e => setForm({ ...form, marksPerQuestion: e.target.value === '' ? '' : +e.target.value })} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Passing Marks</label>
                                            <input className="form-input" type="number" min={0} value={form.passingMarks} onChange={e => setForm({ ...form, passingMarks: e.target.value === '' ? '' : +e.target.value })} />
                                            <span className="form-hint">Out of {Number(form.numberOfQuestions || 0) * Number(form.marksPerQuestion || 0)} total marks</span>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Attempt Limit</label>
                                            <input className="form-input" type="number" min={0} value={form.attemptLimit} onChange={e => setForm({ ...form, attemptLimit: e.target.value === '' ? '' : +e.target.value })} />
                                            <span className="form-hint">0 = unlimited attempts</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Type Distribution — always visible when category is selected */}
                                {form.testCategory && (
                                    <div>
                                        <div className="section-label">MCQ Type Distribution (Weightage)</div>
                                        {categoryTypes.length === 0 ? (
                                            <div style={{
                                                background: 'var(--color-surface-2)',
                                                border: '1.5px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                padding: '16px',
                                                color: 'var(--color-text-secondary)',
                                                fontSize: '0.88rem',
                                            }}>
                                                <strong>No MCQ Types found for this category.</strong>
                                                <br />
                                                To use type-based distribution, first create MCQ types in the{' '}
                                                <a href="/admin/mcq-types" style={{ color: 'var(--color-accent)', textDecoration: 'underline' }}>
                                                    MCQ Types
                                                </a>{' '}
                                                page, then assign types to your MCQs.
                                            </div>
                                        ) : (
                                            <div style={{
                                                background: isDistActive ? 'rgba(99,102,241,0.04)' : 'var(--color-surface-2)',
                                                border: `1.5px solid ${isDistActive ? '#6366f1' : 'var(--color-border)'}`,
                                                borderRadius: 'var(--radius-md)',
                                                padding: '14px 16px',
                                                transition: 'all 0.2s ease',
                                            }}>
                                                <div style={{ display: 'flex', gap: 16, marginBottom: isDistActive ? 14 : 0, flexWrap: 'wrap' }}>
                                                    {(['none', 'count', 'percentage'] as const).map(mode => (
                                                        <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.88rem' }}>
                                                            <input
                                                                type="radio"
                                                                name="distMode"
                                                                checked={form.distMode === mode}
                                                                onChange={() => handleDistModeChange(mode)}
                                                                style={{ accentColor: '#6366f1' }}
                                                            />
                                                            {mode === 'none' ? 'No Distribution (Default)' : mode === 'count' ? 'By Count (Weightage)' : 'By Percentage (Weightage)'}
                                                        </label>
                                                    ))}
                                                </div>
                                                {isDistActive && (
                                                    <>
                                                        <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                    <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Type</th>
                                                                    <th style={{ textAlign: 'center', padding: '6px 8px', fontWeight: 600, width: 120 }}>
                                                                        {form.distMode === 'count' ? 'Count' : 'Percentage'}
                                                                    </th>
                                                                    <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, width: 100 }}>Available</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {form.distItems.map(item => {
                                                                    const typeObj = categoryTypes.find(t => t._id === item.typeId);
                                                                    const avail = mcqCountByType(item.typeId);
                                                                    return (
                                                                        <tr key={item.typeId} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                            <td style={{ padding: '8px' }}>{typeObj?.name || 'Unknown'}</td>
                                                                            <td style={{ padding: '8px', textAlign: 'center' }}>
                                                                                <input
                                                                                    type="number"
                                                                                    min={0}
                                                                                    value={item.value}
                                                                                    onChange={e => updateDistItemValue(item.typeId, e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))}
                                                                                    className="form-input"
                                                                                    style={{ width: 80, textAlign: 'center', margin: '0 auto', display: 'block' }}
                                                                                />
                                                                            </td>
                                                                            <td style={{ padding: '8px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                                                                                {avail} MCQs
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                            <tfoot>
                                                                <tr>
                                                                    <td style={{ padding: '8px', fontWeight: 700 }}>Total</td>
                                                                    <td style={{
                                                                        padding: '8px', textAlign: 'center', fontWeight: 700,
                                                                        color: (form.distMode === 'count' && distSum !== form.numberOfQuestions)
                                                                            || (form.distMode === 'percentage' && Math.abs(distSum - 100) > 0.01)
                                                                            ? 'var(--color-danger)' : 'var(--color-accent-dark)',
                                                                    }}>
                                                                        {distSum}{form.distMode === 'percentage' ? '%' : ''}
                                                                        {form.distMode === 'count' && ` / ${form.numberOfQuestions}`}
                                                                        {form.distMode === 'percentage' && ` / 100%`}
                                                                    </td>
                                                                    <td></td>
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                        <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                                            </svg>
                                                            {form.distMode === 'count'
                                                                ? 'Count total must equal the number of questions. MCQs are randomly selected per type.'
                                                                : 'Percentages must total 100%. Counts are auto-calculated with smart rounding.'}
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Random MCQ Selection (only when not using distribution) */}
                                {!isDistActive && (
                                    <div>
                                        <div className="section-label">Random MCQ Selection</div>
                                        <div style={{
                                            background: Number(form.randomMCQCount || 0) > 0 ? 'rgba(16,185,129,0.06)' : 'var(--color-surface-2)',
                                            border: `1.5px solid ${Number(form.randomMCQCount || 0) > 0 ? 'var(--color-accent)' : 'var(--color-border)'}`,
                                            borderRadius: 'var(--radius-md)',
                                            padding: '14px 16px',
                                            transition: 'all 0.2s ease',
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                                                    <label className="form-label" style={{ marginBottom: 6 }}>
                                                        Add N Random MCQs from Bank
                                                    </label>
                                                    <input
                                                        id="random-mcq-count"
                                                        className="form-input"
                                                        type="number"
                                                        min={0}
                                                        max={availableForRandom}
                                                        value={form.randomMCQCount}
                                                        onChange={e => setForm({ ...form, randomMCQCount: e.target.value === '' ? '' : Math.max(0, +e.target.value) })}
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <div style={{ paddingTop: 24, color: 'var(--color-text-secondary)', fontSize: '0.85rem', minWidth: 160 }}>
                                                    {Number(form.randomMCQCount || 0) > 0 ? (
                                                        <span style={{ color: Number(form.randomMCQCount || 0) > availableForRandom ? 'var(--color-danger)' : 'var(--color-accent)', fontWeight: 600 }}>
                                                            {Number(form.randomMCQCount || 0) > availableForRandom
                                                                ? `⚠ Only ${availableForRandom} available`
                                                                : `✓ ${form.randomMCQCount} will be auto-selected`}
                                                        </span>
                                                    ) : (
                                                        <span>{availableForRandom} MCQs available</span>
                                                    )}
                                                </div>
                                            </div>
                                            {Number(form.randomMCQCount || 0) > 0 && (
                                                <div style={{ marginTop: 10, fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                                    </svg>
                                                    Random MCQs are selected at quiz creation time and stored permanently — not regenerated per attempt.
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* MCQ Selection (only when not using distribution) */}
                                {!isDistActive && (
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                            <div className="section-label" style={{ marginBottom: 0 }}>
                                                Manual MCQ Selection
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                {form.selectedMCQs.length > 0 && (
                                                    <span className="badge badge-accent" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--color-accent-dark)' }}>
                                                        {form.selectedMCQs.length} manual
                                                    </span>
                                                )}
                                                <span className="badge badge-primary">
                                                    {totalMCQPool} total pool
                                                </span>
                                            </div>
                                        </div>
                                        <input
                                            className="form-input"
                                            placeholder="Search MCQs..."
                                            value={mcqSearch}
                                            onChange={e => setMcqSearch(e.target.value)}
                                            style={{ marginBottom: 8 }}
                                        />
                                        <div className="checkbox-list">
                                            {filteredMCQs.length === 0 ? (
                                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                                    No MCQs found. Add some in the MCQ Bank first.
                                                </div>
                                            ) : filteredMCQs.map(m => (
                                                <label key={m._id} className="checkbox-item">
                                                    <input
                                                        type="checkbox"
                                                        checked={form.selectedMCQs.includes(m._id)}
                                                        onChange={() => toggleMCQ(m._id)}
                                                    />
                                                    <div style={{ flex: 1 }}>
                                                        <div className="checkbox-item-label">{m.questionText}</div>
                                                        {(m.category || m.difficulty) && (
                                                            <div className="flex gap-2 mt-1">
                                                                {m.category && <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{typeof m.category === 'object' ? m.category.name : m.category}</span>}
                                                                {m.difficulty && <span className={`badge ${m.difficulty === 'Easy' ? 'badge-success' : m.difficulty === 'Medium' ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: '0.7rem' }}>{m.difficulty}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* User Enrollment */}
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                        <div className="section-label" style={{ marginBottom: 0 }}>
                                            Enroll Students
                                        </div>
                                        <div className="flex gap-2">
                                            <span className="badge badge-info">{form.enrolledUsers.length} enrolled</span>
                                            {form.enrolledUsers.length < allUsers.length && (
                                                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setForm(f => ({ ...f, enrolledUsers: allUsers.map(u => u._id) }))}>
                                                    Select All
                                                </button>
                                            )}
                                            {form.enrolledUsers.length > 0 && (
                                                <button className="btn btn-secondary btn-sm" type="button" onClick={() => setForm(f => ({ ...f, enrolledUsers: [] }))}>
                                                    Clear
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <input
                                        className="form-input"
                                        placeholder="Search students..."
                                        value={userSearch}
                                        onChange={e => setUserSearch(e.target.value)}
                                        style={{ marginBottom: 8 }}
                                    />
                                    <div className="checkbox-list">
                                        {allUsers.length === 0 ? (
                                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                                No active students found. Create users first.
                                            </div>
                                        ) : filteredUsers.map(u => (
                                            <label key={u._id} className="checkbox-item">
                                                <input
                                                    type="checkbox"
                                                    checked={form.enrolledUsers.includes(u._id)}
                                                    onChange={() => toggleUser(u._id)}
                                                />
                                                <div className="checkbox-item-label">{u.username}</div>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving...' : editQuiz ? 'Save Changes' : 'Create Quiz'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default QuizConfiguration;
