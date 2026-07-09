import mongoose from 'mongoose';
import { AssessmentAttempt, IAssessmentAttempt } from '../models/AssessmentAttempt';
import { ClassroomStudent } from '../models/ClassroomStudent';
import { TeacherAssessment } from '../models/TeacherAssessment';
import { TeacherAssessmentCreditUsage } from '../models/TeacherAssessmentCreditUsage';
import { TeacherClassroom } from '../models/TeacherClassroom';
import { TeacherEmailCreditUsage } from '../models/TeacherEmailCreditUsage';
import { TeacherQuestion } from '../models/TeacherQuestion';
import { ITeacherResourceAccount, TeacherResourceAccount } from '../models/TeacherResourceAccount';
import { TeacherResourceAction, TeacherResourceHistory, TeacherResourceType } from '../models/TeacherResourceHistory';
import { User } from '../models/User';

const submittedStatuses = ['submitted', 'auto_submitted'];

export type TeacherLimitResource = 'questions' | 'classrooms' | 'students' | 'assessments';

type CreditResourceType = 'assessment_credits' | 'email_credits';
type LimitResourceType = 'question_limit' | 'classroom_limit' | 'student_limit' | 'assessment_limit';

export interface TeacherResourceUpdateInput {
    resourceType: TeacherResourceType;
    action: TeacherResourceAction;
    amount?: number;
    value?: number;
    reason?: string;
    updatedBy?: mongoose.Types.ObjectId;
}

const limitConfig: Record<TeacherLimitResource, {
    currentLabel: string;
    maxKey: keyof ITeacherResourceAccount;
    unlimitedKey: keyof ITeacherResourceAccount;
    historyType: LimitResourceType;
}> = {
    questions: {
        currentLabel: 'questions',
        maxKey: 'maxQuestions',
        unlimitedKey: 'questionsUnlimited',
        historyType: 'question_limit',
    },
    classrooms: {
        currentLabel: 'classrooms',
        maxKey: 'maxClassrooms',
        unlimitedKey: 'classroomsUnlimited',
        historyType: 'classroom_limit',
    },
    students: {
        currentLabel: 'students',
        maxKey: 'maxStudents',
        unlimitedKey: 'studentsUnlimited',
        historyType: 'student_limit',
    },
    assessments: {
        currentLabel: 'assessments',
        maxKey: 'maxAssessments',
        unlimitedKey: 'assessmentsUnlimited',
        historyType: 'assessment_limit',
    },
};

const creditConfig: Record<CreditResourceType, {
    balanceKey: keyof ITeacherResourceAccount;
    usedKey: keyof ITeacherResourceAccount;
    unlimitedKey: keyof ITeacherResourceAccount;
}> = {
    assessment_credits: {
        balanceKey: 'assessmentCreditsBalance',
        usedKey: 'assessmentCreditsUsed',
        unlimitedKey: 'assessmentCreditsUnlimited',
    },
    email_credits: {
        balanceKey: 'emailCreditsBalance',
        usedKey: 'emailCreditsUsed',
        unlimitedKey: 'emailCreditsUnlimited',
    },
};

function toObjectId(value: mongoose.Types.ObjectId | string) {
    return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(value);
}

function positiveNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function nonNegativeNumber(value: unknown, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

function asNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : Number(value || 0);
}

function setNumber(account: ITeacherResourceAccount, key: keyof ITeacherResourceAccount, value: number) {
    (account as unknown as Record<string, number>)[String(key)] = value;
}

function setBoolean(account: ITeacherResourceAccount, key: keyof ITeacherResourceAccount, value: boolean) {
    (account as unknown as Record<string, boolean>)[String(key)] = value;
}

function creditValue(account: ITeacherResourceAccount, resourceType: CreditResourceType) {
    const config = creditConfig[resourceType];
    const unlimited = Boolean(account[config.unlimitedKey]);
    const balance = asNumber(account[config.balanceKey]);
    const used = asNumber(account[config.usedKey]);
    return unlimited ? `unlimited (${used} used)` : `${Math.max(0, balance)} remaining (${used} used)`;
}

function limitValue(account: ITeacherResourceAccount, resourceType: LimitResourceType) {
    const config = Object.values(limitConfig).find((item) => item.historyType === resourceType);
    if (!config) return 'unknown';
    const unlimited = Boolean(account[config.unlimitedKey]);
    const max = asNumber(account[config.maxKey]);
    return unlimited ? 'unlimited' : `${max} maximum`;
}

function resourceValue(account: ITeacherResourceAccount, resourceType: TeacherResourceType) {
    if (resourceType === 'assessment_credits' || resourceType === 'email_credits') {
        return creditValue(account, resourceType);
    }
    return limitValue(account, resourceType);
}

async function currentResourceCount(teacherId: mongoose.Types.ObjectId, resource: TeacherLimitResource) {
    if (resource === 'questions') return TeacherQuestion.countDocuments({ teacherId });
    if (resource === 'classrooms') return TeacherClassroom.countDocuments({ teacherId, status: { $ne: 'archived' } });
    if (resource === 'assessments') return TeacherAssessment.countDocuments({ teacherId, status: { $ne: 'archived' } });
    const studentIds = await ClassroomStudent.distinct('studentId', { teacherId, status: { $ne: 'removed' } });
    return studentIds.length;
}

function limitMessage(resource: TeacherLimitResource, current: number, max: number, requested: number) {
    const labels: Record<TeacherLimitResource, string> = {
        questions: 'question bank',
        classrooms: 'classroom',
        students: 'student',
        assessments: 'assessment',
    };
    return `Your ${labels[resource]} limit allows ${max}. You currently have ${current}, and this action needs ${requested} more. Contact Super Admin to increase the limit.`;
}

function creditSummary(unlimited: boolean, balance: number, used: number, totalSubmissions?: number) {
    const remaining = unlimited ? null : Math.max(0, balance);
    return {
        unlimited,
        balance: unlimited ? null : Math.max(0, balance),
        used,
        remaining,
        totalStudentSubmissions: totalSubmissions,
        estimatedRemainingCapacity: remaining,
    };
}

function limitSummary(current: number, max: number, unlimited: boolean) {
    return {
        current,
        max: unlimited ? null : max,
        unlimited,
        remaining: unlimited ? null : Math.max(0, max - current),
    };
}

/**
 * Default resource quota granted to every newly registered teacher.
 * Assessment submission credits are intentionally left unlimited — they are not
 * part of the signup quota and are consumed per student submission.
 */
export const DEFAULT_NEW_TEACHER_RESOURCES = {
    emailCredits: 100,
    maxQuestions: 500,
    maxClassrooms: 1,
    maxStudents: 100,
    maxAssessments: 2,
} as const;

/**
 * Provision the resource account for a brand-new teacher with the default
 * signup quota (limited email credits + limited classrooms/students/questions/
 * assessments). Uses an upsert keyed on teacherId so it is race-safe and wins
 * over the lazy unlimited defaults in ensureTeacherResourceAccount(). Returns
 * the account and whether it was freshly created.
 */
export async function provisionNewTeacherResources(
    teacherIdInput: mongoose.Types.ObjectId | string,
    options: { allocatedBy?: mongoose.Types.ObjectId; reason?: string } = {}
) {
    const teacherId = toObjectId(teacherIdInput);
    const now = new Date();

    const result = await TeacherResourceAccount.findOneAndUpdate(
        { teacherId },
        {
            $setOnInsert: {
                teacherId,
                // Assessment submission credits stay unlimited (not part of signup quota).
                assessmentCreditsBalance: 0,
                assessmentCreditsUsed: 0,
                assessmentCreditsUnlimited: true,
                // Email credits — limited at signup.
                emailCreditsBalance: DEFAULT_NEW_TEACHER_RESOURCES.emailCredits,
                emailCreditsUsed: 0,
                emailCreditsUnlimited: false,
                // Question bank limit.
                maxQuestions: DEFAULT_NEW_TEACHER_RESOURCES.maxQuestions,
                questionsUnlimited: false,
                // Concurrent classroom limit.
                maxClassrooms: DEFAULT_NEW_TEACHER_RESOURCES.maxClassrooms,
                classroomsUnlimited: false,
                // Student enrollment limit.
                maxStudents: DEFAULT_NEW_TEACHER_RESOURCES.maxStudents,
                studentsUnlimited: false,
                // Concurrent assessment limit.
                maxAssessments: DEFAULT_NEW_TEACHER_RESOURCES.maxAssessments,
                assessmentsUnlimited: false,
                allocationMode: 'custom',
                lastUpdatedBy: options.allocatedBy,
                lastResourceUpdateAt: now,
            },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true, includeResultMetadata: true }
    );

    const account = result.value as ITeacherResourceAccount;
    const created = !result.lastErrorObject?.updatedExisting;

    // Record the initial allocation in the audit trail (only on first creation).
    if (created) {
        const reason = options.reason || 'Initial allocation on teacher signup';
        const historyEntries = [
            { resourceType: 'email_credits' as const, newValue: `${DEFAULT_NEW_TEACHER_RESOURCES.emailCredits} remaining (0 used)` },
            { resourceType: 'question_limit' as const, newValue: `${DEFAULT_NEW_TEACHER_RESOURCES.maxQuestions} maximum` },
            { resourceType: 'classroom_limit' as const, newValue: `${DEFAULT_NEW_TEACHER_RESOURCES.maxClassrooms} maximum` },
            { resourceType: 'student_limit' as const, newValue: `${DEFAULT_NEW_TEACHER_RESOURCES.maxStudents} maximum` },
            { resourceType: 'assessment_limit' as const, newValue: `${DEFAULT_NEW_TEACHER_RESOURCES.maxAssessments} maximum` },
        ].map((entry) => ({
            teacherId,
            resourceType: entry.resourceType,
            action: 'set_limited' as const,
            previousValue: 'unlimited (default)',
            newValue: entry.newValue,
            reason,
            updatedBy: options.allocatedBy,
        }));

        try {
            await TeacherResourceHistory.insertMany(historyEntries);
        } catch (historyError) {
            // History is best-effort; never block teacher provisioning on it.
            console.error('[provisionNewTeacherResources] Failed to write allocation history:', historyError);
        }
    }

    return { account, created };
}

export async function ensureTeacherResourceAccount(teacherIdInput: mongoose.Types.ObjectId | string) {
    const teacherId = toObjectId(teacherIdInput);
    return TeacherResourceAccount.findOneAndUpdate(
        { teacherId },
        {
            $setOnInsert: {
                teacherId,
                assessmentCreditsBalance: 0,
                assessmentCreditsUsed: 0,
                assessmentCreditsUnlimited: true,
                emailCreditsBalance: 0,
                emailCreditsUsed: 0,
                emailCreditsUnlimited: true,
                maxQuestions: 0,
                questionsUnlimited: true,
                maxClassrooms: 0,
                classroomsUnlimited: true,
                maxStudents: 0,
                studentsUnlimited: true,
                maxAssessments: 0,
                assessmentsUnlimited: true,
                allocationMode: 'custom',
            },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );
}

export async function getTeacherResourceSnapshot(teacherIdInput: mongoose.Types.ObjectId | string) {
    const teacherId = toObjectId(teacherIdInput);
    const account = await ensureTeacherResourceAccount(teacherId);
    const [
        currentQuestions,
        currentClassrooms,
        currentStudents,
        currentAssessments,
        totalSubmissions,
        recentAssessmentUsage,
        recentEmailUsage,
        history,
    ] = await Promise.all([
        currentResourceCount(teacherId, 'questions'),
        currentResourceCount(teacherId, 'classrooms'),
        currentResourceCount(teacherId, 'students'),
        currentResourceCount(teacherId, 'assessments'),
        AssessmentAttempt.countDocuments({ teacherId, status: { $in: submittedStatuses } }),
        TeacherAssessmentCreditUsage.find({ teacherId }).sort({ submittedAt: -1 }).limit(10).lean(),
        TeacherEmailCreditUsage.find({ teacherId }).sort({ sentAt: -1 }).limit(10).lean(),
        TeacherResourceHistory.find({ teacherId })
            .populate('updatedBy', 'fullName username email')
            .sort({ createdAt: -1 })
            .limit(20)
            .lean(),
    ]);

    return {
        accountId: account._id,
        allocationMode: account.allocationMode,
        planCode: account.planCode || null,
        credits: {
            assessment: creditSummary(
                account.assessmentCreditsUnlimited,
                account.assessmentCreditsBalance,
                account.assessmentCreditsUsed,
                totalSubmissions
            ),
            email: creditSummary(account.emailCreditsUnlimited, account.emailCreditsBalance, account.emailCreditsUsed),
        },
        limits: {
            questions: limitSummary(currentQuestions, account.maxQuestions, account.questionsUnlimited),
            classrooms: limitSummary(currentClassrooms, account.maxClassrooms, account.classroomsUnlimited),
            students: limitSummary(currentStudents, account.maxStudents, account.studentsUnlimited),
            assessments: limitSummary(currentAssessments, account.maxAssessments, account.assessmentsUnlimited),
        },
        usageHistory: {
            assessmentCredits: recentAssessmentUsage,
            emailCredits: recentEmailUsage,
        },
        resourceHistory: history,
        lastResourceUpdateAt: account.lastResourceUpdateAt || account.updatedAt,
    };
}

export async function assertTeacherResourceCapacity(
    teacherIdInput: mongoose.Types.ObjectId | string,
    resource: TeacherLimitResource,
    requested = 1
) {
    const teacherId = toObjectId(teacherIdInput);
    const account = await ensureTeacherResourceAccount(teacherId);
    const config = limitConfig[resource];
    if (Boolean(account[config.unlimitedKey])) return;

    const current = await currentResourceCount(teacherId, resource);
    const max = asNumber(account[config.maxKey]);
    const requestedNumber = Number(requested);
    const needed = Number.isFinite(requestedNumber) ? Math.max(0, Math.floor(requestedNumber)) : 1;
    if (needed === 0) return;
    if (current + needed > max) {
        const error = new Error(limitMessage(resource, current, max, needed)) as Error & { status?: number };
        error.status = 400;
        throw error;
    }
}

export async function assertTeacherEmailCapacity(
    teacherIdInput: mongoose.Types.ObjectId | string,
    requested = 1
) {
    const teacherId = toObjectId(teacherIdInput);
    const account = await ensureTeacherResourceAccount(teacherId);
    if (account.emailCreditsUnlimited) return;

    const needed = Math.max(0, Math.floor(Number(requested) || 0));
    if (needed === 0) return;

    const balance = Math.max(0, asNumber(account.emailCreditsBalance));
    if (balance < needed) {
        const error = new Error(
            `Your email credit balance (${balance}) is not enough to send ${needed} invitation${needed === 1 ? '' : 's'}. Contact Super Admin to add more email credits.`
        ) as Error & { status?: number };
        error.status = 400;
        throw error;
    }
}

export async function countNewTeacherStudentsForInvite(
    teacherIdInput: mongoose.Types.ObjectId | string,
    candidateStudentIds: Array<mongoose.Types.ObjectId | string>
) {
    const teacherId = toObjectId(teacherIdInput);
    const uniqueIds = Array.from(new Set(candidateStudentIds.filter(Boolean).map((id) => id.toString())));
    if (!uniqueIds.length) return 0;
    const existingIds = await ClassroomStudent.distinct('studentId', {
        teacherId,
        studentId: { $in: uniqueIds.map((id) => new mongoose.Types.ObjectId(id)) },
        status: { $ne: 'removed' },
    });
    const existingSet = new Set(existingIds.map((id) => id.toString()));
    return uniqueIds.filter((id) => !existingSet.has(id)).length;
}

export async function consumeAssessmentSubmissionCredit(
    attempt: IAssessmentAttempt,
    assessmentSnapshot?: { _id?: unknown; name?: string } | null
) {
    if (!attempt.submittedAt) return null;

    const attemptId = attempt._id as mongoose.Types.ObjectId;
    const existing = await TeacherAssessmentCreditUsage.findOne({ attemptId }).lean();
    if (existing) return existing;

    const teacherId = attempt.teacherId as mongoose.Types.ObjectId;
    const [account, assessment, student] = await Promise.all([
        ensureTeacherResourceAccount(teacherId),
        assessmentSnapshot?._id
            ? Promise.resolve(assessmentSnapshot)
            : TeacherAssessment.findById(attempt.assessmentId).select('name').lean(),
        User.findById(attempt.studentId).select('fullName username email').lean(),
    ]);

    try {
        const usage = await TeacherAssessmentCreditUsage.create({
            teacherId,
            assessmentId: attempt.assessmentId,
            classroomId: attempt.classroomId,
            studentId: attempt.studentId,
            attemptId,
            assessmentName: assessment?.name || 'Assessment',
            studentName: student?.fullName || student?.username || student?.email,
            studentEmail: student?.email || student?.username,
            submittedAt: attempt.submittedAt,
            creditsConsumed: 1,
        });

        const update: any = {
            $inc: { assessmentCreditsUsed: 1 },
            $set: { lastResourceUpdateAt: new Date() },
        };
        if (!account.assessmentCreditsUnlimited) {
            update.$inc.assessmentCreditsBalance = -1;
        }
        await TeacherResourceAccount.updateOne({ teacherId }, update);
        if (!account.assessmentCreditsUnlimited) {
            await TeacherResourceAccount.updateOne({ teacherId, assessmentCreditsBalance: { $lt: 0 } }, { $set: { assessmentCreditsBalance: 0 } });
        }
        await AssessmentAttempt.updateOne({ _id: attemptId }, { $set: { teacherCreditChargedAt: new Date() } });
        return usage;
    } catch (error: any) {
        if (error?.code === 11000) {
            return TeacherAssessmentCreditUsage.findOne({ attemptId }).lean();
        }
        throw error;
    }
}

export async function consumeEmailInvitationCredit(input: {
    teacherId: mongoose.Types.ObjectId | string;
    classroomId?: mongoose.Types.ObjectId | string;
    studentId?: mongoose.Types.ObjectId | string;
    email: string;
    studentName?: string;
}) {
    const teacherId = toObjectId(input.teacherId);
    const account = await ensureTeacherResourceAccount(teacherId);
    const usage = await TeacherEmailCreditUsage.create({
        teacherId,
        classroomId: input.classroomId ? toObjectId(input.classroomId) : undefined,
        studentId: input.studentId ? toObjectId(input.studentId) : undefined,
        email: input.email,
        studentName: input.studentName,
        emailType: 'classroom_invitation',
        sentAt: new Date(),
        creditsConsumed: 1,
    });

    const update: any = {
        $inc: { emailCreditsUsed: 1 },
        $set: { lastResourceUpdateAt: new Date() },
    };
    if (!account.emailCreditsUnlimited) {
        update.$inc.emailCreditsBalance = -1;
    }
    await TeacherResourceAccount.updateOne({ teacherId }, update);
    if (!account.emailCreditsUnlimited) {
        await TeacherResourceAccount.updateOne({ teacherId, emailCreditsBalance: { $lt: 0 } }, { $set: { emailCreditsBalance: 0 } });
    }
    return usage;
}

export async function updateTeacherResourceAccount(
    teacherIdInput: mongoose.Types.ObjectId | string,
    input: TeacherResourceUpdateInput
) {
    const teacherId = toObjectId(teacherIdInput);
    const account = await ensureTeacherResourceAccount(teacherId);
    const previousValue = resourceValue(account, input.resourceType);
    const amount = positiveNumber(input.amount, positiveNumber(input.value, 0));
    const value = nonNegativeNumber(input.value, nonNegativeNumber(input.amount, 0));

    if (input.resourceType === 'assessment_credits' || input.resourceType === 'email_credits') {
        const config = creditConfig[input.resourceType];
        const currentBalance = asNumber(account[config.balanceKey]);
        const currentUsed = asNumber(account[config.usedKey]);

        if (input.action === 'add') {
            setBoolean(account, config.unlimitedKey, false);
            setNumber(account, config.balanceKey, currentBalance + amount);
        } else if (input.action === 'deduct') {
            setBoolean(account, config.unlimitedKey, false);
            setNumber(account, config.balanceKey, Math.max(0, currentBalance - amount));
        } else if (input.action === 'reset') {
            setBoolean(account, config.unlimitedKey, false);
            setNumber(account, config.balanceKey, value);
            setNumber(account, config.usedKey, 0);
        } else if (input.action === 'set_unlimited') {
            setBoolean(account, config.unlimitedKey, true);
            setNumber(account, config.balanceKey, 0);
        } else if (input.action === 'set_limited') {
            setBoolean(account, config.unlimitedKey, false);
            setNumber(account, config.balanceKey, value);
            setNumber(account, config.usedKey, currentUsed);
        } else {
            const error = new Error('Unsupported credit resource action') as Error & { status?: number };
            error.status = 400;
            throw error;
        }
    } else {
        const config = Object.values(limitConfig).find((item) => item.historyType === input.resourceType);
        if (!config) {
            const error = new Error('Unsupported resource type') as Error & { status?: number };
            error.status = 400;
            throw error;
        }
        const currentLimit = asNumber(account[config.maxKey]);
        if (input.action === 'increase_limit') {
            setBoolean(account, config.unlimitedKey, false);
            setNumber(account, config.maxKey, currentLimit + amount);
        } else if (input.action === 'decrease_limit') {
            setBoolean(account, config.unlimitedKey, false);
            setNumber(account, config.maxKey, Math.max(0, currentLimit - amount));
        } else if (input.action === 'set_unlimited') {
            setBoolean(account, config.unlimitedKey, true);
            setNumber(account, config.maxKey, 0);
        } else if (input.action === 'set_limited' || input.action === 'reset') {
            setBoolean(account, config.unlimitedKey, false);
            setNumber(account, config.maxKey, value);
        } else {
            const error = new Error('Unsupported limit resource action') as Error & { status?: number };
            error.status = 400;
            throw error;
        }
    }

    account.lastUpdatedBy = input.updatedBy;
    account.lastResourceUpdateAt = new Date();
    const updated = await account.save();
    const newValue = resourceValue(updated, input.resourceType);
    await TeacherResourceHistory.create({
        teacherId,
        resourceType: input.resourceType,
        action: input.action,
        previousValue,
        newValue,
        reason: input.reason,
        updatedBy: input.updatedBy,
    });

    return getTeacherResourceSnapshot(teacherId);
}
