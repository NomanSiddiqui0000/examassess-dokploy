import React, { useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
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

const ResetPassword: React.FC = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token') || '';

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);
        try {
            await api.post('/auth/reset-password', { token, password });
            setSuccess(true);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to reset password. The link may be invalid or expired.');
        } finally {
            setLoading(false);
        }
    };

    if (!token) {
        return (
            <div className="login-page-centered">
                <div className="login-card" style={{ textAlign: 'center' }}>
                    <div className="login-card-header">
                        <HomeLogoLink imgClassName="login-card-logo" />
                    </div>
                    <div style={{ padding: '32px 24px' }}>
                        <div className="auth-status-icon danger" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                        </div>
                        <h2 style={{ marginBottom: 8 }}>Invalid Reset Link</h2>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>No reset token provided.</p>
                        <Link to="/forgot-password" className="btn btn-accent" style={{ textDecoration: 'none', padding: '10px 24px' }}>
                            Request New Link
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="login-page-centered">
                <div className="login-card" style={{ textAlign: 'center' }}>
                    <div className="login-card-header">
                        <HomeLogoLink imgClassName="login-card-logo" />
                    </div>
                    <div style={{ padding: '32px 24px' }}>
                        <div className="auth-status-icon success" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="m8 12 3 3 5-6" />
                            </svg>
                        </div>
                        <h2 style={{ marginBottom: 8, color: 'var(--color-text-primary)' }}>Password Reset!</h2>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                            Your password has been reset successfully.<br />You can now sign in with your new password.
                        </p>
                        <Link
                            to="/user/login"
                            className="btn btn-accent btn-lg"
                            style={{ display: 'inline-block', textDecoration: 'none', padding: '12px 36px' }}
                        >
                            Sign In Now
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="login-page-centered">
            <div className="login-card">
                <div className="login-card-nav">
                    <BackHomeButton />
                </div>
                <div className="login-card-header">
                    <HomeLogoLink imgClassName="login-card-logo" />
                    <h2 className="login-card-title">Reset Password</h2>
                    <p className="login-card-subtitle">Enter your new password below</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="login-error">
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">New Password</label>
                        <PasswordInput
                            id="reset-password"
                            className="login-input"
                            leadingIcon={<LockIcon />}
                            placeholder="Minimum 6 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Confirm New Password</label>
                        <PasswordInput
                            id="reset-confirm-password"
                            className="login-input"
                            leadingIcon={<LockIcon />}
                            placeholder="Re-enter your new password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        id="reset-submit-btn"
                        type="submit"
                        className="btn btn-accent btn-lg btn-full"
                        disabled={loading}
                        style={{ marginTop: '8px' }}
                    >
                        {loading ? (
                            <>
                                <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                                Resetting...
                            </>
                        ) : (
                            'Reset Password'
                        )}
                    </button>
                </form>

                <div className="login-footer">
                    <Link to="/user/login" style={{ color: 'var(--color-text-secondary)' }}>&larr; Back to Sign In</Link>
                </div>
                </div>
                </div>
                );
                };

                export default ResetPassword;
