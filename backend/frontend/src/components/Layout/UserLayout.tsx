import React, { useState, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import HomeLogoLink from '../HomeLogoLink';
import api from '../../utils/api';

interface UserLayoutProps {
    children: React.ReactNode;
}

const UserLayout: React.FC<UserLayoutProps> = ({ children }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [modules, setModules] = useState({
        practiceModule: user?.modules?.practiceModule ?? true,
        teacherAssessments: user?.modules?.teacherAssessments ?? false,
    });
    const [emailVerified, setEmailVerified] = useState(user?.emailVerified ?? false);

    // Fetch profile to get latest module and verification state
    useEffect(() => {
        api.get('/user/profile')
            .then((res) => {
                if (res.data.modules) {
                    setModules(res.data.modules);
                }
                if (res.data.emailVerified !== undefined) {
                    setEmailVerified(res.data.emailVerified);
                }
            })
            .catch(() => {});
    }, []);

    const handleLogout = () => {
        logout();
        navigate('/user/login');
    };

    const hasPractice = modules.practiceModule && emailVerified;

    return (
        <div className="user-layout">
            <header className="user-topbar">
                <div className="user-topbar-brand">
                    <HomeLogoLink imgClassName="user-topbar-logo" />
                </div>

                <nav className="user-topbar-nav">
                    <NavLink
                        to="/user/dashboard"
                        className={({ isActive }) =>
                            `user-nav-link${isActive ? ' active' : ''}`
                        }
                    >
                        Dashboard
                    </NavLink>
                    <NavLink
                        to="/user/results"
                        className={({ isActive }) =>
                            `user-nav-link${isActive ? ' active' : ''}`
                        }
                    >
                        My Results
                    </NavLink>
                    {hasPractice && (
                        <>
                            <NavLink
                                to="/user/bookmarks"
                                className={({ isActive }) =>
                                    `user-nav-link${isActive ? ' active' : ''}`
                                }
                            >
                                Bookmarks
                            </NavLink>
                            <NavLink
                                to="/user/mistakes"
                                className={({ isActive }) =>
                                    `user-nav-link${isActive ? ' active' : ''}`
                                }
                            >
                                Mistake Book
                            </NavLink>
                            <NavLink
                                to="/user/reports"
                                className={({ isActive }) =>
                                    `user-nav-link${isActive ? ' active' : ''}`
                                }
                            >
                                Performance
                            </NavLink>
                        </>
                    )}
                </nav>

                <div className="user-topbar-right">
                    <span className="user-topbar-username">
                        <span className="user-topbar-username-text">{user?.fullName || user?.username}</span>
                    </span>
                    <button
                        className="btn btn-accent btn-sm user-logout-btn"
                        onClick={handleLogout}
                    >
                        Logout
                    </button>
                </div>
            </header>
            <main className="user-content">
                {children}
            </main>
        </div>
    );
};

export default UserLayout;
