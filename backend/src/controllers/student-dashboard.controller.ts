import { Response } from 'express';
import mongoose from 'mongoose';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';
import { ClassroomStudent } from '../models/ClassroomStudent';
import { StudentPracticeAttempt } from '../models/StudentPracticeAttempt';
import { StudentQuestionBookmark } from '../models/StudentQuestionBookmark';
import { StudentMistake } from '../models/StudentMistake';
import { Result } from '../models/Result';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { TeacherAssessment } from '../models/TeacherAssessment';

/**
 * Aggregated student dashboard data endpoint.
 * Returns profile, modules, practice stats, classroom stats, and recent activity
 * in a single API call for efficient dashboard loading.
 */
export const getStudentDashboardData = async (req: AuthRequest, res: Response) => {
    try {
        const studentId = new mongoose.Types.ObjectId(req.user!.id);

        // Fetch user profile
        const user = await User.findById(studentId)
            .select('-password')
            .populate('testCategory', 'name')
            .lean();

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const modules = user.modules || { practiceModule: false, teacherAssessments: false };

        // Enforce email verification gating for practice module
        const isPracticeUnverified = modules.practiceModule && !user.emailVerified;

        if (isPracticeUnverified && !modules.teacherAssessments) {
            return res.status(403).json({
                errorCode: 'EMAIL_NOT_VERIFIED',
                message: 'Please verify your email address before accessing the Practice Module.',
                email: user.email,
            });
        }

        // ─── Practice Stats (only if practiceModule is enabled and email is verified) ───────────────
        let practiceStats = null;
        if (modules.practiceModule && !isPracticeUnverified) {
            const [
                practiceAttempts,
                bookmarksCount,
                mistakesCount,
                practiceResults,
            ] = await Promise.all([
                StudentPracticeAttempt.countDocuments({ userId: studentId }),
                StudentQuestionBookmark.countDocuments({ userId: studentId }),
                StudentMistake.countDocuments({ userId: studentId }),
                Result.find({ userId: studentId })
                    .sort({ submittedAt: -1 })
                    .limit(10)
                    .select('score totalMarks passed submittedAt quizId')
                    .populate('quizId', 'title')
                    .lean(),
            ]);

            // Calculate overall accuracy from recent practice results
            const totalScore = practiceResults.reduce((sum: number, r: any) => sum + (r.score || 0), 0);
            const totalMarks = practiceResults.reduce((sum: number, r: any) => sum + (r.totalMarks || 0), 0);
            const accuracy = totalMarks > 0 ? Math.round((totalScore / totalMarks) * 100) : 0;

            practiceStats = {
                totalAttempts: practiceAttempts,
                bookmarksCount,
                mistakesCount,
                accuracy,
                credits: user.credits || 0,
                recentResults: practiceResults.map((r: any) => ({
                    id: r._id,
                    quizTitle: r.quizId?.title || 'Quiz',
                    score: r.score,
                    totalMarks: r.totalMarks,
                    passed: r.passed,
                    submittedAt: r.submittedAt,
                })),
            };
        }

        // ─── Classroom Stats (only if teacherAssessments is enabled) ──────────
        let classroomStats = null;
        if (modules.teacherAssessments) {
            const enrollments = await ClassroomStudent.find({ studentId, status: { $ne: 'removed' } })
                .populate('classroomId', 'name')
                .populate('teacherId', 'fullName profileImage professionalTitle organization subjects bio')
                .lean();

            const classroomIds = enrollments.map((e: any) => e.classroomId?._id).filter(Boolean);

            const now = new Date();
            const [totalAssessments, upcomingAssessments, submittedAttempts] = await Promise.all([
                TeacherAssessment.countDocuments({ classroomId: { $in: classroomIds }, status: { $ne: 'archived' } }),
                TeacherAssessment.countDocuments({
                    classroomId: { $in: classroomIds },
                    status: { $ne: 'archived' },
                    startTime: { $gt: now },
                }),
                AssessmentAttempt.countDocuments({
                    studentId,
                    status: { $in: ['submitted', 'auto_submitted'] },
                }),
            ]);

            // Get next upcoming assessment
            const nextAssessment = await TeacherAssessment.findOne({
                classroomId: { $in: classroomIds },
                status: { $ne: 'archived' },
                endTime: { $gt: now },
            })
                .sort({ startTime: 1 })
                .populate('classroomId', 'name')
                .lean();

            classroomStats = {
                totalAssessments,
                upcomingAssessments,
                submittedAttempts,
                classroomCount: enrollments.length,
                classrooms: enrollments.map((e: any) => ({
                    id: e.classroomId?._id,
                    name: e.classroomId?.name || 'Classroom',
                    teacherName: e.teacherId?.fullName || 'Teacher',
                    teacher: e.teacherId,
                    status: e.status,
                    joinedAt: e.joinedAt,
                })),
                nextAssessment: nextAssessment ? {
                    id: nextAssessment._id,
                    name: nextAssessment.name,
                    classroom: (nextAssessment.classroomId as any)?.name || '',
                    startTime: nextAssessment.startTime,
                    endTime: nextAssessment.endTime,
                    durationMinutes: nextAssessment.durationMinutes,
                    totalQuestions: nextAssessment.totalQuestions,
                } : null,
            };
        }

        // ─── Recent Activity (across both modules) ───────────────────────────
        const recentActivity: any[] = [];

        if (modules.practiceModule && !isPracticeUnverified) {
            const recentPractice = await Result.find({ userId: studentId })
                .sort({ submittedAt: -1 })
                .limit(5)
                .select('score totalMarks passed submittedAt quizId')
                .populate('quizId', 'title')
                .lean();

            recentPractice.forEach((r: any) => {
                recentActivity.push({
                    type: 'practice_result',
                    title: `Practice: ${r.quizId?.title || 'Quiz'}`,
                    description: `Scored ${r.score}/${r.totalMarks} (${r.passed ? 'Pass' : 'Fail'})`,
                    timestamp: r.submittedAt,
                });
            });
        }

        if (modules.teacherAssessments) {
            const recentAssessments = await AssessmentAttempt.find({
                studentId,
                status: { $in: ['submitted', 'auto_submitted'] },
            })
                .sort({ submittedAt: -1 })
                .limit(5)
                .select('score totalMarks percentage passed submittedAt assessmentId')
                .populate('assessmentId', 'name resultsReleased')
                .lean();

            recentAssessments.forEach((a: any) => {
                // Only surface the score once the teacher has released results.
                // Unreleased attempts must not leak the score/pass-fail in recent activity.
                if (!a.assessmentId?.resultsReleased) return;
                recentActivity.push({
                    type: 'assessment_result',
                    title: `Assessment: ${(a.assessmentId as any)?.name || 'Assessment'}`,
                    description: `Scored ${a.score}/${a.totalMarks} — ${a.percentage}% (${a.passed ? 'Pass' : 'Fail'})`,
                    timestamp: a.submittedAt,
                });
            });
        }

        // Sort by timestamp descending
        recentActivity.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        res.json({
            profile: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                username: user.username,
                credits: user.credits || 0,
                modules,
                lastLogin: user.lastLogin,
            },
            practiceStats,
            classroomStats,
            recentActivity: recentActivity.slice(0, 10),
        });
    } catch (error) {
        console.error('Student dashboard data error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
