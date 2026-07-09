import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import HomeLogoLink from '../../components/HomeLogoLink';

const VerifyEmailPending: React.FC = () => {
    const { user, login, logout } = useAuth();
    const [resending, setResending] = useState(false);
    const [resendMessage, setResendMessage] = useState('');
    const [resendError, setResendError] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [refreshError, setRefreshError] = useState('');
    
    // Change Email states
    const [isEditingEmail, setIsEditingEmail] = useState(false);
    const [newEmail, setNewEmail] = useState(user?.email || '');
    const [emailChangeLoading, setEmailChangeLoading] = useState(false);
    const [emailChangeSuccess, setEmailChangeSuccess] = useState('');
    const [emailChangeError, setEmailChangeError] = useState('');
    
    const navigate = useNavigate();

    const handleResend = async () => {
        if (!user?.email) return;
        setResending(true);
        setResendMessage('');
        setResendError('');
        try {
            const res = await api.post('/auth/resend-verification', { email: user.email });
            setResendMessage(res.data.message || 'Verification email sent! Check your inbox.');
        } catch (err: any) {
            setResendError(err.response?.data?.message || 'Failed to resend. Please try again.');
        } finally {
            setResending(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        setRefreshError('');
        try {
            const res = await api.get('/user/profile');
            if (res.data.emailVerified) {
                // Update local storage and context
                const updatedUser = { ...user, ...res.data };
                const token = localStorage.getItem('token');
                if (token) {
                    login(token, updatedUser);
                }
                navigate('/user/dashboard');
            } else {
                setRefreshError('Email is still unverified. Please verify via the link in your inbox.');
            }
        } catch (err: any) {
            setRefreshError(err.response?.data?.message || 'Failed to check verification status.');
        } finally {
            setRefreshing(false);
        }
    };

    const handleChangeEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setEmailChangeError('');
        setEmailChangeSuccess('');
        
        if (!newEmail.trim()) {
            setEmailChangeError('Email address cannot be empty.');
            return;
        }

        setEmailChangeLoading(true);
        try {
            const res = await api.post('/auth/change-email', { newEmail: newEmail.trim().toLowerCase() });
            setEmailChangeSuccess(res.data.message || 'Email updated successfully. Check your new inbox.');
            
            // Update auth context with new email address
            const updatedUser = { ...user, email: res.data.email, username: res.data.email } as any;
            const token = localStorage.getItem('token');
            if (token) {
                login(token, updatedUser);
            }
            setIsEditingEmail(false);
        } catch (err: any) {
            setEmailChangeError(err.response?.data?.message || 'Failed to change email address.');
        } finally {
            setEmailChangeLoading(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/user/login');
    };

    return (
        <div className="login-page-centered">
            <div className="login-card" style={{ textAlign: 'center', maxWidth: '480px' }}>
                <div className="login-card-header">
                    <HomeLogoLink imgClassName="login-card-logo" />
                </div>
                <div style={{ padding: '32px 24px' }}>
                    <div className="auth-status-icon warning" aria-hidden="true" style={{ background: 'var(--color-warning-bg) !important', color: 'var(--color-warning) !important' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="16" x2="12" y2="12" />
                            <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                    </div>
                    
                    <h2 style={{ marginBottom: 8, color: 'var(--color-text-primary)', fontFamily: 'Outfit, sans-serif', fontWeight: 800 }}>
                        Verify Your Email Address
                    </h2>
                    
                    {!isEditingEmail ? (
                        <>
                            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.6, fontSize: '0.95rem' }}>
                                A verification email has been sent to:<br />
                                <strong style={{ color: 'var(--color-text-primary)', fontSize: '1.05rem' }}>{user?.email}</strong>
                                <br /><br />
                                Please verify your email before accessing Practice Module features.
                            </p>

                            {resendMessage && (
                                <div style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', padding: '12px', borderRadius: '6px', marginBottom: 16, fontSize: '0.9rem', border: '1px solid #bbf7d0' }}>
                                    {resendMessage}
                                </div>
                            )}

                            {resendError && (
                                <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '12px', borderRadius: '6px', marginBottom: 16, fontSize: '0.9rem', border: '1px solid #fca5a5' }}>
                                    {resendError}
                                </div>
                            )}

                            {refreshError && (
                                <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '12px', borderRadius: '6px', marginBottom: 16, fontSize: '0.9rem', border: '1px solid #fca5a5' }}>
                                    {refreshError}
                                </div>
                            )}

                            {emailChangeSuccess && (
                                <div style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)', padding: '12px', borderRadius: '6px', marginBottom: 16, fontSize: '0.9rem', border: '1px solid #bbf7d0' }}>
                                    {emailChangeSuccess}
                                </div>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch', marginTop: 12 }}>
                                <button
                                    className="btn btn-accent btn-lg"
                                    onClick={handleRefresh}
                                    disabled={refreshing}
                                    style={{ width: '100%' }}
                                >
                                    {refreshing ? 'Checking status...' : 'Refresh Verification Status'}
                                </button>
                                
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                    <button
                                        className="btn btn-outline"
                                        onClick={handleResend}
                                        disabled={resending}
                                        style={{ flex: 1, padding: '10px 12px', fontSize: '0.85rem' }}
                                    >
                                        {resending ? 'Sending...' : 'Resend Email'}
                                    </button>
                                    
                                    <button
                                        className="btn btn-outline"
                                        onClick={() => {
                                            setNewEmail(user?.email || '');
                                            setIsEditingEmail(true);
                                        }}
                                        style={{ flex: 1, padding: '10px 12px', fontSize: '0.85rem' }}
                                    >
                                        Change Email
                                    </button>
                                </div>

                                <button
                                    className="btn btn-link"
                                    onClick={handleLogout}
                                    style={{ color: 'var(--color-text-secondary)', fontSize: '0.9rem', marginTop: 8 }}
                                >
                                    Back to Login
                                </button>
                            </div>
                        </>
                    ) : (
                        <form onSubmit={handleChangeEmail} style={{ textAlign: 'left', marginTop: 16 }}>
                            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 16, fontSize: '0.9rem', textAlign: 'center' }}>
                                Enter your new email address below. We'll update your account and send a verification link there.
                            </p>

                            {emailChangeError && (
                                <div style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '10px', borderRadius: '6px', marginBottom: 14, fontSize: '0.85rem', border: '1px solid #fca5a5' }}>
                                    {emailChangeError}
                                </div>
                            )}

                            <div className="form-group" style={{ marginBottom: 16 }}>
                                <label className="form-label">New Email Address</label>
                                <input
                                    type="email"
                                    className="login-input"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    placeholder="newemail@example.com"
                                    required
                                    style={{ paddingLeft: '14px' }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                                <button
                                    type="button"
                                    className="btn btn-outline"
                                    onClick={() => setIsEditingEmail(false)}
                                    style={{ flex: 1 }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="btn btn-accent"
                                    disabled={emailChangeLoading}
                                    style={{ flex: 1 }}
                                >
                                    {emailChangeLoading ? 'Saving...' : 'Send Link'}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VerifyEmailPending;
