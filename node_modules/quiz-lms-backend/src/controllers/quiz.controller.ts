import { Response } from 'express';
import { Quiz } from '../models/Quiz';
import { MCQ } from '../models/MCQ';
import { Result } from '../models/Result';
import { User } from '../models/User';
import { AuthRequest } from '../middleware/auth.middleware';

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

export const createQuiz = async (req: AuthRequest, res: Response) => {
    try {
        const {
            title,
            description,
            testCategory,
            mcqIds: rawMcqIds,
            randomMCQCount,
            numberOfQuestions,
            duration,
            passingMarks,
            marksPerQuestion,
            enrolledUsers,
            attemptLimit,
            typeDistribution,
        } = req.body;

        if (!title || !numberOfQuestions || !duration || !testCategory) {
            return res.status(400).json({
                message: 'Title, test category, number of questions, and duration are required',
            });
        }

        let finalMcqIds: string[] = [];

        // ── Type Distribution Branch ──────────────────────────────────────
        const distMode = typeDistribution?.mode;
        if (distMode === 'count' || distMode === 'percentage') {
            const distItems: { typeId: string; value: number }[] = typeDistribution.items || [];

            if (distItems.length === 0) {
                return res.status(400).json({ message: 'Distribution items are required when using type distribution' });
            }

            // Convert percentage to counts if needed
            let typeCounts: { typeId: string; count: number }[];
            if (distMode === 'percentage') {
                const totalPct = distItems.reduce((s, i) => s + i.value, 0);
                if (Math.abs(totalPct - 100) > 0.01) {
                    return res.status(400).json({ message: `Percentage total must equal 100%. Current: ${totalPct}%` });
                }
                typeCounts = percentageToCounts(distItems, numberOfQuestions);
            } else {
                typeCounts = distItems.map((i) => ({ typeId: i.typeId, count: i.value }));
                const totalCount = typeCounts.reduce((s, i) => s + i.count, 0);
                if (totalCount !== numberOfQuestions) {
                    return res.status(400).json({
                        message: `Distribution count total (${totalCount}) must equal number of questions (${numberOfQuestions})`,
                    });
                }
            }

            // Fetch MCQs per type
            for (const tc of typeCounts) {
                const available = await MCQ.find(
                    { category: testCategory, typeId: tc.typeId },
                    '_id'
                ).lean();

                if (available.length < tc.count) {
                    return res.status(400).json({
                        message: `Not enough MCQs for type. Required: ${tc.count}, Available: ${available.length}`,
                    });
                }

                const ids = available.map((m: any) => m._id.toString());
                const picked = shuffleArray(ids).slice(0, tc.count);
                finalMcqIds.push(...picked);
            }

            // Deduplicate (shouldn't happen with disjoint types, but safety net)
            finalMcqIds = [...new Set(finalMcqIds)];

            // Final shuffle
            finalMcqIds = shuffleArray(finalMcqIds);
        } else {
            // ── Existing Random Logic (unchanged) ─────────────────────────
            const manualIds: string[] = Array.isArray(rawMcqIds)
                ? [...new Set(rawMcqIds as string[])]
                : [];

            const randomCount = Number(randomMCQCount) || 0;
            finalMcqIds = [...manualIds];

            if (randomCount > 0) {
                const categoryFilter: any = { category: testCategory };
                const allMCQDocs = await MCQ.find(categoryFilter, '_id').lean();
                const allIds = allMCQDocs.map((m: any) => m._id.toString());
                const available = allIds.filter(id => !manualIds.includes(id));

                if (randomCount > available.length) {
                    return res.status(400).json({
                        message: `Cannot select ${randomCount} random MCQs — only ${available.length} MCQs available in this category.`,
                    });
                }

                const randomPicked = shuffleArray(available).slice(0, randomCount);
                finalMcqIds = [...manualIds, ...randomPicked];
            }
        }

        if (finalMcqIds.length === 0) {
            return res.status(400).json({ message: 'At least one MCQ must be selected' });
        }

        if (numberOfQuestions > finalMcqIds.length) {
            return res.status(400).json({
                message: `Number of questions (${numberOfQuestions}) cannot exceed total MCQs in pool (${finalMcqIds.length})`,
            });
        }

        // Verify all MCQs exist
        const mcqCount = await MCQ.countDocuments({ _id: { $in: finalMcqIds } });
        if (mcqCount !== finalMcqIds.length) {
            return res.status(400).json({ message: 'One or more MCQs not found' });
        }

        const quizData: any = {
            title,
            description,
            testCategory,
            mcqIds: finalMcqIds,
            numberOfQuestions,
            duration,
            passingMarks: passingMarks ?? 50,
            marksPerQuestion: marksPerQuestion ?? 1,
            isActive: true,
            enrolledUsers: enrolledUsers || [],
            attemptLimit: attemptLimit ?? 0,
            createdBy: req.user!.id,
        };

        // Only store distribution if it was used
        if (distMode === 'count' || distMode === 'percentage') {
            quizData.typeDistribution = typeDistribution;
        }

        const quiz = await Quiz.create(quizData);

        res.status(201).json({
            message: 'Quiz created successfully',
            quiz,
        });
    } catch (error) {
        console.error('Create quiz error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getAllQuizzes = async (req: AuthRequest, res: Response) => {
    try {
        const quizzes = await Quiz.find()
            .populate('createdBy', 'username')
            .populate('testCategory', 'name')
            .populate('mcqIds', 'questionText category difficulty')
            .populate('enrolledUsers', 'username');

        res.json(quizzes);
    } catch (error) {
        console.error('Get quizzes error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateQuiz = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            testCategory,
            mcqIds: rawMcqIds,
            randomMCQCount,
            numberOfQuestions,
            duration,
            passingMarks,
            marksPerQuestion,
            enrolledUsers,
            attemptLimit,
            typeDistribution,
        } = req.body;

        const quiz = await Quiz.findById(id);
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        if (title) quiz.title = title;
        if (description !== undefined) quiz.description = description;
        if (testCategory) quiz.testCategory = testCategory;
        if (duration) quiz.duration = duration;
        if (passingMarks !== undefined) quiz.passingMarks = passingMarks;
        if (marksPerQuestion !== undefined) quiz.marksPerQuestion = marksPerQuestion;
        if (enrolledUsers !== undefined) quiz.enrolledUsers = enrolledUsers;
        if (attemptLimit !== undefined) quiz.attemptLimit = attemptLimit;

        // Determine effective number of questions
        const effectiveNumQ = numberOfQuestions || quiz.numberOfQuestions;
        const effectiveCategory = testCategory || quiz.testCategory;

        // ── Type Distribution Branch ──────────────────────────────────────
        const distMode = typeDistribution?.mode;
        if (distMode === 'count' || distMode === 'percentage') {
            const distItems: { typeId: string; value: number }[] = typeDistribution.items || [];

            if (distItems.length === 0) {
                return res.status(400).json({ message: 'Distribution items are required when using type distribution' });
            }

            let typeCounts: { typeId: string; count: number }[];
            if (distMode === 'percentage') {
                const totalPct = distItems.reduce((s: number, i: any) => s + i.value, 0);
                if (Math.abs(totalPct - 100) > 0.01) {
                    return res.status(400).json({ message: `Percentage total must equal 100%. Current: ${totalPct}%` });
                }
                typeCounts = percentageToCounts(distItems, effectiveNumQ);
            } else {
                typeCounts = distItems.map((i: any) => ({ typeId: i.typeId, count: i.value }));
                const totalCount = typeCounts.reduce((s, i) => s + i.count, 0);
                if (totalCount !== effectiveNumQ) {
                    return res.status(400).json({
                        message: `Distribution count total (${totalCount}) must equal number of questions (${effectiveNumQ})`,
                    });
                }
            }

            let finalMcqIds: string[] = [];
            for (const tc of typeCounts) {
                const available = await MCQ.find(
                    { category: effectiveCategory, typeId: tc.typeId },
                    '_id'
                ).lean();

                if (available.length < tc.count) {
                    return res.status(400).json({
                        message: `Not enough MCQs for type. Required: ${tc.count}, Available: ${available.length}`,
                    });
                }

                const ids = available.map((m: any) => m._id.toString());
                const picked = shuffleArray(ids).slice(0, tc.count);
                finalMcqIds.push(...picked);
            }

            finalMcqIds = shuffleArray([...new Set(finalMcqIds)]);
            quiz.mcqIds = finalMcqIds as any;
            quiz.typeDistribution = typeDistribution;
        } else if (rawMcqIds !== undefined || randomMCQCount !== undefined) {
            // ── Existing Random Logic (unchanged) ─────────────────────────
            const manualIds: string[] = Array.isArray(rawMcqIds)
                ? [...new Set(rawMcqIds as string[])]
                : quiz.mcqIds.map((m: any) => m.toString());

            const randomCount = Number(randomMCQCount) || 0;
            let finalMcqIds: string[] = [...manualIds];

            if (randomCount > 0) {
                const categoryFilter: any = { category: effectiveCategory };
                const allMCQDocs = await MCQ.find(categoryFilter, '_id').lean();
                const allIds = allMCQDocs.map((m: any) => m._id.toString());
                const available = allIds.filter(id => !manualIds.includes(id));

                if (randomCount > available.length) {
                    return res.status(400).json({
                        message: `Cannot select ${randomCount} random MCQs — only ${available.length} MCQs available in this category.`,
                    });
                }

                const randomPicked = shuffleArray(available).slice(0, randomCount);
                finalMcqIds = [...manualIds, ...randomPicked];
            }

            if (finalMcqIds.length === 0) {
                return res.status(400).json({ message: 'At least one MCQ must be selected' });
            }

            const mcqCount = await MCQ.countDocuments({ _id: { $in: finalMcqIds } });
            if (mcqCount !== finalMcqIds.length) {
                return res.status(400).json({ message: 'One or more MCQs not found' });
            }

            quiz.mcqIds = finalMcqIds as any;
            // Clear distribution if switching back to manual mode
            if (typeDistribution?.mode === 'none') {
                quiz.typeDistribution = undefined;
            }
        }

        if (numberOfQuestions) {
            if (numberOfQuestions > quiz.mcqIds.length) {
                return res.status(400).json({
                    message: 'Number of questions cannot exceed available MCQs',
                });
            }
            quiz.numberOfQuestions = numberOfQuestions;
        }

        await quiz.save();

        res.json({
            message: 'Quiz updated successfully',
            quiz,
        });
    } catch (error) {
        console.error('Update quiz error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteQuiz = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const quiz = await Quiz.findByIdAndDelete(id);
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        res.json({ message: 'Quiz deleted successfully' });
    } catch (error) {
        console.error('Delete quiz error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const toggleQuizStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const quiz = await Quiz.findById(id);
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        quiz.isActive = !quiz.isActive;
        await quiz.save();

        res.json({
            message: `Quiz ${quiz.isActive ? 'enabled' : 'disabled'} successfully`,
            quiz,
        });
    } catch (error) {
        console.error('Toggle quiz status error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const enrollUsers = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { userIds } = req.body;

        if (!Array.isArray(userIds)) {
            return res.status(400).json({ message: 'userIds must be an array' });
        }

        const quiz = await Quiz.findById(id);
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        quiz.enrolledUsers = userIds;
        await quiz.save();

        const populated = await quiz.populate('enrolledUsers', 'username');

        res.json({
            message: 'Users enrolled successfully',
            enrolledUsers: (populated.enrolledUsers as any[]),
        });
    } catch (error) {
        console.error('Enroll users error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getEnrolledUsers = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const quiz = await Quiz.findById(id).populate('enrolledUsers', 'username isActive');
        if (!quiz) {
            return res.status(404).json({ message: 'Quiz not found' });
        }

        res.json({ enrolledUsers: quiz.enrolledUsers });
    } catch (error) {
        console.error('Get enrolled users error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getAdminDashboardStats = async (req: AuthRequest, res: Response) => {
    try {
        const { Quiz: QuizModel } = await import('../models/Quiz');
        const { User: UserModel } = await import('../models/User');
        const { MCQ: MCQModel } = await import('../models/MCQ');
        const { Result: ResultModel } = await import('../models/Result');

        const [totalUsers, totalQuizzes, totalMCQs, totalAttempts, recentResults] = await Promise.all([
            UserModel.countDocuments({ role: 'user' }),
            QuizModel.countDocuments(),
            MCQModel.countDocuments(),
            ResultModel.countDocuments(),
            ResultModel.find()
                .populate('userId', 'username')
                .populate('quizId', 'title')
                .sort({ submittedAt: -1 })
                .limit(10),
        ]);

        res.json({
            stats: { totalUsers, totalQuizzes, totalMCQs, totalAttempts },
            recentResults,
        });
    } catch (error) {
        console.error('Dashboard stats error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
