import { Response } from 'express';
import { TestCategory } from '../models/TestCategory';
import { MCQ } from '../models/MCQ';
import { Quiz } from '../models/Quiz';
import { CategoryQuizConfig } from '../models/CategoryQuizConfig';
import { Result } from '../models/Result';
import { AuthRequest } from '../middleware/auth.middleware';

// ─── Create Test Category (Super Admin only) ──────────────────────────────────

export const createTestCategory = async (req: AuthRequest, res: Response) => {
    try {
        const { name, defaultCredits } = req.body;

        if (!name || defaultCredits === undefined || defaultCredits === null) {
            return res.status(400).json({ message: 'Name and defaultCredits are required' });
        }

        if (typeof defaultCredits !== 'number' || defaultCredits < 0) {
            return res.status(400).json({ message: 'defaultCredits must be a non-negative number' });
        }

        const existing = await TestCategory.findOne({ name: name.trim().toUpperCase() });
        if (existing) {
            return res.status(409).json({ message: 'Test category with this name already exists' });
        }

        const category = await TestCategory.create({
            name: name.trim().toUpperCase(),
            defaultCredits,
        });

        res.status(201).json({
            message: 'Test category created successfully',
            category,
        });
    } catch (error) {
        console.error('Create test category error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Get All Test Categories (Any admin role) ─────────────────────────────────

export const getAllTestCategories = async (req: AuthRequest, res: Response) => {
    try {
        const categories = await TestCategory.find().sort({ name: 1 });
        res.json(categories);
    } catch (error) {
        console.error('Get test categories error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Get Active Test Categories (Public — for registration dropdown) ──────────

export const getPublicTestCategories = async (req: AuthRequest, res: Response) => {
    try {
        const categories = await TestCategory.find({ isActive: true })
            .select('name _id')
            .sort({ name: 1 });

        // Only expose categories that actually have practice content available.
        // A student who registers under a category with no active quiz AND no
        // active dynamic config lands on an empty "My Practice" section — so we
        // hide those categories from the registration dropdown entirely.
        const [quizCategoryIds, configCategoryIds] = await Promise.all([
            Quiz.distinct('testCategory', { isActive: true }),
            CategoryQuizConfig.distinct('testCategory', { isActive: true }),
        ]);
        const categoriesWithContent = new Set(
            [...quizCategoryIds, ...configCategoryIds]
                .filter(Boolean)
                .map((id) => String(id))
        );

        const available = categories.filter((c) => categoriesWithContent.has(String(c._id)));
        res.json(available);
    } catch (error) {
        console.error('Get public test categories error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Update Test Category (Super Admin only) ──────────────────────────────────

export const updateTestCategory = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, defaultCredits, isActive } = req.body;

        const category = await TestCategory.findById(id);
        if (!category) {
            return res.status(404).json({ message: 'Test category not found' });
        }

        if (name) {
            const trimmedName = name.trim().toUpperCase();
            const existing = await TestCategory.findOne({ name: trimmedName, _id: { $ne: id } });
            if (existing) {
                return res.status(409).json({ message: 'Test category with this name already exists' });
            }
            category.name = trimmedName;
        }

        if (defaultCredits !== undefined) {
            if (typeof defaultCredits !== 'number' || defaultCredits < 0) {
                return res.status(400).json({ message: 'defaultCredits must be a non-negative number' });
            }
            category.defaultCredits = defaultCredits;
        }

        if (typeof isActive === 'boolean') {
            category.isActive = isActive;
        }

        await category.save();

        res.json({
            message: 'Test category updated successfully',
            category,
        });
    } catch (error) {
        console.error('Update test category error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Delete Test Category (Super Admin only — soft delete) ────────────────────

export const deleteTestCategory = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const category = await TestCategory.findById(id);
        if (!category) {
            return res.status(404).json({ message: 'Test category not found' });
        }

        category.isActive = false;
        await category.save();

        res.json({ message: 'Test category deactivated successfully' });
    } catch (error) {
        console.error('Delete test category error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Hard Delete Test Category + Cascade (Super Admin only) ───────────────────

export const hardDeleteTestCategory = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { confirm } = req.body;

        if (!confirm) {
            return res.status(400).json({
                message: 'Must send { confirm: true } to permanently delete a category and all its data.',
            });
        }

        const category = await TestCategory.findById(id);
        if (!category) {
            return res.status(404).json({ message: 'Test category not found' });
        }

        // 1. Delete all MCQs in this category
        const mcqResult = await MCQ.deleteMany({ category: id });

        // 2. Delete all quizzes in this category
        const quizResult = await Quiz.deleteMany({ testCategory: id });

        // 3. Find category quiz configs to get their IDs for result cleanup
        const configIds = await CategoryQuizConfig.find({ testCategory: id }).select('_id');
        const configIdList = configIds.map(c => c._id);

        // 4. Delete results that reference these category configs
        let resultDeleteCount = 0;
        if (configIdList.length > 0) {
            const resultResult = await Result.deleteMany({ categoryConfigId: { $in: configIdList } });
            resultDeleteCount = resultResult.deletedCount;
        }

        // 5. Delete category quiz configs
        const configResult = await CategoryQuizConfig.deleteMany({ testCategory: id });

        // 6. Delete the category itself
        await TestCategory.findByIdAndDelete(id);

        res.json({
            message: `Category "${category.name}" and all associated data permanently deleted`,
            deleted: {
                category: category.name,
                mcqs: mcqResult.deletedCount,
                quizzes: quizResult.deletedCount,
                categoryQuizConfigs: configResult.deletedCount,
                results: resultDeleteCount,
            },
        });
    } catch (error) {
        console.error('Hard delete test category error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
