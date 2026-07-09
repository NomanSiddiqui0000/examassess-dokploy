import { Response } from 'express';
import { User } from '../models/User';
import { CreditLog } from '../models/CreditLog';
import { AuthRequest } from '../middleware/auth.middleware';

// ─── Recharge Credits (Admin / Manager) ───────────────────────────────────────

export const rechargeCredits = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { amount, reason } = req.body;

        if (!amount || typeof amount !== 'number' || amount <= 0) {
            return res.status(400).json({ message: 'Amount must be a positive number' });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.role !== 'user') {
            return res.status(400).json({ message: 'Credits can only be added to student accounts' });
        }

        // Atomic increment
        const updatedUser = await User.findByIdAndUpdate(
            id,
            { $inc: { credits: amount } },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(500).json({ message: 'Failed to update credits' });
        }

        // Log the credit change
        await CreditLog.create({
            userId: id,
            action: 'admin_recharge',
            amount: amount,
            balanceAfter: updatedUser.credits,
            performedBy: req.user!.id,
            reason: reason || undefined,
            timestamp: new Date(),
        });

        res.json({
            message: `Successfully added ${amount} credits`,
            user: {
                id: updatedUser._id,
                username: updatedUser.username,
                credits: updatedUser.credits,
            },
        });
    } catch (error) {
        console.error('Recharge credits error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Get Credit Logs for a User (Admin) ───────────────────────────────────────

export const getCreditLogs = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            CreditLog.find({ userId: id })
                .populate('performedBy', 'username')
                .populate('quizId', 'title')
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            CreditLog.countDocuments({ userId: id }),
        ]);

        res.json({
            logs,
            total,
            page,
            totalPages: Math.ceil(total / limit),
        });
    } catch (error) {
        console.error('Get credit logs error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
