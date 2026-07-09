import mongoose from 'mongoose';
import { StudentMistake } from '../models/StudentMistake';
import { LearningQuestionSource, StudentQuestionBookmark } from '../models/StudentQuestionBookmark';
import { DEFAULT_QUESTION_DIFFICULTY, normalizeQuestionDifficulty } from '../constants/questionDifficulty';
import { Result } from '../models/Result';
import { MCQ } from '../models/MCQ';
import { AssessmentAttempt } from '../models/AssessmentAttempt';

export type LearningOutcome = {
    sourceType: LearningQuestionSource;
    sourceQuestionId: mongoose.Types.ObjectId | string;
    questionText: string;
    options: string[];
    correctAnswer: number;
    studentAnswer: number;
    category: string;
    difficulty?: string;
    marks?: number;
    answeredCorrect: boolean;
    attemptedAt?: Date;
};

const MASTERY_STREAK = 3;

export function normalizeLearningQuestion(input: Partial<LearningOutcome>) {
    const sourceQuestionId = input.sourceQuestionId?.toString();
    if (input.sourceType !== 'mcq' && input.sourceType !== 'teacher_question') {
        throw new Error('Question source type must be mcq or teacher_question');
    }
    if (!sourceQuestionId || !mongoose.Types.ObjectId.isValid(sourceQuestionId)) {
        throw new Error('A valid question source is required');
    }
    const questionText = String(input.questionText || '').trim();
    if (!questionText) {
        throw new Error('Question text is required');
    }
    const options = Array.isArray(input.options) ? input.options.map((option) => String(option || '').trim()) : [];
    if (options.length !== 4 || options.some((option) => !option)) {
        throw new Error('Question options are required');
    }
    const correctAnswer = Number(input.correctAnswer);
    if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer > 3) {
        throw new Error('Correct answer is invalid');
    }

    return {
        sourceType: input.sourceType,
        sourceQuestionId: new mongoose.Types.ObjectId(sourceQuestionId),
        questionText,
        options,
        correctAnswer,
        studentAnswer: Number.isInteger(input.studentAnswer) ? Number(input.studentAnswer) : -1,
        category: String(input.category || 'General').trim() || 'General',
        difficulty: normalizeQuestionDifficulty(input.difficulty) || DEFAULT_QUESTION_DIFFICULTY,
        marks: Math.max(1, Number(input.marks || 1)),
        answeredCorrect: !!input.answeredCorrect,
        attemptedAt: input.attemptedAt || new Date(),
    };
}

function isUnrecordedLearningFilter() {
    return {
        $or: [
            { learningRecordedAt: { $exists: false } },
            { learningRecordedAt: null },
        ],
    };
}

function buildMcqOutcome(result: any, mcq: any, index: number): LearningOutcome | null {
    if (!mcq?._id || !Array.isArray(mcq.options) || mcq.options.length !== 4) return null;
    const order = result.optionOrders?.[index];
    const displayedOptions = Array.isArray(order) && order.length === 4
        ? order.map((originalIndex: number) => mcq.options[originalIndex])
        : mcq.options;
    if (displayedOptions.some((option: any) => !option)) return null;
    const correctAnswer = Array.isArray(order) && order.length === 4
        ? order.indexOf(mcq.correctAnswer)
        : mcq.correctAnswer;
    if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer > 3) return null;
    const studentAnswer = Number.isInteger(result.answers?.[index]) ? result.answers[index] : -1;
    const perQuestionMarks = result.mcqSnapshot?.length ? result.totalMarks / result.mcqSnapshot.length : 1;
    return {
        sourceType: 'mcq',
        sourceQuestionId: mcq._id,
        questionText: mcq.questionText,
        options: displayedOptions,
        correctAnswer,
        studentAnswer,
        category: mcq.typeId?.name || mcq.category?.name || 'General',
        difficulty: mcq.difficulty || DEFAULT_QUESTION_DIFFICULTY,
        marks: perQuestionMarks,
        answeredCorrect: studentAnswer === correctAnswer,
        attemptedAt: result.submittedAt || new Date(),
    };
}

function buildAssessmentOutcome(assessment: any, attempt: any, question: any, index: number): LearningOutcome | null {
    if (!question?.sourceQuestionId || !Array.isArray(question.options) || question.options.length !== 4) return null;
    const studentAnswer = Number.isInteger(attempt.answers?.[index]) ? attempt.answers[index] : -1;
    return {
        sourceType: assessment?.questionSource === 'global' ? 'mcq' : 'teacher_question',
        sourceQuestionId: question.sourceQuestionId,
        questionText: question.questionText,
        options: question.options,
        correctAnswer: question.correctAnswer,
        studentAnswer,
        category: question.subject || 'General',
        difficulty: question.difficulty || DEFAULT_QUESTION_DIFFICULTY,
        marks: question.marks || 1,
        answeredCorrect: studentAnswer === question.correctAnswer,
        attemptedAt: attempt.submittedAt || new Date(),
    };
}

export async function syncStudentLearningHistory(userId: mongoose.Types.ObjectId | string, maxAttempts = 500) {
    const normalizedUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const batchSize = Math.min(100, Math.max(10, maxAttempts));
    let processed = 0;

    while (processed < maxAttempts) {
        const results = await Result.find({
            userId: normalizedUserId,
            ...isUnrecordedLearningFilter(),
        }).sort({ submittedAt: 1 }).limit(Math.min(batchSize, maxAttempts - processed)).lean();

        if (!results.length) break;

        const allMcqIds = Array.from(new Set(
            results.flatMap((result: any) => (result.mcqSnapshot || []).map((id: any) => id.toString()))
        ));
        const mcqs = allMcqIds.length
            ? await MCQ.find({ _id: { $in: allMcqIds } }).populate('category', 'name').populate('typeId', 'name').lean()
            : [];
        const mcqMap = new Map(mcqs.map((mcq: any) => [mcq._id.toString(), mcq]));

        for (const result of results) {
            const outcomes = (result.mcqSnapshot || [])
                .map((id: any, index: number) => buildMcqOutcome(result, mcqMap.get(id.toString()), index))
                .filter(Boolean) as LearningOutcome[];
            if (outcomes.length) {
                await recordLearningOutcomes(normalizedUserId, outcomes);
            }
            await Result.updateOne(
                { _id: result._id, ...isUnrecordedLearningFilter() },
                { $set: { learningRecordedAt: new Date() } }
            );
            processed++;
        }
    }

    const assessmentAttempts = await AssessmentAttempt.find({
        studentId: normalizedUserId,
        status: { $in: ['submitted', 'auto_submitted'] },
        ...isUnrecordedLearningFilter(),
    })
        .populate('assessmentId', 'resultsReleased questionSource')
        .sort({ submittedAt: 1 })
        .limit(Math.max(0, maxAttempts - processed));

    for (const attempt of assessmentAttempts) {
        const assessment = (attempt as any).assessmentId;
        if (!assessment?.resultsReleased) {
            continue;
        }
        const outcomes = ((attempt as any).questions || [])
            .map((question: any, index: number) => buildAssessmentOutcome(assessment, attempt, question, index))
            .filter(Boolean) as LearningOutcome[];
        if (outcomes.length) {
            await recordLearningOutcomes(normalizedUserId, outcomes);
        }
        await AssessmentAttempt.updateOne(
            { _id: attempt._id, ...isUnrecordedLearningFilter() },
            { $set: { learningRecordedAt: new Date() } }
        );
        processed++;
    }

    return { processed };
}

export async function recordLearningOutcomes(userId: mongoose.Types.ObjectId | string, outcomes: LearningOutcome[]) {
    if (!outcomes.length) return;
    const normalizedUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    for (const rawOutcome of outcomes) {
        const outcome = normalizeLearningQuestion(rawOutcome);
        const filter = {
            userId: normalizedUserId,
            sourceType: outcome.sourceType,
            sourceQuestionId: outcome.sourceQuestionId,
        };

        const snapshot = {
            questionText: outcome.questionText,
            options: outcome.options,
            correctAnswer: outcome.correctAnswer,
            category: outcome.category,
            difficulty: outcome.difficulty,
            marks: outcome.marks,
            lastStudentAnswer: outcome.studentAnswer,
            lastAttemptAt: outcome.attemptedAt,
        };

        if (!outcome.answeredCorrect) {
            await StudentMistake.updateOne(
                filter,
                {
                    $set: {
                        ...snapshot,
                        status: 'active',
                        correctStreak: 0,
                    },
                    $unset: { masteredAt: '' },
                    $inc: { incorrectAttempts: 1 },
                    $setOnInsert: { userId: normalizedUserId, sourceType: outcome.sourceType, sourceQuestionId: outcome.sourceQuestionId },
                },
                { upsert: true }
            );
            continue;
        }

        await StudentMistake.updateOne(
            { ...filter, status: 'active' },
            {
                $set: snapshot,
                $inc: { correctStreak: 1 },
            }
        );
    }

    await StudentMistake.updateMany(
        { userId: normalizedUserId, status: 'active', correctStreak: { $gte: MASTERY_STREAK } },
        { $set: { status: 'mastered', masteredAt: new Date() } }
    );
}

export async function attachBookmarkStatus<T extends { sourceType?: LearningQuestionSource; sourceQuestionId?: any }>(
    userId: mongoose.Types.ObjectId | string,
    questions: T[]
) {
    const normalizedUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const keys = questions
        .filter((question) => question.sourceType && question.sourceQuestionId && mongoose.Types.ObjectId.isValid(question.sourceQuestionId.toString()))
        .map((question) => ({
            sourceType: question.sourceType,
            sourceQuestionId: new mongoose.Types.ObjectId(question.sourceQuestionId.toString()),
        }));

    if (!keys.length) return questions.map((question) => ({ ...question, bookmarked: false, bookmarkId: null }));

    const bookmarks = await StudentQuestionBookmark.find({
        userId: normalizedUserId,
        $or: keys,
    }).select('_id sourceType sourceQuestionId').lean();

    const bookmarkMap = new Map(
        bookmarks.map((bookmark: any) => [`${bookmark.sourceType}:${bookmark.sourceQuestionId.toString()}`, bookmark._id])
    );

    return questions.map((question) => {
        const key = question.sourceType && question.sourceQuestionId
            ? `${question.sourceType}:${question.sourceQuestionId.toString()}`
            : '';
        const bookmarkId = key ? bookmarkMap.get(key) : null;
        return { ...question, bookmarked: !!bookmarkId, bookmarkId: bookmarkId || null };
    });
}
