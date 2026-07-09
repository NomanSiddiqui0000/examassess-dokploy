import React, { createContext, useContext, useState } from 'react';
import { User, AdminSubRole } from '../types';

// ─── Permission Definitions (mirrors backend) ─────────────────────────────────

export const PERMISSIONS = {
    MANAGE_ADMINS: 'manage_admins',
    MANAGE_STUDENTS: 'manage_students',
    MANAGE_QUIZZES: 'manage_quizzes',
    VIEW_RESULTS: 'view_results',
    MANAGE_MCQS: 'manage_mcqs',
    VIEW_DASHBOARD: 'view_dashboard',
    MANAGE_OWN_CREDENTIALS: 'manage_own_credentials',
    VIEW_AUDIT_LOGS: 'view_audit_logs',
    MANAGE_TEST_CATEGORIES: 'manage_test_categories',
    MANAGE_CREDITS: 'manage_credits',
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

const ROLE_PERMISSIONS: Record<AdminSubRole, Permission[]> = {
    super_admin: [
        PERMISSIONS.MANAGE_ADMINS,
        PERMISSIONS.MANAGE_STUDENTS,
        PERMISSIONS.MANAGE_QUIZZES,
        PERMISSIONS.VIEW_RESULTS,
        PERMISSIONS.MANAGE_MCQS,
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.MANAGE_OWN_CREDENTIALS,
        PERMISSIONS.VIEW_AUDIT_LOGS,
        PERMISSIONS.MANAGE_TEST_CATEGORIES,
        PERMISSIONS.MANAGE_CREDITS,
    ],
    admin: [
        PERMISSIONS.MANAGE_STUDENTS,
        PERMISSIONS.MANAGE_QUIZZES,
        PERMISSIONS.VIEW_RESULTS,
        PERMISSIONS.MANAGE_MCQS,
        PERMISSIONS.VIEW_DASHBOARD,
        PERMISSIONS.MANAGE_CREDITS,
    ],
    content_manager: [
        PERMISSIONS.MANAGE_MCQS,
    ],
};

// ─── Context Type ─────────────────────────────────────────────────────────────

interface AuthContextType {
    user: User | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    isAuthenticated: boolean;
    /** True for any admin sub-role */
    isAdmin: boolean;
    isSuperAdmin: boolean;
    isContentManager: boolean;
    isUser: boolean;
    isTeacher: boolean;
    hasPermission: (permission: Permission) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(() => {
        const stored = localStorage.getItem('user');
        return stored ? JSON.parse(stored) : null;
    });

    const login = (token: string, userData: User) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    const hasPermission = (permission: Permission): boolean => {
        const role = user?.role;
        if (!role || role === 'user' || role === 'teacher') return false;
        return ROLE_PERMISSIONS[role as AdminSubRole]?.includes(permission) ?? false;
    };


    const value: AuthContextType = {
        user,
        login,
        logout,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'super_admin' || user?.role === 'admin' || user?.role === 'content_manager',
        isSuperAdmin: user?.role === 'super_admin',
        isContentManager: user?.role === 'content_manager',
        isUser: user?.role === 'user',
        isTeacher: user?.role === 'teacher',
        hasPermission,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
};
