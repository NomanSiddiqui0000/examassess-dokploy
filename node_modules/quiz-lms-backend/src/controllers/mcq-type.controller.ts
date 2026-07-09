import { Response } from 'express';
import { MCQType } from '../models/MCQType';
import { MCQ } from '../models/MCQ';
import { AuthRequest } from '../middleware/auth.middleware';

export const createMCQType = async (req: AuthRequest, res: Response) => {
    try {
        const { name, categoryId } = req.body;

        if (!name || !categoryId) {
            return res.status(400).json({ message: 'Name and category are required' });
        }

        // Check uniqueness within category
        const existing = await MCQType.findOne({
            categoryId,
            name: { $regex: `^${name.trim()}$`, $options: 'i' },
        });
        if (existing) {
            return res.status(400).json({ message: 'A type with this name already exists in this category' });
        }

        const mcqType = await MCQType.create({
            name: name.trim(),
            categoryId,
            createdBy: req.user!.id,
        });

        const populated = await mcqType.populate('categoryId', 'name');
        res.status(201).json({ message: 'MCQ Type created successfully', mcqType: populated });
    } catch (error) {
        console.error('Create MCQ Type error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getAllMCQTypes = async (req: AuthRequest, res: Response) => {
    try {
        const filter: any = {};
        if (req.query.categoryId) {
            filter.categoryId = req.query.categoryId;
        }
        if (req.query.status) {
            filter.status = req.query.status;
        }

        const mcqTypes = await MCQType.find(filter)
            .populate('categoryId', 'name')
            .populate('createdBy', 'username')
            .sort({ categoryId: 1, name: 1 });

        res.json(mcqTypes);
    } catch (error) {
        console.error('Get MCQ Types error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateMCQType = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { name, status } = req.body;

        const mcqType = await MCQType.findById(id);
        if (!mcqType) {
            return res.status(404).json({ message: 'MCQ Type not found' });
        }

        if (name !== undefined) {
            // Check uniqueness within category
            const existing = await MCQType.findOne({
                _id: { $ne: id },
                categoryId: mcqType.categoryId,
                name: { $regex: `^${name.trim()}$`, $options: 'i' },
            });
            if (existing) {
                return res.status(400).json({ message: 'A type with this name already exists in this category' });
            }
            mcqType.name = name.trim();
        }

        if (status !== undefined) {
            mcqType.status = status;
        }

        await mcqType.save();
        const populated = await mcqType.populate('categoryId', 'name');

        res.json({ message: 'MCQ Type updated successfully', mcqType: populated });
    } catch (error) {
        console.error('Update MCQ Type error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteMCQType = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const mcqType = await MCQType.findById(id);
        if (!mcqType) {
            return res.status(404).json({ message: 'MCQ Type not found' });
        }

        // Check if any MCQs are linked to this type
        const linkedCount = await MCQ.countDocuments({ typeId: id });

        if (linkedCount > 0) {
            // Soft delete — set status to inactive
            mcqType.status = 'inactive';
            await mcqType.save();
            return res.json({
                message: `Type has ${linkedCount} linked MCQ(s). It has been deactivated instead of deleted.`,
                softDeleted: true,
                mcqType,
            });
        }

        // Hard delete — no MCQs linked
        await MCQType.findByIdAndDelete(id);
        res.json({ message: 'MCQ Type deleted successfully' });
    } catch (error) {
        console.error('Delete MCQ Type error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
