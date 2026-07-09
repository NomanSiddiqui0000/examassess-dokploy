import React, { useState, useEffect, useCallback } from 'react';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';

interface AdminAccount {
    _id: string;
    username: string;
    role: 'super_admin' | 'admin' | 'content_manager';
    isActive: boolean;
    mustChangePassword: boolean;
    createdAt: string;
}

interface AdminFormData {
    username: string;
    password: string;
    role: 'admin' | 'content_manager';
}

const ROLE_LABELS: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    content_manager: 'Content Manager',
};

const AdminManagement: React.FC = () => {
    const [admins, setAdmins] = useState<AdminAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [editingAdmin, setEditingAdmin] = useState<AdminAccount | null>(null);
    const [formData, setFormData] = useState<AdminFormData>({ username: '', password: '', role: 'admin' });
    const [formError, setFormError] = useState('');
    const [saving, setSaving] = useState(false);

    // Reset password modal
    const [showResetModal, setShowResetModal] = useState(false);
    const [resetTarget, setResetTarget] = useState<AdminAccount | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetError, setResetError] = useState('');
    const [resetting, setResetting] = useState(false);

    const fetchAdmins = useCallback(async () => {
        try {
            setLoading(true);
            const res = await api.get('/admin/admins');
            setAdmins(res.data);
        } catch (err: any) {
            setError(err.message || 'Failed to load admin accounts');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchAdmins(); }, [fetchAdmins]);

    const showMessage = (msg: string, isError = false) => {
        if (isError) { setError(msg); setSuccess(''); }
        else { setSuccess(msg); setError(''); }
        setTimeout(() => { setError(''); setSuccess(''); }, 4000);
    };

    const openCreateModal = () => {
        setEditingAdmin(null);
        setFormData({ username: '', password: '', role: 'admin' });
        setFormError('');
        setShowModal(true);
    };

    const openEditModal = (admin: AdminAccount) => {
        setEditingAdmin(admin);
        setFormData({ username: admin.username, password: '', role: admin.role as 'admin' | 'content_manager' });
        setFormError('');
        setShowModal(true);
    };

    const handleSave = async () => {
        setFormError('');
        if (!formData.username.trim()) { setFormError('Username is required'); return; }
        if (!editingAdmin && formData.password.length < 8) { setFormError('Password must be at least 8 characters'); return; }

        setSaving(true);
        try {
            if (editingAdmin) {
                const payload: any = { username: formData.username, role: formData.role };
                await api.put(`/admin/admins/${editingAdmin._id}`, payload);
                showMessage('Admin account updated successfully');
            } else {
                await api.post('/admin/admins', formData);
                showMessage('Admin account created successfully');
            }
            setShowModal(false);
            fetchAdmins();
        } catch (err: any) {
            setFormError(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStatus = async (admin: AdminAccount) => {
        try {
            await api.put(`/admin/admins/${admin._id}`, { isActive: !admin.isActive });
            showMessage(`Account ${admin.isActive ? 'disabled' : 'enabled'} successfully`);
            fetchAdmins();
        } catch (err: any) {
            showMessage(err.message || 'Failed to update status', true);
        }
    };

    const handleDelete = async (admin: AdminAccount) => {
        if (!window.confirm(`Delete account "${admin.username}"? This cannot be undone.`)) return;
        try {
            await api.delete(`/admin/admins/${admin._id}`);
            showMessage('Admin account deleted');
            fetchAdmins();
        } catch (err: any) {
            showMessage(err.message || 'Failed to delete', true);
        }
    };

    const openResetModal = (admin: AdminAccount) => {
        setResetTarget(admin);
        setNewPassword('');
        setResetError('');
        setShowResetModal(true);
    };

    const handleResetPassword = async () => {
        setResetError('');
        if (newPassword.length < 8) { setResetError('Password must be at least 8 characters'); return; }
        setResetting(true);
        try {
            await api.post(`/admin/admins/${resetTarget!._id}/reset-password`, { newPassword });
            showMessage(`Password reset for "${resetTarget!.username}". They must change it on next login.`);
            setShowResetModal(false);
        } catch (err: any) {
            setResetError(err.message || 'Failed to reset password');
        } finally {
            setResetting(false);
        }
    };

    return (
        <AdminLayout title="Admin Accounts">
            <div className="page-container">
                {/* Header */}
                <div className="page-header">
                    <div>
                        <h2 className="page-title">Admin Accounts</h2>
                        <p className="page-subtitle">Manage admin and content manager accounts</p>
                    </div>
                    <button className="btn btn-primary" onClick={openCreateModal}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        New Admin
                    </button>
                </div>

                {error && <div className="alert alert-error">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                {/* Table */}
                <div className="card">
                    {loading ? (
                        <div className="loading-state">
                            <div className="spinner" />
                            <p>Loading accounts...</p>
                        </div>
                    ) : admins.length === 0 ? (
                        <div className="empty-state">
                            <p>No admin accounts found.</p>
                        </div>
                    ) : (
                        <div className="table-scroll-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th className="col-student-name">Username</th>
                                        <th className="col-status">Role</th>
                                        <th className="col-status">Status</th>
                                        <th className="col-status">Must Change PW</th>
                                        <th className="col-date">Created</th>
                                        <th className="col-actions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {admins.map((admin) => (
                                        <tr key={admin._id}>
                                            <td>
                                                <span className="font-medium">{admin.username}</span>
                                            </td>
                                            <td>
                                                <span className={`badge ${admin.role === 'super_admin' ? 'badge-warning' : admin.role === 'admin' ? 'badge-primary' : 'badge-info'}`}>
                                                    {ROLE_LABELS[admin.role] || admin.role}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`badge ${admin.isActive ? 'badge-success' : 'badge-error'}`}>
                                                    {admin.isActive ? 'Active' : 'Disabled'}
                                                </span>
                                            </td>
                                            <td>
                                                {admin.mustChangePassword
                                                    ? <span className="badge badge-warning">Yes</span>
                                                    : <span className="text-secondary">No</span>
                                                }
                                            </td>
                                            <td className="text-secondary">
                                                {new Date(admin.createdAt).toLocaleDateString()}
                                            </td>
                                            <td>
                                                {admin.role !== 'super_admin' && (
                                                    <div className="action-buttons">
                                                        <button
                                                            className="btn btn-sm btn-ghost"
                                                            onClick={() => openEditModal(admin)}
                                                            title="Edit"
                                                        >
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-ghost"
                                                            onClick={() => openResetModal(admin)}
                                                            title="Reset Password"
                                                        >
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                                                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            className={`btn btn-sm ${admin.isActive ? 'btn-ghost' : 'btn-ghost'}`}
                                                            onClick={() => handleToggleStatus(admin)}
                                                            title={admin.isActive ? 'Disable' : 'Enable'}
                                                        >
                                                            {admin.isActive ? (
                                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                                                                    <circle cx="12" cy="12" r="10" /><line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                                                                </svg>
                                                            ) : (
                                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                                                                    <circle cx="12" cy="12" r="10" /><polyline points="9 11 12 14 22 4" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                        <button
                                                            className="btn btn-sm btn-danger-ghost"
                                                            onClick={() => handleDelete(admin)}
                                                            title="Delete"
                                                        >
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
                                                                <polyline points="3 6 5 6 21 6" />
                                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                                {admin.role === 'super_admin' && (
                                                    <span className="text-secondary" style={{ fontSize: '0.8rem' }}>Protected</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingAdmin ? 'Edit Admin Account' : 'Create Admin Account'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            {formError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{formError}</div>}
                            <div className="form-group">
                                <label className="form-label">Username</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    value={formData.username}
                                    onChange={(e) => setFormData(p => ({ ...p, username: e.target.value }))}
                                    placeholder="Enter username"
                                    autoComplete="off"
                                />
                            </div>
                            {!editingAdmin && (
                                <div className="form-group">
                                    <label className="form-label">Password</label>
                                    <input
                                        className="form-input"
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData(p => ({ ...p, password: e.target.value }))}
                                        placeholder="Min 8 characters"
                                        autoComplete="new-password"
                                    />
                                    <p className="form-hint">User will be required to change password on first login.</p>
                                </div>
                            )}
                            <div className="form-group">
                                <label className="form-label">Role</label>
                                <select
                                    className="form-select"
                                    value={formData.role}
                                    onChange={(e) => setFormData(p => ({ ...p, role: e.target.value as any }))}
                                >
                                    <option value="admin">Admin</option>
                                    <option value="content_manager">Content Manager</option>
                                </select>
                                <p className="form-hint">
                                    Admin: manages students, quizzes, results, MCQs. Content Manager: MCQ bank only.
                                </p>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving...' : editingAdmin ? 'Update' : 'Create Account'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {showResetModal && resetTarget && (
                <div className="modal-overlay" onClick={() => setShowResetModal(false)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Reset Password</h3>
                            <button className="modal-close" onClick={() => setShowResetModal(false)}>×</button>
                        </div>
                        <div className="modal-body">
                            {resetError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{resetError}</div>}
                            <p style={{ marginBottom: 16, color: 'var(--color-text-secondary)' }}>
                                Resetting password for <strong>{resetTarget.username}</strong>. They will be required to change it on next login.
                            </p>
                            <div className="form-group">
                                <label className="form-label">New Password</label>
                                <input
                                    className="form-input"
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    placeholder="Min 8 characters"
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-ghost" onClick={() => setShowResetModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleResetPassword} disabled={resetting}>
                                {resetting ? 'Resetting...' : 'Reset Password'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default AdminManagement;
