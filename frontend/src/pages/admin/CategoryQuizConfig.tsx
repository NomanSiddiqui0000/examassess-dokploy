import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';

interface TestCategory {
    _id: string;
    name: string;
}

interface CategoryConfig {
    _id: string;
    testCategory: TestCategory;
    numberOfQuestions: number;
    duration: number;
    marksPerQuestion: number;
    passingMarks: number;
    creditCost: number;
    isActive: boolean;
    mcqCount: number;
    createdBy?: { username: string };
    createdAt: string;
}

const CategoryQuizConfig: React.FC = () => {
    const [configs, setConfigs] = useState<CategoryConfig[]>([]);
    const [categories, setCategories] = useState<TestCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formCategory, setFormCategory] = useState('');
    const [formQuestions, setFormQuestions] = useState<number | ''>(10);
    const [formDuration, setFormDuration] = useState<number | ''>(30);
    const [formMarksPerQ, setFormMarksPerQ] = useState<number | ''>(1);
    const [formPassingMarks, setFormPassingMarks] = useState<number | ''>(5);
    const [formCreditCost, setFormCreditCost] = useState<number | ''>(1);
    const [submitting, setSubmitting] = useState(false);
    const [mcqCount, setMcqCount] = useState<number | null>(null);

    const fetchData = async () => {
        try {
            const [configsRes, catsRes] = await Promise.all([
                api.get('/admin/category-quiz-configs'),
                api.get('/admin/test-categories'),
            ]);
            setConfigs(configsRes.data);
            setCategories(catsRes.data);
        } catch {
            setError('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Fetch MCQ count when category changes
    useEffect(() => {
        if (!formCategory) { setMcqCount(null); return; }
        api.get(`/admin/category-quiz-configs/mcq-count/${formCategory}`)
            .then(res => setMcqCount(res.data.count))
            .catch(() => setMcqCount(null));
    }, [formCategory]);

    const resetForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormCategory('');
        setFormQuestions(10);
        setFormDuration(30);
        setFormMarksPerQ(1);
        setFormPassingMarks(5);
        setFormCreditCost(1);
        setMcqCount(null);
        setError('');
    };

    const handleEdit = (cfg: CategoryConfig) => {
        setEditingId(cfg._id);
        setFormCategory(cfg.testCategory._id);
        setFormQuestions(cfg.numberOfQuestions);
        setFormDuration(cfg.duration);
        setFormMarksPerQ(cfg.marksPerQuestion);
        setFormPassingMarks(cfg.passingMarks);
        setFormCreditCost(cfg.creditCost);
        setShowForm(true);
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formQuestions === '') return setError('Number of questions is required');
        if (formDuration === '') return setError('Duration is required');
        if (formMarksPerQ === '') return setError('Marks per question is required');
        if (formPassingMarks === '') return setError('Passing marks is required');
        if (formCreditCost === '') return setError('Credit cost is required');

        setSubmitting(true);
        setError('');
        setSuccess('');

        const payload = {
            testCategory: formCategory,
            numberOfQuestions: Number(formQuestions),
            duration: Number(formDuration),
            marksPerQuestion: Number(formMarksPerQ),
            passingMarks: Number(formPassingMarks),
            creditCost: Number(formCreditCost),
        };

        try {
            if (editingId) {
                await api.put(`/admin/category-quiz-configs/${editingId}`, payload);
                setSuccess('Category quiz config updated successfully');
            } else {
                await api.post('/admin/category-quiz-configs', payload);
                setSuccess('Category quiz config created successfully');
            }
            resetForm();
            fetchData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Operation failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this category quiz configuration?')) return;
        setError('');
        setSuccess('');

        try {
            await api.delete(`/admin/category-quiz-configs/${id}`);
            setSuccess('Config deleted');
            fetchData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to delete');
        }
    };

    const handleToggle = async (cfg: CategoryConfig) => {
        setError('');
        setSuccess('');
        try {
            await api.put(`/admin/category-quiz-configs/${cfg._id}`, { isActive: !cfg.isActive });
            setSuccess(`Config ${cfg.isActive ? 'disabled' : 'enabled'} successfully`);
            fetchData();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update');
        }
    };

    // Categories that already have a config (can't create duplicates)
    const usedCategoryIds = new Set(configs.map(c => c.testCategory?._id));
    const availableCategories = editingId
        ? categories
        : categories.filter(c => !usedCategoryIds.has(c._id));

    return (
        <AdminLayout title="Category Quizzes">
            <div className="page-container">
                {error && <div className="alert alert-danger">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <p className="text-secondary">
                        Configure automatic quizzes per test category. Students registered under a category will see these quizzes on their dashboard.
                    </p>
                    {!showForm && (
                        <button
                            className="btn btn-primary"
                            onClick={() => { setShowForm(true); setEditingId(null); resetForm(); setShowForm(true); }}
                            disabled={availableCategories.length === 0 && !editingId}
                        >
                            + New Config
                        </button>
                    )}
                </div>

                {showForm && (
                    <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}>
                            {editingId ? 'Edit Category Quiz Config' : 'New Category Quiz Config'}
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label htmlFor="cfgCategory">Test Category</label>
                                    <select
                                        id="cfgCategory"
                                        className="form-control"
                                        value={formCategory}
                                        onChange={(e) => setFormCategory(e.target.value)}
                                        required
                                        disabled={!!editingId}
                                    >
                                        <option value="">Select Category</option>
                                        {availableCategories.map(c => (
                                            <option key={c._id} value={c._id}>{c.name}</option>
                                        ))}
                                    </select>
                                    {mcqCount !== null && (
                                        <small style={{
                                            color: mcqCount < Number(formQuestions || 0) ? '#dc2626' : '#16a34a',
                                            display: 'block', marginTop: '0.25rem',
                                        }}>
                                            {mcqCount} MCQs available in this category
                                            {mcqCount < Number(formQuestions || 0) && ' ⚠️ Not enough!'}
                                        </small>
                                    )}
                                </div>

                                <div className="form-group">
                                    <label htmlFor="cfgQuestions">Number of Questions</label>
                                    <input
                                        type="number"
                                        id="cfgQuestions"
                                        className="form-control"
                                        value={formQuestions}
                                        onChange={(e) => setFormQuestions(e.target.value === '' ? '' : Number(e.target.value))}
                                        min={1}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="cfgDuration">Duration (minutes)</label>
                                    <input
                                        type="number"
                                        id="cfgDuration"
                                        className="form-control"
                                        value={formDuration}
                                        onChange={(e) => setFormDuration(e.target.value === '' ? '' : Number(e.target.value))}
                                        min={1}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="cfgMarks">Marks per Question</label>
                                    <input
                                        type="number"
                                        id="cfgMarks"
                                        className="form-control"
                                        value={formMarksPerQ}
                                        onChange={(e) => setFormMarksPerQ(e.target.value === '' ? '' : Number(e.target.value))}
                                        min={1}
                                        required
                                    />
                                </div>

                                <div className="form-group">
                                    <label htmlFor="cfgPassing">Passing Marks</label>
                                    <input
                                        type="number"
                                        id="cfgPassing"
                                        className="form-control"
                                        value={formPassingMarks}
                                        onChange={(e) => setFormPassingMarks(e.target.value === '' ? '' : Number(e.target.value))}
                                        min={0}
                                        required
                                    />
                                    <small style={{ color: 'var(--color-text-secondary)' }}>
                                        Total: {Number(formQuestions || 0) * Number(formMarksPerQ || 0)} marks
                                    </small>
                                </div>

                                <div className="form-group">
                                    <label htmlFor="cfgCredit">Credit Cost per Attempt</label>
                                    <input
                                        type="number"
                                        id="cfgCredit"
                                        className="form-control"
                                        value={formCreditCost}
                                        onChange={(e) => setFormCreditCost(e.target.value === '' ? '' : Number(e.target.value))}
                                        min={0}
                                        required
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
                                </button>
                                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {loading ? (
                    <p>Loading configurations...</p>
                ) : configs.length === 0 ? (
                    <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                            No category quiz configurations yet.
                        </p>
                        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                            Create one to automatically assign quizzes to students based on their registered category.
                        </p>
                    </div>
                ) : (
                    <div className="table-scroll-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th className="col-classroom">Category</th>
                                    <th className="col-status">Questions</th>
                                    <th className="col-status">Duration</th>
                                    <th className="col-status">Marks/Q</th>
                                    <th className="col-status">Passing</th>
                                    <th className="col-status">Credit Cost</th>
                                    <th className="col-status">MCQ Pool</th>
                                    <th className="col-status">Status</th>
                                    <th className="col-actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {configs.map((cfg) => (
                                    <tr key={cfg._id}>
                                        <td><strong>{cfg.testCategory?.name || 'N/A'}</strong></td>
                                        <td>{cfg.numberOfQuestions}</td>
                                        <td>{cfg.duration} min</td>
                                        <td>{cfg.marksPerQuestion}</td>
                                        <td>{cfg.passingMarks} / {cfg.numberOfQuestions * cfg.marksPerQuestion}</td>
                                        <td>{cfg.creditCost}</td>
                                        <td>
                                            <span style={{
                                                color: cfg.mcqCount >= cfg.numberOfQuestions ? '#16a34a' : '#dc2626',
                                                fontWeight: 600,
                                            }}>
                                                {cfg.mcqCount}
                                                {cfg.mcqCount < cfg.numberOfQuestions && ' ⚠️'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={`status-badge ${cfg.isActive ? 'status-active' : 'status-inactive'}`}>
                                                {cfg.isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    onClick={() => handleEdit(cfg)}
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    className={`btn btn-sm ${cfg.isActive ? 'btn-warning' : 'btn-primary'}`}
                                                    onClick={() => handleToggle(cfg)}
                                                    style={!cfg.isActive ? {} : { background: '#f59e0b', borderColor: '#f59e0b' }}
                                                >
                                                    {cfg.isActive ? 'Disable' : 'Enable'}
                                                </button>
                                                <button
                                                    className="btn btn-sm btn-danger"
                                                    onClick={() => handleDelete(cfg._id)}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </AdminLayout>
    );
};

export default CategoryQuizConfig;
