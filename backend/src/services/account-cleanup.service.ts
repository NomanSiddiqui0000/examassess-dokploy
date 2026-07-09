import { User } from '../models/User';
import { ClassroomStudent } from '../models/ClassroomStudent';
import { INVITED_STUDENT_CLEANUP_DAYS, SELF_REGISTRATION_CLEANUP_HOURS } from '../utils/email-security';

let cleanupRunning = false;

export async function cleanupExpiredUnverifiedAccounts() {
    if (cleanupRunning) return { deleted: 0 };
    cleanupRunning = true;
    try {
        const now = new Date();
        const selfCutoff = new Date(now.getTime() - SELF_REGISTRATION_CLEANUP_HOURS * 60 * 60 * 1000);
        const inviteCutoff = new Date(now.getTime() - INVITED_STUDENT_CLEANUP_DAYS * 24 * 60 * 60 * 1000);

        const expired = await User.find({
            role: { $in: ['user', 'teacher'] },
            emailVerified: false,
            lastLogin: { $exists: false },
            $or: [
                { unverifiedAccountExpiresAt: { $lte: now } },
                { unverifiedAccountExpiresAt: { $exists: false }, registrationSource: 'teacher_invite', createdAt: { $lte: inviteCutoff } },
                { unverifiedAccountExpiresAt: { $exists: false }, registrationSource: { $in: ['self_student', 'teacher_self'] }, createdAt: { $lte: selfCutoff } },
                { unverifiedAccountExpiresAt: { $exists: false }, registrationSource: { $exists: false }, createdAt: { $lte: selfCutoff } },
            ],
        }).select('_id role registrationSource').limit(500).lean();

        if (!expired.length) return { deleted: 0 };

        const ids = expired.map((user: any) => user._id);

        if (ids.length) {
            await ClassroomStudent.deleteMany({ studentId: { $in: ids } });
        }

        const deleted = await User.deleteMany({ _id: { $in: ids }, emailVerified: false });
        if (deleted.deletedCount) {
            console.log(`[AccountCleanup] Removed ${deleted.deletedCount} expired unverified account(s).`);
        }
        return { deleted: deleted.deletedCount || 0 };
    } finally {
        cleanupRunning = false;
    }
}

export function startUnverifiedAccountCleanupScheduler() {
    cleanupExpiredUnverifiedAccounts().catch((error) => {
        console.error('[AccountCleanup] Startup cleanup failed:', error);
    });

    setInterval(() => {
        cleanupExpiredUnverifiedAccounts().catch((error) => {
            console.error('[AccountCleanup] Scheduled cleanup failed:', error);
        });
    }, 60 * 60 * 1000).unref();
}

