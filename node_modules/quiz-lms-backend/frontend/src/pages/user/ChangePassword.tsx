import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import UserLayout from '../../components/Layout/UserLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import PasswordInput from '../../components/PasswordInput';

const ChangePassword: React.FC = () => {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { user, login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        try {
            await api.post('/user/change-password', { currentPassword, newPassword });
            const token = localStorage.getItem('token') || '';
            if (user) login(token, { ...user, mustChangePassword: false });
            navigate('/user/dashboard');
        } catch (err: any) {
            setError(err.response?.data?.message || 'Unable to change password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <UserLayout>
            <div className="card" style={{ maxWidth: 520, margin: '32px auto' }}>
                <div className="card-header">
                    <div>
                        <h2 className="card-title">Change Password</h2>
                        <p className="text-sm text-muted">Set a private password before continuing.</p>
                    </div>
                </div>
                <form className="card-body flex flex-col gap-4" onSubmit={handleSubmit}>
                    {error && <div className="alert alert-error">{error}</div>}
                    {!user?.mustChangePassword && (
                        <div className="form-group">
                            <label className="form-label">Current Password</label>
                            <PasswordInput className="form-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
                        </div>
                    )}
                    <div className="form-group">
                        <label className="form-label">New Password</label>
                        <PasswordInput className="form-input" minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
                    </div>
                    <button className="btn btn-accent" disabled={loading}>{loading ? 'Saving...' : 'Save Password'}</button>
                </form>
            </div>
        </UserLayout>
    );
};

export default ChangePassword;
