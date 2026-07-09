import React, { useState } from 'react';
import { Link, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth, PERMISSIONS } from '../../context/AuthContext';

interface AdminLayoutProps {
    children: React.ReactNode;
    title?: string;
}

const AdminLayout: React.FC<AdminLayoutProps> = ({ children, title }) => {
    const { user, logout, hasPermission, isSuperAdmin } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleLogout = () => {
        logout();
        navigate('/admin/login');
    };

    const closeSidebar = () => setSidebarOpen(false);

    // Permission-driven nav items — roles never shown in UI
    const navItems = [
        {
            label: 'Dashboard',
            path: '/admin/dashboard',
            show: hasPermission(PERMISSIONS.VIEW_DASHBOARD),
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                </svg>
            ),
        },
        {
            label: 'Students',
            path: '/admin/users',
            show: hasPermission(PERMISSIONS.MANAGE_STUDENTS),
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
            ),
        },
        {
            label: 'MCQ Bank',
            path: '/admin/mcqs',
            show: hasPermission(PERMISSIONS.MANAGE_MCQS),
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
            ),
        },
        {
            label: 'MCQ Types',
            path: '/admin/mcq-types',
            show: hasPermission(PERMISSIONS.MANAGE_MCQS),
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                    <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
            ),
        },
        {
            label: 'Quizzes',
            path: '/admin/quizzes',
            show: hasPermission(PERMISSIONS.MANAGE_QUIZZES),
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
            ),
        },
        {
            label: 'Category Quizzes',
            path: '/admin/category-quiz-configs',
            show: hasPermission(PERMISSIONS.MANAGE_QUIZZES),
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    <line x1="12" y1="11" x2="12" y2="17" />
                    <line x1="9" y1="14" x2="15" y2="14" />
                </svg>
            ),
        },
        {
            label: 'Results',
            path: '/admin/results',
            show: hasPermission(PERMISSIONS.VIEW_RESULTS),
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="20" x2="18" y2="10" />
                    <line x1="12" y1="20" x2="12" y2="4" />
                    <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
            ),
        },
        {
            label: 'Admin Accounts',
            path: '/admin/admins',
            show: isSuperAdmin,
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
            ),
        },
        {
            label: 'Teacher Management',
            path: '/admin/teachers',
            show: isSuperAdmin,
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5V6a2 2 0 0 1 2-2h12v16H6a2 2 0 0 1-2-2.5Z" />
                    <path d="M8 8h8" />
                    <path d="M8 12h5" />
                    <path d="M17 20v-4" />
                    <path d="M15 18h4" />
                </svg>
            ),
        },
        {
            label: 'Audit Logs',
            path: '/admin/audit-logs',
            show: isSuperAdmin,
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                </svg>
            ),
        },
        {
            label: 'Test Categories',
            path: '/admin/test-categories',
            show: isSuperAdmin,
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M4 12h16M4 17h10" />
                </svg>
            ),
        },
        {
            label: 'My Account',
            path: '/admin/me',
            show: isSuperAdmin,
            icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                </svg>
            ),
        },
    ];

    const visibleNavItems = navItems.filter(item => item.show);
    const currentTitle = title || visibleNavItems.find(n => location.pathname.startsWith(n.path))?.label || 'Admin Panel';

    return (
        <div className="admin-layout">
            {/* Mobile overlay — closes sidebar when clicked */}
            {sidebarOpen && (
                <div
                    className="sidebar-overlay"
                    onClick={closeSidebar}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar */}
            <aside className={`admin-sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
                <div className="sidebar-brand">
                    <Link to="/" className="logo-home-link" aria-label="ExamAssess home" title="ExamAssess home" onClick={closeSidebar}>
                        <img src="/images/site-logo.png" alt="ExamAssess" className="sidebar-brand-logo" />
                    </Link>
                    {/* Close button visible only on mobile inside the sidebar */}
                    <button
                        className="sidebar-close-btn"
                        onClick={closeSidebar}
                        aria-label="Close menu"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <nav className="sidebar-nav">
                    <div className="sidebar-section-label">Navigation</div>
                    {visibleNavItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) =>
                                `sidebar-nav-item ${isActive ? 'active' : ''}`
                            }
                            onClick={closeSidebar}
                        >
                            {item.icon}
                            {item.label}
                        </NavLink>
                    ))}
                </nav>

                <div className="sidebar-footer">
                    <button className="sidebar-nav-item" onClick={handleLogout} style={{ color: 'rgba(255,255,255,0.6)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Logout
                    </button>
                </div>
            </aside>

            {/* Main content */}
            <div className="admin-main">
                <header className="admin-topbar">
                    {/* Hamburger — only shown on mobile */}
                    <button
                        className="topbar-menu-btn"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open menu"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="6" x2="21" y2="6" />
                            <line x1="3" y1="12" x2="21" y2="12" />
                            <line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                    </button>

                    <h1 className="topbar-title">{currentTitle}</h1>

                    <div className="topbar-right">
                        <div className="topbar-user">
                            <div className="topbar-avatar">
                                {user?.username?.charAt(0).toUpperCase()}
                            </div>
                            <span className="topbar-username">{user?.username}</span>
                        </div>
                    </div>
                </header>
                <main className="admin-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
