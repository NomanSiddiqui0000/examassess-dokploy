import React, { useState, useEffect } from 'react';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';

interface TestCategory {
    _id: string;
    name: string;
    defaultCredits: number;
    isActive: boolean;
    createdAt: string;
}

const TestCategoryManagement: React.FC = () => {
    const [categories, setCategories] = useState<TestCategory[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Form state
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formName, setFormName] = useState('');
    const [formCredits, setFormCredits] = useState<number | ''>(0);
    const [submitting, setSubmitting] = useState(false);

    // Hard-delete confirmation state
    const [hardDeleteCat, setHardDeleteCat] = useState<TestCategory | null>(null);
    const [hardDeleteConfirm, setHardDeleteConfirm] = useState('');

    const fetchCategories = async () => {
        try {
            const res = await api.get('/admin/test-categories');
            setCategories(res.data);
        } catch {
            setError('Failed to load test categories');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCategories();
    }, []);

    const resetForm = () => {
        setShowForm(false);
        setEditingId(null);
        setFormName('');
        setFormCredits(0);
        setError('');
    };

    const handleEdit = (cat: TestCategory) => {
        setEditingId(cat._id);
        setFormName(cat.name);
        setFormCredits(cat.defaultCredits);
        setShowForm(true);
        setError('');
        setSuccess('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (formCredits === '') {
            setError('Please enter a value for Default Credits.');
            return;
        }
        setSubmitting(true);
        setError('');
        setSuccess('');

        try {
            if (editingId) {
                await api.put(`/admin/test-categories/${editingId}`, {
                    name: formName,
                    defaultCredits: formCredits,
                });
                setSuccess('Test category updated successfully');
            } else {
                await api.post('/admin/test-categories', {
                    name: formName,
                    defaultCredits: formCredits,
                });
                setSuccess('Test category created successfully');
            }
            resetForm();
            fetchCategories();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Operation failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Are you sure you want to deactivate this category?')) return;
        setError('');
        setSuccess('');

        try {
            await api.delete(`/admin/test-categories/${id}`);
            setSuccess('Category deactivated');
            fetchCategories();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to delete');
        }
    };

    const handleHardDelete = async () => {
        if (!hardDeleteCat || hardDeleteConfirm !== hardDeleteCat.name) return;
        setError('');
        setSuccess('');

        try {
            const res = await api.post(`/admin/test-categories/${hardDeleteCat._id}/hard-delete`, { confirm: true });
            setSuccess(res.data.message);
            setHardDeleteCat(null);
            setHardDeleteConfirm('');
            fetchCategories();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to delete');
        }
    };

    return (
        <AdminLayout title="Test Categories">
            <div className="page-container">
                {error && <div className="alert alert-danger">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <p className="text-secondary">
                        Manage test categories and their default credit allocations
                    </p>
                    {!showForm && (
                        <button
                            className="btn btn-primary"
                            onClick={() => { setShowForm(true); setEditingId(null); setFormName(''); setFormCredits(0); }}
                        >
                            + Add Category
                        </button>
                    )}
                </div>

                {showForm && (
                    <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                        <h3 style={{ marginBottom: '1rem' }}>
                            {editingId ? 'Edit Category' : 'New Category'}
                        </h3>
                        <form onSubmit={handleSubmit}>
                            <div className="form-group">
                                <label htmlFor="catName">Category Name</label>
                                <input
                                    type="text"
                                    id="catName"
                                    className="form-control"
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    placeholder="e.g. Admission Test, Midterm, Certification"
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label htmlFor="catCredits">Default Credits</label>
                                <input
                                    type="number"
                                    id="catCredits"
                                    className="form-control"
                                    value={formCredits}
                                    onChange={(e) => setFormCredits(e.target.value === '' ? '' : Number(e.target.value))}
                                    min={0}
                                    required
                                />
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
                    <p>Loading categories...</p>
                ) : (
                    <div className="table-scroll-container">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th className="col-classroom">Name</th>
                                    <th className="col-status">Default Credits</th>
                                    <th className="col-status">Status</th>
                                    <th className="col-date">Created</th>
                                    <th className="col-actions">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categories.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                                            No test categories found. Create one to get started.
                                        </td>
                                    </tr>
                                ) : (
                                    categories.map((cat) => (
                                        <tr key={cat._id}>
                                            <td><strong>{cat.name}</strong></td>
                                            <td>{cat.defaultCredits}</td>
                                            <td>
                                                <span className={`status-badge ${cat.isActive ? 'status-active' : 'status-inactive'}`}>
                                                    {cat.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>{new Date(cat.createdAt).toLocaleDateString()}</td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button
                                                        className="btn btn-sm btn-secondary"
                                                        onClick={() => handleEdit(cat)}
                                                    >
                                                        Edit
                                                    </button>
                                                    {cat.isActive && (
                                                        <button
                                                            className="btn btn-sm btn-danger"
                                                            onClick={() => handleDelete(cat._id)}
                                                        >
                                                            Deactivate
                                                        </button>
                                                    )}
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ background: '#7f1d1d', color: '#fca5a5', borderColor: '#7f1d1d' }}
                                                        onClick={() => { setHardDeleteCat(cat); setHardDeleteConfirm(''); }}
                                                    >
                                                        Delete Forever
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {hardDeleteCat && (
                <div className="modal-overlay" onClick={() => setHardDeleteCat(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: '#dc2626' }}>⚠️ Permanently Delete Category</h3>
                            <button className="modal-close" onClick={() => setHardDeleteCat(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <div style={{
                                background: '#fef2f2',
                                border: '1px solid #fca5a5',
                                borderRadius: 'var(--radius-md)',
                                padding: '1rem',
                                marginBottom: '1rem',
                                color: '#991b1b',
                                fontSize: '0.85rem',
                                lineHeight: 1.6,
                            }}>
                                <strong>Deleting this category will permanently delete:</strong>
                                <ul style={{ margin: '0.5rem 0 0 1.2rem', padding: 0 }}>
                                    <li>All MCQs belonging to this category</li>
                                    <li>All quizzes related to this category</li>
                                    <li>All quiz configurations for this category</li>
                                    <li>All related results</li>
                                </ul>
                                <br />
                                <strong>This action cannot be undone.</strong>
                            </div>
                            <div className="form-group">
                                <label className="form-label">
                                    Type <strong>{hardDeleteCat.name}</strong> to confirm:
                                </label>
                                <input
                                    type="text"
                                    className="form-control"
                                    value={hardDeleteConfirm}
                                    onChange={e => setHardDeleteConfirm(e.target.value)}
                                    placeholder={hardDeleteCat.name}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setHardDeleteCat(null)}>Cancel</button>
                            <button
                                className="btn btn-danger"
                                disabled={hardDeleteConfirm !== hardDeleteCat.name}
                                onClick={handleHardDelete}
                            >
                                Delete Forever
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default TestCategoryManagement;
