import mongoose, { Document, Schema } from 'mongoose';
import { LearningQuestionSource } from './StudentQuestionBookmark';
import { DEFAULT_QUESTION_DIFFICULTY } from '../constants/questionDifficulty';

export type PracticeSource = 'bookmarks' | 'mistakes';
export type PracticeAttemptStatus = 'in_progress' | 'submitted' | 'auto_submitted';

export interface IPracticeQuestionSnapshot {
    sourceType: LearningQuestionSource;
    sourceQuestionId: mongoose.Types.ObjectId;
    questionText: string;
    options: string[];
    correctAnswer: number;
    category: string;
    difficulty?: string;
    marks: number;
}

export interface IStudentPracticeAttempt extends Document {
    userId: mongoose.Types.ObjectId;
    source: PracticeSource;
    status: PracticeAttemptStatus;
    startedAt: Date;
    allowedUntil: Date;
    submittedAt?: Date;
    durationMinutes: number;
    questions: IPracticeQuestionSnapshot[];
    answers: number[];
    score: number;
    totalMarks: number;
    percentage: number;
    passed: boolean;
    timeTaken: number;
    createdAt: Date;
    updatedAt: Date;
}

const PracticeQuestionSnapshotSchema = new Schema<IPracticeQuestionSnapshot>(
    {
        sourceType: { type: String, enum: ['mcq', 'teacher_question'], required: true },
        sourceQuestionId: { type: Schema.Types.ObjectId, required: true },
        questionText: { type: String, required: true },
        options: { type: [String], required: true },
        correctAnswer: { type: Number, required: true, min: 0, max: 3 },
        category: { type: String, required: true },
        difficulty: { type: String, default: DEFAULT_QUESTION_DIFFICULTY },
        marks: { type: Number, default: 1, min: 1 },
    },
    { _id: false }
);

const StudentPracticeAttemptSchema = new Schema<IStudentPracticeAttempt>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        source: { type: String, enum: ['bookmarks', 'mistakes'], required: true, index: true },
        status: { type: String, enum: ['in_progress', 'submitted', 'auto_submitted'], default: 'in_progress', index: true },
        startedAt: { type: Date, required: true },
        allowedUntil: { type: Date, required: true, index: true },
        submittedAt: { type: Date },
        durationMinutes: { type: Number, required: true, min: 1 },
        questions: { type: [PracticeQuestionSnapshotSchema], required: true },
        answers: { type: [Number], default: [] },
        score: { type: Number, default: 0 },
        totalMarks: { type: Number, default: 0 },
        percentage: { type: Number, default: 0 },
        passed: { type: Boolean, default: false },
        timeTaken: { type: Number, default: 0 },
    },
    { timestamps: true }
);

StudentPracticeAttemptSchema.index({ userId: 1, status: 1, createdAt: -1 });

export const StudentPracticeAttempt = mongoose.model<IStudentPracticeAttempt>('StudentPracticeAttempt', StudentPracticeAttemptSchema);
