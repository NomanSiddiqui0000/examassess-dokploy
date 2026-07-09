import { Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import mongoose from 'mongoose';
import * as XLSX from 'xlsx';
import { AuthRequest } from '../middleware/auth.middleware';
import { User } from '../models/User';
import { TeacherClassroom } from '../models/TeacherClassroom';
import { ClassroomStudent } from '../models/ClassroomStudent';
import { TeacherQuestion } from '../models/TeacherQuestion';
import { TeacherAssessment } from '../models/TeacherAssessment';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { MCQ } from '../models/MCQ';
import { MCQType } from '../models/MCQType';
import { LearningQuestionSource } from '../models/StudentQuestionBookmark';
import { sendAssessmentReminderEmail, sendClassroomInvitationEmail } from '../utils/email';
import {
    DEFAULT_QUESTION_DIFFICULTY,
    QUESTION_DIFFICULTY_MESSAGE,
    normalizeQuestionDifficulty,
} from '../constants/questionDifficulty';
import { recordLearningOutcomes, LearningOutcome } from '../services/student-learning.service';
import {
    assertTeacherEmailCapacity,
    assertTeacherResourceCapacity,
    consumeAssessmentSubmissionCredit,
    consumeEmailInvitationCredit,
    countNewTeacherStudentsForInvite,
    getTeacherResourceSnapshot,
} from '../services/teacher-resource.service';
import {
    createEmailVerificationToken,
    getUnverifiedAccountExpiry,
    normalizeEmailAddress,
    validateEmailForAccount,
} from '../utils/email-security';

type NormalizedQuestion = {
    _id: mongoose.Types.ObjectId;
    questionText: string;
    options: string[];
    correctAnswer: number;
    subject: string;
    difficulty?: string;
    marks: number;
};

const isObjectId = (value: string) => mongoose.Types.ObjectId.isValid(value);
const teacherIdOf = (req: AuthRequest) => new mongoose.Types.ObjectId(req.user!.id);
function generateJoinCode() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function generateTemporaryPassword() {
    return crypto.randomBytes(6).toString('base64url');
}

function shuffleArray<T>(arr: T[]): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

function parseCsv(buffer: Buffer): Record<string, string>[] {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const rows: string[][] = [];
    let current = '';
    let row: string[] = [];
    let quoted = false;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const next = text[i + 1];
        if (ch === '"' && quoted && next === '"') {
            current += '"';
            i++;
        } else if (ch === '"') {
            quoted = !quoted;
        } else if (ch === ',' && !quoted) {
            row.push(current.trim());
            current = '';
        } else if ((ch === '\n' || ch === '\r') && !quoted) {
            if (ch === '\r' && next === '\n') i++;
            row.push(current.trim());
            current = '';
            if (row.some(Boolean)) rows.push(row);
            row = [];
        } else {
            current += ch;
        }
    }
    row.push(current.trim());
    if (row.some(Boolean)) rows.push(row);

    if (rows.length < 2) return [];
    const headers = rows[0].map((h) => h.trim());
    return rows.slice(1).map((cells) => {
        const item: Record<string, string> = {};
        headers.forEach((header, index) => {
            item[header] = cells[index]?.trim() || '';
        });
        return item;
    });
}

function parseCsvOrWorkbook(buffer: Buffer, originalName = ''): Record<string, string>[] {
    if (originalName.toLowerCase().endsWith('.xlsx') || originalName.toLowerCase().endsWith('.xls')) {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        return XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });
    }
    return parseCsv(buffer);
}

function getRowValue(row: Record<string, any>, candidates: string[]) {
    const wanted = candidates.map((candidate) => candidate.toLowerCase());
    const key = Object.keys(row).find((item) => wanted.includes(item.trim().toLowerCase()));
    return key ? String(row[key] ?? '').trim() : '';
}

function parseStudentRowsFromBody(body: any): { name: string; email: string }[] {
    if (Array.isArray(body.students)) {
        return body.students.map((row: any) => ({ name: String(row?.name || '').trim(), email: String(row?.email || '').trim() }));
    }

    if (typeof body.students === 'string' && body.students.trim()) {
        try {
            const parsed = JSON.parse(body.students);
            if (Array.isArray(parsed)) {
                return parsed.map((row: any) => ({ name: String(row?.name || '').trim(), email: String(row?.email || '').trim() }));
            }
        } catch {
            return [];
        }
    }

    if (body.name || body.email) {
        return [{ name: String(body.name || '').trim(), email: String(body.email || '').trim() }];
    }

    return String(body.emails || '')
        .split(/\r?\n|,|;/)
        .map((email: string) => ({ name: '', email: email.trim() }))
        .filter((row: { email: string }) => row.email);
}

function normalizeCorrectAnswer(value: string, options: string[]) {
    const raw = value.trim();
    const letterIndex = ['A', 'B', 'C', 'D'].indexOf(raw.toUpperCase());
    if (letterIndex >= 0) return letterIndex;
    const numeric = Number(raw);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= 4) return numeric - 1;
    const optionIndex = options.findIndex((option) => option.trim().toLowerCase() === raw.toLowerCase());
    return optionIndex;
}

function normalizeDistribution(body: any): { mode: 'count' | 'percentage'; items: { subject: string; value: number }[]; totalQuestions: number } {
    const mode = body.distributionMode === 'percentage' ? 'percentage' : 'count';
    const items = Array.isArray(body.categoryDistribution)
        ? body.categoryDistribution
        : Array.isArray(body.subjectDistribution)
            ? body.subjectDistribution
            : [];
    const normalized = items
        .map((item: any) => ({
            subject: String(item.category || item.subject || '').trim(),
            value: Number(item.value),
        }))
        .filter((item: any) => item.subject && Number.isFinite(item.value) && item.value > 0);

    if (normalized.length === 0) {
        throw new Error('At least one MCQ category distribution item is required.');
    }

    if (mode === 'percentage') {
        const pct = normalized.reduce((sum: number, item: any) => sum + item.value, 0);
        if (Math.round(pct) !== 100) {
            throw new Error('Percentage distribution must add up to 100.');
        }
        const totalQuestions = Number(body.totalQuestions);
        if (!Number.isInteger(totalQuestions) || totalQuestions <= 0) {
            throw new Error('Total questions is required when using percentage distribution.');
        }
        return { mode, items: normalized, totalQuestions };
    }

    const totalQuestions = normalized.reduce((sum: number, item: any) => sum + item.value, 0);
    return { mode, items: normalized, totalQuestions };
}

function distributionToCounts(mode: 'count' | 'percentage', items: { subject: string; value: number }[], totalQuestions: number) {
    if (mode === 'count') {
        return items.map((item) => ({ subject: item.subject, count: Math.floor(item.value) }));
    }

    const counts = items.map((item) => ({
        subject: item.subject,
        count: Math.floor((item.value / 100) * totalQuestions),
        pct: item.value,
    }));
    let assigned = counts.reduce((sum, item) => sum + item.count, 0);
    const sorted = [...counts].sort((a, b) => b.pct - a.pct);
    let index = 0;
    while (assigned < totalQuestions) {
        sorted[index % sorted.length].count++;
        assigned++;
        index++;
    }
    return counts.map(({ subject, count }) => ({ subject, count }));
}

async function getGlobalTypeMap(subjects: string[], categoryId?: string) {
    const filter: any = {
        name: { $in: subjects.map((subject) => new RegExp(`^${subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) },
        status: 'active',
    };
    if (categoryId && isObjectId(categoryId)) filter.categoryId = categoryId;
    const types = await MCQType.find(filter).lean();
    const bySubject = new Map<string, any[]>();
    subjects.forEach((subject) => bySubject.set(subject.toLowerCase(), []));
    types.forEach((type: any) => {
        const key = subjects.find((subject) => subject.toLowerCase() === type.name.toLowerCase())?.toLowerCase();
        if (key) bySubject.get(key)!.push(type);
    });
    return bySubject;
}

async function countAvailableQuestions(
    teacherId: mongoose.Types.ObjectId,
    source: 'teacher' | 'global',
    counts: { subject: string; count: number }[],
    categoryId?: string
) {
    const result: { subject: string; required: number; available: number }[] = [];
    if (source === 'teacher') {
        for (const item of counts) {
            const available = await TeacherQuestion.countDocuments({
                teacherId,
                subject: new RegExp(`^${item.subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
            });
            result.push({ subject: item.subject, category: item.subject, required: item.count, available } as any);
        }
        return result;
    }

    const typeMap = await getGlobalTypeMap(counts.map((item) => item.subject), categoryId);
    for (const item of counts) {
        const typeIds = (typeMap.get(item.subject.toLowerCase()) || []).map((type) => type._id);
        const filter: any = { typeId: { $in: typeIds } };
        if (categoryId && isObjectId(categoryId)) filter.category = categoryId;
        const available = typeIds.length ? await MCQ.countDocuments(filter) : 0;
        result.push({ subject: item.subject, category: item.subject, required: item.count, available } as any);
    }
    return result;
}

async function selectQuestions(
    teacherId: mongoose.Types.ObjectId,
    source: 'teacher' | 'global',
    counts: { subject: string; count: number }[],
    categoryId?: string
): Promise<NormalizedQuestion[]> {
    const selected: NormalizedQuestion[] = [];
    if (source === 'teacher') {
        for (const item of counts) {
            const sampled = await TeacherQuestion.aggregate([
                {
                    $match: {
                        teacherId,
                        subject: new RegExp(`^${item.subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
                    },
                },
                { $sample: { size: item.count } },
            ]);
            selected.push(...sampled.map((q: any) => ({
                _id: q._id,
                questionText: q.questionText,
                options: q.options,
                correctAnswer: q.correctAnswer,
                subject: q.subject,
                difficulty: q.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                marks: q.marks || 1,
            })));
        }
        return selected;
    }

    const typeMap = await getGlobalTypeMap(counts.map((item) => item.subject), categoryId);
    const typeSubject = new Map<string, string>();
    typeMap.forEach((types, subject) => {
        types.forEach((type: any) => typeSubject.set(type._id.toString(), subject));
    });
    for (const item of counts) {
        const typeIds = (typeMap.get(item.subject.toLowerCase()) || []).map((type) => type._id);
        const match: any = { typeId: { $in: typeIds } };
        if (categoryId && isObjectId(categoryId)) match.category = new mongoose.Types.ObjectId(categoryId);
        const sampled = typeIds.length
            ? await MCQ.aggregate([{ $match: match }, { $sample: { size: item.count } }])
            : [];
        selected.push(...sampled.map((q: any) => ({
            _id: q._id,
            questionText: q.questionText,
            options: q.options,
            correctAnswer: q.correctAnswer,
            subject: item.subject || typeSubject.get(q.typeId?.toString()) || 'General',
            difficulty: q.difficulty || DEFAULT_QUESTION_DIFFICULTY,
            marks: 1,
        })));
    }
    return selected;
}

async function hydrateQuestions(
    teacherId: mongoose.Types.ObjectId,
    source: 'teacher' | 'global',
    ids: mongoose.Types.ObjectId[]
): Promise<NormalizedQuestion[]> {
    if (source === 'teacher') {
        const docs = await TeacherQuestion.find({ _id: { $in: ids }, teacherId }).lean();
        const map = new Map(docs.map((q: any) => [q._id.toString(), q]));
        return ids.map((id) => map.get(id.toString())).filter(Boolean).map((q: any) => ({
            _id: q._id,
            questionText: q.questionText,
            options: q.options,
            correctAnswer: q.correctAnswer,
            subject: q.subject,
            difficulty: q.difficulty || DEFAULT_QUESTION_DIFFICULTY,
            marks: q.marks || 1,
        }));
    }

    const docs = await MCQ.find({ _id: { $in: ids } }).populate('typeId', 'name').lean();
    const map = new Map(docs.map((q: any) => [q._id.toString(), q]));
    return ids.map((id) => map.get(id.toString())).filter(Boolean).map((q: any) => ({
        _id: q._id,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        subject: q.typeId?.name || 'General',
        difficulty: q.difficulty || DEFAULT_QUESTION_DIFFICULTY,
        marks: 1,
    }));
}

function buildQuestionSnapshot(questions: NormalizedQuestion[], mode: 'strict' | 'secure' | 'practice') {
    const ordered = mode === 'strict' ? questions : shuffleArray(questions);
    return ordered.map((question) => {
        const optionOrder = mode === 'strict' ? [0, 1, 2, 3] : shuffleArray([0, 1, 2, 3]);
        const displayOptions = optionOrder.map((index) => question.options[index]);
        const correctAnswer = optionOrder.indexOf(question.correctAnswer);
        return {
            sourceQuestionId: question._id,
            questionText: question.questionText,
            options: displayOptions,
            correctAnswer,
            subject: question.subject,
            difficulty: question.difficulty || DEFAULT_QUESTION_DIFFICULTY,
            marks: question.marks,
            optionOrder,
        };
    });
}

async function assertTeacherClassroom(teacherId: mongoose.Types.ObjectId, classroomId: string) {
    const classroom = await TeacherClassroom.findOne({ _id: classroomId, teacherId });
    if (!classroom) {
        throw Object.assign(new Error('Classroom not found'), { status: 404 });
    }
    return classroom;
}

function parseAssessmentSchedule(body: any) {
    const startTime = new Date(`${body.assessmentDate}T${body.assessmentStartTime}`);
    const endTime = new Date(`${body.assessmentDate}T${body.assessmentEndTime}`);
    return { startTime, endTime };
}

function validateFutureAssessmentSchedule(startTime: Date, endTime: Date, now = new Date()) {
    if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        throw Object.assign(new Error('Valid assessment date, start time, and end time are required'), { status: 400 });
    }
    if (endTime <= startTime) {
        throw Object.assign(new Error('Assessment end time must be after the start time.'), { status: 400 });
    }
    if (endTime <= now) {
        throw Object.assign(new Error('This assessment schedule has already expired.'), { status: 400 });
    }
    if (startTime <= now) {
        throw Object.assign(new Error('Assessment start time must be in the future.'), { status: 400 });
    }
}

function getAssessmentRuntimeStatus(assessment: any, now = new Date()) {
    if (assessment.status === 'cancelled' || assessment.status === 'archived') return 'cancelled';
    const start = new Date(assessment.startTime);
    const end = new Date(assessment.endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'scheduled';
    if (now > end) return 'completed';
    if (now >= start && now <= end) return 'live';
    return 'scheduled';
}

function getAssessmentStatusLabel(status: string) {
    if (status === 'live') return 'Live';
    if (status === 'completed') return 'Completed';
    if (status === 'cancelled') return 'Cancelled';
    return 'Scheduled';
}

async function refreshTeacherAssessmentStatuses(teacherId?: mongoose.Types.ObjectId) {
    const filter: any = {
        status: { $in: ['scheduled'] },
        endTime: { $lt: new Date() },
    };
    if (teacherId) filter.teacherId = teacherId;
    await TeacherAssessment.updateMany(filter, { $set: { status: 'completed' } });
}

async function autoSubmitExpiredAttempts() {
    const now = new Date();
    const expired = await AssessmentAttempt.find({
        status: { $in: ['started', 'in_progress'] },
        allowedUntil: { $lte: now },
    }).limit(500);

    await Promise.all(expired.map((attempt) => finalizeAttempt(attempt, attempt.answers || [], true)));
}

async function finalizeAttempt(attempt: any, answers: number[], autoSubmitted: boolean) {
    if (attempt.status === 'submitted' || attempt.status === 'auto_submitted') return attempt;
    const normalizedAnswers = attempt.questions.map((_: any, index: number) => {
        const value = answers[index];
        return Number.isInteger(value) ? value : -1;
    });
    const score = attempt.questions.reduce((sum: number, question: any, index: number) => {
        return sum + (normalizedAnswers[index] === question.correctAnswer ? question.marks : 0);
    }, 0);
    const totalMarks = attempt.questions.reduce((sum: number, question: any) => sum + question.marks, 0);
    const percentage = totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0;
    const assessment = await TeacherAssessment.findById(attempt.assessmentId).lean();
    attempt.answers = normalizedAnswers;
    attempt.score = score;
    attempt.totalMarks = totalMarks;
    attempt.percentage = percentage;
    attempt.passed = assessment ? percentage >= assessment.passingPercentage : false;
    attempt.status = autoSubmitted ? 'auto_submitted' : 'submitted';
    attempt.submittedAt = new Date();
    attempt.timeTaken = Math.max(0, Math.floor((attempt.submittedAt.getTime() - attempt.startedAt.getTime()) / 1000));
    await attempt.save();
    await recordAssessmentLearningIfReleased(assessment, attempt, normalizedAnswers);
    try {
        await consumeAssessmentSubmissionCredit(attempt, assessment);
    } catch (creditError) {
        console.error('Assessment credit tracking failed:', creditError);
    }
    return attempt;
}

function buildAssessmentLearningOutcomes(assessment: any, attempt: any, answers: number[]): LearningOutcome[] {
    const sourceType: LearningQuestionSource = assessment?.questionSource === 'global' ? 'mcq' : 'teacher_question';
    return attempt.questions.map((question: any, index: number) => ({
        sourceType,
        sourceQuestionId: question.sourceQuestionId,
        questionText: question.questionText,
        options: question.options,
        correctAnswer: question.correctAnswer,
        studentAnswer: answers[index],
        category: question.subject || 'General',
        difficulty: question.difficulty || DEFAULT_QUESTION_DIFFICULTY,
        marks: question.marks || 1,
        answeredCorrect: answers[index] === question.correctAnswer,
        attemptedAt: attempt.submittedAt,
    }));
}

async function recordAssessmentLearningIfReleased(assessment: any, attempt: any, answers?: number[]) {
    if (!assessment?.resultsReleased || attempt.learningRecordedAt) return;
    const normalizedAnswers = answers || attempt.answers || [];
    await recordLearningOutcomes(attempt.studentId, buildAssessmentLearningOutcomes(assessment, attempt, normalizedAnswers));
    const recordedAt = new Date();
    if (typeof attempt.save === 'function') {
        attempt.learningRecordedAt = recordedAt;
        await attempt.save();
        return;
    }
    await AssessmentAttempt.updateOne(
        { _id: attempt._id, learningRecordedAt: { $exists: false } },
        { $set: { learningRecordedAt: recordedAt } }
    );
}

function csvEscape(value: any) {
    const text = String(value ?? '');
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Record<string, any>[]) {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    return [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))].join('\n');
}

function sendCsvDownload(res: Response, filename: string, rows: Record<string, any>[]) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(toCsv(rows));
}

function formatSeconds(seconds: number) {
    const total = Math.max(0, Number(seconds) || 0);
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function buildAttemptReview(attempt: any) {
    if (!attempt) return [];
    return (attempt.questions || []).map((question: any, index: number) => {
        const selectedIndex = Number.isInteger(attempt.answers?.[index]) ? attempt.answers[index] : -1;
        const correct = selectedIndex === question.correctAnswer;
        return {
            questionNumber: index + 1,
            questionText: question.questionText,
            subject: question.subject,
            marks: question.marks,
            options: question.options,
            selectedAnswer: selectedIndex,
            selectedAnswerText: selectedIndex >= 0 ? question.options[selectedIndex] : 'Not answered',
            correctAnswer: question.correctAnswer,
            correctAnswerText: question.options[question.correctAnswer],
            correct,
        };
    });
}

function simplePdf(title: string, lines: string[]) {
    const content = [`BT /F1 18 Tf 50 760 Td (${title.replace(/[()\\]/g, '')}) Tj ET`];
    lines.slice(0, 42).forEach((line, index) => {
        content.push(`BT /F1 10 Tf 50 ${730 - index * 15} Td (${line.replace(/[()\\]/g, '').slice(0, 95)}) Tj ET`);
    });
    const stream = content.join('\n');
    const objects = [
        '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
        '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
        '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj',
        '4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
        `5 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
    ];
    return Buffer.from(`%PDF-1.4\n${objects.join('\n')}\ntrailer << /Root 1 0 R >>\n%%EOF`);
}

export const getTeacherDashboard = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        await refreshTeacherAssessmentStatuses(teacherId);
        const [classrooms, students, assessments, questions, resources] = await Promise.all([
            TeacherClassroom.countDocuments({ teacherId, status: 'active' }),
            ClassroomStudent.countDocuments({ teacherId, status: { $ne: 'removed' } }),
            TeacherAssessment.countDocuments({ teacherId, status: { $in: ['scheduled'] } }),
            TeacherQuestion.countDocuments({ teacherId }),
            getTeacherResourceSnapshot(teacherId),
        ]);
        res.json({ classrooms, students, activeAssessments: assessments, teacherQuestions: questions, resources });
    } catch (error) {
        console.error('Teacher dashboard error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const createClassroom = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const { name, description, academicSession, status } = req.body;
        if (!name?.trim()) return res.status(400).json({ message: 'Classroom name is required' });
        await assertTeacherResourceCapacity(teacherId, 'classrooms', 1);

        let joinCode = generateJoinCode();
        while (await TeacherClassroom.exists({ joinCode })) joinCode = generateJoinCode();

        const classroom = await TeacherClassroom.create({
            teacherId,
            name: name.trim(),
            description,
            academicSession,
            status: status === 'archived' ? 'archived' : 'active',
            joinCode,
        });
        res.status(201).json(classroom);
    } catch (error: any) {
        console.error('Create classroom error:', error);
        res.status(error.status || 500).json({ message: error.message || 'Server error' });
    }
};

export const getClassrooms = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const classrooms = await TeacherClassroom.find({ teacherId }).sort({ createdAt: -1 }).lean();
        const ids = classrooms.map((classroom: any) => classroom._id);
        const [studentCounts, activeAssessments, previousAssessments] = await Promise.all([
            ClassroomStudent.aggregate([
                { $match: { teacherId, classroomId: { $in: ids }, status: { $ne: 'removed' } } },
                { $group: { _id: '$classroomId', count: { $sum: 1 } } },
            ]),
            TeacherAssessment.aggregate([
                { $match: { teacherId, classroomId: { $in: ids }, endTime: { $gte: new Date() }, status: { $ne: 'archived' } } },
                { $group: { _id: '$classroomId', count: { $sum: 1 } } },
            ]),
            TeacherAssessment.aggregate([
                { $match: { teacherId, classroomId: { $in: ids }, endTime: { $lt: new Date() } } },
                { $group: { _id: '$classroomId', count: { $sum: 1 } } },
            ]),
        ]);
        const countMap = (rows: any[]) => new Map(rows.map((row) => [row._id.toString(), row.count]));
        const studentMap = countMap(studentCounts);
        const activeMap = countMap(activeAssessments);
        const previousMap = countMap(previousAssessments);
        res.json(classrooms.map((classroom: any) => ({
            ...classroom,
            totalStudents: studentMap.get(classroom._id.toString()) || 0,
            activeAssessments: activeMap.get(classroom._id.toString()) || 0,
            previousAssessments: previousMap.get(classroom._id.toString()) || 0,
        })));
    } catch (error) {
        console.error('Get classrooms error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateClassroom = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const classroom = await TeacherClassroom.findOneAndUpdate(
            { _id: req.params.id, teacherId },
            {
                $set: {
                    name: req.body.name,
                    description: req.body.description,
                    academicSession: req.body.academicSession,
                    status: req.body.status === 'archived' ? 'archived' : 'active',
                },
            },
            { new: true, runValidators: true }
        );
        if (!classroom) return res.status(404).json({ message: 'Classroom not found' });
        res.json(classroom);
    } catch (error) {
        console.error('Update classroom error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const inviteStudents = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const classroom = await assertTeacherClassroom(teacherId, req.params.id);
        const teacher = await User.findById(teacherId).lean();
        const allowResend = req.body.resend === true || req.body.resend === 'true';
        const assessmentId = String(req.body.assessmentId || req.query.assessmentId || '').trim();
        const selectedAssessment = assessmentId && isObjectId(assessmentId)
            ? await TeacherAssessment.findOne({ _id: assessmentId, teacherId, classroomId: classroom._id }).lean()
            : null;
        if (assessmentId && !selectedAssessment) {
            return res.status(400).json({ message: 'Selected assessment was not found for this classroom' });
        }
        const isBulkImport = !!req.file;
        const parsedRows = req.file ? parseCsvOrWorkbook(req.file.buffer, req.file.originalname) : [];
        const rows = req.file
            ? parsedRows.map((row) => ({
                name: getRowValue(row, ['Name', 'Student Name', 'Full Name']),
                email: getRowValue(row, ['Email', 'Email Address', 'Student Email', 'Student Email Address']),
            }))
            : parseStudentRowsFromBody(req.body);

        const results: any[] = [];
        const normalizedRows: { row?: number; name: string; email: string }[] = [];
        const validationEmails = new Set<string>();

        if (isBulkImport) {
            if (!req.file?.originalname.toLowerCase().match(/\.(csv|xlsx|xls)$/)) {
                return res.status(400).json({ message: 'Upload a valid CSV, XLSX, or XLS student file' });
            }
            if (parsedRows.length === 0) {
                return res.status(400).json({ message: 'The uploaded file does not contain any student rows' });
            } else {
                const headers = Object.keys(parsedRows[0]).map((header) => header.trim().toLowerCase());
                const hasName = headers.some((header) => ['name', 'student name', 'full name'].includes(header));
                const hasEmail = headers.some((header) => ['email', 'email address', 'student email', 'student email address'].includes(header));
                if (!hasName || !hasEmail) {
                    return res.status(400).json({
                        message: [
                            !hasName ? 'CSV header "Name" is required' : '',
                            !hasEmail ? 'CSV header "Email" is required' : '',
                        ].filter(Boolean).join('. '),
                    });
                }
            }
        }

        if (rows.length === 0) {
            return res.status(400).json({ message: isBulkImport ? 'No students found in the uploaded file' : 'Student name and email are required' });
        }

        rows.forEach((row, index) => {
            const rawEmail = String(row.email || '');
            const email = normalizeEmailAddress(rawEmail);
            const name = String(row.name || '').trim();
            const rowNumber = isBulkImport ? index + 2 : index + 1;
            if (!name) {
                results.push({ row: rowNumber, email, status: 'skipped', message: 'Student name is required' });
                return;
            }
            if (!email) {
                results.push({ row: rowNumber, name, status: 'skipped', message: 'Student email address is required' });
                return;
            }
            const emailValidation = validateEmailForAccount(email);
            if (!emailValidation.valid) {
                results.push({ row: rowNumber, name, email, status: 'skipped', message: emailValidation.message || 'Student email address is invalid' });
                return;
            }
            if (validationEmails.has(emailValidation.email)) {
                results.push({ row: rowNumber, name, email: emailValidation.email, status: 'skipped', message: 'Duplicate student in this import' });
                return;
            }
            validationEmails.add(emailValidation.email);
            normalizedRows.push({ row: rowNumber, name, email: emailValidation.email });
        });

        const emails = normalizedRows.map((row) => row.email);
        const emailRegexes = emails.map((email) => new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'));
        const existingUsers = await User.find({
            $or: [
                { email: { $in: emails } },
                { username: { $in: emails } },
                { email: { $in: emailRegexes } },
                { username: { $in: emailRegexes } },
            ],
        }).select('_id role email username fullName').lean();
        const userByEmail = new Map<string, any>();
        existingUsers.forEach((existingUser: any) => {
            if (existingUser.email) userByEmail.set(String(existingUser.email).toLowerCase(), existingUser);
            if (existingUser.username) userByEmail.set(String(existingUser.username).toLowerCase(), existingUser);
        });
        const existingStudentIds = existingUsers.filter((item: any) => item.role === 'user').map((item: any) => item._id);
        const existingMemberships = existingStudentIds.length
            ? await ClassroomStudent.find({
                classroomId: classroom._id,
                studentId: { $in: existingStudentIds },
                status: { $ne: 'removed' },
            }).select('studentId').lean()
            : [];
        const existingMemberIds = new Set(existingMemberships.map((membership: any) => membership.studentId.toString()));

        for (const row of normalizedRows) {
            const existingUser = userByEmail.get(row.email);
            if (existingUser?.role && existingUser.role !== 'user') {
                results.push({
                    row: row.row,
                    email: row.email,
                    name: row.name,
                    status: 'skipped',
                    message: 'This email is already associated with a staff account and cannot be invited as a student.',
                });
                continue;
            }
            if (existingUser && existingMemberIds.has(existingUser._id.toString()) && !allowResend) {
                results.push({ row: row.row, email: row.email, name: row.name, status: 'skipped', message: 'Student is already in this classroom' });
                continue;
            }
        }

        const blockedRows = new Set(results.filter((result) => result.row).map((result) => Number(result.row)));
        const processableRows = normalizedRows.filter((row) => !blockedRows.has(Number(row.row)));
        const existingStudentCandidateIds = processableRows
            .map((row) => userByEmail.get(row.email))
            .filter((student) => student?.role === 'user')
            .map((student) => student._id);
        const newExistingTeacherStudents = await countNewTeacherStudentsForInvite(teacherId, existingStudentCandidateIds);
        const newStudentAccounts = processableRows.filter((row) => !userByEmail.get(row.email)).length;
        await assertTeacherResourceCapacity(teacherId, 'students', newExistingTeacherStudents + newStudentAccounts);
        // Each processable row sends one invitation email — ensure enough email credits up-front.
        await assertTeacherEmailCapacity(teacherId, processableRows.length);

        for (const row of processableRows) {
            const email = row.email;
            const name = row.name;
            let temporaryPassword: string | undefined;
            let inviteVerificationToken: string | undefined;
            const emailRegex = new RegExp(`^${email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
            let student = await User.findOne({ $or: [{ email }, { username: email }, { email: emailRegex }, { username: emailRegex }] });
            if (!student) {
                temporaryPassword = generateTemporaryPassword();
                const verification = createEmailVerificationToken(7 * 24);
                inviteVerificationToken = verification.verificationToken;
                student = await User.create({
                    username: email,
                    email,
                    fullName: name || email,
                    password: await bcrypt.hash(temporaryPassword, 10),
                    role: 'user',
                    isActive: true,
                    emailVerified: false,
                    emailVerificationToken: verification.hashedToken,
                    emailVerificationExpires: verification.expiresAt,
                    registrationSource: 'teacher_invite',
                    unverifiedAccountExpiresAt: getUnverifiedAccountExpiry('teacher_invite'),
                    mustChangePassword: true,
                    credits: 0,
                    modules: { practiceModule: false, teacherAssessments: true },
                });
            } else {
                if (student.role !== 'user') {
                    results.push({
                        row: row.row,
                        name,
                        email,
                        status: 'skipped',
                        message: 'This email is already associated with a staff account and cannot be invited as a student.',
                    });
                    continue;
                }
                if (!student.fullName && name) {
                    student.fullName = name;
                }
                // Additively enable teacher assessments module
                if (!student.modules?.teacherAssessments) {
                    student.modules = {
                        practiceModule: student.modules?.practiceModule ?? false,
                        teacherAssessments: true,
                    };
                }
                if (!student.emailVerified) {
                    const verification = createEmailVerificationToken(7 * 24);
                    inviteVerificationToken = verification.verificationToken;
                    student.emailVerificationToken = verification.hashedToken;
                    student.emailVerificationExpires = verification.expiresAt;
                    student.registrationSource = student.registrationSource || 'teacher_invite';
                    student.unverifiedAccountExpiresAt = getUnverifiedAccountExpiry('teacher_invite');
                }
                if (student.isModified()) {
                    await student.save();
                }
            }

            await ClassroomStudent.findOneAndUpdate(
                { classroomId: classroom._id, studentId: student._id },
                {
                    $set: {
                        teacherId,
                        invitedEmail: email,
                        invitedName: name || student.fullName,
                        status: 'active',
                        joinedAt: new Date(),
                    },
                    $setOnInsert: { invitedAt: new Date() },
                },
                { upsert: true, new: true }
            );

            let emailStatus: 'sent' | 'failed' = 'sent';
            let emailErrorMessage: string | undefined;
            try {
                await sendClassroomInvitationEmail(email, {
                    studentName: name || student.fullName,
                    teacherName: teacher?.fullName || teacher?.username || 'Your teacher',
                    classroomName: classroom.name,
                    loginEmail: email,
                    temporaryPassword,
                    assessmentName: selectedAssessment?.name,
                    assessmentStart: selectedAssessment?.startTime,
                    assessmentEnd: selectedAssessment?.endTime,
                    durationMinutes: selectedAssessment?.durationMinutes,
                    totalQuestions: selectedAssessment?.totalQuestions,
                    lateJoinPolicy: selectedAssessment?.lateJoinPolicy,
                    verificationToken: inviteVerificationToken,
                });
                try {
                    await consumeEmailInvitationCredit({
                        teacherId,
                        classroomId: classroom._id,
                        studentId: student._id,
                        email,
                        studentName: name || student.fullName,
                    });
                } catch (creditError) {
                    console.error('Invitation email credit tracking failed:', creditError);
                }
            } catch (emailError: any) {
                emailStatus = 'failed';
                emailErrorMessage = emailError.message;
                console.error('Invitation email failed:', emailError.message);
            }
            results.push({
                row: row.row,
                name,
                email,
                status: emailStatus === 'failed' ? 'failed' : temporaryPassword ? 'created' : 'invited',
                accountStatus: temporaryPassword ? 'created' : 'existing_student',
                emailStatus,
                emailError: emailErrorMessage,
            });
        }

        const imported = results.filter((result) => ['created', 'invited', 'failed'].includes(result.status)).length;
        const invitationsSent = results.filter((result) => result.emailStatus === 'sent').length;
        const skipped = results.filter((result) => result.status === 'skipped').length;
        const failed = results.filter((result) => result.status === 'failed').length;
        const summary = { imported, invitationsSent, skipped, failed, total: results.length };
        const statusCode = !isBulkImport && imported === 0 ? 400 : 200;

        res.status(statusCode).json({
            message: isBulkImport
                ? `Import completed. Imported: ${imported}. Invitations Sent: ${invitationsSent}. Skipped: ${skipped}. Failed: ${failed}.`
                : imported > 0
                    ? failed > 0 ? 'Student added, but the invitation email failed to send' : 'Student invited successfully'
                    : 'Student invitation failed',
            accepted: imported,
            emailFailed: failed,
            summary,
            results,
        });
    } catch (error: any) {
        console.error('Invite students error:', error);
        res.status(error.status || 500).json({ message: error.message || 'Server error' });
    }
};

export const getClassroomStudents = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        await assertTeacherClassroom(teacherId, req.params.id);
        const students = await ClassroomStudent.find({ classroomId: req.params.id, teacherId, status: { $ne: 'removed' } })
            .populate('studentId', 'fullName email username isActive mustChangePassword emailVerified lastLogin')
            .sort({ invitedAt: -1 });
        res.json(students);
    } catch (error: any) {
        console.error('Get classroom students error:', error);
        res.status(error.status || 500).json({ message: error.message || 'Server error' });
    }
};

export const removeClassroomStudent = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const studentId = req.params.studentId;

        if (!isObjectId(studentId)) {
            return res.status(400).json({ message: 'Invalid student or enrollment ID' });
        }

        const removed = await ClassroomStudent.findOneAndUpdate(
            {
                classroomId: req.params.id,
                teacherId,
                $or: [
                    { studentId: new mongoose.Types.ObjectId(studentId) },
                    { _id: new mongoose.Types.ObjectId(studentId) }
                ]
            },
            { $set: { status: 'removed' } }
        );
        if (!removed) return res.status(404).json({ message: 'Classroom student not found' });
        res.json({ message: 'Student removed from classroom' });
    } catch (error) {
        console.error('Remove classroom student error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const removeClassroomStudents = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        await assertTeacherClassroom(teacherId, req.params.id);
        const studentIds = Array.isArray(req.body.studentIds) ? req.body.studentIds.filter((id: any) => id && isObjectId(id)) : [];
        if (studentIds.length === 0) {
            return res.status(400).json({ message: 'At least one student must be selected' });
        }
        const objectIds = studentIds.map((id: string) => new mongoose.Types.ObjectId(id));
        const result = await ClassroomStudent.updateMany(
            {
                classroomId: req.params.id,
                teacherId,
                $or: [
                    { studentId: { $in: objectIds } },
                    { _id: { $in: objectIds } }
                ]
            },
            { $set: { status: 'removed' } }
        );
        res.json({ message: 'Students removed from classroom', removed: result.modifiedCount });
    } catch (error: any) {
        console.error('Bulk remove classroom students error:', error);
        res.status(error.status || 500).json({ message: error.message || 'Server error' });
    }
};

export const downloadStudentTemplate = async (_req: AuthRequest, res: Response) => {
    return sendCsvDownload(res, 'examassess-student-import-template.csv', [
        { Name: 'Ali', Email: 'ali@example.com' },
        { Name: 'Ahmed', Email: 'ahmed@example.com' },
        { Name: 'Sara', Email: 'sara@example.com' },
    ]);
};

export const downloadTeacherQuestionTemplate = async (_req: AuthRequest, res: Response) => {
    return sendCsvDownload(res, 'examassess-teacher-mcq-template.csv', [
        {
            Question: 'What is 2+2?',
            OptionA: '3',
            OptionB: '4',
            OptionC: '5',
            OptionD: '6',
            CorrectAnswer: 'B',
            Category: 'Mathematics',
            Difficulty: 'Easy',
            Explanation: '2 plus 2 equals 4',
            Marks: 1,
        },
    ]);
};

export const createTeacherQuestion = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const { questionText, options, correctAnswer, subject, difficulty, marks, explanation } = req.body;

        if (!questionText || !options || options.length !== 4 || correctAnswer === undefined || !subject) {
            return res.status(400).json({ message: 'Missing required fields for question.' });
        }

        const normalizedDifficulty = difficulty === undefined || String(difficulty).trim() === ''
            ? DEFAULT_QUESTION_DIFFICULTY
            : normalizeQuestionDifficulty(difficulty);
        if (!normalizedDifficulty) {
            return res.status(400).json({ message: QUESTION_DIFFICULTY_MESSAGE });
        }

        await assertTeacherResourceCapacity(teacherId, 'questions', 1);

        const question = await TeacherQuestion.create({
            teacherId,
            questionText,
            options,
            correctAnswer: Number(correctAnswer),
            subject,
            difficulty: normalizedDifficulty,
            marks: marks || 1,
            explanation: explanation || '',
        });

        res.status(201).json({ message: 'Question added successfully', question });
    } catch (error: any) {
        console.error('Create teacher question error:', error);
        res.status(error.status || 500).json({ message: error.message || 'Failed to create question' });
    }
};

export const uploadTeacherQuestions = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'CSV or Excel file is required' });
        const teacherId = teacherIdOf(req);
        const rows = parseCsvOrWorkbook(req.file.buffer, req.file.originalname);
        if (!rows.length) {
            return res.status(400).json({ message: 'File is empty or has no data rows' });
        }

        // Use flexible header matching — same approach as student invitation parser
        const first = rows[0];
        const headerChecks: { label: string; candidates: string[] }[] = [
            { label: 'Question', candidates: ['Question', 'Question Text', 'QuestionText', 'question'] },
            { label: 'OptionA', candidates: ['OptionA', 'Option A', 'Option_A', 'optiona'] },
            { label: 'OptionB', candidates: ['OptionB', 'Option B', 'Option_B', 'optionb'] },
            { label: 'OptionC', candidates: ['OptionC', 'Option C', 'Option_C', 'optionc'] },
            { label: 'OptionD', candidates: ['OptionD', 'Option D', 'Option_D', 'optiond'] },
            { label: 'CorrectAnswer', candidates: ['CorrectAnswer', 'Correct Answer', 'Correct_Answer', 'correctanswer'] },
            { label: 'Difficulty', candidates: ['Difficulty', 'Difficulty Level', 'difficulty'] },
        ];
        const missing = headerChecks
            .filter((check) => !getRowValue(first, check.candidates))
            .map((check) => check.label);
        // Category/Subject: at least one must be present
        if (!getRowValue(first, ['Category', 'Subject', 'Category/Topic', 'Topic', 'category', 'subject'])) {
            missing.push('Category');
        }
        if (missing.length) {
            return res.status(400).json({ message: `Invalid file structure. Missing: ${missing.join(', ')}` });
        }

        const errors: string[] = [];
        const docs: any[] = [];
        const fileQuestions = new Set<string>();
        const existingQuestions = new Set(
            (await TeacherQuestion.find({ teacherId }).select('questionText').lean())
                .map((q: any) => String(q.questionText).trim().toLowerCase())
        );
        rows.forEach((row, index) => {
            const line = index + 2;
            const questionText = (getRowValue(row, ['Question', 'Question Text', 'QuestionText']) || '').trim();
            const optA = (getRowValue(row, ['OptionA', 'Option A', 'Option_A']) || '').trim();
            const optB = (getRowValue(row, ['OptionB', 'Option B', 'Option_B']) || '').trim();
            const optC = (getRowValue(row, ['OptionC', 'Option C', 'Option_C']) || '').trim();
            const optD = (getRowValue(row, ['OptionD', 'Option D', 'Option_D']) || '').trim();
            const options = [optA, optB, optC, optD];
            const difficulty = normalizeQuestionDifficulty(getRowValue(row, ['Difficulty', 'Difficulty Level']) || '');
            const correctAnswer = normalizeCorrectAnswer(getRowValue(row, ['CorrectAnswer', 'Correct Answer', 'Correct_Answer']) || '', options);
            const category = (getRowValue(row, ['Category', 'Subject', 'Category/Topic', 'Topic']) || '').trim();
            const normalizedQuestion = questionText.toLowerCase();
            if (!questionText) errors.push(`Row ${line}: Question is required`);
            if (questionText && fileQuestions.has(normalizedQuestion)) errors.push(`Row ${line}: Duplicate question in uploaded file`);
            if (questionText && existingQuestions.has(normalizedQuestion)) errors.push(`Row ${line}: Question already exists in your MCQ bank`);
            if (options.some((option) => !option)) errors.push(`Row ${line}: All four options are required`);
            if (correctAnswer < 0) errors.push(`Row ${line}: CorrectAnswer must be A, B, C, D, 1-4, or exact option text`);
            if (!category) errors.push(`Row ${line}: MCQ Category is required`);
            if (!difficulty) errors.push(`Row ${line}: ${QUESTION_DIFFICULTY_MESSAGE}`);
            const marksRaw = getRowValue(row, ['Marks', 'marks', 'Mark']);
            const marks = marksRaw ? Number(marksRaw) : 1;
            if (!Number.isFinite(marks) || marks <= 0) errors.push(`Row ${line}: Marks must be a positive number`);
            if (errors.length === 0 || !errors.some((err) => err.startsWith(`Row ${line}:`))) {
                fileQuestions.add(normalizedQuestion);
                docs.push({
                    teacherId,
                    questionText,
                    options,
                    correctAnswer,
                    subject: category,
                    difficulty,
                    explanation: (getRowValue(row, ['Explanation', 'explanation']) || '').trim() || undefined,
                    marks,
                });
            }
        });

        if (errors.length) {
            return res.status(400).json({ message: 'Question upload validation failed', errors });
        }

        await assertTeacherResourceCapacity(teacherId, 'questions', docs.length);

        await TeacherQuestion.insertMany(docs);
        res.status(201).json({ message: 'Questions uploaded successfully', inserted: docs.length });
    } catch (error: any) {
        console.error('Upload teacher questions error:', error);
        res.status(error.status || 500).json({ message: error.message || 'Server error' });
    }
};

export const getQuestionBankAnalytics = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const [total, distribution] = await Promise.all([
            TeacherQuestion.countDocuments({ teacherId }),
            TeacherQuestion.aggregate([
                { $match: { teacherId } },
                { $group: { _id: '$subject', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
            ]),
        ]);
        const categoryDistribution = distribution.map((row) => ({ category: row._id, subject: row._id, count: row.count }));
        res.json({
            total,
            categoryDistribution,
            subjectDistribution: categoryDistribution,
        });
    } catch (error) {
        console.error('Question analytics error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getTeacherQuestionCategories = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const categories = await TeacherQuestion.aggregate([
            { $match: { teacherId } },
            { $group: { _id: '$subject', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
        ]);
        res.json(categories.map((row) => ({ category: row._id, subject: row._id, count: row.count })));
    } catch (error) {
        console.error('Get teacher question categories error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getTeacherQuestions = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 25));
        const filter: any = { teacherId };
        
        if (req.query.subject) filter.subject = new RegExp(`^${String(req.query.subject).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        if (req.query.difficulty) filter.difficulty = new RegExp(`^${String(req.query.difficulty).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
        if (req.query.search) filter.questionText = { $regex: String(req.query.search), $options: 'i' };

        const sortField = String(req.query.sortBy || 'createdAt');
        const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
        const sortOptions: any = { [sortField]: sortOrder };

        const [items, total] = await Promise.all([
            TeacherQuestion.find(filter).sort(sortOptions).skip((page - 1) * limit).limit(limit),
            TeacherQuestion.countDocuments(filter),
        ]);
        res.json({ items, total, page, limit });
    } catch (error) {
        console.error('Get teacher questions error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const validateAssessmentConfig = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        if (req.body.assessmentDate && req.body.assessmentStartTime && req.body.assessmentEndTime) {
            const { startTime, endTime } = parseAssessmentSchedule(req.body);
            validateFutureAssessmentSchedule(startTime, endTime);
        }
        const distribution = normalizeDistribution(req.body);
        const counts = distributionToCounts(distribution.mode, distribution.items, distribution.totalQuestions);
        const availability = await countAvailableQuestions(teacherId, req.body.questionSource === 'global' ? 'global' : 'teacher', counts, req.body.globalCategoryId);
        const valid = availability.every((item) => item.available >= item.required);
        res.status(valid ? 200 : 400).json({ valid, availability });
    } catch (error: any) {
        res.status(400).json({ message: error.message });
    }
};

export const createAssessment = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        await assertTeacherClassroom(teacherId, req.body.classroomId);
        await assertTeacherResourceCapacity(teacherId, 'assessments', 1);
        const { startTime, endTime } = parseAssessmentSchedule(req.body);
        validateFutureAssessmentSchedule(startTime, endTime);
        const distribution = normalizeDistribution(req.body);
        const counts = distributionToCounts(distribution.mode, distribution.items, distribution.totalQuestions);
        const questionSource = req.body.questionSource === 'global' ? 'global' : 'teacher';
        const availability = await countAvailableQuestions(teacherId, questionSource, counts, req.body.globalCategoryId);
        const insufficient = availability.filter((item) => item.available < item.required);
        if (insufficient.length) {
            return res.status(400).json({
                message: 'Insufficient questions for assessment configuration',
                availability,
            });
        }

        const baseQuestions = req.body.randomizationMode === 'practice'
            ? []
            : await selectQuestions(teacherId, questionSource, counts, req.body.globalCategoryId);

        const assessment = await TeacherAssessment.create({
            teacherId,
            classroomId: req.body.classroomId,
            name: String(req.body.name || '').trim(),
            questionSource,
            globalCategoryId: questionSource === 'global' && req.body.globalCategoryId ? req.body.globalCategoryId : undefined,
            assessmentDate: startTime,
            startTime,
            endTime,
            durationMinutes: Number(req.body.durationMinutes),
            passingPercentage: Number(req.body.passingPercentage),
            attemptLimit: Number(req.body.attemptLimit) || 1,
            distributionMode: distribution.mode,
            subjectDistribution: distribution.items,
            randomizationMode: ['strict', 'secure', 'practice'].includes(req.body.randomizationMode) ? req.body.randomizationMode : 'secure',
            lateJoinPolicy: req.body.lateJoinPolicy === 'block' ? 'block' : 'allow',
            resultPolicy: req.body.resultPolicy === 'immediate' ? 'immediate' : 'manual',
            resultsReleased: req.body.resultPolicy === 'immediate',
            status: 'scheduled',
            baseQuestionIds: baseQuestions.map((q) => q._id),
            totalQuestions: distribution.totalQuestions,
        });

        res.status(201).json({ assessment, availability });
    } catch (error: any) {
        console.error('Create assessment error:', error);
        res.status(error.status || 500).json({ message: error.message || 'Server error' });
    }
};

export const getAssessments = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        await refreshTeacherAssessmentStatuses(teacherId);
        const filter: any = { teacherId };
        if (req.query.classroomId) filter.classroomId = req.query.classroomId;
        const assessments = await TeacherAssessment.find(filter)
            .populate('classroomId', 'name')
            .sort({ startTime: -1 })
            .lean();
        const ids = assessments.map((a: any) => a._id);
        const teacherQuestionIds = Array.from(new Set(assessments
            .filter((assessment: any) => assessment.questionSource === 'teacher')
            .flatMap((assessment: any) => (assessment.baseQuestionIds || []).map((id: any) => id.toString()))));
        const [submitted, teacherQuestionMarks] = await Promise.all([
            AssessmentAttempt.aggregate([
                { $match: { assessmentId: { $in: ids }, status: { $in: ['submitted', 'auto_submitted'] } } },
                { $group: { _id: '$assessmentId', count: { $sum: 1 }, avg: { $avg: '$percentage' } } },
            ]),
            teacherQuestionIds.length
                ? TeacherQuestion.find({ _id: { $in: teacherQuestionIds.map((id) => new mongoose.Types.ObjectId(id)) } }).select('_id marks').lean()
                : Promise.resolve([]),
        ]);
        const submittedMap = new Map(submitted.map((row) => [row._id.toString(), row]));
        const marksMap = new Map((teacherQuestionMarks as any[]).map((question: any) => [question._id.toString(), Number(question.marks || 1)]));
        const now = new Date();
        res.json(assessments.map((assessment: any) => ({
            ...assessment,
            computedStatus: getAssessmentRuntimeStatus(assessment, now),
            statusLabel: getAssessmentStatusLabel(getAssessmentRuntimeStatus(assessment, now)),
            totalMarks: assessment.questionSource === 'teacher' && assessment.baseQuestionIds?.length
                ? assessment.baseQuestionIds.reduce((sum: number, id: any) => sum + (marksMap.get(id.toString()) || 1), 0)
                : assessment.totalQuestions,
            submittedCount: submittedMap.get(assessment._id.toString())?.count || 0,
            averageScore: Math.round(submittedMap.get(assessment._id.toString())?.avg || 0),
        })));
    } catch (error) {
        console.error('Get assessments error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteAssessment = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const { id } = req.params;

        const assessment = await TeacherAssessment.findOne({ _id: id, teacherId });
        if (!assessment) {
            return res.status(404).json({ message: 'Assessment not found' });
        }

        const now = new Date();
        const isLive = assessment.startTime && assessment.endTime && now >= assessment.startTime && now <= assessment.endTime;
        
        const activeAttempts = await AssessmentAttempt.countDocuments({
            assessmentId: assessment._id,
            status: { $in: ['started', 'in_progress'] }
        });

        if (isLive || activeAttempts > 0) {
            return res.status(400).json({ message: 'Cannot delete assessment while it is live or has active attempts.' });
        }

        await TeacherAssessment.deleteOne({ _id: assessment._id });
        await AssessmentAttempt.deleteMany({ assessmentId: assessment._id });

        res.json({ message: 'Assessment deleted successfully' });
    } catch (error) {
        console.error('Delete assessment error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const duplicateAssessment = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const source = await TeacherAssessment.findOne({ _id: req.params.id, teacherId }).lean();
        if (!source) return res.status(404).json({ message: 'Assessment not found' });
        await assertTeacherResourceCapacity(teacherId, 'assessments', 1);
        const startTime = req.body.assessmentDate && req.body.assessmentStartTime
            ? new Date(`${req.body.assessmentDate}T${req.body.assessmentStartTime}`)
            : new Date(source.startTime);
        const endTime = req.body.assessmentDate && req.body.assessmentEndTime
            ? new Date(`${req.body.assessmentDate}T${req.body.assessmentEndTime}`)
            : new Date(source.endTime);
        validateFutureAssessmentSchedule(startTime, endTime);
        const duplicate = await TeacherAssessment.create({
            ...source,
            _id: undefined,
            name: req.body.name || `${source.name} Copy`,
            startTime,
            endTime,
            assessmentDate: startTime,
            status: 'scheduled',
            resultsReleased: source.resultPolicy === 'immediate',
            remindersSent: { before24h: false, before1h: false, before15m: false },
            createdAt: undefined,
            updatedAt: undefined,
        });
        res.status(201).json(duplicate);
    } catch (error: any) {
        console.error('Duplicate assessment error:', error);
        res.status(error.status || 500).json({ message: error.message || 'Server error' });
    }
};

export const releaseAssessmentResults = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const assessment = await TeacherAssessment.findOneAndUpdate(
            { _id: req.params.id, teacherId },
            { $set: { resultsReleased: true } },
            { new: true }
        );
        if (!assessment) return res.status(404).json({ message: 'Assessment not found' });
        const attempts = await AssessmentAttempt.find({
            assessmentId: assessment._id,
            status: { $in: ['submitted', 'auto_submitted'] },
            learningRecordedAt: { $exists: false },
        }).limit(1000);
        await Promise.all(attempts.map((attempt) => recordAssessmentLearningIfReleased(assessment, attempt)));
        res.json({ message: 'Results released', assessment });
    } catch (error) {
        console.error('Release results error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const hideAssessmentResults = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const assessment = await TeacherAssessment.findOneAndUpdate(
            { _id: req.params.id, teacherId },
            { $set: { resultsReleased: false } },
            { new: true }
        );
        if (!assessment) return res.status(404).json({ message: 'Assessment not found' });
        res.json({ message: 'Results hidden', assessment });
    } catch (error) {
        console.error('Hide results error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

async function getAssessmentReport(assessmentId: string, teacherId?: mongoose.Types.ObjectId) {
    await autoSubmitExpiredAttempts();
    const filter: any = { _id: assessmentId };
    if (teacherId) filter.teacherId = teacherId;
    const assessment = await TeacherAssessment.findOne(filter).populate('classroomId', 'name').lean();
    if (!assessment) return null;
    const students = await ClassroomStudent.find({ classroomId: assessment.classroomId, status: { $ne: 'removed' } })
        .populate('studentId', 'fullName email username')
        .lean();
    const attempts = await AssessmentAttempt.find({ assessmentId: assessment._id, status: { $in: ['submitted', 'auto_submitted'] } })
        .populate('studentId', 'fullName email username')
        .sort({ percentage: -1, submittedAt: 1 })
        .lean();
    const attemptedIds = new Set(attempts.map((attempt: any) => attempt.studentId?._id?.toString() || attempt.studentId?.toString()));
    const rows = students.map((enrollment: any) => {
        const student = enrollment.studentId;
        const attempt = attempts.find((item: any) => (item.studentId?._id?.toString() || item.studentId?.toString()) === student?._id?.toString());
        const review = buildAttemptReview(attempt);
        const correctAnswers = review.filter((item: any) => item.correct).length;
        const incorrectAnswers = attempt ? Math.max(0, review.length - correctAnswers) : '';
        return {
            attemptId: attempt?._id || '',
            studentId: student?._id || enrollment.studentId,
            name: student?.fullName || enrollment.invitedName || student?.username || enrollment.invitedEmail,
            email: student?.email || enrollment.invitedEmail,
            attendance: attemptedIds.has(student?._id?.toString()) ? 'Attempted' : 'Absent',
            score: attempt?.score ?? '',
            totalMarks: attempt?.totalMarks ?? '',
            percentage: attempt?.percentage ?? '',
            passed: attempt ? (attempt.passed ? 'Pass' : 'Fail') : '',
            submittedAt: attempt?.submittedAt || '',
            submissionTime: attempt?.submittedAt || '',
            correctAnswers,
            incorrectAnswers,
            totalQuestions: attempt?.questions?.length || assessment.totalQuestions,
            timeTaken: attempt?.timeTaken ?? '',
            timeTakenDisplay: attempt ? formatSeconds(attempt.timeTaken) : '',
            attemptNumber: attempt?.attemptNumber || '',
            resultReleased: assessment.resultsReleased ? 'Released' : 'Hidden',
            questionReview: review,
        };
    });
    const scores = attempts.map((attempt: any) => attempt.percentage);
    const analytics = {
        invited: students.length,
        submitted: attempts.length,
        absent: Math.max(0, students.length - attemptedIds.size),
        averageScore: scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0,
        highestScore: scores.length ? Math.max(...scores) : 0,
        lowestScore: scores.length ? Math.min(...scores) : 0,
        passCount: attempts.filter((attempt: any) => attempt.passed).length,
        failCount: attempts.filter((attempt: any) => !attempt.passed).length,
    };
    return { assessment, rows, analytics };
}

export const getAssessmentResults = async (req: AuthRequest, res: Response) => {
    try {
        const report = await getAssessmentReport(req.params.id, teacherIdOf(req));
        if (!report) return res.status(404).json({ message: 'Assessment not found' });
        res.json(report);
    } catch (error) {
        console.error('Get assessment results error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getLiveAssessmentTracking = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        const assessment = await TeacherAssessment.findOne({ _id: req.params.id, teacherId }).lean();
        if (!assessment) return res.status(404).json({ message: 'Assessment not found' });
        const invited = await ClassroomStudent.countDocuments({ classroomId: assessment.classroomId, status: { $ne: 'removed' } });
        const attempts = await AssessmentAttempt.find({ assessmentId: assessment._id }).lean();
        const startedIds = new Set(attempts.map((attempt: any) => attempt.studentId.toString()));
        const submitted = attempts.filter((attempt: any) => attempt.status === 'submitted' || attempt.status === 'auto_submitted').length;
        const inProgress = attempts.filter((attempt: any) => attempt.status === 'started' || attempt.status === 'in_progress').length;
        res.json({
            invited,
            started: startedIds.size,
            submitted,
            inProgress,
            absent: Math.max(0, invited - startedIds.size),
        });
    } catch (error) {
        console.error('Live tracking error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getClassroomAnalytics = async (req: AuthRequest, res: Response) => {
    try {
        const teacherId = teacherIdOf(req);
        await assertTeacherClassroom(teacherId, req.params.id);
        const assessments = await TeacherAssessment.find({ classroomId: req.params.id, teacherId }).sort({ startTime: 1 }).lean();
        const reports = await Promise.all(assessments.map((assessment: any) => getAssessmentReport(assessment._id.toString(), teacherId)));
        res.json(reports.filter(Boolean).map((report: any) => ({
            assessmentId: report.assessment._id,
            assessmentName: report.assessment.name,
            startTime: report.assessment.startTime,
            ...report.analytics,
            passRate: report.analytics.submitted ? Math.round((report.analytics.passCount / report.analytics.submitted) * 100) : 0,
            attendanceRate: report.analytics.invited ? Math.round((report.analytics.submitted / report.analytics.invited) * 100) : 0,
        })));
    } catch (error: any) {
        console.error('Classroom analytics error:', error);
        res.status(error.status || 500).json({ message: error.message || 'Server error' });
    }
};

const SUBMITTED_ATTEMPT_STATUSES = ['submitted', 'auto_submitted'];

function toId(value: any) {
    return value?._id?.toString?.() || value?.toString?.() || '';
}

function percent(value: number, total: number) {
    return total > 0 ? Math.round((value / total) * 100) : 0;
}

function average(values: number[]) {
    const filtered = values.filter((value) => Number.isFinite(value));
    return filtered.length ? Math.round(filtered.reduce((sum, value) => sum + value, 0) / filtered.length) : 0;
}

function averageRaw(values: number[]) {
    const filtered = values.filter((value) => Number.isFinite(value));
    return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : 0;
}

function topicName(value: any) {
    return String(value || 'General').trim() || 'General';
}

function studentName(student: any, fallback = 'Student') {
    return student?.fullName || student?.username || fallback;
}

function studentEmail(student: any, fallback = '') {
    return student?.email || fallback || '';
}

function getTrendValue(attempts: any[]) {
    const ordered = [...attempts]
        .filter((attempt) => attempt.submittedAt)
        .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
    if (ordered.length < 2) return 0;
    const midpoint = Math.max(1, Math.floor(ordered.length / 2));
    const earlier = averageRaw(ordered.slice(0, midpoint).map((attempt) => Number(attempt.percentage || 0)));
    const recent = averageRaw(ordered.slice(midpoint).map((attempt) => Number(attempt.percentage || 0)));
    return Math.round(recent - earlier);
}

function getCurrentStreak(attempts: any[]) {
    const ordered = [...attempts]
        .filter((attempt) => attempt.submittedAt)
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    let streak = 0;
    for (const attempt of ordered) {
        if (!attempt.passed) break;
        streak += 1;
    }
    return streak;
}

function statusFromAverage(score: number) {
    if (score >= 80) return 'Excellent';
    if (score >= 65) return 'Average';
    return 'Needs Attention';
}

function startOfWeek(date: Date) {
    const copy = new Date(date);
    const day = copy.getDay();
    copy.setHours(0, 0, 0, 0);
    copy.setDate(copy.getDate() - day);
    return copy;
}

function formatShortDate(date: Date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatShortMonth(date: Date) {
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function buildWeeklyBuckets(attempts: any[], assessments: any[], enrollmentCount: number, now = new Date()) {
    const start = startOfWeek(new Date(now.getTime() - 5 * 7 * 24 * 60 * 60 * 1000));
    return Array.from({ length: 6 }).map((_, index) => {
        const bucketStart = new Date(start.getTime() + index * 7 * 24 * 60 * 60 * 1000);
        const bucketEnd = new Date(bucketStart.getTime() + 7 * 24 * 60 * 60 * 1000);
        const bucketAttempts = attempts.filter((attempt) => {
            const submittedAt = new Date(attempt.submittedAt || 0);
            return submittedAt >= bucketStart && submittedAt < bucketEnd;
        });
        const bucketAssessments = assessments.filter((assessment) => {
            const startTime = new Date(assessment.startTime);
            return startTime >= bucketStart && startTime < bucketEnd;
        });
        const possible = bucketAssessments.length * enrollmentCount;
        return {
            label: formatShortDate(bucketStart),
            classAverage: average(bucketAttempts.map((attempt) => Number(attempt.percentage || 0))),
            topScore: bucketAttempts.length ? Math.max(...bucketAttempts.map((attempt) => Number(attempt.percentage || 0))) : 0,
            participation: percent(bucketAttempts.length, possible || enrollmentCount),
            submissions: bucketAttempts.length,
        };
    });
}

function buildMonthlyBuckets(attempts: any[], assessments: any[], enrollmentCount: number, now = new Date()) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return Array.from({ length: 6 }).map((_, index) => {
        const bucketStart = new Date(monthStart.getFullYear(), monthStart.getMonth() + index, 1);
        const bucketEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + index + 1, 1);
        const bucketAttempts = attempts.filter((attempt) => {
            const submittedAt = new Date(attempt.submittedAt || 0);
            return submittedAt >= bucketStart && submittedAt < bucketEnd;
        });
        const bucketAssessments = assessments.filter((assessment) => {
            const startTime = new Date(assessment.startTime);
            return startTime >= bucketStart && startTime < bucketEnd;
        });
        const possible = bucketAssessments.length * enrollmentCount;
        return {
            label: formatShortMonth(bucketStart),
            performance: average(bucketAttempts.map((attempt) => Number(attempt.percentage || 0))),
            passRate: percent(bucketAttempts.filter((attempt) => attempt.passed).length, bucketAttempts.length),
            participation: percent(bucketAttempts.length, possible || enrollmentCount),
        };
    });
}

async function buildTeacherAnalyticsSnapshot(teacherId: mongoose.Types.ObjectId) {
    await autoSubmitExpiredAttempts();
    const [classrooms, enrollments, assessments, attempts, questions, resources] = await Promise.all([
        TeacherClassroom.find({ teacherId }).lean(),
        ClassroomStudent.find({ teacherId, status: { $ne: 'removed' } })
            .populate('studentId', 'fullName email username emailVerified lastLogin updatedAt')
            .lean(),
        TeacherAssessment.find({ teacherId, status: { $ne: 'archived' } })
            .populate('classroomId', 'name')
            .sort({ startTime: 1 })
            .lean(),
        AssessmentAttempt.find({ teacherId, status: { $in: SUBMITTED_ATTEMPT_STATUSES } })
            .populate('studentId', 'fullName email username updatedAt')
            .sort({ submittedAt: 1 })
            .lean(),
        TeacherQuestion.find({ teacherId }).lean(),
        getTeacherResourceSnapshot(teacherId),
    ]);

    const classroomById = new Map(classrooms.map((classroom: any) => [toId(classroom), classroom]));
    const assessmentById = new Map(assessments.map((assessment: any) => [toId(assessment), assessment]));
    const enrollmentsByClassroom = new Map<string, any[]>();
    const studentsById = new Map<string, any>();

    enrollments.forEach((enrollment: any) => {
        const classroomId = toId(enrollment.classroomId);
        enrollmentsByClassroom.set(classroomId, [...(enrollmentsByClassroom.get(classroomId) || []), enrollment]);
        const studentId = toId(enrollment.studentId);
        if (studentId) {
            studentsById.set(studentId, {
                id: studentId,
                student: enrollment.studentId,
                invitedName: enrollment.invitedName,
                invitedEmail: enrollment.invitedEmail,
                lastActivity: enrollment.studentId?.lastLogin || enrollment.studentId?.updatedAt || enrollment.updatedAt,
            });
        }
    });

    const attemptsByStudent = new Map<string, any[]>();
    const attemptsByAssessment = new Map<string, any[]>();
    attempts.forEach((attempt: any) => {
        const assessmentId = toId(attempt.assessmentId);
        if (!assessmentById.has(assessmentId)) return;
        const studentId = toId(attempt.studentId);
        attemptsByStudent.set(studentId, [...(attemptsByStudent.get(studentId) || []), attempt]);
        attemptsByAssessment.set(assessmentId, [...(attemptsByAssessment.get(assessmentId) || []), attempt]);
    });

    const totalAssigned = assessments.reduce((sum: number, assessment: any) => {
        return sum + (enrollmentsByClassroom.get(toId(assessment.classroomId)) || []).length;
    }, 0);
    const submittedAttempts = attempts.filter((attempt: any) => assessmentById.has(toId(attempt.assessmentId)));
    const passCount = submittedAttempts.filter((attempt: any) => attempt.passed).length;
    const averageScore = average(submittedAttempts.map((attempt: any) => Number(attempt.percentage || 0)));

    const studentRows = Array.from(studentsById.values()).map((entry: any) => {
        const studentAttempts = attemptsByStudent.get(entry.id) || [];
        const avg = average(studentAttempts.map((attempt: any) => Number(attempt.percentage || 0)));
        const passRate = percent(studentAttempts.filter((attempt: any) => attempt.passed).length, studentAttempts.length);
        const trend = getTrendValue(studentAttempts);
        return {
            studentId: entry.id,
            name: studentName(entry.student, entry.invitedName || entry.invitedEmail || 'Student'),
            email: studentEmail(entry.student, entry.invitedEmail),
            averageScore: avg,
            quizzesAttended: studentAttempts.length,
            passRate,
            trend,
            currentStreak: getCurrentStreak(studentAttempts),
            progress: avg,
            lastActivity: studentAttempts[studentAttempts.length - 1]?.submittedAt || entry.lastActivity || null,
            status: studentAttempts.length === 0 ? 'No Attempts' : statusFromAverage(avg),
        };
    }).sort((a, b) => b.averageScore - a.averageScore || b.quizzesAttended - a.quizzesAttended);

    const topPerformers = studentRows.filter((row) => row.quizzesAttended > 0).slice(0, 3).map((row, index) => ({
        rank: index + 1,
        studentName: row.name,
        averageScore: row.averageScore,
        passRate: row.passRate,
        assessmentsTaken: row.quizzesAttended,
    }));

    const atRiskStudents = studentRows
        .filter((row) => row.quizzesAttended > 0 && row.averageScore < 65)
        .sort((a, b) => a.averageScore - b.averageScore)
        .slice(0, 10)
        .map((row) => ({
            studentName: row.name,
            email: row.email,
            averageScore: row.averageScore,
            riskLevel: row.averageScore < 50 ? 'High' : 'Moderate',
            suggestedAction: row.averageScore < 50 ? 'Schedule a focused review session.' : 'Assign targeted practice before the next assessment.',
        }));

    const quizCards = assessments.map((assessment: any) => {
        const quizAttempts = attemptsByAssessment.get(toId(assessment)) || [];
        const assigned = (enrollmentsByClassroom.get(toId(assessment.classroomId)) || []).length;
        const scores = quizAttempts.map((attempt: any) => Number(attempt.percentage || 0));
        return {
            assessmentId: toId(assessment),
            quizName: assessment.name,
            classroomName: assessment.classroomId?.name || classroomById.get(toId(assessment.classroomId))?.name || '-',
            questions: assessment.totalQuestions,
            averageScore: average(scores),
            topScore: scores.length ? Math.max(...scores) : 0,
            lowestScore: scores.length ? Math.min(...scores) : 0,
            submissionCount: quizAttempts.length,
            assignedStudents: assigned,
            attendanceRate: percent(quizAttempts.length, assigned),
            passRate: percent(quizAttempts.filter((attempt: any) => attempt.passed).length, quizAttempts.length),
            status: getAssessmentStatusLabel(getAssessmentRuntimeStatus(assessment)),
            schedule: assessment.startTime,
            durationMinutes: assessment.durationMinutes,
        };
    }).sort((a, b) => new Date(b.schedule).getTime() - new Date(a.schedule).getTime());

    const topicStats = new Map<string, { attempted: number; correct: number; incorrect: number; marks: number; score: number; students: Set<string> }>();
    const studentTopicStats = new Map<string, Map<string, { attempted: number; correct: number }>>();
    const questionUsage = new Map<string, any>();

    submittedAttempts.forEach((attempt: any) => {
        const studentId = toId(attempt.studentId);
        (attempt.questions || []).forEach((question: any, index: number) => {
            const topic = topicName(question.subject);
            const selected = Number.isInteger(attempt.answers?.[index]) ? attempt.answers[index] : -1;
            const isCorrect = selected === question.correctAnswer;
            const marks = Number(question.marks || 1);
            const topicRow = topicStats.get(topic) || { attempted: 0, correct: 0, incorrect: 0, marks: 0, score: 0, students: new Set<string>() };
            topicRow.attempted += 1;
            topicRow.correct += isCorrect ? 1 : 0;
            topicRow.incorrect += isCorrect ? 0 : 1;
            topicRow.marks += marks;
            topicRow.score += isCorrect ? marks : 0;
            if (studentId) topicRow.students.add(studentId);
            topicStats.set(topic, topicRow);

            const studentTopic = studentTopicStats.get(studentId) || new Map<string, { attempted: number; correct: number }>();
            const studentTopicRow = studentTopic.get(topic) || { attempted: 0, correct: 0 };
            studentTopicRow.attempted += 1;
            studentTopicRow.correct += isCorrect ? 1 : 0;
            studentTopic.set(topic, studentTopicRow);
            studentTopicStats.set(studentId, studentTopic);

            const questionKey = `${toId(question.sourceQuestionId)}:${question.questionText}`;
            const questionRow = questionUsage.get(questionKey) || {
                questionText: question.questionText,
                category: topic,
                difficulty: question.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                usageCount: 0,
                correct: 0,
                incorrect: 0,
                marks,
            };
            questionRow.usageCount += 1;
            questionRow.correct += isCorrect ? 1 : 0;
            questionRow.incorrect += isCorrect ? 0 : 1;
            questionUsage.set(questionKey, questionRow);
        });
    });

    const topicMastery = Array.from(topicStats.entries()).map(([topic, row]) => {
        const accuracy = percent(row.correct, row.attempted);
        return {
            topic,
            attempted: row.attempted,
            correct: row.correct,
            incorrect: row.incorrect,
            accuracy,
            averageScore: percent(row.score, row.marks),
            studentsAffected: row.students.size,
            mastery: accuracy >= 80 ? 'Strong' : accuracy >= 65 ? 'Average' : 'Weak',
        };
    }).sort((a, b) => b.attempted - a.attempted || b.accuracy - a.accuracy);

    const heatmapTopics = topicMastery.slice(0, 7).map((row) => row.topic);
    const heatmap = studentRows.slice(0, 16).map((student) => {
        const topicMap = studentTopicStats.get(student.studentId) || new Map<string, { attempted: number; correct: number }>();
        return {
            studentName: student.name,
            cells: heatmapTopics.map((topic) => {
                const row = topicMap.get(topic);
                const accuracy = row ? percent(row.correct, row.attempted) : null;
                return { topic, accuracy, level: accuracy === null ? 'none' : accuracy >= 80 ? 'strong' : accuracy >= 65 ? 'average' : 'weak' };
            }),
        };
    });

    const mostMissedTopics = topicMastery
        .filter((row) => row.attempted > 0)
        .map((row) => ({
            topic: row.topic,
            incorrectRate: percent(row.incorrect, row.attempted),
            averageScore: row.averageScore,
            studentsAffected: row.studentsAffected,
            usageCount: row.attempted,
        }))
        .sort((a, b) => b.incorrectRate - a.incorrectRate)
        .slice(0, 8);

    const categoryDistribution = Object.entries(questions.reduce((acc: Record<string, number>, question: any) => {
        const key = topicName(question.subject);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {})).map(([category, count]) => ({ category, count }));

    const difficultyDistribution = Object.entries(questions.reduce((acc: Record<string, number>, question: any) => {
        const key = question.difficulty || DEFAULT_QUESTION_DIFFICULTY;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {})).map(([difficulty, count]) => ({ difficulty, count }));

    const mostMissedQuestions = Array.from(questionUsage.values())
        .map((row: any) => ({
            ...row,
            correctRate: percent(row.correct, row.usageCount),
            incorrectRate: percent(row.incorrect, row.usageCount),
        }))
        .sort((a: any, b: any) => b.incorrectRate - a.incorrectRate || b.usageCount - a.usageCount)
        .slice(0, 8);

    const assignedTotal = totalAssigned;
    const lateJoiners = submittedAttempts.filter((attempt: any) => {
        const assessment = assessmentById.get(toId(attempt.assessmentId));
        if (!assessment) return false;
        return new Date(attempt.startedAt).getTime() > new Date(assessment.startTime).getTime() + 60 * 1000;
    }).length;

    const classroomComparison = classrooms.map((classroom: any) => {
        const classroomAssessments = assessments.filter((assessment: any) => toId(assessment.classroomId) === toId(classroom));
        const classroomAttempts = submittedAttempts.filter((attempt: any) => classroomAssessments.some((assessment: any) => toId(assessment) === toId(attempt.assessmentId)));
        const assigned = (enrollmentsByClassroom.get(toId(classroom)) || []).length * classroomAssessments.length;
        return {
            classroomId: toId(classroom),
            classroomName: classroom.name,
            averageScore: average(classroomAttempts.map((attempt: any) => Number(attempt.percentage || 0))),
            passRate: percent(classroomAttempts.filter((attempt: any) => attempt.passed).length, classroomAttempts.length),
            attendanceRate: percent(classroomAttempts.length, assigned),
            completionRate: percent(classroomAttempts.length, assigned),
            submissions: classroomAttempts.length,
            assessments: classroomAssessments.length,
        };
    });

    const studentTimeRows = studentRows.map((student) => {
        const studentAttempts = attemptsByStudent.get(student.studentId) || [];
        return {
            studentName: student.name,
            averageSeconds: Math.round(averageRaw(studentAttempts.map((attempt: any) => Number(attempt.timeTaken || 0)))),
            attempts: studentAttempts.length,
        };
    }).filter((row) => row.attempts > 0);

    const weakestTopic = mostMissedTopics[0];
    const strongestTopic = [...topicMastery].sort((a, b) => b.accuracy - a.accuracy)[0];
    const lowParticipationQuiz = [...quizCards].filter((quiz) => quiz.assignedStudents > 0).sort((a, b) => a.attendanceRate - b.attendanceRate)[0];
    const recommendations = [
        weakestTopic ? `${weakestTopic.topic} needs reinforcement; ${weakestTopic.incorrectRate}% of attempts were incorrect.` : '',
        atRiskStudents.length ? `${atRiskStudents.length} students are below 65%; schedule targeted follow-up for the next classroom session.` : '',
        strongestTopic ? `${strongestTopic.topic} is currently the strongest area at ${strongestTopic.accuracy}% accuracy.` : '',
        lowParticipationQuiz && lowParticipationQuiz.attendanceRate < 70 ? `${lowParticipationQuiz.quizName} has low participation at ${lowParticipationQuiz.attendanceRate}%; resend reminders before the next assessment.` : '',
    ].filter(Boolean);

    const weeklyPerformance = buildWeeklyBuckets(submittedAttempts, assessments, studentsById.size);
    const monthlyTrends = buildMonthlyBuckets(submittedAttempts, assessments, studentsById.size);

    return {
        generatedAt: new Date(),
        resources,
        overview: {
            totalStudents: studentsById.size,
            totalClassrooms: classrooms.length,
            totalAssessments: assessments.length,
            totalSubmissions: submittedAttempts.length,
            averageScore,
            participationRate: percent(submittedAttempts.length, assignedTotal),
            passPercentage: percent(passCount, submittedAttempts.length),
            attendancePercentage: percent(submittedAttempts.length, assignedTotal),
            creditsUsed: resources?.credits?.assessment?.used || 0,
            creditsRemaining: resources?.credits?.assessment?.unlimited ? 'Unlimited' : resources?.credits?.assessment?.remaining || 0,
            topPerformer: topPerformers[0]?.studentName || '-',
            atRiskStudentsCount: atRiskStudents.length,
        },
        weeklyPerformance,
        monthlyTrends,
        submissionTrends: weeklyPerformance.map((row) => ({ label: row.label, submissions: row.submissions })),
        scoreDistribution: [
            { range: '0-50', count: submittedAttempts.filter((attempt: any) => Number(attempt.percentage || 0) <= 50).length },
            { range: '51-65', count: submittedAttempts.filter((attempt: any) => Number(attempt.percentage || 0) > 50 && Number(attempt.percentage || 0) <= 65).length },
            { range: '66-80', count: submittedAttempts.filter((attempt: any) => Number(attempt.percentage || 0) > 65 && Number(attempt.percentage || 0) <= 80).length },
            { range: '81-100', count: submittedAttempts.filter((attempt: any) => Number(attempt.percentage || 0) > 80).length },
        ],
        studentSnapshots: studentRows.slice(0, 12),
        students: {
            topPerformers,
            table: studentRows,
            atRisk: atRiskStudents,
        },
        quizzes: {
            cards: quizCards,
            trend: quizCards.map((quiz) => ({
                quizName: quiz.quizName,
                averageScore: quiz.averageScore,
                attendanceRate: quiz.attendanceRate,
                submissions: quiz.submissionCount,
                passRate: quiz.passRate,
            })),
        },
        topicMastery: {
            topics: topicMastery,
            heatmapTopics,
            heatmap,
            mostMissedTopics,
            recommendations,
        },
        questionAnalytics: {
            totalQuestions: questions.length,
            categoryDistribution,
            difficultyDistribution,
            mostUsedCategories: [...categoryDistribution].sort((a: any, b: any) => Number(b.count) - Number(a.count)).slice(0, 5),
            leastUsedCategories: [...categoryDistribution].sort((a: any, b: any) => Number(a.count) - Number(b.count)).slice(0, 5),
            mostMissedQuestions,
            averageQuestionMarks: average(questions.map((question: any) => Number(question.marks || 1))),
        },
        attendanceAnalytics: {
            presentStudents: submittedAttempts.length,
            absentStudents: Math.max(0, assignedTotal - submittedAttempts.length),
            lateJoiners,
            attendanceRate: percent(submittedAttempts.length, assignedTotal),
            submissionRate: percent(submittedAttempts.length, assignedTotal),
        },
        timeAnalytics: {
            averageTimePerQuestion: submittedAttempts.length ? formatSeconds(Math.round(averageRaw(submittedAttempts.map((attempt: any) => Number(attempt.timeTaken || 0) / Math.max(1, attempt.questions?.length || 1))))) : '0m 00s',
            averageCompletionTime: submittedAttempts.length ? formatSeconds(Math.round(averageRaw(submittedAttempts.map((attempt: any) => Number(attempt.timeTaken || 0))))) : '0m 00s',
            fastestStudents: [...studentTimeRows].sort((a, b) => a.averageSeconds - b.averageSeconds).slice(0, 5).map((row) => ({ ...row, averageTime: formatSeconds(row.averageSeconds) })),
            slowestStudents: [...studentTimeRows].sort((a, b) => b.averageSeconds - a.averageSeconds).slice(0, 5).map((row) => ({ ...row, averageTime: formatSeconds(row.averageSeconds) })),
        },
        classroomComparison,
    };
}

export const getTeacherAnalyticsOverview = async (req: AuthRequest, res: Response) => {
    try {
        const analytics = await buildTeacherAnalyticsSnapshot(teacherIdOf(req));
        res.json(analytics);
    } catch (error) {
        console.error('Teacher analytics overview error:', error);
        res.status(500).json({ message: 'Unable to load teacher analytics' });
    }
};

export const exportTeacherAnalytics = async (req: AuthRequest, res: Response) => {
    try {
        const analytics = await buildTeacherAnalyticsSnapshot(teacherIdOf(req));
        const format = String(req.query.format || 'csv').toLowerCase();
        const filename = 'teacher-analytics-report';
        const summaryRows = Object.entries(analytics.overview).map(([metric, value]) => ({ metric, value }));
        if (format === 'xlsx' || format === 'excel') {
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Overview');
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(analytics.students.table), 'Students');
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(analytics.quizzes.cards), 'Quizzes');
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(analytics.topicMastery.topics), 'Topics');
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(analytics.classroomComparison), 'Classrooms');
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
            return res.send(buffer);
        }
        if (format === 'pdf') {
            const lines = [
                `Students: ${analytics.overview.totalStudents}`,
                `Classrooms: ${analytics.overview.totalClassrooms}`,
                `Assessments: ${analytics.overview.totalAssessments}`,
                `Submissions: ${analytics.overview.totalSubmissions}`,
                `Average Score: ${analytics.overview.averageScore}%`,
                `Pass Percentage: ${analytics.overview.passPercentage}%`,
                `Participation: ${analytics.overview.participationRate}%`,
                '',
                ...analytics.topicMastery.recommendations.slice(0, 5),
            ];
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
            return res.send(simplePdf('Teacher Analytics Report', lines));
        }
        return sendCsvDownload(res, `${filename}.csv`, summaryRows);
    } catch (error) {
        console.error('Export teacher analytics error:', error);
        res.status(500).json({ message: 'Unable to export teacher analytics' });
    }
};

export const exportAssessmentReport = async (req: AuthRequest, res: Response) => {
    try {
        const report = await getAssessmentReport(req.params.id, teacherIdOf(req));
        if (!report) return res.status(404).json({ message: 'Assessment not found' });
        const format = String(req.query.format || 'csv').toLowerCase();
        const filename = `${String(report.assessment.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-report`;
        if (format === 'xlsx' || format === 'excel') {
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.rows), 'Results');
            XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([report.analytics]), 'Analytics');
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
            return res.send(buffer);
        }
        if (format === 'pdf') {
            const lines = [
                `Invited: ${report.analytics.invited}`,
                `Submitted: ${report.analytics.submitted}`,
                `Absent: ${report.analytics.absent}`,
                `Average: ${report.analytics.averageScore}%`,
                '',
                ...report.rows.map((row) => `${row.name} | ${row.email} | ${row.attendance} | ${row.percentage || '-'}%`),
            ];
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
            return res.send(simplePdf(report.assessment.name, lines));
        }
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
        return res.send(toCsv(report.rows));
    } catch (error) {
        console.error('Export assessment report error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getStudentClassroomAssessments = async (req: AuthRequest, res: Response) => {
    try {
        await autoSubmitExpiredAttempts();
        const studentId = new mongoose.Types.ObjectId(req.user!.id);
        const enrollments = await ClassroomStudent.find({ studentId, status: { $ne: 'removed' } }).lean();
        const classroomIds = enrollments.map((enrollment: any) => enrollment.classroomId);
        const assessments = await TeacherAssessment.find({ classroomId: { $in: classroomIds }, status: { $ne: 'archived' } })
            .populate('classroomId', 'name')
            .populate('teacherId', 'fullName profileImage professionalTitle organization subjects bio')
            .sort({ startTime: 1 })
            .lean();
        const assessmentIds = assessments.map((assessment: any) => assessment._id);
        const attempts = await AssessmentAttempt.find({ studentId, assessmentId: { $in: assessmentIds } })
            .sort({ attemptNumber: -1, createdAt: -1 })
            .lean();
        const attemptsByAssessment = new Map<string, any[]>();
        attempts.forEach((attempt: any) => {
            const key = attempt.assessmentId.toString();
            attemptsByAssessment.set(key, [...(attemptsByAssessment.get(key) || []), attempt]);
        });
        const now = new Date();
        const serverTime = now.toISOString();
        res.json(assessments.map((assessment: any) => {
            const assessmentAttempts = attemptsByAssessment.get(assessment._id.toString()) || [];
            const activeAttempt = assessmentAttempts.find((item: any) => item.status === 'started' || item.status === 'in_progress');
            const submittedAttempt = assessmentAttempts.find((item: any) => item.status === 'submitted' || item.status === 'auto_submitted');
            const attemptCount = assessmentAttempts.length;
            const open = now >= new Date(assessment.startTime) && now < new Date(assessment.endTime);
            const review = buildAttemptReview(submittedAttempt);
            const correctAnswers = review.filter((item: any) => item.correct).length;
            return {
                _id: assessment._id,
                title: assessment.name,
                classroom: assessment.classroomId,
                teacher: assessment.teacherId,
                numberOfQuestions: assessment.totalQuestions,
                duration: assessment.durationMinutes,
                passingMarks: assessment.passingPercentage,
                marksPerQuestion: 1,
                attemptLimit: assessment.attemptLimit,
                attemptCount,
                attemptsRemaining: Math.max(0, assessment.attemptLimit - attemptCount),
                isLocked: attemptCount >= assessment.attemptLimit || (!open && now >= new Date(assessment.endTime)) || (assessment.lateJoinPolicy === 'block' && !activeAttempt && now > new Date(assessment.startTime)),
                type: 'assessment',
                startTime: assessment.startTime,
                endTime: assessment.endTime,
                serverTime,
                resultVisible: assessment.resultsReleased,
                lateJoinPolicy: assessment.lateJoinPolicy,
                allowedUntil: activeAttempt?.allowedUntil,
                result: assessment.resultsReleased && submittedAttempt ? {
                    id: submittedAttempt._id,
                    assessmentName: assessment.name,
                    submittedAt: submittedAttempt.submittedAt,
                    score: submittedAttempt.score,
                    totalMarks: submittedAttempt.totalMarks,
                    percentage: submittedAttempt.percentage,
                    passed: submittedAttempt.passed,
                    timeTaken: submittedAttempt.timeTaken,
                    timeTakenDisplay: formatSeconds(submittedAttempt.timeTaken),
                    correctAnswers,
                    incorrectAnswers: Math.max(0, review.length - correctAnswers),
                    totalQuestions: submittedAttempt.questions?.length || assessment.totalQuestions,
                    passingMarks: assessment.passingPercentage,
                    questionReview: review,
                } : null,
            };
        }));
    } catch (error) {
        console.error('Get student classroom assessments error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

                export const startStudentAssessment = async (req: AuthRequest, res: Response) => {
                try {
                await autoSubmitExpiredAttempts();
                const studentId = new mongoose.Types.ObjectId(req.user!.id);
                const assessment = await TeacherAssessment.findById(req.params.id);
                if (!assessment) return res.status(404).json({ errorCode: 'QUIZ_NOT_FOUND', message: 'Assessment not found' });
                const enrollment = await ClassroomStudent.findOne({ classroomId: assessment.classroomId, studentId, status: { $ne: 'removed' } });
                if (!enrollment) return res.status(403).json({ errorCode: 'QUIZ_ACCESS_DENIED', message: 'You are not enrolled in this classroom' });

                const now = new Date();
                if (now < assessment.startTime) return res.status(403).json({ errorCode: 'QUIZ_NOT_ACTIVE', message: 'Assessment has not started yet' });
                if (now >= assessment.endTime) return res.status(403).json({ errorCode: 'QUIZ_NOT_ACTIVE', message: 'Assessment window is closed' });    

                const existing = await AssessmentAttempt.findOne({
                assessmentId: assessment._id,
                studentId,
                status: { $in: ['started', 'in_progress'] },
                }).sort({ attemptNumber: -1 });

                if (existing) {
                return res.json({
                serverTime: now,
                quiz: {
                    id: assessment._id,
                    title: assessment.name,
                    duration: Math.max(1, Math.ceil((existing.allowedUntil.getTime() - now.getTime()) / 60000)),
                    numberOfQuestions: existing.questions.length,
                    marksPerQuestion: 1,
                    totalMarks: existing.totalMarks || existing.questions.reduce((sum, q: any) => sum + q.marks, 0),
                    type: 'assessment',
                    allowedUntil: existing.allowedUntil,
                },
                mcqs: existing.questions.map((q: any) => ({ _id: q.sourceQuestionId, questionText: q.questionText, options: q.options })),
                startTime: existing.startedAt,
                });
                }

                if (assessment.lateJoinPolicy === 'block' && now > assessment.startTime) {
                return res.status(403).json({ errorCode: 'QUIZ_ACCESS_DENIED', message: 'Late joining is blocked for this assessment' });
                }

                const attemptCount = await AssessmentAttempt.countDocuments({ assessmentId: assessment._id, studentId });
        if (attemptCount >= assessment.attemptLimit) {
            return res.status(403).json({ errorCode: 'QUIZ_ATTEMPT_LIMIT_REACHED', message: 'Attempt limit reached for this assessment' });
        }

        const counts = distributionToCounts(assessment.distributionMode, assessment.subjectDistribution, assessment.totalQuestions);
        const questions = assessment.randomizationMode === 'practice'
            ? await selectQuestions(assessment.teacherId as any, assessment.questionSource, counts, assessment.globalCategoryId?.toString())
            : await hydrateQuestions(assessment.teacherId as any, assessment.questionSource, assessment.baseQuestionIds as any);
        const snapshot = buildQuestionSnapshot(questions, assessment.randomizationMode);
        const allowedUntil = new Date(Math.min(now.getTime() + assessment.durationMinutes * 60000, assessment.endTime.getTime()));
        const attempt = await AssessmentAttempt.create({
            assessmentId: assessment._id,
            classroomId: assessment.classroomId,
            teacherId: assessment.teacherId,
            studentId,
            attemptNumber: attemptCount + 1,
            status: 'in_progress',
            startedAt: now,
            allowedUntil,
            questions: snapshot,
            answers: new Array(snapshot.length).fill(-1),
            totalMarks: snapshot.reduce((sum, q) => sum + q.marks, 0),
        });

        res.json({
            serverTime: now,
            quiz: {
                id: assessment._id,
                title: assessment.name,
                duration: Math.max(1, Math.ceil((allowedUntil.getTime() - now.getTime()) / 60000)),
                numberOfQuestions: snapshot.length,
                marksPerQuestion: 1,
                totalMarks: attempt.totalMarks,
                type: 'assessment',
                allowedUntil,
            },
            mcqs: snapshot.map((q) => ({ _id: q.sourceQuestionId, questionText: q.questionText, options: q.options })),
            startTime: now,
        });
    } catch (error) {
        console.error('Start student assessment error:', error);
        res.status(500).json({ errorCode: 'UNKNOWN_SERVER_ERROR', message: 'Unable to start assessment' });
    }
};

export const submitStudentAssessment = async (req: AuthRequest, res: Response) => {
    try {
        const studentId = new mongoose.Types.ObjectId(req.user!.id);
        const attempt = await AssessmentAttempt.findOne({
            assessmentId: req.params.id,
            studentId,
            status: { $in: ['started', 'in_progress'] },
        }).sort({ attemptNumber: -1 });
        if (!attempt) return res.status(404).json({ message: 'Active assessment attempt not found' });
        const autoSubmitted = new Date() > attempt.allowedUntil;
        const finalized = await finalizeAttempt(attempt, Array.isArray(req.body.answers) ? req.body.answers : [], autoSubmitted);
        const assessment = await TeacherAssessment.findById(finalized.assessmentId).lean();
        const visible = !!assessment?.resultsReleased;
        res.json({
            message: 'Assessment submitted successfully',
            result: visible ? {
                id: finalized._id,
                score: finalized.score,
                totalMarks: finalized.totalMarks,
                passed: finalized.passed,
                timeTaken: finalized.timeTaken,
                correctAnswers: finalized.questions.filter((q: any, idx: number) => finalized.answers[idx] === q.correctAnswer).length,
                totalQuestions: finalized.questions.length,
                passingMarks: assessment?.passingPercentage || 0,
                percentage: finalized.percentage,
                submittedAt: finalized.submittedAt,
            } : {
                id: finalized._id,
                hidden: true,
                submittedAt: finalized.submittedAt,
            },
        });
    } catch (error) {
        console.error('Submit student assessment error:', error);
        res.status(500).json({ message: 'Unable to submit assessment' });
    }
};

export const changeOwnPassword = async (req: AuthRequest, res: Response) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!newPassword || String(newPassword).trim().length < 6) {
            return res.status(400).json({ message: 'New password must be at least 6 characters' });
        }
        const user = await User.findById(req.user!.id);
        if (!user) return res.status(404).json({ message: 'User not found' });
        if (!user.mustChangePassword) {
            const valid = await bcrypt.compare(String(currentPassword || ''), user.password);
            if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });
        }
        user.password = await bcrypt.hash(String(newPassword).trim(), 10);
        user.mustChangePassword = false;
        user.lastPasswordChange = new Date();
        await user.save();
        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change own password error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export async function sendDueAssessmentReminders() {
    const now = new Date();
    const windows = [
        { key: 'before24h', minutes: 24 * 60, from: 24 * 60 + 5, to: 24 * 60 },
        { key: 'before1h', minutes: 60, from: 65, to: 60 },
        { key: 'before15m', minutes: 15, from: 20, to: 15 },
    ] as const;

    for (const window of windows) {
        const from = new Date(now.getTime() + window.from * 60000);
        const to = new Date(now.getTime() + window.to * 60000);
        const assessments = await TeacherAssessment.find({
            startTime: { $lte: from, $gte: to },
            status: 'scheduled',
            [`remindersSent.${window.key}`]: false,
        }).populate('teacherId', 'fullName username').populate('classroomId', 'name');

        for (const assessment of assessments as any[]) {
            const enrollments = await ClassroomStudent.find({ classroomId: assessment.classroomId._id, status: { $ne: 'removed' } })
                .populate('studentId', 'fullName email username')
                .lean();
            await Promise.all(enrollments.map(async (enrollment: any) => {
                const student = enrollment.studentId;
                if (!student?.email) return;
                try {
                    await sendAssessmentReminderEmail(student.email, {
                        studentName: student.fullName,
                        teacherName: assessment.teacherId?.fullName || assessment.teacherId?.username || 'Your teacher',
                        classroomName: assessment.classroomId?.name || 'your classroom',
                        assessmentName: assessment.name,
                        assessmentStart: assessment.startTime,
                        minutesBefore: window.minutes,
                    });
                } catch (error: any) {
                    console.error('Reminder email failed:', error.message);
                }
            }));
            assessment.remindersSent[window.key] = true;
            await assessment.save();
        }
    }
    await autoSubmitExpiredAttempts();
}
