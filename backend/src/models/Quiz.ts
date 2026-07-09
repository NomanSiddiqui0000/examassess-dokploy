import mongoose, { Document, Schema } from 'mongoose';

export interface ITypeDistributionItem {
    typeId: mongoose.Types.ObjectId;
    value: number;
}

export interface ITypeDistribution {
    mode: 'none' | 'count' | 'percentage';
    items: ITypeDistributionItem[];
}

export interface IQuiz extends Document {
    title: string;
    description?: string;
    testCategory: mongoose.Types.ObjectId;
    mcqIds: mongoose.Types.ObjectId[];
    numberOfQuestions: number;
    duration: number;
    passingMarks: number;
    marksPerQuestion: number;
    isActive: boolean;
    enrolledUsers: mongoose.Types.ObjectId[];
    attemptLimit: number; // 0 = unlimited
    typeDistribution?: ITypeDistribution;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const QuizSchema = new Schema<IQuiz>(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        testCategory: {
            type: Schema.Types.ObjectId,
            ref: 'TestCategory',
            required: true,
        },
        mcqIds: {
            type: [Schema.Types.ObjectId],
            ref: 'MCQ',
            required: true,
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
        passingMarks: {
            type: Number,
            default: 50,
        },
        marksPerQuestion: {
            type: Number,
            default: 1,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        enrolledUsers: {
            type: [Schema.Types.ObjectId],
            ref: 'User',
            default: [],
        },
        attemptLimit: {
            type: Number,
            default: 0, // 0 = unlimited
            min: 0,
        },
        typeDistribution: {
            type: {
                mode: {
                    type: String,
                    enum: ['none', 'count', 'percentage'],
                },
                items: [
                    {
                        typeId: { type: Schema.Types.ObjectId, ref: 'MCQType' },
                        value: { type: Number },
                    },
                ],
            },
            required: false,
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

export const Quiz = mongoose.model<IQuiz>('Quiz', QuizSchema);

