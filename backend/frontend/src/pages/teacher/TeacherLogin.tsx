import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import BackHomeButton from '../../components/BackHomeButton';
import HomeLogoLink from '../../components/HomeLogoLink';
import PasswordInput from '../../components/PasswordInput';

const TeacherLogin: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [verificationNeeded, setVerificationNeeded] = useState(false);
    const [verificationEmail, setVerificationEmail] = useState('');
    const [resending, setResending] = useState(false);
    const [resendMessage, setResendMessage] = useState('');
    const { login, isAuthenticated, isTeacher } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (isAuthenticated && isTeacher) navigate('/teacher/dashboard');
    }, [isAuthenticated, isTeacher, navigate]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        setError('');
        try {
            const res = await api.post('/auth/teacher/login', { username, password });
            login(res.data.token, res.data.user);
            navigate('/teacher/dashboard');
        } catch (err: any) {
            const data = err.response?.data;
            if (data?.errorCode === 'EMAIL_NOT_VERIFIED') {
                setVerificationNeeded(true);
                setVerificationEmail(data.email || username);
                setError(data.message);
            } else {
                setVerificationNeeded(false);
                setError(data?.message || 'Unable to sign in');
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
            setResendMessage(res.data.message || 'Verification email sent.');
        } catch (err: any) {
            setResendMessage(err.response?.data?.message || 'Failed to resend verification email.');
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
                    <h2 className="login-card-title">Teacher Sign In</h2>
                    <p className="login-card-subtitle">Manage classrooms, assessments, and results</p>
                </div>
                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="login-error">
                            {error}
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
                        <label className="form-label">Email</label>
                        <input className="form-input" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
                    </div>
                    <div className="form-group">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <label className="form-label" style={{ marginBottom: 0 }}>Password</label>
                            <Link to="/forgot-password" style={{ fontSize: '0.875rem', color: 'var(--color-primary)', textDecoration: 'none' }}>Forgot Password?</Link>
                        </div>
                        <PasswordInput
                            className="form-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    <button className="btn btn-accent btn-lg btn-full" disabled={loading}>
                        {loading ? 'Signing in...' : 'Sign In'}
                    </button>
                </form>
                <div className="login-footer">
                    New teacher?{' '}
                    <Link to="/teacher/register">Create an account &rarr;</Link>
                </div>
            </div>
        </div>
    );
};

export default TeacherLogin;
