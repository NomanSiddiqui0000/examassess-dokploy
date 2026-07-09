import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Homepage.css';

const useCountUp = (end: number, duration = 1200) => {
    const [count, setCount] = useState(0);
    const ref = useRef<HTMLSpanElement>(null);
    const started = useRef(false);

    useEffect(() => {
        if (started.current) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting && !started.current) {
                    started.current = true;
                    const startTime = performance.now();
                    const step = (now: number) => {
                        const progress = Math.min((now - startTime) / duration, 1);
                        const eased = 1 - (1 - progress) * (1 - progress);
                        setCount(Math.round(eased * end));
                        if (progress < 1) requestAnimationFrame(step);
                    };
                    requestAnimationFrame(step);
                }
            },
            { threshold: 0.3 }
        );
        if (ref.current) observer.observe(ref.current);
        return () => observer.disconnect();
    }, [end, duration]);

    return { count, ref };
};

const WHATSAPP_LINK =
    'https://wa.me/923154832988?text=Hello%2C%20I%20need%20support%20for%20ExamAssess.';

const Homepage: React.FC = () => {
    const { user, logout, isAuthenticated, isTeacher, isAdmin } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [activeSection, setActiveSection] = useState('hero');

    const avgScore = useCountUp(80);
    const attempts = useCountUp(10);
    const improvement = useCountUp(40);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 10);
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        const ids = ['hero', 'categories', 'how', 'performance', 'contact'];
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) setActiveSection(entry.target.id);
                });
            },
            { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
        );
        ids.forEach((id) => {
            const el = document.getElementById(id);
            if (el) observer.observe(el);
        });
        return () => observer.disconnect();
    }, []);

    const scrollTo = (id: string) => {
        setMenuOpen(false);
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    };

    const displayName = user?.fullName || user?.username || user?.email || 'User';
    const userInitial = displayName.charAt(0).toUpperCase();
    const dashboardPath = isTeacher ? '/teacher/dashboard' : isAdmin ? '/admin/dashboard' : '/user/dashboard';

    const handleLogout = () => {
        logout();
        setMenuOpen(false);
    };

    const navLinks = [
        { label: 'Home', id: 'hero' },
        { label: 'Solutions', id: 'categories' },
        { label: 'How It Works', id: 'how' },
        { label: 'Analytics', id: 'performance' },
        { label: 'Contact', id: 'contact' },
    ];

    return (
        <div className="hp-page">
            <header className={`hp-header${scrolled ? ' scrolled' : ''}`}>
                <div className="hp-container hp-header-inner">
                    <Link to="/" className="hp-logo" onClick={() => scrollTo('hero')}>
                        <img src="/images/site-logo.png" alt="ExamAssess Logo" />
                    </Link>

                    <nav className="hp-nav">
                        {navLinks.map((link) => (
                            <a
                                key={link.id}
                                href={`#${link.id}`}
                                className={`hp-nav-link${activeSection === link.id ? ' active' : ''}`}
                                onClick={(e) => { e.preventDefault(); scrollTo(link.id); }}
                            >
                                {link.label}
                            </a>
                        ))}
                    </nav>

                    {isAuthenticated ? (
                        <div className="hp-header-actions hp-auth-actions">
                            <Link to={dashboardPath} className="hp-user-chip" title={displayName}>
                                <span className="hp-user-avatar">{userInitial}</span>
                                <span className="hp-user-name">{displayName}</span>
                            </Link>
                            <Link to={dashboardPath} className="hp-btn hp-btn-blue-outline hp-btn-sm">Dashboard</Link>
                            <button type="button" className="hp-btn hp-btn-orange hp-btn-sm" onClick={handleLogout}>Logout</button>
                        </div>
                    ) : (
                        <div className="hp-header-actions">
                            <Link to="/user/login" className="hp-btn hp-btn-blue hp-btn-sm">Login</Link>
                            <Link to="/user/register" className="hp-btn hp-btn-blue-outline hp-btn-sm">Register</Link>
                            <Link to="/teacher/register" className="hp-btn hp-btn-blue-outline hp-btn-sm">Teacher Registration</Link>
                        </div>
                    )}

                    <button className="hp-hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                    </button>
                </div>
            </header>

            <div className={`hp-mobile-menu${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)}>
                <div className="hp-mobile-menu-panel" onClick={(e) => e.stopPropagation()}>
                    <button className="hp-mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                    <nav className="hp-mobile-nav">
                        {navLinks.map((link) => (
                            <a
                                key={link.id}
                                href={`#${link.id}`}
                                className="hp-nav-link"
                                onClick={(e) => { e.preventDefault(); scrollTo(link.id); }}
                            >
                                {link.label}
                            </a>
                        ))}
                    </nav>
                    {isAuthenticated ? (
                        <div className="hp-mobile-actions">
                            <Link to={dashboardPath} className="hp-mobile-user-card" onClick={() => setMenuOpen(false)}>
                                <span className="hp-user-avatar">{userInitial}</span>
                                <span>
                                    <span className="hp-mobile-user-label">Signed in as</span>
                                    <strong>{displayName}</strong>
                                </span>
                            </Link>
                            <Link to={dashboardPath} className="hp-btn hp-btn-blue-outline" onClick={() => setMenuOpen(false)}>Dashboard</Link>
                            <button type="button" className="hp-btn hp-btn-orange" onClick={handleLogout}>Logout</button>
                        </div>
                    ) : (
                        <div className="hp-mobile-actions">
                            <Link to="/user/login" className="hp-btn hp-btn-blue" onClick={() => setMenuOpen(false)}>Login</Link>
                            <Link to="/user/register" className="hp-btn hp-btn-blue-outline" onClick={() => setMenuOpen(false)}>Register</Link>
                            <Link to="/teacher/register" className="hp-btn hp-btn-blue-outline" onClick={() => setMenuOpen(false)}>Teacher Registration</Link>
                        </div>
                    )}
                </div>
            </div>

            <section id="hero" className="hp-hero">
                <div className="hp-container hp-hero-grid">
                    <div>
                        <div className="hp-hero-badge">
                            <span></span> Online Assessment Platform
                        </div>
                        <h1>
                            Smart Practice.<br />
                            <span className="hp-highlight">Real Results.</span> Future Ready.
                        </h1>
                        <p className="hp-hero-sub">
                            A scalable assessment and classroom testing platform for educational institutions,
                            academies, training centers, and independent learners.
                        </p>
                        <p className="hp-hero-mention">
                            Build quizzes, schedule assessments, manage classrooms, and track performance from one flexible workspace.
                        </p>
                        <div className="hp-hero-actions">
                            <Link to="/user/register" className="hp-btn hp-btn-orange hp-btn-hero">Create Student Account</Link>
                            <a href="#categories" className="hp-btn hp-btn-blue-outline" onClick={(e) => { e.preventDefault(); scrollTo('categories'); }}>
                                Explore Platform Uses
                            </a>
                        </div>
                    </div>

                    <div className="hp-preview hp-fadein">
                        <div className="hp-analytics">
                            <div className="hp-analytics-header">
                                <div className="hp-analytics-dot"></div>
                                <span>Performance Analytics</span>
                            </div>
                            <div className="hp-summary-row">
                                <div className="hp-summary-item">
                                    <span className="hp-summary-label">Avg. Score</span>
                                    <span className="hp-summary-value hp-val-blue" ref={avgScore.ref}>{avgScore.count}%</span>
                                </div>
                                <div className="hp-summary-item">
                                    <span className="hp-summary-label">Attempts</span>
                                    <span className="hp-summary-value hp-val-blue" ref={attempts.ref}>{attempts.count}</span>
                                </div>
                                <div className="hp-summary-item">
                                    <span className="hp-summary-label">Improvement</span>
                                    <span className="hp-summary-value hp-val-green" ref={improvement.ref}>+{improvement.count}%</span>
                                </div>
                            </div>
                            <div className="hp-chart-section">
                                <div className="hp-chart-label">Improvement Progress</div>
                                <div className="hp-bar-chart">
                                    {[
                                        ['Q1', '60%', false],
                                        ['Q2', '75%', true],
                                        ['Q3', '55%', false],
                                        ['Q4', '90%', true],
                                        ['Q5', '82%', false],
                                    ].map(([label, height, accent]) => (
                                        <div className="hp-bar-col" key={label as string}>
                                            <div className={`hp-bar${accent ? ' hp-bar-accent' : ''}`} style={{ height: height as string }} />
                                            <span>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section id="categories" className="hp-section hp-section-alt">
                <div className="hp-container">
                    <h2 className="hp-section-title">Assessment Workflows for Every Learning Setting</h2>
                    <p className="hp-section-desc">
                        Run structured testing for admission preparation, academic courses, classroom checkpoints,
                        competitive exam practice, and training evaluations.
                    </p>

                    <div className="hp-cat-grid">
                        <div className="hp-cat-card">
                            <div className="hp-cat-icon blue">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                                </svg>
                            </div>
                            <div className="hp-cat-name">Admission Tests</div>
                            <p className="hp-cat-desc">Create category-wise practice and screening assessments for applicants and independent learners.</p>
                        </div>

                        <div className="hp-cat-card">
                            <div className="hp-cat-icon orange">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c0 1.1 2.7 2 6 2s6-.9 6-2v-5" />
                                </svg>
                            </div>
                            <div className="hp-cat-name">Classroom Assessments</div>
                            <p className="hp-cat-desc">Let teachers schedule secure tests, invite students, track attendance, and release results when ready.</p>
                        </div>

                        <div className="hp-cat-card">
                            <div className="hp-cat-icon teal">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                            </div>
                            <div className="hp-cat-name">Training Evaluations</div>
                            <p className="hp-cat-desc">Support academies, colleges, training centers, and organizations with reusable MCQ-based evaluations.</p>
                        </div>
                    </div>

                    <p className="hp-cat-note">
                        Flexible enough for practice mode, scheduled assessments, institutional testing, and performance analytics.
                    </p>
                </div>
            </section>

            <section id="how" className="hp-section">
                <div className="hp-container">
                    <h2 className="hp-section-title">How ExamAssess Works</h2>
                    <p className="hp-section-desc">A simple, structured approach to assessment management.</p>

                    <div className="hp-steps">
                        <div className="hp-step">
                            <div className="hp-step-num">1</div>
                            <h3>Register &amp; Organize</h3>
                            <p>Register as a learner or teacher and choose the assessment workflow that fits your setting.</p>
                        </div>
                        <div className="hp-step">
                            <div className="hp-step-num">2</div>
                            <h3>Create &amp; Attempt</h3>
                            <p>Build MCQ banks, generate quizzes, schedule assessments, and complete attempts securely.</p>
                        </div>
                        <div className="hp-step">
                            <div className="hp-step-num">3</div>
                            <h3>Review &amp; Improve</h3>
                            <p>Review results, attendance, rankings, and trends to improve learning outcomes over time.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section id="performance" className="hp-section">
                <div className="hp-container">
                    <h2 className="hp-section-title">Track Performance with Clarity</h2>
                    <p className="hp-section-desc">
                        Every attempt can feed meaningful analytics for learners, teachers, and administrators.
                    </p>

                    <div className="hp-perf-grid">
                        {[
                            ['Score Percentage', 'Measure scores across quizzes, classrooms, and assessment windows.'],
                            ['Correct & Incorrect', 'Review answer accuracy and identify weak areas after assessments.'],
                            ['Attempt History', 'Maintain a clear history of submitted work and performance records.'],
                            ['Performance Trends', 'Compare attendance, averages, pass rates, and improvement over time.'],
                        ].map(([title, description]) => (
                            <div className="hp-perf-card" key={title}>
                                <div className="hp-perf-icon">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                                    </svg>
                                </div>
                                <div>
                                    <h4>{title}</h4>
                                    <p>{description}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section id="contact" className="hp-cta">
                <div className="hp-container">
                    <h2>Need Assistance?</h2>
                    <p>Get in touch with us directly on WhatsApp for quick support.</p>
                    <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" className="hp-btn hp-btn-whatsapp">
                        Chat with Us on WhatsApp
                    </a>
                </div>
            </section>

            <footer className="hp-footer">
                <div className="hp-container">
                    <div className="hp-footer-grid">
                        <div>
                            <div className="hp-footer-brand">
                                <img src="/images/footer-logo.png" alt="ExamAssess Logo" />
                            </div>
                            <p>
                                A scalable assessment and classroom testing platform for educational institutions,
                                academies, training centers, and independent learners.
                            </p>
                        </div>

                        <div>
                            <h4>Platform</h4>
                            <ul className="hp-footer-links">
                                <li><a href="#categories" onClick={(e) => { e.preventDefault(); scrollTo('categories'); }}>Platform Uses</a></li>
                                <li><a href="#how" onClick={(e) => { e.preventDefault(); scrollTo('how'); }}>How It Works</a></li>
                                <li><a href="#performance" onClick={(e) => { e.preventDefault(); scrollTo('performance'); }}>Analytics</a></li>
                            </ul>
                        </div>

                        <div>
                            <h4>Account</h4>
                            <ul className="hp-footer-links">
                                <li><Link to="/user/login">Student Login</Link></li>
                                <li><Link to="/user/register">Student Registration</Link></li>
                                <li><Link to="/teacher/register">Teacher Registration</Link></li>
                                <li><Link to="/teacher/login">Teacher Login</Link></li>
                                <li><a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer">Contact Support</a></li>
                            </ul>
                        </div>
                    </div>

                    <div className="hp-footer-bottom">
                        &copy; {new Date().getFullYear()} ExamAssess. All rights reserved.
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default Homepage;
