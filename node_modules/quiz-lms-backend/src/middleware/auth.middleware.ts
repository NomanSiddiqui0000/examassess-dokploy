import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, AdminSubRole, UserRole } from '../models/User';


// ─── Permission Definitions ───────────────────────────────────────────────────

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

export function roleHasPermission(role: AdminSubRole, permission: Permission): boolean {
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

// ─── Auth Request Type ────────────────────────────────────────────────────────

export interface AuthRequest extends Request {
    user?: {
        id: string;
        username: string;
        role: UserRole;
    };
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export const authenticate = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];

        if (!token) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
            id: string;
            username: string;
            role: UserRole;
        };

        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
};

/** Any admin sub-role (super_admin | admin | content_manager) */
export const requireAdmin = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const role = req.user?.role;
    if (role !== 'super_admin' && role !== 'admin' && role !== 'content_manager') {
        return res.status(403).json({ message: 'Admin access required' });
    }
    next();
};

/** Super Admin only */
export const requireSuperAdmin = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (req.user?.role !== 'super_admin') {
        return res.status(403).json({ message: 'Super Admin access required' });
    }
    next();
};

/** Student/user role only */
export const requireUser = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (req.user?.role !== 'user') {
        return res.status(403).json({ message: 'User access required' });
    }
    next();
};

/** Teacher role only */
export const requireTeacher = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    if (req.user?.role !== 'teacher') {
        return res.status(403).json({ message: 'Teacher access required' });
    }
    next();
};

/** Permission-based middleware factory */
export const requirePermission = (permission: Permission) => {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
        const role = req.user?.role as AdminSubRole | undefined;
        if (!role || !roleHasPermission(role, permission)) {
            return res.status(403).json({
                message: `Permission denied: ${permission} required`,
            });
        }
        next();
    };
};

/**
 * Enforces email verification for student users who have the practice module activated.
 */
export const requireVerifiedEmailIfPractice = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
) => {
    try {
        if (!req.user) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Student with active practice module must have emailVerified set to true
        if (user.role === 'user' && user.modules?.practiceModule === true && !user.emailVerified) {
            return res.status(403).json({
                errorCode: 'EMAIL_NOT_VERIFIED',
                message: 'Please verify your email address before accessing the Practice Module.',
                email: user.email,
            });
        }

        next();
    } catch (error) {
        console.error('requireVerifiedEmailIfPractice middleware error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

