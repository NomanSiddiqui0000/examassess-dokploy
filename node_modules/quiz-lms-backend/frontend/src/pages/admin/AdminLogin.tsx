import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import BackHomeButton from '../../components/BackHomeButton';
import HomeLogoLink from '../../components/HomeLogoLink';
import PasswordInput from '../../components/PasswordInput';

const LockIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);

const AdminLogin: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await api.post('/auth/admin/login', { username, password });
            login(res.data.token, res.data.user);
            const role = res.data.user?.role;
            if (role === 'content_manager') {
                navigate('/admin/mcqs');
            } else {
                navigate('/admin/dashboard');
            }
        } catch (err: any) {
            setError(err.response?.data?.message || 'Invalid credentials');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-page-centered">
            <div className="login-card">
                <div className="login-card-nav">
                    <BackHomeButton />
                </div>
                <div className="login-card-header">
                    <HomeLogoLink imgClassName="login-card-logo" />
                    <h2 className="login-card-title">Admin Sign In</h2>
                    <p className="login-card-subtitle">Enter your credentials to access the admin panel</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="login-error">
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Username</label>
                        <div className="login-input-group">
                            <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                            <input
                                id="admin-username"
                                type="text"
                                className="login-input"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <PasswordInput
                            id="admin-password"
                            className="login-input"
                            leadingIcon={<LockIcon />}
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        id="admin-login-btn"
                        type="submit"
                        className="btn btn-primary btn-lg btn-full"
                        disabled={loading}
                        style={{ marginTop: '8px' }}
                    >
                        {loading ? (
                            <>
                                <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                                Signing in...
                            </>
                        ) : (
                            'Sign In as Admin'
                        )}
                    </button>
                </form>
                <div className="login-footer">
                    <Link to="/" style={{ color: 'var(--color-text-secondary)', fontWeight: 'normal' }}>&larr; Back to Home</Link>
                </div>
            </div>
        </div>
    );
};

export default AdminLogin;
