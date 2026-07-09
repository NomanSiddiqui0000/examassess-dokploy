import { Response } from 'express';
import { Result } from '../models/Result';
import { AuthRequest } from '../middleware/auth.middleware';

export const getAllResults = async (req: AuthRequest, res: Response) => {
    try {
        const { userId, quizId } = req.query;

        const filter: any = {};
        if (userId) filter.userId = userId;
        if (quizId) filter.quizId = quizId;

        const results = await Result.find(filter)
            .populate('userId', 'username')
            .populate('quizId', 'title numberOfQuestions marksPerQuestion passingMarks')
            .sort({ submittedAt: -1 });

        res.json(results);
    } catch (error) {
        console.error('Get results error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getResultsByQuiz = async (req: AuthRequest, res: Response) => {
    try {
        const { quizId } = req.params;

        const results = await Result.find({ quizId })
            .populate('userId', 'username')
            .populate('quizId', 'title numberOfQuestions marksPerQuestion passingMarks')
            .sort({ submittedAt: -1 });

        res.json(results);
    } catch (error) {
        console.error('Get results by quiz error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getResultsByUser = async (req: AuthRequest, res: Response) => {
    try {
        const { userId } = req.params;

        const results = await Result.find({ userId })
            .populate('quizId', 'title numberOfQuestions marksPerQuestion passingMarks')
            .sort({ submittedAt: -1 });

        res.json(results);
    } catch (error) {
        console.error('Get results by user error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
