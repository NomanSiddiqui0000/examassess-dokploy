import mongoose, { Document, Schema } from 'mongoose';

export interface IResult extends Document {
    userId: mongoose.Types.ObjectId;
    quizId?: mongoose.Types.ObjectId;
    categoryConfigId?: mongoose.Types.ObjectId;
    answers: number[];
    mcqSnapshot: mongoose.Types.ObjectId[]; // MCQ IDs used in this attempt
    optionOrders?: number[][]; // shuffled option indices per question (category quizzes only)
    score: number;
    totalMarks: number;
    passed: boolean;
    timeTaken: number;
    submittedAt: Date;
    learningRecordedAt?: Date;
}

const ResultSchema = new Schema<IResult>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        quizId: {
            type: Schema.Types.ObjectId,
            ref: 'Quiz',
        },
        categoryConfigId: {
            type: Schema.Types.ObjectId,
            ref: 'CategoryQuizConfig',
        },
        answers: {
            type: [Number],
            required: true,
        },
        mcqSnapshot: {
            type: [Schema.Types.ObjectId],
            ref: 'MCQ',
            default: [],
        },
        optionOrders: {
            type: [[Number]],
            default: undefined,
        },
        score: {
            type: Number,
            required: true,
        },
        totalMarks: {
            type: Number,
            required: true,
        },
        passed: {
            type: Boolean,
            required: true,
        },
        timeTaken: {
            type: Number,
            required: true,
        },
        submittedAt: {
            type: Date,
            default: Date.now,
        },
        learningRecordedAt: {
            type: Date,
        },
    },
    {
        timestamps: false,
    }
);

ResultSchema.index({ userId: 1, learningRecordedAt: 1, submittedAt: -1 });

export const Result = mongoose.model<IResult>('Result', ResultSchema);
