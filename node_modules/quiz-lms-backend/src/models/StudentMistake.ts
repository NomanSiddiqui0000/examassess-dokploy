import mongoose, { Document, Schema } from 'mongoose';
import { DEFAULT_QUESTION_DIFFICULTY, QUESTION_DIFFICULTIES, QuestionDifficulty } from '../constants/questionDifficulty';
import { LearningQuestionSource } from './StudentQuestionBookmark';

export type MistakeStatus = 'active' | 'mastered';

export interface IStudentMistake extends Document {
    userId: mongoose.Types.ObjectId;
    sourceType: LearningQuestionSource;
    sourceQuestionId: mongoose.Types.ObjectId;
    questionText: string;
    options: string[];
    correctAnswer: number;
    lastStudentAnswer: number;
    category: string;
    difficulty?: QuestionDifficulty;
    marks: number;
    incorrectAttempts: number;
    correctStreak: number;
    status: MistakeStatus;
    lastAttemptAt: Date;
    masteredAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const StudentMistakeSchema = new Schema<IStudentMistake>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        sourceType: { type: String, enum: ['mcq', 'teacher_question'], required: true },
        sourceQuestionId: { type: Schema.Types.ObjectId, required: true, index: true },
        questionText: { type: String, required: true, trim: true },
        options: {
            type: [String],
            required: true,
            validate: {
                validator: (value: string[]) => value.length === 4,
                message: 'Mistake-book question must have exactly 4 options',
            },
        },
        correctAnswer: { type: Number, required: true, min: 0, max: 3 },
        lastStudentAnswer: { type: Number, default: -1 },
        category: { type: String, required: true, trim: true, index: true },
        difficulty: { type: String, enum: [...QUESTION_DIFFICULTIES], default: DEFAULT_QUESTION_DIFFICULTY, index: true },
        marks: { type: Number, default: 1, min: 1 },
        incorrectAttempts: { type: Number, default: 0, min: 0 },
        correctStreak: { type: Number, default: 0, min: 0 },
        status: { type: String, enum: ['active', 'mastered'], default: 'active', index: true },
        lastAttemptAt: { type: Date, default: Date.now, index: true },
        masteredAt: { type: Date },
    },
    { timestamps: true }
);

StudentMistakeSchema.index({ userId: 1, sourceType: 1, sourceQuestionId: 1 }, { unique: true });
StudentMistakeSchema.index({ userId: 1, status: 1, category: 1, difficulty: 1, lastAttemptAt: -1 });

export const StudentMistake = mongoose.model<IStudentMistake>('StudentMistake', StudentMistakeSchema);
