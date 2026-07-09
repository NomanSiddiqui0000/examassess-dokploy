import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';

interface MCQType {
    _id: string;
    name: string;
    categoryId?: { _id: string; name: string } | string;
    status: 'active' | 'inactive';
}

interface TestCategory {
    _id: string;
    name: string;
}

const MCQTypeManagement: React.FC = () => {
    const [mcqTypes, setMcqTypes] = useState<MCQType[]>([]);
    const [categories, setCategories] = useState<TestCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<MCQType | null>(null);
    const [form, setForm] = useState({ name: '', categoryId: '' });
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [filterCategory, setFilterCategory] = useState('');

    const fetchAll = async () => {
        setLoading(true);
        try {
            const [typesRes, catsRes] = await Promise.all([
                api.get('/admin/mcq-types'),
                api.get('/admin/test-categories'),
            ]);
            setMcqTypes(typesRes.data);
            setCategories(catsRes.data);
        } catch {
            console.error('Failed to fetch data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAll();
    }, []);

    const openCreate = () => {
        setEditing(null);
        setForm({ name: '', categoryId: '' });
        setError('');
        setShowModal(true);
    };

    const openEdit = (t: MCQType) => {
        setEditing(t);
        const catId = typeof t.categoryId === 'object' && t.categoryId ? t.categoryId._id : (t.categoryId || '');
        setForm({ name: t.name, categoryId: catId });
        setError('');
        setShowModal(true);
    };

    const handleSave = async () => {
        setError('');
        if (!form.name.trim()) return setError('Name is required');
        if (!form.categoryId) return setError('Category is required');
        setSaving(true);
        try {
            if (editing) {
                await api.put(`/admin/mcq-types/${editing._id}`, { name: form.name });
            } else {
                await api.post('/admin/mcq-types', form);
            }
            setShowModal(false);
            fetchAll();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this MCQ type? If MCQs are linked, it will be deactivated instead.')) return;
        try {
            const res = await api.delete(`/admin/mcq-types/${id}`);
            if (res.data.softDeleted) {
                alert(res.data.message);
            }
            fetchAll();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to delete');
        }
    };

    const handleToggleStatus = async (t: MCQType) => {
        try {
            const newStatus = t.status === 'active' ? 'inactive' : 'active';
            await api.put(`/admin/mcq-types/${t._id}`, { status: newStatus });
            fetchAll();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to update status');
        }
    };

    const filteredTypes = filterCategory
        ? mcqTypes.filter((t) => {
            const catId = typeof t.categoryId === 'object' && t.categoryId ? t.categoryId._id : t.categoryId;
            return catId === filterCategory;
        })
        : mcqTypes;

    const getCatName = (t: MCQType) => {
        if (typeof t.categoryId === 'object' && t.categoryId) return t.categoryId.name;
        const cat = categories.find((c) => c._id === t.categoryId);
        return cat ? cat.name : '—';
    };

    return (
        <AdminLayout title="MCQ Types">
            <div className="admin-toolbar" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 18 }}>
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="admin-select">
                    <option value="">All Categories</option>
                    {categories.map((c) => (
                        <option key={c._id} value={c._id}>{c.name}</option>
                    ))}
                </select>
                <button className="btn btn-primary" onClick={openCreate}>
                    + New MCQ Type
                </button>
            </div>

            {loading ? (
                <p>Loading…</p>
            ) : filteredTypes.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', padding: 24 }}>No MCQ types found. Create one to get started.</p>
            ) : (
                <div className="table-scroll-container">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th className="col-classroom">Name</th>
                                <th className="col-classroom">Category</th>
                                <th className="col-status">Status</th>
                                <th className="col-actions">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredTypes.map((t) => (
                                <tr key={t._id}>
                                    <td>{t.name}</td>
                                    <td>{getCatName(t)}</td>
                                    <td>
                                        <span
                                            className={`status-badge ${t.status}`}
                                            style={{
                                                padding: '3px 10px',
                                                borderRadius: 12,
                                                fontSize: '0.82rem',
                                                fontWeight: 600,
                                                background: t.status === 'active' ? '#dcfce7' : '#fee2e2',
                                                color: t.status === 'active' ? '#166534' : '#991b1b',
                                            }}
                                        >
                                            {t.status}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button className="btn btn-sm btn-secondary" onClick={() => openEdit(t)}>
                                                Edit
                                            </button>
                                            <button className="btn btn-sm btn-secondary" onClick={() => handleToggleStatus(t)}>
                                                {t.status === 'active' ? 'Deactivate' : 'Activate'}
                                            </button>
                                            <button className="btn btn-sm btn-danger" onClick={() => handleDelete(t._id)}>
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

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editing ? 'Edit MCQ Type' : 'Create New MCQ Type'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {error && <div className="alert alert-danger mb-4">{error}</div>}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                                <div className="form-group">
                                    <label className="form-label">Type Name *</label>
                                    <input
                                        className="form-input"
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        placeholder="e.g. Vocabulary, Algebra, Analytical"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Category *</label>
                                    <select
                                        className="form-select"
                                        value={form.categoryId}
                                        onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                                        disabled={!!editing}
                                    >
                                        <option value="">Select Category</option>
                                        {categories.map((c) => (
                                            <option key={c._id} value={c._id}>{c.name}</option>
                                        ))}
                                    </select>
                                    {editing && (
                                        <small style={{ marginTop: 6, display: 'block', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                                            Category cannot be changed after creation.
                                        </small>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)} disabled={saving}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default MCQTypeManagement;
