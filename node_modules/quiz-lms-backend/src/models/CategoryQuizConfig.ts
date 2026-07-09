import mongoose, { Document, Schema } from 'mongoose';

export interface ICategoryQuizConfig extends Document {
    testCategory: mongoose.Types.ObjectId;
    numberOfQuestions: number;
    duration: number;
    marksPerQuestion: number;
    passingMarks: number;
    creditCost: number;
    isActive: boolean;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const CategoryQuizConfigSchema = new Schema<ICategoryQuizConfig>(
    {
        testCategory: {
            type: Schema.Types.ObjectId,
            ref: 'TestCategory',
            required: true,
            unique: true,
        },
        numberOfQuestions: {
            type: Number,
            required: true,
            min: 1,
        },
        duration: {
            type: Number,
            required: true,
            min: 1,
        },
        marksPerQuestion: {
            type: Number,
            default: 1,
            min: 1,
        },
        passingMarks: {
            type: Number,
            default: 50,
            min: 0,
        },
        creditCost: {
            type: Number,
            default: 1,
            min: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
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

export const CategoryQuizConfig = mongoose.model<ICategoryQuizConfig>(
    'CategoryQuizConfig',
    CategoryQuizConfigSchema
);
