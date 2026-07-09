import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';

const MyAccount: React.FC = () => {
    const { user, logout } = useAuth();

    // Change password state
    const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [pwError, setPwError] = useState('');
    const [pwSuccess, setPwSuccess] = useState('');
    const [pwLoading, setPwLoading] = useState(false);

    // Change username state
    const [unForm, setUnForm] = useState({ newUsername: '', currentPassword: '' });
    const [unError, setUnError] = useState('');
    const [unSuccess, setUnSuccess] = useState('');
    const [unLoading, setUnLoading] = useState(false);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPwError('');
        setPwSuccess('');

        if (pwForm.newPassword !== pwForm.confirmPassword) {
            setPwError('New passwords do not match');
            return;
        }
        if (pwForm.newPassword.length < 8) {
            setPwError('New password must be at least 8 characters');
            return;
        }

        setPwLoading(true);
        try {
            await api.post('/admin/me/change-password', {
                currentPassword: pwForm.currentPassword,
                newPassword: pwForm.newPassword,
            });
            setPwSuccess('Password changed successfully');
            setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err: any) {
            setPwError(err.message || 'Failed to change password');
        } finally {
            setPwLoading(false);
        }
    };

    const handleChangeUsername = async (e: React.FormEvent) => {
        e.preventDefault();
        setUnError('');
        setUnSuccess('');

        if (!unForm.newUsername.trim() || !unForm.currentPassword) {
            setUnError('All fields are required');
            return;
        }

        setUnLoading(true);
        try {
            await api.post('/admin/me/change-username', {
                newUsername: unForm.newUsername.trim(),
                currentPassword: unForm.currentPassword,
            });
            setUnSuccess('Username changed. You will be logged out in 3 seconds...');
            setTimeout(() => {
                logout();
            }, 3000);
        } catch (err: any) {
            setUnError(err.message || 'Failed to change username');
        } finally {
            setUnLoading(false);
        }
    };

    return (
        <AdminLayout title="My Account">
            <div className="page-container">
                <div className="page-header">
                    <div>
                        <h2 className="page-title">My Account</h2>
                        <p className="page-subtitle">Manage your Super Admin credentials</p>
                    </div>
                </div>

                {/* Account Info */}
                <div className="card" style={{ marginBottom: 24 }}>
                    <div className="card-header">
                        <h3 className="card-title">Account Information</h3>
                    </div>
                    <div className="card-body">
                        <div className="info-row">
                            <span className="info-label">Username</span>
                            <span className="info-value font-medium">{user?.username}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-label">Role</span>
                            <span className="badge badge-warning">Super Admin</span>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                    {/* Change Password */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">Change Password</h3>
                        </div>
                        <div className="card-body">
                            {pwError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{pwError}</div>}
                            {pwSuccess && <div className="alert alert-success" style={{ marginBottom: 16 }}>{pwSuccess}</div>}
                            <form onSubmit={handleChangePassword}>
                                <div className="form-group">
                                    <label className="form-label">Current Password</label>
                                    <input
                                        className="form-input"
                                        type="password"
                                        value={pwForm.currentPassword}
                                        onChange={(e) => setPwForm(p => ({ ...p, currentPassword: e.target.value }))}
                                        placeholder="Enter current password"
                                        autoComplete="current-password"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">New Password</label>
                                    <input
                                        className="form-input"
                                        type="password"
                                        value={pwForm.newPassword}
                                        onChange={(e) => setPwForm(p => ({ ...p, newPassword: e.target.value }))}
                                        placeholder="Min 8 characters"
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Confirm New Password</label>
                                    <input
                                        className="form-input"
                                        type="password"
                                        value={pwForm.confirmPassword}
                                        onChange={(e) => setPwForm(p => ({ ...p, confirmPassword: e.target.value }))}
                                        placeholder="Repeat new password"
                                        autoComplete="new-password"
                                        required
                                    />
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={pwLoading} style={{ width: '100%' }}>
                                    {pwLoading ? 'Changing...' : 'Change Password'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Change Username */}
                    <div className="card">
                        <div className="card-header">
                            <h3 className="card-title">Change Username</h3>
                        </div>
                        <div className="card-body">
                            {unError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{unError}</div>}
                            {unSuccess && <div className="alert alert-success" style={{ marginBottom: 16 }}>{unSuccess}</div>}
                            <div className="alert" style={{ marginBottom: 16, background: 'rgba(245,158,11,0.1)', color: '#d97706', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: '0.875rem' }}>
                                ⚠️ Changing your username will log you out. You must log in again with the new username.
                            </div>
                            <form onSubmit={handleChangeUsername}>
                                <div className="form-group">
                                    <label className="form-label">New Username</label>
                                    <input
                                        className="form-input"
                                        type="text"
                                        value={unForm.newUsername}
                                        onChange={(e) => setUnForm(p => ({ ...p, newUsername: e.target.value }))}
                                        placeholder="Enter new username"
                                        autoComplete="off"
                                        required
                                    />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Current Password (re-authentication)</label>
                                    <input
                                        className="form-input"
                                        type="password"
                                        value={unForm.currentPassword}
                                        onChange={(e) => setUnForm(p => ({ ...p, currentPassword: e.target.value }))}
                                        placeholder="Enter current password to confirm"
                                        autoComplete="current-password"
                                        required
                                    />
                                </div>
                                <button type="submit" className="btn btn-primary" disabled={unLoading} style={{ width: '100%' }}>
                                    {unLoading ? 'Changing...' : 'Change Username'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default MyAccount;
