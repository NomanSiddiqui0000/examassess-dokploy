import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import BackHomeButton from '../../components/BackHomeButton';
import HomeLogoLink from '../../components/HomeLogoLink';
import PasswordInput from '../../components/PasswordInput';

const TeacherRegister: React.FC = () => {
    const [form, setForm] = useState({ fullName: '', email: '', password: '' });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [registeredEmail, setRegisteredEmail] = useState('');
    const [registrationSuccess, setRegistrationSuccess] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await api.post('/auth/teacher/register', form);
            setRegisteredEmail(res.data.email || form.email.trim().toLowerCase());
            setRegistrationSuccess(true);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Registration failed');
        } finally {
            setLoading(false);
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
                        <h2 style={{ marginBottom: 8, color: 'var(--color-text-primary)' }}>Check Your Email</h2>
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24, lineHeight: 1.6 }}>
                            We sent a verification link to <strong>{registeredEmail}</strong>.
                            <br />Please verify your email before signing in.
                        </p>
                        <Link to="/teacher/login" className="btn btn-accent btn-lg" style={{ textDecoration: 'none', padding: '12px 36px' }}>
                            Go to Teacher Login
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
                    <h2 className="login-card-title">Teacher Registration</h2>
                    <p className="login-card-subtitle">Create your ExamAssess classroom workspace</p>
                </div>
                <form className="login-form" onSubmit={handleSubmit}>
                    {error && <div className="login-error">{error}</div>}
                    <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input className="form-input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input className="form-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
                    </div>
                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <PasswordInput
                            className="form-input"
                            minLength={6}
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                            required
                        />
                    </div>
                    <button className="btn btn-accent btn-lg btn-full" disabled={loading}>
                        {loading ? 'Creating...' : 'Create Account'}
                    </button>
                </form>
                <div className="login-footer">
                    Already a member? <Link to="/teacher/login">Sign in to continue &rarr;</Link>
                </div>
            </div>
        </div>
    );
};

export default TeacherRegister;
