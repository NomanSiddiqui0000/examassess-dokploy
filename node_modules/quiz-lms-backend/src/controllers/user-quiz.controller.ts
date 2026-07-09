import { Response } from 'express';
import mongoose from 'mongoose';
import { Quiz } from '../models/Quiz';
import { Result } from '../models/Result';
import { User } from '../models/User';
import { MCQ } from '../models/MCQ';
import { CreditLog } from '../models/CreditLog';
import { CategoryQuizConfig } from '../models/CategoryQuizConfig';
import { AuthRequest } from '../middleware/auth.middleware';
import { AssessmentAttempt } from '../models/AssessmentAttempt';
import { StudentPracticeAttempt } from '../models/StudentPracticeAttempt';
import { LearningQuestionSource } from '../models/StudentQuestionBookmark';
import { recordLearningOutcomes, LearningOutcome, attachBookmarkStatus } from '../services/student-learning.service';
import { DEFAULT_QUESTION_DIFFICULTY } from '../constants/questionDifficulty';

export const getAvailableQuizzes = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;

        // Fetch user to get their testCategory
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Show quizzes where: category matches user's testCategory OR user is manually enrolled
        const filter: any = { isActive: true };
        const conditions: any[] = [];
        if (currentUser.testCategory) {
            conditions.push({ testCategory: currentUser.testCategory });
        }
        conditions.push({ enrolledUsers: { $in: [userId] } });
        filter.$or = conditions;

        const quizzes = await Quiz.find(filter)
            .populate('testCategory', 'name')
            .select('title description numberOfQuestions duration passingMarks marksPerQuestion attemptLimit testCategory');

        // For each quiz, attach attempt count for this user
        const quizzesWithAttempts = await Promise.all(
            quizzes.map(async (quiz) => {
                const attemptCount = await Result.countDocuments({
                    userId,
                    quizId: quiz._id,
                });
                return {
                    ...quiz.toObject(),
                    type: 'manual' as const,
                    attemptCount,
                    attemptsRemaining:
                        quiz.attemptLimit === 0
                            ? null // null means unlimited
                            : Math.max(0, quiz.attemptLimit - attemptCount),
                    isLocked:
                        quiz.attemptLimit > 0 && attemptCount >= quiz.attemptLimit,
                };
            })
        );

        // Also fetch category quiz configs for the user's category
        const categoryQuizzes: any[] = [];
        if (currentUser.testCategory) {
            const categoryConfig = await CategoryQuizConfig.findOne({
                testCategory: currentUser.testCategory,
                isActive: true,
            }).populate('testCategory', 'name');

            if (categoryConfig) {
                const attemptCount = await Result.countDocuments({
                    userId,
                    categoryConfigId: categoryConfig._id,
                });
                const cat = categoryConfig.testCategory as any;
                categoryQuizzes.push({
                    _id: categoryConfig._id,
                    title: `${cat?.name || 'Category'} Quiz`,
                    description: `Dynamic quiz — ${categoryConfig.numberOfQuestions} random questions from ${cat?.name || 'your category'}. Questions and options are shuffled each attempt.`,
                    numberOfQuestions: categoryConfig.numberOfQuestions,
                    duration: categoryConfig.duration,
                    passingMarks: categoryConfig.passingMarks,
                    marksPerQuestion: categoryConfig.marksPerQuestion,
                    attemptLimit: 0,
                    attemptCount,
                    attemptsRemaining: null,
                    isLocked: false,
                    type: 'category' as const,
                    configId: categoryConfig._id,
                });
            }
        }

        res.json([...categoryQuizzes, ...quizzesWithAttempts]);
    } catch (error) {
        console.error('Get available quizzes error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Convert percentage distribution to count distribution.
 * Uses floor for each + distributes remainder to highest-percentage items.
 */
function percentageToCounts(
    items: { typeId: string; value: number }[],
    totalQuestions: number
): { typeId: string; count: number }[] {
    const result = items.map((item) => ({
        typeId: item.typeId,
        count: Math.floor((item.value / 100) * totalQuestions),
        pct: item.value,
    }));

    let assigned = result.reduce((sum, r) => sum + r.count, 0);
    let remainder = totalQuestions - assigned;

    // Distribute remainder starting from highest percentage
    const sorted = [...result].sort((a, b) => b.pct - a.pct);
    let idx = 0;
    while (remainder > 0) {
        sorted[idx % sorted.length].count++;
        remainder--;
        idx++;
    }

    return result.map((r) => ({ typeId: r.typeId, count: r.count }));
}

export const startQuiz = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const userId = req.user!.id;

        const quiz = await Quiz.findById(id).populate('mcqIds');

        if (!quiz) {
            return res.status(404).json({
                errorCode: 'QUIZ_NOT_FOUND',
                message: 'Quiz not found',
            });
        }

        if (!quiz.isActive) {
            return res.status(403).json({
                errorCode: 'QUIZ_NOT_ACTIVE',
                message: 'Quiz is not active',
            });
        }

        // Check access: user is enrolled OR user's category matches quiz category
        const isEnrolled = quiz.enrolledUsers.some(
            (uid: any) => uid.toString() === userId.toString()
        );
        const currentUser = await User.findById(userId);
        const isCategoryMatch = currentUser?.testCategory &&
            quiz.testCategory &&
            currentUser.testCategory.toString() === quiz.testCategory.toString();

        if (!isEnrolled && !isCategoryMatch) {
            return res.status(403).json({
                errorCode: 'QUIZ_ACCESS_DENIED',
                message: 'You do not have access to this quiz',
            });
        }

        // Check attempt limit
        if (quiz.attemptLimit > 0) {
            const attemptCount = await Result.countDocuments({ userId, quizId: id });
            if (attemptCount >= quiz.attemptLimit) {
                return res.status(403).json({
                    errorCode: 'QUIZ_ATTEMPT_LIMIT_REACHED',
                    message: `Attempt limit reached. You have used all ${quiz.attemptLimit} attempt(s) for this quiz.`,
                });
            }
        }

        // ─── Credit Check (ONLY place in system where credits are enforced) ───
        if (!currentUser) {
            return res.status(404).json({
                errorCode: 'USER_NOT_FOUND',
                message: 'User not found',
            });
        }

        // Fresh read to guarantee latest credit value
        const freshUser = await User.findById(userId).select('credits').lean();
        const currentCredits = freshUser?.credits ?? 0;

        console.log(`[CreditCheck] User ${userId} — DB credits (remaining attempts): ${currentCredits}`);

        if (currentCredits <= 0) {
            return res.status(403).json({
                errorCode: 'NO_CREDITS_REMAINING',
                message: 'You have no remaining attempts. Please contact admin to get more credits.',
            });
        }

        // Atomic credit deduction
        const updatedUser = await User.findOneAndUpdate(
            { _id: userId, credits: { $gt: 0 } },
            { $inc: { credits: -1 } },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(403).json({
                errorCode: 'NO_CREDITS_REMAINING',
                message: 'Your credits have ended. Please contact admin.',
            });
        }

        // Log the credit deduction
        await CreditLog.create({
            userId,
            action: 'quiz_deduction',
            amount: -1,
            balanceAfter: updatedUser.credits,
            performedBy: userId,
            quizId: quiz._id,
            reason: `Started quiz: ${quiz.title}`,
            timestamp: new Date(),
        });
        // ─── End Credit Check ─────────────────────────────────────────────────

        // ─── Random MCQ selection from bank, respecting type distribution ───
        let selectedMCQs: any[] = [];
        const distMode = quiz.typeDistribution?.mode;

        try {
            if ((distMode === 'count' || distMode === 'percentage') &&
                quiz.typeDistribution?.items?.length) {
                // Validate distribution config
                const distItems = quiz.typeDistribution.items;
                const hasValidItems = distItems.every((i: any) => i.typeId && typeof i.value === 'number' && i.value >= 0);
                if (!hasValidItems) {
                    console.error('[QuizStart] Invalid distribution items:', JSON.stringify(distItems));
                    return res.status(400).json({
                        errorCode: 'QUIZ_CONFIGURATION_INVALID',
                        message: 'Quiz distribution configuration is invalid. Please contact the administrator.',
                    });
                }

                // Type-distribution-aware sampling from the full MCQ bank
                let typeCounts: { typeId: any; count: number }[];
                if (distMode === 'percentage') {
                    typeCounts = percentageToCounts(
                        distItems.map((i: any) => ({
                            typeId: i.typeId.toString(), value: i.value
                        })),
                        quiz.numberOfQuestions
                    );
                } else {
                    typeCounts = distItems.map((i: any) => ({
                        typeId: i.typeId, count: i.value
                    }));
                }

                for (const tc of typeCounts) {
                    if (tc.count <= 0) continue; // skip zero-count types

                    const typeOid = new mongoose.Types.ObjectId(tc.typeId.toString());
                    const catOid = new mongoose.Types.ObjectId((quiz.testCategory as any).toString());

                    const sampled = await MCQ.aggregate([
                        { $match: { category: catOid, typeId: typeOid } },
                        { $sample: { size: tc.count } },
                    ]);

                    if (sampled.length < tc.count) {
                        // Pool too small — take all available
                        const all = await MCQ.find({ category: quiz.testCategory, typeId: tc.typeId });
                        if (all.length === 0) {
                            console.error(`[QuizStart] No MCQs found for type ${tc.typeId} in category ${quiz.testCategory}`);
                            return res.status(400).json({
                                errorCode: 'MCQ_POOL_INSUFFICIENT',
                                message: 'Not enough questions are available to generate this quiz. Please contact the administrator.',
                            });
                        }
                        selectedMCQs.push(...shuffleArray(all).slice(0, tc.count));
                    } else {
                        selectedMCQs.push(...sampled);
                    }
                }
            } else {
                // No distribution — randomly sample from the quiz's MCQ pool
                const poolIds = (quiz.mcqIds as any[]).map((m: any) => m._id || m);
                if (!poolIds || poolIds.length === 0) {
                    console.error(`[QuizStart] Quiz ${quiz._id} has empty MCQ pool`);
                    return res.status(400).json({
                        errorCode: 'MCQ_POOL_INSUFFICIENT',
                        message: 'Not enough questions are available to generate this quiz. Please contact the administrator.',
                    });
                }

                if (quiz.numberOfQuestions < poolIds.length) {
                    const sampled = await MCQ.aggregate([
                        { $match: { _id: { $in: poolIds } } },
                        { $sample: { size: quiz.numberOfQuestions } },
                    ]);
                    selectedMCQs = sampled;
                } else {
                    // Pool equals or is smaller than needed — use all
                    selectedMCQs = quiz.mcqIds as any[];
                }
            }

            // Validate we got enough MCQs
            if (!selectedMCQs || selectedMCQs.length === 0) {
                console.error(`[QuizStart] MCQ selection returned empty result for quiz ${quiz._id}`);
                return res.status(400).json({
                    errorCode: 'MCQ_POOL_INSUFFICIENT',
                    message: 'Not enough questions are available to generate this quiz. Please contact the administrator.',
                });
            }
        } catch (mcqError) {
            console.error('[QuizStart] MCQ selection failed:', mcqError);
            return res.status(500).json({
                errorCode: 'QUIZ_CONFIGURATION_INVALID',
                message: 'This quiz configuration is invalid. Please contact the administrator.',
            });
        }

        // Final question-order shuffle
        selectedMCQs = shuffleArray(selectedMCQs);

        // Shuffle options within each MCQ and track correct answer mapping
        const mcqsWithShuffledOptions = selectedMCQs.map((mcq: any) => {
            const originalOptions = [...mcq.options];
            const correctOption = originalOptions[mcq.correctAnswer];

            const indices = [0, 1, 2, 3];
            const shuffledIndices = shuffleArray(indices);
            const shuffledOptions = shuffledIndices.map((i: number) => originalOptions[i]);
            const newCorrectAnswer = shuffledOptions.indexOf(correctOption);

            return {
                _id: mcq._id,
                questionText: mcq.questionText,
                options: shuffledOptions,
                _correctAnswer: newCorrectAnswer,
                _shuffledIndices: shuffledIndices,
            };
        });

        // Build correctAnswerMap for grading and answer review reconstruction
        const correctAnswerMap = mcqsWithShuffledOptions.map((m) => ({
            mcqId: m._id,
            correctAnswer: m._correctAnswer,
            optionOrder: m._shuffledIndices,
        }));

        // Send to client without correct answers
        const mcqsForUser = mcqsWithShuffledOptions.map(
            ({ _correctAnswer, _shuffledIndices, ...rest }) => rest
        );

        res.json({
            quiz: {
                id: quiz._id,
                title: quiz.title,
                description: quiz.description,
                duration: quiz.duration,
                numberOfQuestions: quiz.numberOfQuestions,
                marksPerQuestion: quiz.marksPerQuestion,
                totalMarks: quiz.numberOfQuestions * quiz.marksPerQuestion,
            },
            mcqs: mcqsForUser,
            mcqIds: selectedMCQs.map((m: any) => m._id),
            correctAnswerMap,
            startTime: new Date(),
            remainingCredits: updatedUser.credits,
        });
    } catch (error) {
        console.error('Start quiz error:', error);
        res.status(500).json({
            errorCode: 'UNKNOWN_SERVER_ERROR',
            message: 'Something went wrong while starting the quiz. Please try again later.',
        });
    }
};

export const submitQuiz = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { answers, startTime, mcqIds, correctAnswerMap } = req.body;
        const userId = req.user!.id;

        if (!answers || !Array.isArray(answers)) {
            return res.status(400).json({ message: 'Answers are required' });
        }

        const quiz = await Quiz.findById(id).populate('mcqIds');

        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        // Double-check attempt limit on submit (prevent race conditions)
        if (quiz.attemptLimit > 0) {
            const attemptCount = await Result.countDocuments({ userId, quizId: id });
            if (attemptCount >= quiz.attemptLimit) {
                return res.status(403).json({
                    message: 'Attempt limit reached. This submission cannot be accepted.',
                });
            }
        }

        // Calculate time taken
        const timeTaken = startTime
            ? Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
            : 0;

        // Use mcqIds from request (the snapshot sent at start) for accurate grading
        // Fall back to quiz.mcqIds if not provided
        let mcqsToGrade = quiz.mcqIds as any[];
        if (mcqIds && Array.isArray(mcqIds) && mcqIds.length > 0) {
            mcqsToGrade = await MCQ.find({ _id: { $in: mcqIds } }).populate('category', 'name').populate('typeId', 'name');
            // Preserve order from mcqIds
            const mcqMap = new Map(mcqsToGrade.map((m: any) => [m._id.toString(), m]));
            mcqsToGrade = mcqIds.map((mid: string) => mcqMap.get(mid)).filter(Boolean);
        } else {
            const fallbackIds = (quiz.mcqIds as any[]).map((m: any) => m._id || m);
            const docs = await MCQ.find({ _id: { $in: fallbackIds } }).populate('category', 'name').populate('typeId', 'name');
            const mcqMap = new Map(docs.map((m: any) => [m._id.toString(), m]));
            mcqsToGrade = fallbackIds.map((mid: any) => mcqMap.get(mid.toString())).filter(Boolean);
        }

        // Calculate score — use correctAnswerMap if provided (shuffled options)
        let score = 0;
        if (correctAnswerMap && Array.isArray(correctAnswerMap)) {
            answers.forEach((answer: number, index: number) => {
                if (index < correctAnswerMap.length &&
                    correctAnswerMap[index].correctAnswer === answer) {
                    score += quiz.marksPerQuestion;
                }
            });
        } else {
            // Fallback: grade from original MCQ order (backward compatibility)
            answers.forEach((answer: number, index: number) => {
                if (index < mcqsToGrade.length && mcqsToGrade[index].correctAnswer === answer) {
                    score += quiz.marksPerQuestion;
                }
            });
        }

        const totalMarks = quiz.numberOfQuestions * quiz.marksPerQuestion;
        const passed = score >= quiz.passingMarks;

        // Save result with mcqSnapshot and optionOrders
        const result = await Result.create({
            userId,
            quizId: quiz._id,
            answers,
            mcqSnapshot: mcqsToGrade.map((m: any) => m._id),
            optionOrders: correctAnswerMap && Array.isArray(correctAnswerMap)
                ? correctAnswerMap.map((entry: any) => entry.optionOrder || [])
                : undefined,
            score,
            totalMarks,
            passed,
            timeTaken,
        });

        const correctAnswers = Math.round(score / quiz.marksPerQuestion);
        const outcomes: LearningOutcome[] = mcqsToGrade.map((mcq: any, index: number) => {
            const order = correctAnswerMap?.[index]?.optionOrder;
            const displayedOptions = Array.isArray(order) && order.length === 4
                ? order.map((originalIndex: number) => mcq.options[originalIndex])
                : mcq.options;
            const correctAnswer = correctAnswerMap?.[index]?.correctAnswer ?? mcq.correctAnswer;
            const studentAnswer = Number.isInteger(answers[index]) ? answers[index] : -1;
            return {
                sourceType: 'mcq',
                sourceQuestionId: mcq._id,
                questionText: mcq.questionText,
                options: displayedOptions,
                correctAnswer,
                studentAnswer,
                category: mcq.typeId?.name || mcq.category?.name || 'General',
                difficulty: mcq.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                marks: quiz.marksPerQuestion,
                answeredCorrect: studentAnswer === correctAnswer,
                attemptedAt: result.submittedAt,
            };
        });
        await recordLearningOutcomes(userId, outcomes);

        res.json({
            message: 'Quiz submitted successfully',
            result: {
                id: result._id,
                score,
                totalMarks,
                passed,
                timeTaken,
                passingMarks: quiz.passingMarks,
                correctAnswers,
                totalQuestions: quiz.numberOfQuestions,
                percentage: totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0,
                submittedAt: result.submittedAt,
            },
        });
    } catch (error) {
        console.error('Submit quiz error:', error);
        res.status(500).json({
            errorCode: 'UNKNOWN_SERVER_ERROR',
            message: 'Something went wrong while submitting the quiz. Please try again later.',
        });
    }
};

export const getUserResults = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const studentObjectId = new mongoose.Types.ObjectId(userId);

        const user = await User.findById(userId).select('emailVerified modules').lean();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isPracticeUnverified = user.modules?.practiceModule === true && !user.emailVerified;

        if (isPracticeUnverified && !user.modules?.teacherAssessments) {
            return res.status(403).json({
                errorCode: 'EMAIL_NOT_VERIFIED',
                message: 'Please verify your email address before accessing the Practice Module.',
                email: user.email,
            });
        }

        let enriched: any[] = [];
        if (!isPracticeUnverified) {
            const results = await Result.find({ userId })
                .populate('quizId', 'title numberOfQuestions marksPerQuestion passingMarks')
                .populate('categoryConfigId', 'testCategory numberOfQuestions marksPerQuestion passingMarks')
                .sort({ submittedAt: -1 });

            // For category results, populate the category name
            enriched = await Promise.all(
                results.map(async (r) => {
                    const obj = r.toObject() as any;
                    if (obj.categoryConfigId && !obj.quizId) {
                        const config = await CategoryQuizConfig.findById(obj.categoryConfigId)
                            .populate('testCategory', 'name');
                        if (config) {
                            const cat = config.testCategory as any;
                            obj.quizId = {
                                _id: config._id,
                                title: `${cat?.name || 'Category'} Quiz`,
                                numberOfQuestions: config.numberOfQuestions,
                                marksPerQuestion: config.marksPerQuestion,
                                passingMarks: config.passingMarks,
                            };
                        }
                    }
                    return obj;
                })
            );
        }

        const assessmentAttempts = await AssessmentAttempt.find({
            studentId: studentObjectId,
            status: { $in: ['submitted', 'auto_submitted'] },
        })
            .populate('assessmentId', 'name totalQuestions passingPercentage resultsReleased')
            .sort({ submittedAt: -1 })
            .lean();

        const releasedAssessmentResults = assessmentAttempts
            .filter((attempt: any) => attempt.assessmentId?.resultsReleased)
            .map((attempt: any) => {
                const assessment = attempt.assessmentId;
                const correctAnswers = (attempt.questions || []).filter((question: any, index: number) => attempt.answers?.[index] === question.correctAnswer).length;
                return {
                    _id: attempt._id,
                    resultType: 'assessment',
                    quizId: {
                        _id: assessment?._id,
                        title: assessment?.name || 'Classroom Assessment',
                        numberOfQuestions: attempt.questions?.length || assessment?.totalQuestions || 0,
                        marksPerQuestion: 1,
                        passingMarks: assessment?.passingPercentage || 0,
                    },
                    score: attempt.score,
                    totalMarks: attempt.totalMarks,
                    passed: attempt.passed,
                    timeTaken: attempt.timeTaken,
                    submittedAt: attempt.submittedAt,
                    correctAnswers,
                    totalQuestions: attempt.questions?.length || assessment?.totalQuestions || 0,
                    percentage: attempt.percentage,
                };
            });

        const combined = [...enriched, ...releasedAssessmentResults]
            .sort((a: any, b: any) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

        res.json(combined);
    } catch (error) {
        console.error('Get user results error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Category Quiz — Dynamic Start & Submit
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Shuffle an array in place using Fisher-Yates algorithm.
 */
function shuffleArray<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

export const startCategoryQuiz = async (req: AuthRequest, res: Response) => {
    try {
        const { configId } = req.params;
        const userId = req.user!.id;

        const config = await CategoryQuizConfig.findById(configId)
            .populate('testCategory', 'name');

        if (!config) {
            return res.status(404).json({
                errorCode: 'QUIZ_NOT_FOUND',
                message: 'Category quiz configuration not found.',
            });
        }

        if (!config.isActive) {
            return res.status(403).json({
                errorCode: 'QUIZ_NOT_ACTIVE',
                message: 'This category quiz is currently unavailable.',
            });
        }

        // Validate user belongs to this category
        const currentUser = await User.findById(userId);
        if (!currentUser) {
            return res.status(404).json({
                errorCode: 'USER_NOT_FOUND',
                message: 'User not found',
            });
        }

        if (!currentUser.testCategory ||
            currentUser.testCategory.toString() !== config.testCategory._id.toString()) {
            return res.status(403).json({
                errorCode: 'QUIZ_ACCESS_DENIED',
                message: 'You do not have access to this category quiz',
            });
        }

        // ─── Credit Check (1 credit = 1 attempt) ───
        const freshUser = await User.findById(userId).select('credits').lean();
        const currentCredits = freshUser?.credits ?? 0;

        console.log(`[CreditCheck] User ${userId} — DB credits (remaining attempts): ${currentCredits}`);

        if (currentCredits <= 0) {
            return res.status(403).json({
                errorCode: 'NO_CREDITS_REMAINING',
                message: 'You have no remaining attempts. Please contact admin to get more credits.',
            });
        }

        // Atomic credit deduction — exactly 1 credit per attempt
        const updatedUser = await User.findOneAndUpdate(
            { _id: userId, credits: { $gt: 0 } },
            { $inc: { credits: -1 } },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(403).json({
                errorCode: 'NO_CREDITS_REMAINING',
                message: 'You have no remaining attempts. Please contact admin.',
            });
        }

        // Log credit deduction
        const catName = (config.testCategory as any)?.name || 'Category';
        await CreditLog.create({
            userId,
            action: 'quiz_deduction',
            amount: -1,
            balanceAfter: updatedUser.credits,
            performedBy: userId,
            reason: `Started ${catName} category quiz`,
            timestamp: new Date(),
        });

        // ─── Fetch random MCQs from category pool ───
        const allMCQs = await MCQ.find({ category: config.testCategory._id });

        if (allMCQs.length < config.numberOfQuestions) {
            console.error(`[CategoryQuizStart] Insufficient MCQs: ${allMCQs.length} available, ${config.numberOfQuestions} needed`);
            return res.status(400).json({
                errorCode: 'MCQ_POOL_INSUFFICIENT',
                message: 'Not enough questions are available to generate this quiz. Please contact the administrator.',
            });
        }

        // Select random non-repetitive MCQs
        const shuffledMCQs = shuffleArray(allMCQs).slice(0, config.numberOfQuestions);

        // Shuffle options within each MCQ and track new correct answer index
        const mcqsForUser = shuffledMCQs.map((mcq: any) => {
            const originalOptions = [...mcq.options];
            const correctOption = originalOptions[mcq.correctAnswer];

            // Create index mapping and shuffle
            const indices = [0, 1, 2, 3];
            const shuffledIndices = shuffleArray(indices);
            const shuffledOptions = shuffledIndices.map(i => originalOptions[i]);
            const newCorrectAnswer = shuffledOptions.indexOf(correctOption);

            return {
                _id: mcq._id,
                questionText: mcq.questionText,
                options: shuffledOptions,
                _correctAnswer: newCorrectAnswer, // stored server-side for grading
                _shuffledIndices: shuffledIndices, // track original->shuffled mapping
            };
        });

        // Build correctAnswerMap with optionOrder for grading AND review reconstruction
        const correctAnswerMap = mcqsForUser.map((m) => ({
            mcqId: m._id,
            correctAnswer: m._correctAnswer,
            optionOrder: m._shuffledIndices, // shuffledIndices[i] = original option index at display position i
        }));

        // Send to client without correct answers
        const clientMCQs = mcqsForUser.map(({ _correctAnswer, _shuffledIndices, ...rest }) => rest);

        res.json({
            quiz: {
                id: config._id,
                title: `${catName} Quiz`,
                description: config.numberOfQuestions + ' randomly selected questions',
                duration: config.duration,
                numberOfQuestions: config.numberOfQuestions,
                marksPerQuestion: config.marksPerQuestion,
                totalMarks: config.numberOfQuestions * config.marksPerQuestion,
                type: 'category',
            },
            mcqs: clientMCQs,
            mcqIds: shuffledMCQs.map((m: any) => m._id),
            correctAnswerMap, // sent for submit grading
            startTime: new Date(),
            remainingCredits: updatedUser.credits,
        });
    } catch (error) {
        console.error('Start category quiz error:', error);
        res.status(500).json({
            errorCode: 'UNKNOWN_SERVER_ERROR',
            message: 'Something went wrong while starting the quiz. Please try again later.',
        });
    }
};

export const submitCategoryQuiz = async (req: AuthRequest, res: Response) => {
    try {
        const { configId } = req.params;
        const { answers, startTime, mcqIds, correctAnswerMap } = req.body;
        const userId = req.user!.id;

        if (!answers || !Array.isArray(answers)) {
            return res.status(400).json({ message: 'Answers are required' });
        }

        const config = await CategoryQuizConfig.findById(configId);
        if (!config) {
            return res.status(404).json({ message: 'Category quiz config not found' });
        }

        const timeTaken = startTime
            ? Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
            : 0;

        // Grade using the correct answer map (shuffled order)
        let score = 0;
        if (correctAnswerMap && Array.isArray(correctAnswerMap)) {
            answers.forEach((answer: number, index: number) => {
                if (index < correctAnswerMap.length && correctAnswerMap[index].correctAnswer === answer) {
                    score += config.marksPerQuestion;
                }
            });
        } else {
            // Fallback: grade from original MCQs
            if (mcqIds && Array.isArray(mcqIds)) {
                const mcqs = await MCQ.find({ _id: { $in: mcqIds } });
                const mcqMap = new Map(mcqs.map((m: any) => [m._id.toString(), m]));
                const ordered = mcqIds.map((id: string) => mcqMap.get(id)).filter(Boolean);
                answers.forEach((answer: number, index: number) => {
                    if (index < ordered.length && ordered[index].correctAnswer === answer) {
                        score += config.marksPerQuestion;
                    }
                });
            }
        }

        const totalMarks = config.numberOfQuestions * config.marksPerQuestion;
        const passed = score >= config.passingMarks;
        const orderedMcqs = mcqIds && Array.isArray(mcqIds)
            ? await MCQ.find({ _id: { $in: mcqIds } }).populate('category', 'name').populate('typeId', 'name').then((docs: any[]) => {
                const mcqMap = new Map(docs.map((m: any) => [m._id.toString(), m]));
                return mcqIds.map((mid: string) => mcqMap.get(mid)).filter(Boolean);
            })
            : [];

        const result = await Result.create({
            userId,
            categoryConfigId: config._id,
            answers,
            mcqSnapshot: mcqIds || [],
            optionOrders: correctAnswerMap && Array.isArray(correctAnswerMap)
                ? correctAnswerMap.map((entry: any) => entry.optionOrder || [])
                : undefined,
            score,
            totalMarks,
            passed,
            timeTaken,
        });

        const correctAnswers = Math.round(score / config.marksPerQuestion);
        const outcomes: LearningOutcome[] = orderedMcqs.map((mcq: any, index: number) => {
            const order = correctAnswerMap?.[index]?.optionOrder;
            const displayedOptions = Array.isArray(order) && order.length === 4
                ? order.map((originalIndex: number) => mcq.options[originalIndex])
                : mcq.options;
            const correctAnswer = correctAnswerMap?.[index]?.correctAnswer ?? mcq.correctAnswer;
            const studentAnswer = Number.isInteger(answers[index]) ? answers[index] : -1;
            return {
                sourceType: 'mcq',
                sourceQuestionId: mcq._id,
                questionText: mcq.questionText,
                options: displayedOptions,
                correctAnswer,
                studentAnswer,
                category: mcq.typeId?.name || mcq.category?.name || 'General',
                difficulty: mcq.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                marks: config.marksPerQuestion,
                answeredCorrect: studentAnswer === correctAnswer,
                attemptedAt: result.submittedAt,
            };
        });
        await recordLearningOutcomes(userId, outcomes);

        res.json({
            message: 'Quiz submitted successfully',
            result: {
                id: result._id,
                score,
                totalMarks,
                passed,
                timeTaken,
                passingMarks: config.passingMarks,
                correctAnswers,
                totalQuestions: config.numberOfQuestions,
                percentage: totalMarks > 0 ? Math.round((score / totalMarks) * 100) : 0,
                submittedAt: result.submittedAt,
            },
        });
    } catch (error) {
        console.error('Submit category quiz error:', error);
        res.status(500).json({
            errorCode: 'UNKNOWN_SERVER_ERROR',
            message: 'Something went wrong while submitting the quiz. Please try again later.',
        });
    }
};

// ═══════════════════════════════════════════════════════════════════════════════
// Answer Review — fetch per-question breakdown for a specific result
// ═══════════════════════════════════════════════════════════════════════════════

export const getResultReview = async (req: AuthRequest, res: Response) => {
    try {
        const { resultId } = req.params;
        const userId = req.user!.id;

        const user = await User.findById(userId).select('emailVerified modules').lean();
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const isPracticeUnverified = user.modules?.practiceModule === true && !user.emailVerified;

        if (isPracticeUnverified) {
            // Unverified students are only allowed to review classroom assessment attempts
            const isAssessment = await AssessmentAttempt.exists({ _id: resultId, studentId: userId });
            if (!isAssessment) {
                return res.status(403).json({
                    errorCode: 'EMAIL_NOT_VERIFIED',
                    message: 'Please verify your email address before reviewing Practice Module quizzes.',
                });
            }
        }

        // Fetch legacy quiz result and validate ownership
        const result = await Result.findById(resultId);
        if (!result) {
            const practiceAttempt = await StudentPracticeAttempt.findOne({
                _id: resultId,
                userId: new mongoose.Types.ObjectId(userId),
                status: { $in: ['submitted', 'auto_submitted'] },
            }).lean();

            if (practiceAttempt) {
                const practiceQuestions = (practiceAttempt.questions || []).map((question: any, idx: number) => {
                    const userAnswer = practiceAttempt.answers?.[idx] ?? -1;
                    return {
                        sourceType: question.sourceType,
                        sourceQuestionId: question.sourceQuestionId,
                        questionText: question.questionText,
                        displayedOptions: question.options,
                        correctAnswerIndex: question.correctAnswer,
                        userAnswerIndex: userAnswer,
                        isCorrect: userAnswer === question.correctAnswer,
                        category: question.category,
                        difficulty: question.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                        marks: question.marks || 1,
                    };
                });

                return res.json({
                    resultId: practiceAttempt._id,
                    score: practiceAttempt.score,
                    totalMarks: practiceAttempt.totalMarks,
                    passed: practiceAttempt.passed,
                    timeTaken: practiceAttempt.timeTaken,
                    submittedAt: practiceAttempt.submittedAt,
                    questions: await attachBookmarkStatus(userId, practiceQuestions),
                });
            }

            const assessmentAttempt = await AssessmentAttempt.findOne({
                _id: resultId,
                studentId: new mongoose.Types.ObjectId(userId),
                status: { $in: ['submitted', 'auto_submitted'] },
            })
                .populate('assessmentId', 'resultsReleased questionSource')
                .lean();

            if (!assessmentAttempt) {
                return res.status(404).json({ message: 'Result not found' });
            }

            if (!(assessmentAttempt.assessmentId as any)?.resultsReleased) {
                return res.status(403).json({ message: 'Results have not been released yet' });
            }

            const sourceType: LearningQuestionSource = (assessmentAttempt.assessmentId as any)?.questionSource === 'global'
                ? 'mcq'
                : 'teacher_question';
            const questions = (assessmentAttempt.questions || []).map((question: any, idx: number) => {
                const userAnswer = assessmentAttempt.answers?.[idx] ?? -1;
                return {
                    sourceType,
                    sourceQuestionId: question.sourceQuestionId,
                    questionText: question.questionText,
                    displayedOptions: question.options,
                    correctAnswerIndex: question.correctAnswer,
                    userAnswerIndex: userAnswer,
                    isCorrect: userAnswer === question.correctAnswer,
                    category: question.subject || 'General',
                    difficulty: question.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                    marks: question.marks || 1,
                };
            });

            return res.json({
                resultId: assessmentAttempt._id,
                score: assessmentAttempt.score,
                totalMarks: assessmentAttempt.totalMarks,
                passed: assessmentAttempt.passed,
                timeTaken: assessmentAttempt.timeTaken,
                submittedAt: assessmentAttempt.submittedAt,
                questions: await attachBookmarkStatus(userId, questions),
            });
        }

        if (result.userId.toString() !== userId.toString()) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Populate MCQ documents in mcqSnapshot order
        const mcqDocs = await MCQ.find({ _id: { $in: result.mcqSnapshot } }).populate('category', 'name').populate('typeId', 'name').lean();
        const mcqMap = new Map(mcqDocs.map((m: any) => [m._id.toString(), m]));
        const orderedMCQs = result.mcqSnapshot.map((id) => mcqMap.get(id.toString())).filter(Boolean) as any[];

        const optionOrders = result.optionOrders;
        const hasOptionOrders = Array.isArray(optionOrders) && optionOrders.length > 0;

        const questions = orderedMCQs.map((mcq: any, idx: number) => {
            const userAnswer = result.answers[idx] ?? -1;

            if (hasOptionOrders && optionOrders![idx] && optionOrders![idx].length === 4) {
                // Category quiz — reconstruct shuffled display from stored optionOrders
                const shuffledIndices = optionOrders![idx]; // shuffledIndices[displayPos] = originalIndex
                const displayedOptions = shuffledIndices.map((origIdx: number) => mcq.options[origIdx]);
                const correctInDisplay = shuffledIndices.indexOf(mcq.correctAnswer);
                return {
                    sourceType: 'mcq' as LearningQuestionSource,
                    sourceQuestionId: mcq._id,
                    questionText: mcq.questionText,
                    displayedOptions,
                    correctAnswerIndex: correctInDisplay,
                    userAnswerIndex: userAnswer,
                    isCorrect: userAnswer === correctInDisplay,
                    category: mcq.typeId?.name || mcq.category?.name || 'General',
                    difficulty: mcq.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                    marks: result.mcqSnapshot.length ? result.totalMarks / result.mcqSnapshot.length : 1,
                };
            } else {
                // Manual quiz — options not shuffled, use original MCQ order
                return {
                    sourceType: 'mcq' as LearningQuestionSource,
                    sourceQuestionId: mcq._id,
                    questionText: mcq.questionText,
                    displayedOptions: mcq.options,
                    correctAnswerIndex: mcq.correctAnswer,
                    userAnswerIndex: userAnswer,
                    isCorrect: userAnswer === mcq.correctAnswer,
                    category: mcq.typeId?.name || mcq.category?.name || 'General',
                    difficulty: mcq.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                    marks: result.mcqSnapshot.length ? result.totalMarks / result.mcqSnapshot.length : 1,
                };
            }
        });

        res.json({
            resultId: result._id,
            score: result.score,
            totalMarks: result.totalMarks,
            passed: result.passed,
            timeTaken: result.timeTaken,
            submittedAt: result.submittedAt,
            questions: await attachBookmarkStatus(userId, questions),
        });
    } catch (error) {
        console.error('Get result review error:', error);
        res.status(500).json({
            errorCode: 'UNKNOWN_SERVER_ERROR',
            message: 'Something went wrong. Please try again later.',
        });
    }
};
