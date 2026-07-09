import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import BackHomeButton from '../../components/BackHomeButton';
import HomeLogoLink from '../../components/HomeLogoLink';

const ForgotPassword: React.FC = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await api.post('/auth/forgot-password', { email });
            setMessage(res.data.message || 'If the email exists, a reset link has been sent.');
            setSubmitted(true);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Something went wrong. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (submitted) {
        return (
            <div className="login-page-centered">
                <div className="login-card" style={{ textAlign: 'center' }}>
                    <div className="login-card-header">
                        <HomeLogoLink imgClassName="login-card-logo" />
                    </div>
                    <div style={{ padding: '32px 24px' }}>
                        <div className="auth-status-icon success" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 4h16v16H4z" />
                                <path d="m4 6 8 7 8-7" />
                            </svg>
                        </div>
                        <h2 style={{ marginBottom: 8, color: 'var(--color-text-primary)' }}>Check Your Email</h2>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                            {message}
                        </p>
                        <Link
                            to="/user/login"
                            className="btn btn-accent btn-lg"
                            style={{ display: 'inline-block', textDecoration: 'none', padding: '12px 36px' }}
                        >
                            Back to Login
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
                    <h2 className="login-card-title">Forgot Password</h2>
                    <p className="login-card-subtitle">Enter your email to receive a password reset link</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="login-error">
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <div className="login-input-group">
                            <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <input
                                id="forgot-email"
                                type="email"
                                className="login-input"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    <button
                        id="forgot-submit-btn"
                        type="submit"
                        className="btn btn-accent btn-lg btn-full"
                        disabled={loading}
                        style={{ marginTop: '8px' }}
                    >
                        {loading ? (
                            <>
                                <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                                Sending...
                            </>
                        ) : (
                            'Send Reset Link'
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

export default ForgotPassword;
