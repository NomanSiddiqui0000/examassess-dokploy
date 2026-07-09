import mongoose, { Document, Schema } from 'mongoose';
import { QUESTION_DIFFICULTIES, QuestionDifficulty } from '../constants/questionDifficulty';

export type TeacherQuestionDifficulty = QuestionDifficulty;

export interface ITeacherQuestion extends Document {
    teacherId: mongoose.Types.ObjectId;
    questionText: string;
    options: string[];
    correctAnswer: number;
    subject: string;
    difficulty: TeacherQuestionDifficulty;
    explanation?: string;
    marks: number;
    createdAt: Date;
    updatedAt: Date;
}

const TeacherQuestionSchema = new Schema<ITeacherQuestion>(
    {
        teacherId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        questionText: {
            type: String,
            required: true,
            trim: true,
        },
        options: {
            type: [String],
            required: true,
            validate: {
                validator: (v: string[]) => v.length === 4 && v.every(Boolean),
                message: 'Teacher MCQ must have exactly 4 options',
            },
        },
        correctAnswer: {
            type: Number,
            required: true,
            min: 0,
            max: 3,
        },
        subject: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        difficulty: {
            type: String,
            enum: [...QUESTION_DIFFICULTIES],
            required: true,
        },
        explanation: {
            type: String,
            trim: true,
        },
        marks: {
            type: Number,
            default: 1,
            min: 1,
        },
    },
    { timestamps: true }
);

TeacherQuestionSchema.index({ teacherId: 1, subject: 1, difficulty: 1 });

export const TeacherQuestion = mongoose.model<ITeacherQuestion>('TeacherQuestion', TeacherQuestionSchema);
