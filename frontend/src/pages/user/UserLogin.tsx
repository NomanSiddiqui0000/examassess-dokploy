import React, { useState, useEffect } from 'react';
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

const UserLogin: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [verificationNeeded, setVerificationNeeded] = useState(false);
    const [verificationEmail, setVerificationEmail] = useState('');
    const [resending, setResending] = useState(false);
    const [resendMessage, setResendMessage] = useState('');
    const { login, isAuthenticated, isAdmin, isUser, isTeacher } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (isAuthenticated) {
            navigate(isUser ? '/user/dashboard' : isAdmin ? '/admin/dashboard' : isTeacher ? '/teacher/dashboard' : '/');
        }
    }, [isAuthenticated, isUser, isAdmin, isTeacher, navigate]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await api.post('/auth/user/login', { username, password });
            login(res.data.token, res.data.user);
            navigate(res.data.user?.mustChangePassword ? '/user/change-password' : '/user/dashboard');
        } catch (err: any) {
            const data = err.response?.data;
            if (data?.errorCode === 'EMAIL_NOT_VERIFIED') {
                setVerificationNeeded(true);
                setVerificationEmail(data.email || username);
                setError(data.message);
            } else {
                setVerificationNeeded(false);
                setError(data?.message || 'Invalid credentials');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        setResendMessage('');
        try {
            const res = await api.post('/auth/resend-verification', { email: verificationEmail });
            setResendMessage(res.data.message || 'Verification email sent!');
        } catch (err: any) {
            setResendMessage(err.response?.data?.message || 'Failed to resend.');
        } finally {
            setResending(false);
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
                    <h2 className="login-card-title">Student Sign In</h2>
                    <p className="login-card-subtitle">Enter your credentials to access your quizzes</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="login-error">
                            <strong>{verificationNeeded ? 'Verification Required:' : 'Error:'}</strong> {error}
                            {verificationNeeded && (
                                <div style={{ marginTop: 10 }}>
                                    {resendMessage && (
                                        <p style={{ fontSize: '0.85rem', marginBottom: 8, color: 'var(--color-accent)' }}>
                                            {resendMessage}
                                        </p>
                                    )}
                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={handleResend}
                                        disabled={resending}
                                        style={{ padding: '6px 16px', fontSize: '0.8rem' }}
                                    >
                                        {resending ? 'Sending...' : 'Resend Verification Email'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Email or Username</label>
                        <div className="login-input-group">
                            <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                            <input
                                id="user-username"
                                type="text"
                                className="login-input"
                                placeholder="Enter your email or username"
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
                            id="user-password"
                            className="login-input"
                            leadingIcon={<LockIcon />}
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        id="user-login-btn"
                        type="submit"
                        className="btn btn-accent btn-lg btn-full"
                        disabled={loading}
                        style={{ marginTop: '8px' }}
                    >
                        {loading ? (
                            <>
                                <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                                Signing in...
                            </>
                        ) : (
                            'Sign In'
                        )}
                    </button>
                </form>

                <div className="login-footer">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                        <Link to="/forgot-password" style={{ fontSize: '0.875rem' }}>Forgot Password?</Link>
                        <Link to="/teacher/login" style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Teacher Sign In</Link>
                    </div>
                    <div>
                        New to ExamAssess? <Link to="/user/register">Create your account &rarr;</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UserLogin;
