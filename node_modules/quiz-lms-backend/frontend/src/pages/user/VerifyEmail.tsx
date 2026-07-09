import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import api from '../../utils/api';
import HomeLogoLink from '../../components/HomeLogoLink';

const VerifyEmail: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');
    const [userRole, setUserRole] = useState<string>('user');
    const hasCalledRef = useRef(false);

    const loginPath = userRole === 'teacher' ? '/teacher/login' : '/user/login';
    const registerPath = userRole === 'teacher' ? '/teacher/register' : '/user/register';

    useEffect(() => {
        // Prevent React Strict Mode from firing this twice
        if (hasCalledRef.current) return;
        hasCalledRef.current = true;

        const token = searchParams.get('token');
        if (!token) {
            setStatus('error');
            setMessage('No verification token provided.');
            return;
        }

        api.get(`/auth/verify-email?token=${token}`)
            .then(res => {
                setStatus('success');
                setMessage(res.data.message || 'Email successfully verified!');
                if (res.data.role) setUserRole(res.data.role);
            })
            .catch(err => {
                setStatus('error');
                setMessage(err.response?.data?.message || 'Verification failed. The link may be invalid or expired.');
            });
    }, [searchParams]);

    return (
        <div className="login-page-centered">
            <div className="login-card" style={{ textAlign: 'center' }}>
                <div className="login-card-header">
                    <HomeLogoLink imgClassName="login-card-logo" />
                </div>

                {status === 'loading' && (
                    <div style={{ padding: '40px 24px' }}>
                        <div className="loading-spinner" style={{ width: 40, height: 40, margin: '0 auto 16px' }} />
                        <p style={{ color: 'var(--color-text-secondary)' }}>Verifying your email...</p>
                    </div>
                )}

                {status === 'success' && (
                    <div style={{ padding: '32px 24px' }}>
                        <div className="auth-status-icon success" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="m8 12 3 3 5-6" />
                            </svg>
                        </div>
                        <h2 style={{ marginBottom: 8, color: 'var(--color-text-primary)' }}>Email Verified!</h2>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                            {message}
                        </p>
                        <Link
                            to={loginPath}
                            className="btn btn-accent btn-lg"
                            style={{ display: 'inline-block', textDecoration: 'none', padding: '12px 36px' }}
                        >
                            Sign In Now
                        </Link>
                    </div>
                )}

                {status === 'error' && (
                    <div style={{ padding: '32px 24px' }}>
                        <div className="auth-status-icon danger" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <line x1="15" y1="9" x2="9" y2="15" />
                                <line x1="9" y1="9" x2="15" y2="15" />
                            </svg>
                        </div>
                        <h2 style={{ marginBottom: 8, color: 'var(--color-text-primary)' }}>Verification Failed</h2>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                            {message}
                        </p>
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
                            <Link
                                to={loginPath}
                                className="btn btn-accent"
                                style={{ textDecoration: 'none', padding: '10px 24px' }}
                            >
                                Go to Login
                            </Link>
                            <Link
                                to={registerPath}
                                className="btn btn-outline"
                                style={{ textDecoration: 'none', padding: '10px 24px' }}
                            >
                                Register Again
                            </Link>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VerifyEmail;
