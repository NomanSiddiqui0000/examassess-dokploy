import mongoose, { Document, Schema } from 'mongoose';

export type QuestionSource = 'global' | 'teacher';
export type DistributionMode = 'count' | 'percentage';
export type RandomizationMode = 'strict' | 'secure' | 'practice';
export type LateJoinPolicy = 'allow' | 'block';
export type ResultPolicy = 'manual' | 'immediate';
export type TeacherAssessmentStatus = 'draft' | 'scheduled' | 'completed' | 'cancelled' | 'archived';

export interface ISubjectDistribution {
    subject: string;
    value: number;
}

export interface ITeacherAssessment extends Document {
    teacherId: mongoose.Types.ObjectId;
    classroomId: mongoose.Types.ObjectId;
    name: string;
    questionSource: QuestionSource;
    globalCategoryId?: mongoose.Types.ObjectId;
    assessmentDate: Date;
    startTime: Date;
    endTime: Date;
    durationMinutes: number;
    passingPercentage: number;
    attemptLimit: number;
    distributionMode: DistributionMode;
    subjectDistribution: ISubjectDistribution[];
    randomizationMode: RandomizationMode;
    lateJoinPolicy: LateJoinPolicy;
    resultPolicy: ResultPolicy;
    resultsReleased: boolean;
    status: TeacherAssessmentStatus;
    baseQuestionIds: mongoose.Types.ObjectId[];
    totalQuestions: number;
    remindersSent: {
        before24h: boolean;
        before1h: boolean;
        before15m: boolean;
    };
    createdAt: Date;
    updatedAt: Date;
}

const TeacherAssessmentSchema = new Schema<ITeacherAssessment>(
    {
        teacherId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        classroomId: {
            type: Schema.Types.ObjectId,
            ref: 'TeacherClassroom',
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        questionSource: {
            type: String,
            enum: ['global', 'teacher'],
            required: true,
        },
        globalCategoryId: {
            type: Schema.Types.ObjectId,
            ref: 'TestCategory',
        },
        assessmentDate: {
            type: Date,
            required: true,
        },
        startTime: {
            type: Date,
            required: true,
            index: true,
        },
        endTime: {
            type: Date,
            required: true,
            index: true,
        },
        durationMinutes: {
            type: Number,
            required: true,
            min: 1,
        },
        passingPercentage: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },
        attemptLimit: {
            type: Number,
            default: 1,
            min: 1,
        },
        distributionMode: {
            type: String,
            enum: ['count', 'percentage'],
            required: true,
        },
        subjectDistribution: [
            {
                subject: { type: String, required: true, trim: true },
                value: { type: Number, required: true, min: 0 },
            },
        ],
        randomizationMode: {
            type: String,
            enum: ['strict', 'secure', 'practice'],
            default: 'secure',
        },
        lateJoinPolicy: {
            type: String,
            enum: ['allow', 'block'],
            default: 'allow',
        },
        resultPolicy: {
            type: String,
            enum: ['manual', 'immediate'],
            default: 'manual',
        },
        resultsReleased: {
            type: Boolean,
            default: false,
            index: true,
        },
        status: {
            type: String,
            enum: ['draft', 'scheduled', 'completed', 'cancelled', 'archived'],
            default: 'scheduled',
            index: true,
        },
        baseQuestionIds: {
            type: [Schema.Types.ObjectId],
            default: [],
        },
        totalQuestions: {
            type: Number,
            required: true,
            min: 1,
        },
        remindersSent: {
            before24h: { type: Boolean, default: false },
            before1h: { type: Boolean, default: false },
            before15m: { type: Boolean, default: false },
        },
    },
    { timestamps: true }
);

TeacherAssessmentSchema.index({ teacherId: 1, classroomId: 1, startTime: -1 });
TeacherAssessmentSchema.index({ status: 1, startTime: 1 });

export const TeacherAssessment = mongoose.model<ITeacherAssessment>('TeacherAssessment', TeacherAssessmentSchema);
