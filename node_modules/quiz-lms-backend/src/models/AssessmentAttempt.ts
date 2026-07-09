import mongoose, { Document, Schema } from 'mongoose';
import { DEFAULT_QUESTION_DIFFICULTY } from '../constants/questionDifficulty';

export type AssessmentAttemptStatus = 'started' | 'in_progress' | 'submitted' | 'auto_submitted';

export interface IAssessmentQuestionSnapshot {
    sourceQuestionId: mongoose.Types.ObjectId;
    questionText: string;
    options: string[];
    correctAnswer: number;
    subject: string;
    difficulty?: string;
    marks: number;
    optionOrder: number[];
}

export interface IAssessmentAttempt extends Document {
    assessmentId: mongoose.Types.ObjectId;
    classroomId: mongoose.Types.ObjectId;
    teacherId: mongoose.Types.ObjectId;
    studentId: mongoose.Types.ObjectId;
    attemptNumber: number;
    status: AssessmentAttemptStatus;
    startedAt: Date;
    allowedUntil: Date;
    submittedAt?: Date;
    answers: number[];
    questions: IAssessmentQuestionSnapshot[];
    score: number;
    totalMarks: number;
    percentage: number;
    passed: boolean;
    timeTaken: number;
    learningRecordedAt?: Date;
    teacherCreditChargedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const AssessmentQuestionSnapshotSchema = new Schema<IAssessmentQuestionSnapshot>(
    {
        sourceQuestionId: {
            type: Schema.Types.ObjectId,
            required: true,
        },
        questionText: {
            type: String,
            required: true,
        },
        options: {
            type: [String],
            required: true,
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
        },
        difficulty: {
            type: String,
            default: DEFAULT_QUESTION_DIFFICULTY,
        },
        marks: {
            type: Number,
            required: true,
            min: 1,
        },
        optionOrder: {
            type: [Number],
            required: true,
        },
    },
    { _id: false }
);

const AssessmentAttemptSchema = new Schema<IAssessmentAttempt>(
    {
        assessmentId: {
            type: Schema.Types.ObjectId,
            ref: 'TeacherAssessment',
            required: true,
            index: true,
        },
        classroomId: {
            type: Schema.Types.ObjectId,
            ref: 'TeacherClassroom',
            required: true,
            index: true,
        },
        teacherId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        studentId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        attemptNumber: {
            type: Number,
            required: true,
            min: 1,
        },
        status: {
            type: String,
            enum: ['started', 'in_progress', 'submitted', 'auto_submitted'],
            default: 'started',
            index: true,
        },
        startedAt: {
            type: Date,
            required: true,
        },
        allowedUntil: {
            type: Date,
            required: true,
            index: true,
        },
        submittedAt: {
            type: Date,
        },
        answers: {
            type: [Number],
            default: [],
        },
        questions: {
            type: [AssessmentQuestionSnapshotSchema],
            required: true,
        },
        score: {
            type: Number,
            default: 0,
        },
        totalMarks: {
            type: Number,
            default: 0,
        },
        percentage: {
            type: Number,
            default: 0,
        },
        passed: {
            type: Boolean,
            default: false,
        },
        timeTaken: {
            type: Number,
            default: 0,
        },
        learningRecordedAt: {
            type: Date,
        },
        teacherCreditChargedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

AssessmentAttemptSchema.index({ assessmentId: 1, studentId: 1, attemptNumber: 1 }, { unique: true });
AssessmentAttemptSchema.index({ assessmentId: 1, status: 1 });
AssessmentAttemptSchema.index({ studentId: 1, learningRecordedAt: 1, submittedAt: -1 });

export const AssessmentAttempt = mongoose.model<IAssessmentAttempt>('AssessmentAttempt', AssessmentAttemptSchema);
