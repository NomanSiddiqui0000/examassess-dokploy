import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middleware/auth.middleware';
import { StudentQuestionBookmark } from '../models/StudentQuestionBookmark';
import { StudentMistake } from '../models/StudentMistake';
import { StudentPracticeAttempt } from '../models/StudentPracticeAttempt';
import { Result } from '../models/Result';
import { MCQ } from '../models/MCQ';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { normalizeLearningQuestion, recordLearningOutcomes, LearningOutcome, syncStudentLearningHistory } from '../services/student-learning.service';
import { DEFAULT_QUESTION_DIFFICULTY } from '../constants/questionDifficulty';

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clampPage = (value: any) => Math.max(1, Number.parseInt(String(value || '1'), 10) || 1);
const clampLimit = (value: any) => Math.min(50, Math.max(5, Number.parseInt(String(value || '10'), 10) || 10));
const shuffle = <T,>(items: T[]) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

function buildCollectionFilter(userId: mongoose.Types.ObjectId, query: any) {
    const filter: any = { userId };
    if (query.category) filter.category = query.category;
    if (query.difficulty) filter.difficulty = query.difficulty;
    if (query.search) {
        filter.questionText = new RegExp(escapeRegex(String(query.search).trim()), 'i');
    }
    return filter;
}

function formatCollectionResponse(items: any[], total: number, page: number, limit: number, categories: string[], difficulties: string[]) {
    return {
        items,
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
        categories,
        difficulties,
    };
}

export const listBookmarks = async (req: AuthRequest, res: Response) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user!.id);
        await syncStudentLearningHistory(userId);
        const page = clampPage(req.query.page);
        const limit = clampLimit(req.query.limit);
        const filter = buildCollectionFilter(userId, req.query);
        const [items, total, categories, difficulties] = await Promise.all([
            StudentQuestionBookmark.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            StudentQuestionBookmark.countDocuments(filter),
            StudentQuestionBookmark.distinct('category', { userId }),
            StudentQuestionBookmark.distinct('difficulty', { userId }),
        ]);
        res.json(formatCollectionResponse(items, total, page, limit, categories, difficulties));
    } catch (error) {
        console.error('List bookmarks error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const saveBookmark = async (req: AuthRequest, res: Response) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user!.id);
        const question = normalizeLearningQuestion({
            ...req.body,
            studentAnswer: -1,
            answeredCorrect: false,
        });
        const bookmark = await StudentQuestionBookmark.findOneAndUpdate(
            { userId, sourceType: question.sourceType, sourceQuestionId: question.sourceQuestionId },
            {
                $set: {
                    questionText: question.questionText,
                    options: question.options,
                    correctAnswer: question.correctAnswer,
                    category: question.category,
                    difficulty: question.difficulty,
                    marks: question.marks,
                },
                $setOnInsert: { userId, sourceType: question.sourceType, sourceQuestionId: question.sourceQuestionId },
            },
            { upsert: true, new: true }
        );
        res.status(201).json({ message: 'Question bookmarked', bookmark });
    } catch (error: any) {
        console.error('Save bookmark error:', error);
        res.status(400).json({ message: error.message || 'Unable to bookmark question' });
    }
};

export const removeBookmark = async (req: AuthRequest, res: Response) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user!.id);
        const removed = await StudentQuestionBookmark.findOneAndDelete({ _id: req.params.id, userId });
        if (!removed) return res.status(404).json({ message: 'Bookmark not found' });
        res.json({ message: 'Bookmark removed' });
    } catch (error) {
        console.error('Remove bookmark error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const listMistakes = async (req: AuthRequest, res: Response) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user!.id);
        const page = clampPage(req.query.page);
        const limit = clampLimit(req.query.limit);
        const filter = buildCollectionFilter(userId, req.query);
        filter.status = req.query.status === 'mastered' ? 'mastered' : 'active';
        const sortKey = String(req.query.sort || 'lastAttemptAt');
        const sort: any = sortKey === 'incorrectAttempts'
            ? { incorrectAttempts: -1, lastAttemptAt: -1 }
            : sortKey === 'category'
                ? { category: 1, lastAttemptAt: -1 }
                : { lastAttemptAt: -1 };

        const [items, total, categories, difficulties, activeCount, masteredCount] = await Promise.all([
            StudentMistake.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).lean(),
            StudentMistake.countDocuments(filter),
            StudentMistake.distinct('category', { userId }),
            StudentMistake.distinct('difficulty', { userId }),
            StudentMistake.countDocuments({ userId, status: 'active' }),
            StudentMistake.countDocuments({ userId, status: 'mastered' }),
        ]);
        res.json({ ...formatCollectionResponse(items, total, page, limit, categories, difficulties), activeCount, masteredCount });
    } catch (error) {
        console.error('List mistakes error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const startPersonalPractice = async (req: AuthRequest, res: Response) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user!.id);
        const source = req.body.source === 'mistakes' ? 'mistakes' : 'bookmarks';
        if (source === 'mistakes') {
            await syncStudentLearningHistory(userId);
        }
        const durationMinutes = Math.min(180, Math.max(1, Number(req.body.durationMinutes || 15)));
        const rows = source === 'mistakes'
            ? await StudentMistake.find({ userId, status: 'active' }).sort({ incorrectAttempts: -1, lastAttemptAt: -1 }).limit(100).lean()
            : await StudentQuestionBookmark.find({ userId }).sort({ createdAt: -1 }).limit(100).lean();

        if (!rows.length) {
            return res.status(400).json({
                errorCode: 'MCQ_POOL_INSUFFICIENT',
                message: source === 'mistakes' ? 'No active mistake-book questions are available for practice.' : 'No bookmarked questions are available for practice.',
            });
        }

        const selected = shuffle(rows).slice(0, Math.min(50, rows.length));
        const questions = selected.map((row: any) => ({
            sourceType: row.sourceType,
            sourceQuestionId: row.sourceQuestionId,
            questionText: row.questionText,
            options: row.options,
            correctAnswer: row.correctAnswer,
            category: row.category,
            difficulty: row.difficulty || DEFAULT_QUESTION_DIFFICULTY,
            marks: row.marks || 1,
        }));
        const now = new Date();
        const attempt = await StudentPracticeAttempt.create({
            userId,
            source,
            durationMinutes,
            startedAt: now,
            allowedUntil: new Date(now.getTime() + durationMinutes * 60000),
            questions,
            answers: new Array(questions.length).fill(-1),
            totalMarks: questions.reduce((sum, question) => sum + question.marks, 0),
        });

        res.json({
            quiz: {
                id: attempt._id,
                title: source === 'mistakes' ? 'Weak Areas Practice' : 'Bookmark Practice',
                duration: durationMinutes,
                numberOfQuestions: questions.length,
                marksPerQuestion: 1,
                totalMarks: attempt.totalMarks,
                allowedUntil: attempt.allowedUntil,
                type: 'personal',
            },
            mcqs: questions.map((question) => ({
                _id: question.sourceQuestionId,
                questionText: question.questionText,
                options: question.options,
            })),
            startTime: attempt.startedAt,
        });
    } catch (error) {
        console.error('Start personal practice error:', error);
        res.status(500).json({ message: 'Unable to start personal practice' });
    }
};

export const submitPersonalPractice = async (req: AuthRequest, res: Response) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user!.id);
        const attempt = await StudentPracticeAttempt.findOne({ _id: req.params.id, userId, status: 'in_progress' });
        if (!attempt) return res.status(404).json({ message: 'Practice attempt not found' });

        const answers = Array.isArray(req.body.answers) ? req.body.answers : [];
        const normalizedAnswers = attempt.questions.map((_: any, index: number) => Number.isInteger(answers[index]) ? answers[index] : -1);
        const score = attempt.questions.reduce((sum: number, question: any, index: number) => {
            return sum + (normalizedAnswers[index] === question.correctAnswer ? question.marks : 0);
        }, 0);
        const totalMarks = attempt.questions.reduce((sum: number, question: any) => sum + question.marks, 0);
        const percentage = totalMarks ? Math.round((score / totalMarks) * 100) : 0;
        const submittedAt = new Date();

        attempt.answers = normalizedAnswers;
        attempt.score = score;
        attempt.totalMarks = totalMarks;
        attempt.percentage = percentage;
        attempt.passed = percentage >= 50;
        attempt.status = submittedAt > attempt.allowedUntil ? 'auto_submitted' : 'submitted';
        attempt.submittedAt = submittedAt;
        attempt.timeTaken = Math.max(0, Math.floor((submittedAt.getTime() - attempt.startedAt.getTime()) / 1000));
        await attempt.save();

        const outcomes: LearningOutcome[] = attempt.questions.map((question: any, index: number) => ({
            sourceType: question.sourceType,
            sourceQuestionId: question.sourceQuestionId,
            questionText: question.questionText,
            options: question.options,
            correctAnswer: question.correctAnswer,
            studentAnswer: normalizedAnswers[index],
            category: question.category,
            difficulty: question.difficulty,
            marks: question.marks,
            answeredCorrect: normalizedAnswers[index] === question.correctAnswer,
            attemptedAt: submittedAt,
        }));
        await recordLearningOutcomes(userId, outcomes);

        res.json({
            message: 'Practice submitted successfully',
            result: {
                id: attempt._id,
                score,
                totalMarks,
                passed: attempt.passed,
                timeTaken: attempt.timeTaken,
                correctAnswers: outcomes.filter((item) => item.answeredCorrect).length,
                totalQuestions: attempt.questions.length,
                passingMarks: 50,
                percentage,
                submittedAt,
            },
        });
    } catch (error) {
        console.error('Submit personal practice error:', error);
        res.status(500).json({ message: 'Unable to submit practice' });
    }
};

type SubjectRecord = {
    category: string;
    difficulty: string;
    correct: boolean;
    marks: number;
    score: number;
    attemptedAt: Date;
};

function pushSubjectRecord(records: SubjectRecord[], data: Partial<SubjectRecord>) {
    records.push({
        category: data.category || 'General',
        difficulty: data.difficulty || DEFAULT_QUESTION_DIFFICULTY,
        correct: !!data.correct,
        marks: Number(data.marks || 1),
        score: Number(data.score || 0),
        attemptedAt: data.attemptedAt || new Date(),
    });
}

function summarizeSubjects(records: SubjectRecord[]) {
    const byCategory = new Map<string, SubjectRecord[]>();
    records.forEach((record) => {
        byCategory.set(record.category, [...(byCategory.get(record.category) || []), record]);
    });

    const subjects = Array.from(byCategory.entries()).map(([category, items]) => {
        const correctAnswers = items.filter((item) => item.correct).length;
        const incorrectAnswers = items.length - correctAnswers;
        const totalMarks = items.reduce((sum, item) => sum + item.marks, 0);
        const score = items.reduce((sum, item) => sum + item.score, 0);
        const difficultyGroups = new Map<string, SubjectRecord[]>();
        items.forEach((item) => difficultyGroups.set(item.difficulty, [...(difficultyGroups.get(item.difficulty) || []), item]));
        const areas = Array.from(difficultyGroups.entries()).map(([difficulty, rows]) => ({
            label: difficulty,
            accuracy: rows.length ? Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) : 0,
        }));
        const trendMap = new Map<string, SubjectRecord[]>();
        items.forEach((item) => {
            const key = item.attemptedAt.toISOString().slice(0, 10);
            trendMap.set(key, [...(trendMap.get(key) || []), item]);
        });
        return {
            subject: category,
            totalQuestionsAttempted: items.length,
            correctAnswers,
            incorrectAnswers,
            accuracyPercentage: items.length ? Math.round((correctAnswers / items.length) * 100) : 0,
            averageScore: totalMarks ? Math.round((score / totalMarks) * 100) : 0,
            strongAreas: areas.filter((area) => area.accuracy >= 75).map((area) => area.label),
            weakAreas: areas.filter((area) => area.accuracy < 60).map((area) => area.label),
            progressTrend: Array.from(trendMap.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-8).map(([date, rows]) => ({
                date,
                accuracy: rows.length ? Math.round((rows.filter((row) => row.correct).length / rows.length) * 100) : 0,
            })),
        };
    }).sort((a, b) => b.totalQuestionsAttempted - a.totalQuestionsAttempted || a.subject.localeCompare(b.subject));

    const total = records.length;
    const correct = records.filter((record) => record.correct).length;
    return {
        subjects,
        charts: {
            categoryDistribution: subjects.map((subject) => ({ label: subject.subject, value: subject.totalQuestionsAttempted })),
            performanceComparison: subjects.map((subject) => ({ label: subject.subject, value: subject.accuracyPercentage })),
            accuracyTrends: subjects.flatMap((subject) => subject.progressTrend.map((point: any) => ({ subject: subject.subject, ...point }))).slice(-24),
            completionStatistics: {
                attempted: total,
                correct,
                incorrect: total - correct,
                accuracy: total ? Math.round((correct / total) * 100) : 0,
            },
        },
    };
}

export const getSubjectReports = async (req: AuthRequest, res: Response) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user!.id);
        await syncStudentLearningHistory(userId);
        const records: SubjectRecord[] = [];

        const results = await Result.find({ userId }).lean();
        const allMcqIds = Array.from(new Set(results.flatMap((result: any) => (result.mcqSnapshot || []).map((id: any) => id.toString()))));
        const mcqs = allMcqIds.length
            ? await MCQ.find({ _id: { $in: allMcqIds } }).populate('category', 'name').populate('typeId', 'name').lean()
            : [];
        const mcqMap = new Map(mcqs.map((mcq: any) => [mcq._id.toString(), mcq]));

        results.forEach((result: any) => {
            const perQuestionMarks = result.mcqSnapshot?.length ? result.totalMarks / result.mcqSnapshot.length : 1;
            (result.mcqSnapshot || []).forEach((id: any, index: number) => {
                const mcq = mcqMap.get(id.toString());
                if (!mcq) return;
                const order = result.optionOrders?.[index];
                const correctAnswer = Array.isArray(order) && order.length === 4 ? order.indexOf(mcq.correctAnswer) : mcq.correctAnswer;
                const correct = result.answers?.[index] === correctAnswer;
                pushSubjectRecord(records, {
                    category: mcq.typeId?.name || mcq.category?.name || 'General',
                    difficulty: mcq.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                    correct,
                    score: correct ? perQuestionMarks : 0,
                    marks: perQuestionMarks,
                    attemptedAt: result.submittedAt || new Date(),
                });
            });
        });

        const assessmentAttempts = await AssessmentAttempt.find({ studentId: userId, status: { $in: ['submitted', 'auto_submitted'] } })
            .populate('assessmentId', 'resultsReleased')
            .lean();
        assessmentAttempts.filter((attempt: any) => attempt.assessmentId?.resultsReleased).forEach((attempt: any) => {
            (attempt.questions || []).forEach((question: any, index: number) => {
                const correct = attempt.answers?.[index] === question.correctAnswer;
                pushSubjectRecord(records, {
                    category: question.subject || 'General',
                    difficulty: question.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                    correct,
                    score: correct ? question.marks : 0,
                    marks: question.marks || 1,
                    attemptedAt: attempt.submittedAt || new Date(),
                });
            });
        });

        const practiceAttempts = await StudentPracticeAttempt.find({ userId, status: { $in: ['submitted', 'auto_submitted'] } }).lean();
        practiceAttempts.forEach((attempt: any) => {
            (attempt.questions || []).forEach((question: any, index: number) => {
                const correct = attempt.answers?.[index] === question.correctAnswer;
                pushSubjectRecord(records, {
                    category: question.category || 'General',
                    difficulty: question.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                    correct,
                    score: correct ? question.marks : 0,
                    marks: question.marks || 1,
                    attemptedAt: attempt.submittedAt || new Date(),
                });
            });
        });

        res.json(summarizeSubjects(records));
    } catch (error) {
        console.error('Subject reports error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
