import React, { useEffect, useState, useRef } from 'react';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';
import { QUESTION_DIFFICULTIES } from '../../constants/questionDifficulty';

interface MCQ {
    _id: string;
    questionText: string;
    options: string[];
    correctAnswer: number;
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

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

const emptyForm = {
    questionText: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    category: '',
    typeId: '',
    difficulty: '',
};

const MCQBank: React.FC = () => {
    const [mcqs, setMcqs] = useState<MCQ[]>([]);
    const [categories, setCategories] = useState<TestCategory[]>([]);
    const [mcqTypes, setMcqTypes] = useState<MCQTypeItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterDifficulty, setFilterDifficulty] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [filterType, setFilterType] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editMCQ, setEditMCQ] = useState<MCQ | null>(null);
    const [form, setForm] = useState({ ...emptyForm });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [uploadMsg, setUploadMsg] = useState('');
    const fileRef = useRef<HTMLInputElement>(null);

    const fetchMCQs = (s = search, d = filterDifficulty, c = filterCategory, t = filterType) => {
        setLoading(true);
        const params: any = {};
        if (s) params.search = s;
        if (d) params.difficulty = d;
        if (c) params.category = c;
        if (t) params.type = t;
        api.get('/admin/mcqs', { params })
            .then(res => setMcqs(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchMCQs();
        api.get('/admin/test-categories').then(res => setCategories(res.data)).catch(console.error);
        api.get('/admin/mcq-types?status=active').then(res => setMcqTypes(res.data)).catch(console.error);
    }, []);

    const handleSearch = (val: string) => { setSearch(val); fetchMCQs(val, filterDifficulty, filterCategory, filterType); };
    const handleDifficulty = (val: string) => { setFilterDifficulty(val); fetchMCQs(search, val, filterCategory, filterType); };
    const handleCategory = (val: string) => { setFilterCategory(val); setFilterType(''); fetchMCQs(search, filterDifficulty, val, ''); };
    const handleType = (val: string) => { setFilterType(val); fetchMCQs(search, filterDifficulty, filterCategory, val); };

    // MCQ types filtered by the category currently selected in the form
    const formTypes = form.category ? mcqTypes.filter(t => {
        const catId = typeof t.categoryId === 'object' && t.categoryId ? t.categoryId._id : t.categoryId;
        return catId === form.category;
    }) : mcqTypes;

    // MCQ types filtered by the filter category
    const filterTypes = filterCategory ? mcqTypes.filter(t => {
        const catId = typeof t.categoryId === 'object' && t.categoryId ? t.categoryId._id : t.categoryId;
        return catId === filterCategory;
    }) : mcqTypes;

    const openCreate = () => {
        setEditMCQ(null);
        setForm({ ...emptyForm, options: ['', '', '', ''], typeId: '' });
        setError('');
        setShowModal(true);
    };

    const openEdit = (m: MCQ) => {
        setEditMCQ(m);
        const catId = typeof m.category === 'object' && m.category ? m.category._id : (m.category || '');
        const tId = typeof m.typeId === 'object' && m.typeId ? m.typeId._id : (m.typeId || '');
        setForm({
            questionText: m.questionText,
            options: [...m.options],
            correctAnswer: m.correctAnswer,
            category: catId,
            typeId: tId,
            difficulty: m.difficulty || '',
        });
        setError('');
        setShowModal(true);
    };

    const handleSave = async () => {
        setError('');
        if (!form.questionText.trim()) return setError('Question text is required');
        if (form.options.some(o => !o.trim())) return setError('All 4 options are required');
        if (!form.category) return setError('Category is required. Every MCQ must belong to a test category.');
        setSaving(true);
        try {
            if (editMCQ) {
                await api.put(`/admin/mcqs/${editMCQ._id}`, form);
            } else {
                await api.post('/admin/mcqs', form);
            }
            setShowModal(false);
            fetchMCQs();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to save MCQ');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this MCQ?')) return;
        try {
            await api.delete(`/admin/mcqs/${id}`);
            fetchMCQs();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to delete');
        }
    };

    const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!filterCategory) {
            setUploadMsg('❌ Please select a category filter first. Bulk-uploaded MCQs will be assigned to the selected category.');
            if (fileRef.current) fileRef.current.value = '';
            return;
        }
        setUploadMsg('Uploading...');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('categoryId', filterCategory);
        if (filterType) {
            formData.append('typeId', filterType);
        }
        try {
            const res = await api.post('/admin/mcqs/bulk-upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUploadMsg(`✅ ${res.data.message}`);
            fetchMCQs();
        } catch (err: any) {
            const errData = err.response?.data;
            if (errData?.errors && Array.isArray(errData.errors)) {
                setUploadMsg(`❌ ${errData.message}\n${errData.errors.join('\n')}`);
            } else {
                setUploadMsg(`❌ ${errData?.message || 'Upload failed'}`);
            }
        }
        if (fileRef.current) fileRef.current.value = '';
    };

    const handleDownloadTemplate = async () => {
        const res = await api.get('/admin/mcqs/template', { responseType: 'blob' });
        const url = URL.createObjectURL(res.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'mcq-template.xlsx';
        a.click();
    };

    const diffBadge = (d?: string) => {
        if (!d) return null;
        const cls = d === 'Easy' ? 'badge-success' : d === 'Medium' ? 'badge-warning' : 'badge-danger';
        return <span className={`badge ${cls}`}>{d}</span>;
    };

    return (
        <AdminLayout title="MCQ Bank">
            <div className="card">
                <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
                    <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
                        <div className="search-bar">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                className="search-input"
                                placeholder="Search questions..."
                                value={search}
                                onChange={e => handleSearch(e.target.value)}
                            />
                        </div>
                        <select
                            className="form-select"
                            style={{ width: 'auto' }}
                            value={filterCategory}
                            onChange={e => handleCategory(e.target.value)}
                        >
                            <option value="">All Categories</option>
                            {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                        </select>
                        <select
                            className="form-select"
                            style={{ width: 'auto' }}
                            value={filterDifficulty}
                            onChange={e => handleDifficulty(e.target.value)}
                        >
                            <option value="">All Difficulties</option>
                            {QUESTION_DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                        <select
                            className="form-select"
                            style={{ width: 'auto' }}
                            value={filterType}
                            onChange={e => handleType(e.target.value)}
                        >
                            <option value="">All Types</option>
                            {filterTypes.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={handleDownloadTemplate}>
                            ⬇ Template
                        </button>
                        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                            ⬆ Bulk Upload
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".xlsx,.csv"
                                style={{ display: 'none' }}
                                onChange={handleBulkUpload}
                            />
                        </label>
                        <button className="btn btn-primary btn-sm" onClick={openCreate} id="add-mcq-btn">
                            + Add MCQ
                        </button>
                    </div>
                </div>

                {uploadMsg && (
                    <div style={{ padding: '10px 24px' }}>
                        <div className={`alert ${uploadMsg.startsWith('✅') ? 'alert-success' : 'alert-danger'}`}>
                            {uploadMsg}
                        </div>
                    </div>
                )}

                <div style={{ padding: '8px 24px', borderBottom: '1px solid var(--color-border)', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                    {mcqs.length} question{mcqs.length !== 1 ? 's' : ''} in bank
                </div>

                {loading ? (
                    <div className="loading-overlay"><div className="loading-spinner" />Loading MCQs...</div>
                ) : (
                    <div className="table-scroll-container">
                        {mcqs.length === 0 ? (
                            <div className="empty-state">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                                </svg>
                                <div className="empty-state-title">No MCQs found</div>
                                <div className="empty-state-desc">Add questions manually or upload via Excel/CSV.</div>
                            </div>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th className="cell-wrap">Question</th>
                                        <th className="col-classroom">Category</th>
                                        <th className="col-classroom">Type</th>
                                        <th className="col-status">Difficulty</th>
                                        <th className="col-status">Answer</th>
                                        <th className="col-actions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mcqs.map((m, i) => (
                                        <tr key={m._id}>
                                            <td className="text-muted text-sm">{i + 1}</td>
                                            <td className="cell-wrap">
                                                <div style={{ fontWeight: 500, marginBottom: 4 }}>{m.questionText}</div>
                                                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                                                    {m.options.map((opt, idx) => (
                                                        <span key={idx} style={{
                                                            fontSize: '0.75rem',
                                                            padding: '2px 8px',
                                                            borderRadius: 'var(--radius-sm)',
                                                            background: idx === m.correctAnswer ? 'var(--color-success-bg)' : 'var(--color-surface-2)',
                                                            color: idx === m.correctAnswer ? '#059669' : 'var(--color-text-secondary)',
                                                            fontWeight: idx === m.correctAnswer ? 600 : 400,
                                                            border: `1px solid ${idx === m.correctAnswer ? '#6ee7b7' : 'var(--color-border)'}`,
                                                        }}>
                                                            {OPTION_LETTERS[idx]}. {opt}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="text-sm">{typeof m.category === 'object' && m.category ? m.category.name : (m.category || <span className="text-muted">—</span>)}</td>
                                            <td className="text-sm">{typeof m.typeId === 'object' && m.typeId ? m.typeId.name : <span className="text-muted">—</span>}</td>
                                            <td>{diffBadge(m.difficulty)}</td>
                                            <td>
                                                <span className="badge badge-success">{OPTION_LETTERS[m.correctAnswer]}</span>
                                            </td>
                                            <td>
                                                <div className="flex gap-2">
                                                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(m)}>Edit</button>
                                                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(m._id)}>Delete</button>
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
                    <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editMCQ ? 'Edit MCQ' : 'Add New MCQ'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {error && <div className="alert alert-danger mb-4">{error}</div>}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Question Text *</label>
                                    <textarea
                                        className="form-textarea"
                                        value={form.questionText}
                                        onChange={e => setForm({ ...form, questionText: e.target.value })}
                                        placeholder="Enter the question..."
                                        rows={3}
                                    />
                                </div>

                                <div>
                                    <label className="form-label" style={{ marginBottom: 10, display: 'block' }}>Options * (select the correct answer)</label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {form.options.map((opt, idx) => (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <input
                                                    type="radio"
                                                    name="correctAnswer"
                                                    checked={form.correctAnswer === idx}
                                                    onChange={() => setForm({ ...form, correctAnswer: idx })}
                                                    style={{ width: 18, height: 18, accentColor: 'var(--color-accent)', flexShrink: 0 }}
                                                />
                                                <span style={{
                                                    width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                                                    background: form.correctAnswer === idx ? 'var(--color-accent)' : 'var(--color-surface-2)',
                                                    color: form.correctAnswer === idx ? 'white' : 'var(--color-text-secondary)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontWeight: 700, fontSize: '0.8rem', flexShrink: 0,
                                                    border: '1.5px solid var(--color-border)',
                                                }}>
                                                    {OPTION_LETTERS[idx]}
                                                </span>
                                                <input
                                                    className="form-input"
                                                    value={opt}
                                                    onChange={e => {
                                                        const opts = [...form.options];
                                                        opts[idx] = e.target.value;
                                                        setForm({ ...form, options: opts });
                                                    }}
                                                    placeholder={`Option ${OPTION_LETTERS[idx]}`}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="form-grid">
                                    <div className="form-group">
                                        <label className="form-label">Category *</label>
                                        <select
                                            className="form-select"
                                            value={form.category}
                                            onChange={e => setForm({ ...form, category: e.target.value, typeId: '' })}
                                        >
                                            <option value="">Select category</option>
                                            {categories.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Type</label>
                                        <select
                                            className="form-select"
                                            value={form.typeId}
                                            onChange={e => setForm({ ...form, typeId: e.target.value })}
                                        >
                                            <option value="">No type (General)</option>
                                            {formTypes.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Difficulty</label>
                                        <select
                                            className="form-select"
                                            value={form.difficulty}
                                            onChange={e => setForm({ ...form, difficulty: e.target.value })}
                                        >
                                            <option value="">Select difficulty</option>
                                            {QUESTION_DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving...' : editMCQ ? 'Save Changes' : 'Add MCQ'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default MCQBank;
