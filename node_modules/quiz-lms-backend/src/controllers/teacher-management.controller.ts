import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User';
import { TeacherClassroom } from '../models/TeacherClassroom';
import { ClassroomStudent } from '../models/ClassroomStudent';
import { TeacherAssessment } from '../models/TeacherAssessment';
import { TeacherQuestion } from '../models/TeacherQuestion';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import {
    getTeacherResourceSnapshot,
    updateTeacherResourceAccount,
} from '../services/teacher-resource.service';
import { TeacherResourceAction, TeacherResourceType } from '../models/TeacherResourceHistory';

const submittedStatuses = ['submitted', 'auto_submitted'];

const idKey = (value: any) => {
    if (!value) return '';
    if (value._id) return value._id.toString();
    return value.toString();
};

const round = (value: number) => Math.round((value || 0) * 100) / 100;

const countMap = (rows: any[], key = 'count') => {
    const map = new Map<string, number>();
    rows.forEach((row) => map.set(idKey(row._id), Number(row[key] || 0)));
    return map;
};

const getCompletionStatus = (assessment: any) => {
    const now = new Date();
    const start = new Date(assessment.startTime);
    const end = new Date(assessment.endTime);
    if (now < start) return 'Upcoming';
    if (now >= start && now < end) return 'Live';
    return 'Completed';
};

const distribution = (items: any[], field: string) => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
        const key = String(item[field] || 'Uncategorized');
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries())
        .map(([label, count]) => ({ label, count }))
        .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
};

const allowedResourceTypes: TeacherResourceType[] = [
    'assessment_credits',
    'email_credits',
    'question_limit',
    'classroom_limit',
    'student_limit',
    'assessment_limit',
];

const allowedResourceActions: TeacherResourceAction[] = [
    'add',
    'deduct',
    'reset',
    'set_unlimited',
    'set_limited',
    'increase_limit',
    'decrease_limit',
];

async function resolveTeacherId(id: string) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        const error = new Error('Invalid teacher id') as Error & { status?: number };
        error.status = 400;
        throw error;
    }
    const teacherId = new mongoose.Types.ObjectId(id);
    const teacher = await User.findOne({ _id: teacherId, role: 'teacher' }).select('_id').lean();
    if (!teacher) {
        const error = new Error('Teacher not found') as Error & { status?: number };
        error.status = 404;
        throw error;
    }
    return teacherId;
}

export const getTeacherManagementOverview = async (_req: AuthRequest, res: Response) => {
    try {
        const teachers = await User.find({ role: 'teacher' })
            .select('_id fullName username email emailVerified isActive createdAt updatedAt lastLogin')
            .sort({ createdAt: -1 })
            .lean();

        const teacherIds = teachers.map((teacher: any) => teacher._id);
        const [
            classroomCounts,
            studentCounts,
            assessmentCounts,
            questionCounts,
            teacherPerformance,
            overallPerformance,
        ] = await Promise.all([
            TeacherClassroom.aggregate([
                { $match: { teacherId: { $in: teacherIds } } },
                { $group: { _id: '$teacherId', count: { $sum: 1 } } },
            ]),
            ClassroomStudent.aggregate([
                { $match: { teacherId: { $in: teacherIds }, status: { $ne: 'removed' } } },
                { $group: { _id: '$teacherId', count: { $sum: 1 } } },
            ]),
            TeacherAssessment.aggregate([
                { $match: { teacherId: { $in: teacherIds }, status: { $ne: 'archived' } } },
                { $group: { _id: '$teacherId', count: { $sum: 1 } } },
            ]),
            TeacherQuestion.aggregate([
                { $match: { teacherId: { $in: teacherIds } } },
                { $group: { _id: '$teacherId', count: { $sum: 1 } } },
            ]),
            AssessmentAttempt.aggregate([
                { $match: { teacherId: { $in: teacherIds }, status: { $in: submittedStatuses } } },
                { $group: { _id: '$teacherId', averageScore: { $avg: '$percentage' } } },
            ]),
            AssessmentAttempt.aggregate([
                { $match: { teacherId: { $in: teacherIds }, status: { $in: submittedStatuses } } },
                { $group: { _id: null, averagePerformance: { $avg: '$percentage' } } },
            ]),
        ]);

        const classroomsByTeacher = countMap(classroomCounts);
        const studentsByTeacher = countMap(studentCounts);
        const assessmentsByTeacher = countMap(assessmentCounts);
        const questionsByTeacher = countMap(questionCounts);
        const performanceByTeacher = new Map<string, number>();
        teacherPerformance.forEach((row: any) => performanceByTeacher.set(idKey(row._id), round(row.averageScore)));

        const teacherRows = teachers.map((teacher: any) => {
            const key = teacher._id.toString();
            return {
                _id: teacher._id,
                name: teacher.fullName || teacher.username || teacher.email,
                email: teacher.email || teacher.username,
                registrationDate: teacher.createdAt,
                verificationStatus: teacher.emailVerified ? 'Verified' : 'Pending',
                totalStudents: studentsByTeacher.get(key) || 0,
                totalClassrooms: classroomsByTeacher.get(key) || 0,
                totalAssessments: assessmentsByTeacher.get(key) || 0,
                totalQuestionBankSize: questionsByTeacher.get(key) || 0,
                lastLogin: teacher.lastLogin,
                accountStatus: teacher.isActive ? 'Active' : 'Disabled',
                averageScore: performanceByTeacher.get(key) || 0,
            };
        });

        const stats = {
            totalTeachers: teachers.length,
            activeTeachers: teachers.filter((teacher: any) => teacher.isActive).length,
            totalClassrooms: Array.from(classroomsByTeacher.values()).reduce((sum, value) => sum + value, 0),
            totalTeacherStudents: Array.from(studentsByTeacher.values()).reduce((sum, value) => sum + value, 0),
            totalTeacherAssessments: Array.from(assessmentsByTeacher.values()).reduce((sum, value) => sum + value, 0),
            totalTeacherQuestions: Array.from(questionsByTeacher.values()).reduce((sum, value) => sum + value, 0),
            averagePerformance: round(overallPerformance[0]?.averagePerformance || 0),
        };

        res.json({ stats, teachers: teacherRows });
    } catch (error) {
        console.error('Teacher management overview error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getTeacherManagementDetails = async (req: AuthRequest, res: Response) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ message: 'Invalid teacher id' });
        }
        const teacherId = new mongoose.Types.ObjectId(req.params.id);
        const teacher = await User.findOne({ _id: teacherId, role: 'teacher' })
            .select('_id fullName username email emailVerified isActive createdAt updatedAt lastLogin profileImage professionalTitle organization subjects bio')
            .lean();

        if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

        const [classrooms, students, assessments, questions, attempts, resources] = await Promise.all([
            TeacherClassroom.find({ teacherId }).sort({ createdAt: -1 }).lean(),
            ClassroomStudent.find({ teacherId, status: { $ne: 'removed' } })
                .populate('studentId', 'fullName email username isActive lastLogin')
                .populate('classroomId', 'name')
                .sort({ invitedAt: -1 })
                .lean(),
            TeacherAssessment.find({ teacherId, status: { $ne: 'archived' } })
                .populate('classroomId', 'name')
                .sort({ startTime: -1 })
                .lean(),
            TeacherQuestion.find({ teacherId }).sort({ createdAt: -1 }).lean(),
            AssessmentAttempt.find({ teacherId, status: { $in: submittedStatuses } })
                .populate('studentId', 'fullName email username lastLogin')
                .populate('assessmentId', 'name startTime endTime durationMinutes totalQuestions passingPercentage')
                .populate('classroomId', 'name')
                .sort({ submittedAt: -1 })
                .lean(),
            getTeacherResourceSnapshot(teacherId),
        ]);

        const now = new Date();
        const attemptsByStudent = new Map<string, any[]>();
        const attemptsByAssessment = new Map<string, any[]>();
        attempts.forEach((attempt: any) => {
            const studentKey = idKey(attempt.studentId);
            const assessmentKey = idKey(attempt.assessmentId);
            attemptsByStudent.set(studentKey, [...(attemptsByStudent.get(studentKey) || []), attempt]);
            attemptsByAssessment.set(assessmentKey, [...(attemptsByAssessment.get(assessmentKey) || []), attempt]);
        });

        const classroomAssessmentCounts = new Map<string, number>();
        assessments.forEach((assessment: any) => {
            const key = idKey(assessment.classroomId);
            classroomAssessmentCounts.set(key, (classroomAssessmentCounts.get(key) || 0) + 1);
        });

        const studentMap = new Map<string, any>();
        students.forEach((enrollment: any) => {
            const studentKey = idKey(enrollment.studentId);
            const existing = studentMap.get(studentKey) || {
                studentId: studentKey,
                name: enrollment.studentId?.fullName || enrollment.invitedName || enrollment.studentId?.username || enrollment.invitedEmail,
                email: enrollment.studentId?.email || enrollment.invitedEmail,
                classrooms: [],
                attemptCount: 0,
                assessmentCount: 0,
                averageScore: 0,
                lastActivity: null,
            };
            existing.classrooms.push(enrollment.classroomId?.name || 'Classroom');
            existing.assessmentCount += classroomAssessmentCounts.get(idKey(enrollment.classroomId)) || 0;
            studentMap.set(studentKey, existing);
        });

        const studentMonitoring = Array.from(studentMap.values()).map((student) => {
            const studentAttempts = attemptsByStudent.get(student.studentId) || [];
            const averageScore = studentAttempts.length
                ? round(studentAttempts.reduce((sum: number, attempt: any) => sum + Number(attempt.percentage || 0), 0) / studentAttempts.length)
                : 0;
            const lastAttemptDate = studentAttempts[0]?.submittedAt;
            return {
                ...student,
                classrooms: Array.from(new Set(student.classrooms)),
                attemptCount: studentAttempts.length,
                averageScore,
                lastActivity: lastAttemptDate || null,
            };
        });

        const assessmentMonitoring = assessments.map((assessment: any) => {
            const assessmentAttempts = attemptsByAssessment.get(assessment._id.toString()) || [];
            const assignedStudents = students.filter((student: any) => idKey(student.classroomId) === idKey(assessment.classroomId)).length;
            const averageScore = assessmentAttempts.length
                ? round(assessmentAttempts.reduce((sum: number, attempt: any) => sum + Number(attempt.percentage || 0), 0) / assessmentAttempts.length)
                : 0;
            const passPercentage = assessmentAttempts.length
                ? Math.round((assessmentAttempts.filter((attempt: any) => attempt.passed).length / assessmentAttempts.length) * 100)
                : 0;
            return {
                _id: assessment._id,
                name: assessment.name,
                classroomName: assessment.classroomId?.name,
                schedule: { startTime: assessment.startTime, endTime: assessment.endTime },
                duration: assessment.durationMinutes,
                questionCount: assessment.totalQuestions,
                assignedStudents,
                submissionCount: assessmentAttempts.length,
                averageScore,
                passPercentage,
                completionStatus: getCompletionStatus(assessment),
            };
        });

        const categoryDistribution = distribution(questions, 'subject');
        const difficultyDistribution = distribution(questions, 'difficulty');
        const averageMarks = questions.length
            ? round(questions.reduce((sum: number, question: any) => sum + Number(question.marks || 0), 0) / questions.length)
            : 0;

        const completedAssessments = assessments.filter((assessment: any) => new Date(assessment.endTime) <= now).length;
        const upcomingAssessments = assessments.filter((assessment: any) => new Date(assessment.startTime) > now).length;
        const averageScores = attempts.length
            ? round(attempts.reduce((sum: number, attempt: any) => sum + Number(attempt.percentage || 0), 0) / attempts.length)
            : 0;

        res.json({
            teacher: {
                _id: teacher._id,
                name: teacher.fullName || teacher.username || teacher.email,
                email: teacher.email || teacher.username,
                verificationStatus: teacher.emailVerified ? 'Verified' : 'Pending',
                accountStatus: teacher.isActive ? 'Active' : 'Disabled',
                registrationDate: teacher.createdAt,
                lastLogin: teacher.lastLogin,
            },
            classrooms: classrooms.map((classroom: any) => ({
                _id: classroom._id,
                name: classroom.name,
                academicSession: classroom.academicSession,
                status: classroom.status,
                createdAt: classroom.createdAt,
            })),
            students: studentMonitoring,
            assessmentHistory: assessmentMonitoring,
            questionBank: {
                totalQuestions: questions.length,
                categoryDistribution,
                difficultyDistribution,
                mostUsedCategories: categoryDistribution.slice(0, 5),
                averageMarks,
            },
            assessmentCounts: {
                total: assessments.length,
                upcoming: upcomingAssessments,
                completed: completedAssessments,
            },
            studentPerformance: {
                averageScores,
                submissions: attempts.length,
                passRate: attempts.length ? Math.round((attempts.filter((attempt: any) => attempt.passed).length / attempts.length) * 100) : 0,
            },
            resources,
            recentActivity: attempts.slice(0, 8).map((attempt: any) => ({
                _id: attempt._id,
                studentName: attempt.studentId?.fullName || attempt.studentId?.username || attempt.studentId?.email,
                assessmentName: attempt.assessmentId?.name,
                submittedAt: attempt.submittedAt,
                percentage: attempt.percentage,
                passed: attempt.passed,
            })),
        });
    } catch (error) {
        console.error('Teacher management details error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getTeacherResources = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = await resolveTeacherId(req.params.id);
        const resources = await getTeacherResourceSnapshot(teacherId);
        res.json(resources);
    } catch (error: any) {
        console.error('Get teacher resources error:', error);
        res.status(error.status || 500).json({ message: error.message || 'Server error' });
    }
};

export const updateTeacherResources = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = await resolveTeacherId(req.params.id);
        const resourceType = String(req.body.resourceType || '') as TeacherResourceType;
        const action = String(req.body.action || '') as TeacherResourceAction;
        if (!allowedResourceTypes.includes(resourceType)) {
            return res.status(400).json({ message: 'Invalid teacher resource type' });
        }
        if (!allowedResourceActions.includes(action)) {
            return res.status(400).json({ message: 'Invalid teacher resource action' });
        }

        const resources = await updateTeacherResourceAccount(teacherId, {
            resourceType,
            action,
            amount: req.body.amount,
            value: req.body.value,
            reason: String(req.body.reason || '').trim() || undefined,
            updatedBy: new mongoose.Types.ObjectId(req.user!.id),
        });
        res.json({ message: 'Teacher resources updated successfully', resources });
    } catch (error: any) {
        console.error('Update teacher resources error:', error);
        res.status(error.status || 500).json({ message: error.message || 'Server error' });
    }
};
