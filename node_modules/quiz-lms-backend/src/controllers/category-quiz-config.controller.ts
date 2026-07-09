import { Response } from 'express';
import { CategoryQuizConfig } from '../models/CategoryQuizConfig';
import { MCQ } from '../models/MCQ';
import { AuthRequest } from '../middleware/auth.middleware';

export const createCategoryQuizConfig = async (req: AuthRequest, res: Response) => {
    try {
        const { testCategory, numberOfQuestions, duration, marksPerQuestion, passingMarks, creditCost } = req.body;

        if (!testCategory || !numberOfQuestions || !duration) {
            return res.status(400).json({ message: 'Test category, number of questions, and duration are required' });
        }

        // Check if config already exists for this category
        const existing = await CategoryQuizConfig.findOne({ testCategory });
        if (existing) {
            return res.status(400).json({ message: 'A quiz configuration already exists for this category' });
        }

        // Validate MCQ pool size
        const mcqCount = await MCQ.countDocuments({ category: testCategory });
        if (mcqCount < numberOfQuestions) {
            return res.status(400).json({
                message: `Not enough MCQs in this category. Found ${mcqCount} but need ${numberOfQuestions}. Add more MCQs first.`,
            });
        }

        const config = await CategoryQuizConfig.create({
            testCategory,
            numberOfQuestions,
            duration,
            marksPerQuestion: marksPerQuestion || 1,
            passingMarks: passingMarks || 50,
            creditCost: creditCost ?? 1,
            createdBy: req.user!.id,
        });

        const populated = await CategoryQuizConfig.findById(config._id)
            .populate('testCategory', 'name');

        res.status(201).json({ message: 'Category quiz config created', config: populated });
    } catch (error) {
        console.error('Create category quiz config error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getAllCategoryQuizConfigs = async (req: AuthRequest, res: Response) => {
    try {
        const configs = await CategoryQuizConfig.find()
            .populate('testCategory', 'name')
            .populate('createdBy', 'username')
            .sort({ createdAt: -1 });

        // Attach MCQ count per category
        const configsWithCounts = await Promise.all(
            configs.map(async (config) => {
                const mcqCount = await MCQ.countDocuments({ category: config.testCategory });
                return { ...config.toObject(), mcqCount };
            })
        );

        res.json(configsWithCounts);
    } catch (error) {
        console.error('Get category quiz configs error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateCategoryQuizConfig = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { numberOfQuestions, duration, marksPerQuestion, passingMarks, creditCost, isActive } = req.body;

        const config = await CategoryQuizConfig.findById(id);
        if (!config) {
            return res.status(404).json({ message: 'Config not found' });
        }

        // Validate MCQ pool if numberOfQuestions changed
        if (numberOfQuestions && numberOfQuestions !== config.numberOfQuestions) {
            const mcqCount = await MCQ.countDocuments({ category: config.testCategory });
            if (mcqCount < numberOfQuestions) {
                return res.status(400).json({
                    message: `Not enough MCQs. Found ${mcqCount} but need ${numberOfQuestions}.`,
                });
            }
        }

        if (numberOfQuestions !== undefined) config.numberOfQuestions = numberOfQuestions;
        if (duration !== undefined) config.duration = duration;
        if (marksPerQuestion !== undefined) config.marksPerQuestion = marksPerQuestion;
        if (passingMarks !== undefined) config.passingMarks = passingMarks;
        if (creditCost !== undefined) config.creditCost = creditCost;
        if (isActive !== undefined) config.isActive = isActive;

        await config.save();

        const populated = await CategoryQuizConfig.findById(config._id)
            .populate('testCategory', 'name');

        res.json({ message: 'Config updated', config: populated });
    } catch (error) {
        console.error('Update category quiz config error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteCategoryQuizConfig = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const config = await CategoryQuizConfig.findByIdAndDelete(id);
        if (!config) {
            return res.status(404).json({ message: 'Config not found' });
        }
        res.json({ message: 'Config deleted' });
    } catch (error) {
        console.error('Delete category quiz config error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getCategoryMCQCount = async (req: AuthRequest, res: Response) => {
    try {
        const { categoryId } = req.params;
        const count = await MCQ.countDocuments({ category: categoryId });
        res.json({ count });
    } catch (error) {
        console.error('Get MCQ count error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
