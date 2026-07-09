import React, { useEffect, useState } from 'react';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';

interface TestCat {
    _id: string;
    name: string;
    defaultCredits: number;
}

interface User {
    _id: string;
    username: string;
    email?: string;
    fullName?: string;
    role: string;
    isActive: boolean;
    credits: number;
    emailVerified?: boolean;
    testCategory?: TestCat | string;
    createdAt: string;
}

const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [categories, setCategories] = useState<TestCat[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editUser, setEditUser] = useState<User | null>(null);
    const [form, setForm] = useState({ username: '', password: '', isActive: true, testCategoryId: '', credits: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    // Recharge modal
    const [rechargeUser, setRechargeUser] = useState<User | null>(null);
    const [rechargeAmount, setRechargeAmount] = useState('');
    const [rechargeReason, setRechargeReason] = useState('');
    const [recharging, setRecharging] = useState(false);
    const [rechargeError, setRechargeError] = useState('');

    // Details modal
    const [detailsUser, setDetailsUser] = useState<User | null>(null);
    const [studentDetails, setStudentDetails] = useState<any>(null);
    const [detailsLoading, setDetailsLoading] = useState(false);

    const fetchUsers = () => {
        setLoading(true);
        api.get('/admin/users')
            .then(res => setUsers(res.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    const fetchCategories = () => {
        api.get('/admin/test-categories')
            .then(res => setCategories(res.data.filter((c: TestCat & { isActive: boolean }) => c.isActive !== false)))
            .catch(console.error);
    };

    useEffect(() => { fetchUsers(); fetchCategories(); }, []);

    const getCategoryName = (u: User) => {
        if (!u.testCategory) return '—';
        if (typeof u.testCategory === 'string') return u.testCategory;
        return u.testCategory.name || '—';
    };

    const openDetails = async (u: User) => {
        setDetailsUser(u);
        setStudentDetails(null);
        setDetailsLoading(true);
        try {
            const res = await api.get(`/admin/users/${u._id}/details`);
            setStudentDetails(res.data);
        } catch (err) {
            console.error('Failed to fetch student details', err);
        } finally {
            setDetailsLoading(false);
        }
    };

    const openCreate = () => {
        setEditUser(null);
        setForm({ username: '', password: '', isActive: true, testCategoryId: '', credits: '' });
        setError('');
        setShowModal(true);
    };

    const openEdit = (u: User) => {
        setEditUser(u);
        setForm({ username: u.username, password: '', isActive: u.isActive, testCategoryId: '', credits: '' });
        setError('');
        setShowModal(true);
    };

    const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
            if (editUser) {
                const payload: any = { username: form.username, isActive: form.isActive };
                if (form.password) payload.password = form.password;
                await api.put(`/admin/users/${editUser._id}`, payload);
            } else {
                const payload: any = { username: form.username, password: form.password };
                if (form.testCategoryId) payload.testCategoryId = form.testCategoryId;
                if (form.credits !== '') payload.credits = Number(form.credits);
                await api.post('/admin/users', payload);
            }
            setShowModal(false);
            fetchUsers();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to save user');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this user? This cannot be undone.')) return;
        try {
            await api.delete(`/admin/users/${id}`);
            fetchUsers();
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to delete user');
        }
    };

    const handleRecharge = async () => {
        if (!rechargeUser) return;
        if (rechargeAmount === '') {
            setRechargeError('Please enter a recharge amount.');
            return;
        }
        setRechargeError('');
        setRecharging(true);
        try {
            await api.post(`/admin/users/${rechargeUser._id}/recharge-credits`, {
                amount: Number(rechargeAmount),
                reason: rechargeReason || undefined,
            });
            setRechargeUser(null);
            setRechargeAmount('');
            setRechargeReason('');
            fetchUsers();
        } catch (err: any) {
            setRechargeError(err.response?.data?.message || 'Failed to recharge');
        } finally {
            setRecharging(false);
        }
    };

    const filtered = users.filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        (u.email && u.email.toLowerCase().includes(search.toLowerCase())) ||
        (u.fullName && u.fullName.toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <AdminLayout title="User Management">
            <div className="card">
                <div className="card-header">
                    <div className="search-bar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            className="search-input"
                            placeholder="Search users..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <button className="btn btn-primary" onClick={openCreate} id="create-user-btn">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add User
                    </button>
                </div>

                {loading ? (
                    <div className="loading-overlay"><div className="loading-spinner" />Loading users...</div>
                ) : (
                    <div className="table-scroll-container">
                        {filtered.length === 0 ? (
                            <div className="empty-state">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                                </svg>
                                <div className="empty-state-title">No users found</div>
                                <div className="empty-state-desc">Add your first student to get started.</div>
                            </div>
                        ) : (
                            <table>
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th className="col-student-name">Username</th>
                                        <th className="col-classroom">Category</th>
                                        <th className="col-status">Credits</th>
                                        <th className="col-status">Status</th>
                                        <th className="col-status">Email</th>
                                        <th className="col-date">Created</th>
                                        <th className="col-actions">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map((u, i) => (
                                        <tr key={u._id}>
                                            <td className="text-muted text-sm">{i + 1}</td>
                                            <td>
                                                <strong>{u.username}</strong>
                                                {u.fullName && <div className="text-muted text-sm">{u.fullName}</div>}
                                            </td>
                                            <td>
                                                <span className="badge badge-info">{getCategoryName(u)}</span>
                                            </td>
                                            <td>
                                                <strong style={{ color: u.credits > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                                                    {u.credits ?? 0}
                                                </strong>
                                            </td>
                                            <td>
                                                <span className={`badge ${u.isActive ? 'badge-success' : 'badge-danger'}`}>
                                                    {u.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </td>
                                            <td>
                                                <span
                                                    className="badge"
                                                    style={{
                                                        background: u.emailVerified ? 'var(--color-success)' : '#e67e22',
                                                        color: '#fff',
                                                        fontSize: '0.75rem',
                                                        padding: '3px 10px',
                                                        borderRadius: '12px',
                                                    }}
                                                >
                                                    {u.emailVerified ? 'Verified' : 'Unverified'}
                                                </span>
                                            </td>
                                            <td className="text-muted text-sm">
                                                {new Date(u.createdAt).toLocaleDateString()}
                                            </td>
                                            <td>
                                                <div className="flex gap-2">
                                                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(u)}>Edit</button>
                                                    <button className="btn btn-ghost btn-sm" onClick={() => openDetails(u)}>View Details</button>
                                                    <button
                                                        className="btn btn-sm"
                                                        style={{ background: 'var(--color-primary)', color: '#fff' }}
                                                        onClick={() => { setRechargeUser(u); setRechargeAmount(''); setRechargeReason(''); setRechargeError(''); }}
                                                    >
                                                        Recharge
                                                    </button>
                                                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u._id)}>Delete</button>
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

            {/* Create/Edit Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editUser ? 'Edit User' : 'Create New User'}</h3>
                            <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {error && <div className="alert alert-danger mb-4">{error}</div>}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Username</label>
                                    <input
                                        className="form-input"
                                        value={form.username}
                                        onChange={e => setForm({ ...form, username: e.target.value })}
                                        placeholder="Enter username"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">{editUser ? 'New Password (leave blank to keep)' : 'Password'}</label>
                                    <input
                                        className="form-input"
                                        type="password"
                                        value={form.password}
                                        onChange={e => setForm({ ...form, password: e.target.value })}
                                        placeholder={editUser ? 'Leave blank to keep current' : 'Enter password'}
                                    />
                                </div>
                                {!editUser && (
                                    <>
                                        <div className="form-group">
                                            <label className="form-label">Test Category</label>
                                            <select
                                                className="form-select"
                                                value={form.testCategoryId}
                                                onChange={e => setForm({ ...form, testCategoryId: e.target.value })}
                                            >
                                                <option value="">None</option>
                                                {categories.map(c => (
                                                    <option key={c._id} value={c._id}>
                                                        {c.name} ({c.defaultCredits} credits)
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Credits Override (optional)</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                min={0}
                                                value={form.credits}
                                                onChange={e => setForm({ ...form, credits: e.target.value })}
                                                placeholder="Leave blank for category default"
                                            />
                                        </div>
                                    </>
                                )}
                                {editUser && (
                                    <div className="form-group">
                                        <label className="form-label">Status</label>
                                        <select
                                            className="form-select"
                                            value={form.isActive ? 'active' : 'inactive'}
                                            onChange={e => setForm({ ...form, isActive: e.target.value === 'active' })}
                                        >
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                                {saving ? 'Saving...' : editUser ? 'Save Changes' : 'Create User'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Recharge Modal */}
            {rechargeUser && (
                <div className="modal-overlay" onClick={() => setRechargeUser(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">Recharge Credits — {rechargeUser.username}</h3>
                            <button className="modal-close" onClick={() => setRechargeUser(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {rechargeError && <div className="alert alert-danger mb-4">{rechargeError}</div>}
                            <p className="text-muted" style={{ marginBottom: '1rem' }}>
                                Current credits: <strong>{rechargeUser.credits ?? 0}</strong>
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                <div className="form-group">
                                    <label className="form-label">Amount to Add</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        min={1}
                                        value={rechargeAmount}
                                        onChange={e => setRechargeAmount(e.target.value)}
                                        placeholder="Enter credit amount"
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Reason (optional)</label>
                                    <input
                                        className="form-input"
                                        value={rechargeReason}
                                        onChange={e => setRechargeReason(e.target.value)}
                                        placeholder="e.g. Payment received"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setRechargeUser(null)}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleRecharge}
                                disabled={recharging || !rechargeAmount || Number(rechargeAmount) <= 0}
                            >
                                {recharging ? 'Processing...' : `Add ${rechargeAmount || 0} Credits`}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Details Modal */}
            {detailsUser && (
                <div className="modal-overlay" onClick={() => setDetailsUser(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Student Details</h3>
                            <button className="modal-close" onClick={() => setDetailsUser(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {detailsLoading ? (
                                <div style={{ textAlign: 'center', padding: '2rem' }}>Loading details...</div>
                            ) : studentDetails ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                                    <div className="grid-2">
                                        <div><span className="text-muted text-sm">Full Name:</span><br/><strong>{studentDetails.user.fullName || '—'}</strong></div>
                                        <div><span className="text-muted text-sm">Username:</span><br/><strong>{studentDetails.user.username}</strong></div>
                                        <div><span className="text-muted text-sm">Email:</span><br/><strong>{studentDetails.user.email || '—'}</strong></div>
                                        <div><span className="text-muted text-sm">Role:</span><br/><strong>{studentDetails.user.role}</strong></div>
                                        <div><span className="text-muted text-sm">Status:</span><br/><span className={`badge ${studentDetails.user.isActive ? 'badge-success' : 'badge-danger'}`}>{studentDetails.user.isActive ? 'Active' : 'Inactive'}</span></div>
                                        <div><span className="text-muted text-sm">Verification:</span><br/><span className={`badge ${studentDetails.user.emailVerified ? 'badge-success' : 'badge-warning'}`}>{studentDetails.user.emailVerified ? 'Verified' : 'Unverified'}</span></div>
                                        <div><span className="text-muted text-sm">Registered:</span><br/><strong>{new Date(studentDetails.user.createdAt).toLocaleString()}</strong></div>
                                        <div><span className="text-muted text-sm">Total Attempts:</span><br/><strong>{studentDetails.totalAttempts}</strong></div>
                                    </div>
                                    
                                    <div>
                                        <h4 style={{ marginBottom: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>Classroom Memberships</h4>
                                        {studentDetails.classrooms.length === 0 ? <p className="text-muted text-sm">Not enrolled in any classrooms.</p> : (
                                            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {studentDetails.classrooms.map((c: any) => (
                                                    <li key={c._id} style={{ background: 'var(--color-bg)', padding: '0.5rem', borderRadius: '4px' }}>
                                                        <strong>{c.classroomId?.name}</strong> <span className="text-muted text-sm">(Invited by: {c.teacherId?.fullName || c.teacherId?.email})</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                    
                                    <div>
                                        <h4 style={{ marginBottom: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>Assessment History</h4>
                                        {studentDetails.attempts.length === 0 ? <p className="text-muted text-sm">No assessment attempts found.</p> : (
                                            <div className="table-responsive">
                                                <table className="data-table" style={{ fontSize: '0.875rem' }}>
                                                    <thead><tr><th className="col-assessment-name">Assessment</th><th className="col-date">Started</th><th className="col-status">Score</th><th className="col-status">Status</th></tr></thead>
                                                    <tbody>
                                                        {studentDetails.attempts.slice(0, 5).map((a: any) => (
                                                            <tr key={a._id}>
                                                                <td>{a.assessmentId?.name}</td>
                                                                <td>{new Date(a.startedAt).toLocaleDateString()}</td>
                                                                <td>{a.score} / {a.totalMarks} ({a.percentage}%)</td>
                                                                <td><span className={`badge ${a.status === 'submitted' || a.status === 'auto_submitted' ? 'badge-success' : 'badge-warning'}`}>{a.status}</span></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                                {studentDetails.attempts.length > 5 && <div className="text-muted text-sm mt-2 text-center">Showing last 5 attempts...</div>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="alert alert-error">Failed to load details.</div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDetailsUser(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default UserManagement;
