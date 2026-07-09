import { Response } from 'express';
import { MCQ } from '../models/MCQ';
import { MCQType } from '../models/MCQType';
import { AuthRequest } from '../middleware/auth.middleware';
import { parseExcelFile, generateTemplate } from '../utils/upload.util';

export const createMCQ = async (req: AuthRequest, res: Response) => {
    try {
        const { questionText, options, correctAnswer, category, difficulty, typeId } = req.body;

        if (!questionText || !options || correctAnswer === undefined) {
            return res.status(400).json({ message: 'Question text, options, and correct answer are required' });
        }

        if (!category) {
            return res.status(400).json({ message: 'Category is required. Every MCQ must belong to a test category.' });
        }

        if (!Array.isArray(options) || options.length !== 4) {
            return res.status(400).json({ message: 'Exactly 4 options are required' });
        }

        if (correctAnswer < 0 || correctAnswer > 3) {
            return res.status(400).json({ message: 'Correct answer must be between 0 and 3' });
        }

        const mcq = await MCQ.create({
            questionText,
            options,
            correctAnswer,
            category,
            difficulty,
            typeId: typeId || undefined,
            createdBy: req.user!.id,
        });

        res.status(201).json({
            message: 'MCQ created successfully',
            mcq,
        });
    } catch (error) {
        console.error('Create MCQ error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const getAllMCQs = async (req: AuthRequest, res: Response) => {
    try {
        const { search, category, difficulty, type } = req.query;

        const filter: any = {};

        if (search) {
            filter.questionText = { $regex: search, $options: 'i' };
        }

        if (category) {
            filter.category = category;
        }

        if (difficulty) {
            filter.difficulty = difficulty;
        }

        if (type) {
            filter.typeId = type;
        }

        const mcqs = await MCQ.find(filter)
            .populate('createdBy', 'username')
            .populate('category', 'name')
            .populate('typeId', 'name');
        res.json(mcqs);
    } catch (error) {
        console.error('Get MCQs error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateMCQ = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { questionText, options, correctAnswer, category, difficulty, typeId } = req.body;

        const mcq = await MCQ.findById(id);
        if (!mcq) {
            return res.status(404).json({ message: 'MCQ not found' });
        }

        if (questionText) mcq.questionText = questionText;
        if (options) {
            if (!Array.isArray(options) || options.length !== 4) {
                return res.status(400).json({ message: 'Exactly 4 options are required' });
            }
            mcq.options = options;
        }
        if (correctAnswer !== undefined) {
            if (correctAnswer < 0 || correctAnswer > 3) {
                return res.status(400).json({ message: 'Correct answer must be between 0 and 3' });
            }
            mcq.correctAnswer = correctAnswer;
        }
        if (category !== undefined) {
            if (!category) {
                return res.status(400).json({ message: 'Category is required and cannot be cleared.' });
            }
            mcq.category = category;
        }
        if (difficulty !== undefined) mcq.difficulty = difficulty;
        if (typeId !== undefined) mcq.typeId = typeId || undefined;

        await mcq.save();

        res.json({
            message: 'MCQ updated successfully',
            mcq,
        });
    } catch (error) {
        console.error('Update MCQ error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const deleteMCQ = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        const mcq = await MCQ.findByIdAndDelete(id);
        if (!mcq) {
            return res.status(404).json({ message: 'MCQ not found' });
        }

        res.json({ message: 'MCQ deleted successfully' });
    } catch (error) {
        console.error('Delete MCQ error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const bulkUploadMCQs = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const categoryId = req.body.categoryId;
        if (!categoryId) {
            return res.status(400).json({ message: 'Category is required for bulk upload. Select a category before uploading.' });
        }

        // Fallback typeId from UI selection (used when rows don't specify a type)
        const fallbackTypeId = req.body.typeId || undefined;

        const parseResult = parseExcelFile(req.file.buffer);

        if (!parseResult.success) {
            return res.status(400).json({
                message: 'File contains errors',
                errors: parseResult.errors,
            });
        }

        // --- Resolve type names to ObjectIds ---
        // Collect unique type names from parsed MCQs
        const uniqueTypeNames = [
            ...new Set(
                parseResult.mcqs
                    .map((m) => m.typeName)
                    .filter((n): n is string => !!n)
            ),
        ];

        // Build a case-insensitive name → _id map for types under this category
        const typeNameToId: Record<string, string> = {};
        if (uniqueTypeNames.length > 0) {
            // Query all MCQ types that belong to this category
            const matchingTypes = await MCQType.find({
                categoryId,
                status: 'active',
            }).lean();

            for (const t of matchingTypes) {
                typeNameToId[t.name.toLowerCase().trim()] = t._id.toString();
            }

            // Validate that every referenced type name actually exists
            const typeErrors: string[] = [];
            parseResult.mcqs.forEach((mcq, index) => {
                if (mcq.typeName) {
                    const key = mcq.typeName.toLowerCase().trim();
                    if (!typeNameToId[key]) {
                        typeErrors.push(
                            `Row ${index + 2}: MCQ Type '${mcq.typeName}' does not exist under selected category.`
                        );
                    }
                }
            });

            if (typeErrors.length > 0) {
                return res.status(400).json({
                    message: 'Some MCQ types not found',
                    errors: typeErrors,
                });
            }
        }

        const mcqs = await MCQ.insertMany(
            parseResult.mcqs.map((mcq) => {
                // Determine typeId: file-level type takes precedence, then UI fallback
                let resolvedTypeId = fallbackTypeId;
                if (mcq.typeName) {
                    const key = mcq.typeName.toLowerCase().trim();
                    resolvedTypeId = typeNameToId[key] || fallbackTypeId;
                }

                // Remove typeName before inserting (it's not part of the MCQ schema)
                const { typeName, ...mcqData } = mcq;

                return {
                    ...mcqData,
                    category: categoryId,
                    typeId: resolvedTypeId,
                    createdBy: req.user!.id,
                };
            })
        );

        res.status(201).json({
            message: `Successfully uploaded ${mcqs.length} MCQs`,
            count: mcqs.length,
            mcqs,
        });
    } catch (error) {
        console.error('Bulk upload error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const downloadTemplate = async (req: AuthRequest, res: Response) => {
    try {
        const buffer = generateTemplate();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=mcq-template.xlsx');
        res.send(buffer);
    } catch (error) {
        console.error('Download template error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
