import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { User, AdminSubRole } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth.middleware';

// ─── Helper: Create Audit Log ─────────────────────────────────────────────────

async function createAuditLog(
    actor: AuthRequest['user'],
    action: string,
    targetId?: string,
    targetUsername?: string,
    details?: Record<string, any>,
    req?: AuthRequest
) {
    try {
        await AuditLog.create({
            actor: actor!.id,
            actorUsername: actor!.username,
            action,
            targetUser: targetId || undefined,
            targetUsername: targetUsername || undefined,
            details,
            ipAddress: req?.ip,
            timestamp: new Date(),
        });
    } catch (err) {
        console.error('Audit log error:', err);
    }
}

// ─── Get All Admin Accounts ───────────────────────────────────────────────────

export const getAllAdmins = async (req: AuthRequest, res: Response) => {
    try {
        const admins = await User.find({
            role: { $in: ['super_admin', 'admin', 'content_manager'] },
        })
            .select('-password')
            .sort({ createdAt: -1 });

        res.json(admins);
    } catch (error) {
        console.error('Get admins error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Create Admin Account ─────────────────────────────────────────────────────

export const createAdminAccount = async (req: AuthRequest, res: Response) => {
    try {
        const { username, password, role } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ message: 'Username, password, and role are required' });
        }

        // Only allow creating admin or content_manager — never super_admin via API
        const allowedRoles: AdminSubRole[] = ['admin', 'content_manager'];
        if (!allowedRoles.includes(role)) {
            return res.status(400).json({ message: 'Role must be admin or content_manager' });
        }

        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }

        const existing = await User.findOne({ username: username.trim() });
        if (existing) {
            return res.status(409).json({ message: 'Username already taken' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newAdmin = await User.create({
            username: username.trim(),
            password: hashedPassword,
            role,
            isActive: true,
            mustChangePassword: true,
        });

        await createAuditLog(
            req.user,
            'CREATE_ADMIN',
            (newAdmin._id as any).toString(),
            newAdmin.username,
            { role },
            req
        );

        res.status(201).json({
            message: 'Admin account created successfully',
            admin: {
                id: newAdmin._id,
                username: newAdmin.username,
                role: newAdmin.role,
                isActive: newAdmin.isActive,
                mustChangePassword: newAdmin.mustChangePassword,
            },
        });
    } catch (error) {
        console.error('Create admin error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Update Admin Account ─────────────────────────────────────────────────────

export const updateAdminAccount = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { username, role, isActive } = req.body;

        const target = await User.findById(id);
        if (!target) {
            return res.status(404).json({ message: 'Admin account not found' });
        }

        // Cannot modify another super_admin
        if (target.role === 'super_admin' && target._id.toString() !== req.user!.id) {
            return res.status(403).json({ message: 'Cannot modify another Super Admin account' });
        }

        // Cannot change role to super_admin
        if (role === 'super_admin') {
            return res.status(400).json({ message: 'Cannot assign Super Admin role via this endpoint' });
        }

        const changes: Record<string, any> = {};

        if (username && username.trim() !== target.username) {
            const existing = await User.findOne({ username: username.trim() });
            if (existing) {
                return res.status(409).json({ message: 'Username already taken' });
            }
            changes.previousUsername = target.username;
            target.username = username.trim();
        }

        if (role && ['admin', 'content_manager'].includes(role)) {
            changes.previousRole = target.role;
            target.role = role;
        }

        if (isActive !== undefined) {
            changes.previousIsActive = target.isActive;
            target.isActive = isActive;
        }

        await target.save();

        await createAuditLog(
            req.user,
            'UPDATE_ADMIN',
            (target._id as any).toString(),
            target.username,
            changes,
            req
        );

        res.json({
            message: 'Admin account updated',
            admin: {
                id: target._id,
                username: target.username,
                role: target.role,
                isActive: target.isActive,
            },
        });
    } catch (error) {
        console.error('Update admin error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Delete Admin Account ─────────────────────────────────────────────────────

export const deleteAdminAccount = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        // Cannot delete self
        if (id === req.user!.id) {
            return res.status(400).json({ message: 'Cannot delete your own account' });
        }

        const target = await User.findById(id);
        if (!target) {
            return res.status(404).json({ message: 'Admin account not found' });
        }

        // Cannot delete another super_admin
        if (target.role === 'super_admin') {
            return res.status(403).json({ message: 'Cannot delete a Super Admin account' });
        }

        await User.findByIdAndDelete(id);

        await createAuditLog(
            req.user,
            'DELETE_ADMIN',
            id,
            target.username,
            { role: target.role },
            req
        );

        res.json({ message: 'Admin account deleted' });
    } catch (error) {
        console.error('Delete admin error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Reset Admin Password (by Super Admin) ────────────────────────────────────

export const resetAdminPassword = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ message: 'New password must be at least 8 characters' });
        }

        const target = await User.findById(id);
        if (!target) {
            return res.status(404).json({ message: 'Admin account not found' });
        }

        // Cannot reset another super_admin's password
        if (target.role === 'super_admin' && target._id.toString() !== req.user!.id) {
            return res.status(403).json({ message: 'Cannot reset another Super Admin\'s password' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        target.password = hashedPassword;
        target.mustChangePassword = true;
        target.lastPasswordChange = new Date();
        await target.save();

        await createAuditLog(
            req.user,
            'RESET_ADMIN_PASSWORD',
            (target._id as any).toString(),
            target.username,
            {},
            req
        );

        res.json({ message: 'Password reset successfully. User must change password on next login.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Change Own Password (Super Admin self-service) ───────────────────────────

export const changeSelfPassword = async (req: AuthRequest, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ message: 'Current and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ message: 'New password must be at least 8 characters' });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ message: 'New password must be different from current password' });
        }

        const user = await User.findById(req.user!.id);
        if (!user) {
            return res.status(404).json({ message: 'Account not found' });
        }

        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        user.password = hashedPassword;
        user.mustChangePassword = false;
        user.lastPasswordChange = new Date();
        await user.save();

        await createAuditLog(
            req.user,
            'CHANGE_OWN_PASSWORD',
            req.user!.id,
            req.user!.username,
            {},
            req
        );

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Change Own Username (Super Admin self-service) ───────────────────────────

export const changeSelfUsername = async (req: AuthRequest, res: Response) => {
    try {
        const { newUsername, currentPassword } = req.body;

        if (!newUsername || !currentPassword) {
            return res.status(400).json({ message: 'New username and current password are required' });
        }

        const trimmedUsername = newUsername.trim();
        if (trimmedUsername.length < 3) {
            return res.status(400).json({ message: 'Username must be at least 3 characters' });
        }

        const user = await User.findById(req.user!.id);
        if (!user) {
            return res.status(404).json({ message: 'Account not found' });
        }

        // Re-authenticate
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        // Uniqueness check
        if (trimmedUsername === user.username) {
            return res.status(400).json({ message: 'New username must be different from current username' });
        }

        const existing = await User.findOne({ username: trimmedUsername });
        if (existing) {
            return res.status(409).json({ message: 'Username already taken' });
        }

        const previousUsername = user.username;
        user.username = trimmedUsername;
        await user.save();

        await createAuditLog(
            req.user,
            'CHANGE_OWN_USERNAME',
            req.user!.id,
            trimmedUsername,
            { previousUsername },
            req
        );

        res.json({
            message: 'Username changed successfully. Please log in again with your new username.',
            newUsername: trimmedUsername,
        });
    } catch (error) {
        console.error('Change username error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Get Audit Logs ───────────────────────────────────────────────────────────

export const getAuditLogs = async (req: AuthRequest, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            AuditLog.find()
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(),
        ]);

        res.json({
            logs,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error('Get audit logs error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
