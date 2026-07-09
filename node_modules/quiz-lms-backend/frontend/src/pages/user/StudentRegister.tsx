import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import BackHomeButton from '../../components/BackHomeButton';
import HomeLogoLink from '../../components/HomeLogoLink';
import PasswordInput from '../../components/PasswordInput';

interface TestCategoryOption {
    _id: string;
    name: string;
}

const LockIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
);
const StudentRegister: React.FC = () => {
    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [testCategoryId, setTestCategoryId] = useState('');
    const [categories, setCategories] = useState<TestCategoryOption[]>([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [registrationSuccess, setRegistrationSuccess] = useState(false);
    const [moduleActivated, setModuleActivated] = useState(false);
    const [registeredEmail, setRegisteredEmail] = useState('');
    const [resending, setResending] = useState(false);
    const [resendMessage, setResendMessage] = useState('');
    const navigate = useNavigate();
    const { isAuthenticated, isUser, isAdmin } = useAuth();

    useEffect(() => {
        if (isAuthenticated) {
            navigate(isUser ? '/user/dashboard' : isAdmin ? '/admin/dashboard' : '/');
        }
    }, [isAuthenticated, isUser, isAdmin, navigate]);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                const res = await api.get('/auth/test-categories/public');
                setCategories(res.data);
            } catch {
                setError('Failed to load test categories');
            }
        };
        fetchCategories();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        if (!testCategoryId) {
            setError('Please select a test category');
            return;
        }

        setLoading(true);
        try {
            const res = await api.post('/auth/user/register', {
                fullName,
                email,
                password,
                testCategoryId,
            });
            setRegisteredEmail(res.data.email || email.trim().toLowerCase());
            // Handle both new registration and module activation for existing accounts
            if (res.data.moduleActivated) {
                setModuleActivated(true);
            }
            setRegistrationSuccess(true);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResending(true);
        setResendMessage('');
        try {
            const res = await api.post('/auth/resend-verification', { email: registeredEmail });
            setResendMessage(res.data.message || 'Verification email sent!');
        } catch (err: any) {
            setResendMessage(err.response?.data?.message || 'Failed to resend. Please try again.');
        } finally {
            setResending(false);
        }
    };

    if (registrationSuccess) {
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
                        <h2 style={{ marginBottom: 8, color: 'var(--color-text-primary)' }}>
                            {moduleActivated ? 'Practice Module Activated!' : 'Check Your Email'}
                        </h2>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                            {moduleActivated ? (
                                <>Your practice module has been activated for <strong>{registeredEmail}</strong>.<br />Please verify your email to access all features.</>
                            ) : (
                                <>We've sent a verification link to <strong>{registeredEmail}</strong>.<br />Please click the link to verify your account and log in.</>
                            )}
                        </p>
                        {resendMessage && (
                            <p style={{ color: 'var(--color-accent)', marginBottom: 16, fontSize: '0.9rem' }}>
                                {resendMessage}
                            </p>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                            <Link
                                to="/user/login"
                                className="btn btn-accent btn-lg"
                                style={{ display: 'inline-block', textDecoration: 'none', padding: '12px 36px', minWidth: 200 }}
                            >
                                Go to Login
                            </Link>
                            <button
                                className="btn btn-outline"
                                onClick={handleResend}
                                disabled={resending}
                                style={{ padding: '10px 24px', fontSize: '0.85rem' }}
                            >
                                {resending ? 'Sending...' : 'Resend Verification Email'}
                            </button>
                        </div>
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
                    <h2 className="login-card-title">Student Registration</h2>
                    <p className="login-card-subtitle">Create your account to get started</p>
                </div>

                <form className="login-form" onSubmit={handleSubmit}>
                    {error && (
                        <div className="login-error">
                            <strong>Error:</strong> {error}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <div className="login-input-group">
                            <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                            <input
                                id="reg-fullname"
                                type="text"
                                className="login-input"
                                placeholder="Enter your full name"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Email Address</label>
                        <div className="login-input-group">
                            <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                                <polyline points="22,6 12,13 2,6" />
                            </svg>
                            <input
                                id="reg-email"
                                type="email"
                                className="login-input"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Test Category</label>
                        <div className="login-input-group">
                            <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                            </svg>
                            <select
                                id="reg-category"
                                className="login-input"
                                value={testCategoryId}
                                onChange={(e) => setTestCategoryId(e.target.value)}
                                required
                            >
                                <option value="">Select a test category</option>
                                {categories.map((cat) => (
                                    <option key={cat._id} value={cat._id}>
                                        {cat.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <PasswordInput
                            id="reg-password"
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
                        <label className="form-label">Confirm Password</label>
                        <PasswordInput
                            id="reg-confirm-password"
                            className="login-input"
                            leadingIcon={<LockIcon />}
                            placeholder="Re-enter your password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                        />
                    </div>

                    <button
                        id="register-btn"
                        type="submit"
                        className="btn btn-accent btn-lg btn-full"
                        disabled={loading}
                        style={{ marginTop: '8px' }}
                    >
                        {loading ? (
                            <>
                                <div className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                                Creating Account...
                            </>
                        ) : (
                            'Create Account'
                        )}
                    </button>
                </form>

                <div className="login-footer">
                    <div style={{ marginBottom: '1rem' }}>
                        Already a member? <Link to="/user/login">Sign in to continue &rarr;</Link>
                    </div>
                    <div style={{ color: 'var(--color-text-secondary)' }}>
                        Registering as a teacher? <Link to="/teacher/register">Teacher Registration</Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default StudentRegister;
