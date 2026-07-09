import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, Permission } from '../context/AuthContext';

interface ProtectedRouteProps {
    children: React.ReactNode;
    /** 'admin' means any admin sub-role; 'user' means student role */
    requiredRole?: 'admin' | 'user' | 'teacher';
    /** Optional: specific permission required beyond role check */
    requiredPermission?: Permission;
    /** Optional: if true, allows unverified practice-only users to access */
    allowUnverified?: boolean;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
    children,
    requiredRole,
    requiredPermission,
    allowUnverified = false,
}) => {
    const { isAuthenticated, isAdmin, isUser, isTeacher, hasPermission, user } = useAuth();

    if (!isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    // Check if the student is unverified and has ONLY the practice module active
    const isUnverifiedPracticeOnly = isUser && 
        user?.modules?.practiceModule === true && 
        user?.emailVerified === false && 
        user?.modules?.teacherAssessments === false;

    if (isUnverifiedPracticeOnly && !allowUnverified) {
        return <Navigate to="/verify-email-pending" replace />;
    }

    if (!isUnverifiedPracticeOnly && allowUnverified) {
        return <Navigate to="/user/dashboard" replace />;
    }

    if (requiredRole === 'admin' && !isAdmin) {
        return <Navigate to="/" replace />;
    }

    if (requiredRole === 'user' && !isUser) {
        return <Navigate to="/" replace />;
    }

    if (requiredRole === 'teacher' && !isTeacher) {
        return <Navigate to="/" replace />;
    }

    if (requiredPermission && !hasPermission(requiredPermission)) {
        // Redirect to MCQ bank — accessible by ALL admin roles (avoids loop for Content Manager)
        return <Navigate to="/admin/mcqs" replace />;
    }

    return <>{children}</>;
};

export default ProtectedRoute;
