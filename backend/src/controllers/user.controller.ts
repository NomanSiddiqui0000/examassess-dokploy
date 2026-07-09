import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { TestCategory } from '../models/TestCategory';
import { CreditLog } from '../models/CreditLog';
import { AuthRequest } from '../middleware/auth.middleware';

import { ClassroomStudent } from '../models/ClassroomStudent';
import { AssessmentAttempt } from '../models/AssessmentAttempt';

export const createUser = async (req: AuthRequest, res: Response) => {
    try {
        const { username, password, testCategoryId, credits: manualCredits } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Determine credits: use manual override only if explicitly set to a positive value,
        // otherwise use category's defaultCredits
        let assignedCredits = 0;
        let categoryRef: any = undefined;

        if (testCategoryId) {
            const category = await TestCategory.findById(testCategoryId);
            if (!category || !category.isActive) {
                return res.status(400).json({ message: 'Invalid or inactive test category' });
            }
            categoryRef = category._id;
            // Only override category defaults if admin explicitly provides a positive credit value
            assignedCredits = (manualCredits !== undefined && manualCredits !== null && Number(manualCredits) > 0)
                ? Number(manualCredits)
                : category.defaultCredits;
        } else if (manualCredits !== undefined && manualCredits !== null && Number(manualCredits) > 0) {
            assignedCredits = Number(manualCredits);
        }

        const user = await User.create({
            username,
            password: hashedPassword,
            role: 'user',
            isActive: true,
            testCategory: categoryRef,
            credits: assignedCredits,
        });

        // Log initial credit assignment if credits > 0
        if (assignedCredits > 0) {
            await CreditLog.create({
                userId: user._id,
                action: 'initial_assignment',
                amount: assignedCredits,
                balanceAfter: assignedCredits,
                performedBy: req.user!.id,
                reason: 'Admin-created student account',
                timestamp: new Date(),
            });
        }

        res.status(201).json({
            message: 'User created successfully',
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                isActive: user.isActive,
                testCategory: user.testCategory,
                credits: user.credits,
            },
        });
    } catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getAllUsers = async (req: AuthRequest, res: Response) => {
    try {
        const users = await User.find({ role: 'user' })
            .select('-password')
            .populate('testCategory', 'name defaultCredits');
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateUser = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { username, password, isActive } = req.body;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.role !== 'user') {
            return res.status(400).json({ message: 'Cannot update admin users' });
        }

        if (username) {
            const existingUser = await User.findOne({ username, _id: { $ne: id } });
            if (existingUser) {
                return res.status(400).json({ message: 'Username already exists' });
            }
            user.username = username;
        }

        if (password) {
            user.password = await bcrypt.hash(password, 10);
        }

        if (typeof isActive === 'boolean') {
            user.isActive = isActive;
        }

        await user.save();

        res.json({
            message: 'User updated successfully',
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                isActive: user.isActive,
                credits: user.credits,
                testCategory: user.testCategory,
            },
        });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteUser = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.role !== 'user') {
            return res.status(400).json({ message: 'Cannot delete admin users' });
        }

        await User.findByIdAndDelete(id);

        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Get User Profile (Authenticated student — own profile) ───────────────────

export const getUserProfile = async (req: AuthRequest, res: Response) => {
    try {
        const user = await User.findById(req.user!.id)
            .select('-password')
            .populate('testCategory', 'name');

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.json({
            id: user._id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            credits: user.credits,
            testCategory: user.testCategory,
            isActive: user.isActive,
            modules: user.modules,
            emailVerified: user.emailVerified,
        });
    } catch (error) {
        console.error('Get user profile error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getStudentDetails = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id).select('-password').populate('testCategory', 'name');
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const classrooms = await ClassroomStudent.find({ studentId: id })
            .populate('classroomId', 'name joinCode')
            .populate('teacherId', 'fullName email username');
            
        const attempts = await AssessmentAttempt.find({ studentId: id })
            .populate('assessmentId', 'name startTime endTime')
            .populate('classroomId', 'name')
            .sort({ startedAt: -1 });

        res.json({
            user,
            classrooms,
            attempts,
            totalAttempts: attempts.length,
            lastLogin: user.updatedAt, // assuming updatedAt reflects last interaction or we fallback
        });
    } catch (error) {
        console.error('Get student details error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

