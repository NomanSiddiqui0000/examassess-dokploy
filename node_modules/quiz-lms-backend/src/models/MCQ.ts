import mongoose, { Document, Schema } from 'mongoose';
import { QUESTION_DIFFICULTIES, QuestionDifficulty } from '../constants/questionDifficulty';

export interface IMCQ extends Document {
    questionText: string;
    options: string[];
    correctAnswer: number;
    category: mongoose.Types.ObjectId;
    typeId?: mongoose.Types.ObjectId;
    difficulty?: QuestionDifficulty;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const MCQSchema = new Schema<IMCQ>(
    {
        questionText: {
            type: String,
            required: true,
        },
        options: {
            type: [String],
            required: true,
            validate: {
                validator: (v: string[]) => v.length === 4,
                message: 'MCQ must have exactly 4 options',
            },
        },
        correctAnswer: {
            type: Number,
            required: true,
            min: 0,
            max: 3,
        },
        category: {
            type: Schema.Types.ObjectId,
            ref: 'TestCategory',
            required: true,
            index: true,
        },
        typeId: {
            type: Schema.Types.ObjectId,
            ref: 'MCQType',
            required: false,
        },
        difficulty: {
            type: String,
            enum: [...QUESTION_DIFFICULTIES],
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for fast type-based queries
MCQSchema.index({ category: 1, typeId: 1 });

export const MCQ = mongoose.model<IMCQ>('MCQ', MCQSchema);

