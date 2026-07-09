import mongoose, { Document, Schema } from 'mongoose';

export type TeacherAllocationMode = 'monthly' | 'yearly' | 'lifetime' | 'custom';

export interface ITeacherResourceAccount extends Document {
    teacherId: mongoose.Types.ObjectId;
    assessmentCreditsBalance: number;
    assessmentCreditsUsed: number;
    assessmentCreditsUnlimited: boolean;
    emailCreditsBalance: number;
    emailCreditsUsed: number;
    emailCreditsUnlimited: boolean;
    maxQuestions: number;
    questionsUnlimited: boolean;
    maxClassrooms: number;
    classroomsUnlimited: boolean;
    maxStudents: number;
    studentsUnlimited: boolean;
    maxAssessments: number;
    assessmentsUnlimited: boolean;
    allocationMode: TeacherAllocationMode;
    planCode?: string;
    lastUpdatedBy?: mongoose.Types.ObjectId;
    lastResourceUpdateAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const TeacherResourceAccountSchema = new Schema<ITeacherResourceAccount>(
    {
        teacherId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },
        assessmentCreditsBalance: {
            type: Number,
            default: 0,
            min: 0,
        },
        assessmentCreditsUsed: {
            type: Number,
            default: 0,
            min: 0,
        },
        assessmentCreditsUnlimited: {
            type: Boolean,
            default: true,
            index: true,
        },
        emailCreditsBalance: {
            type: Number,
            default: 0,
            min: 0,
        },
        emailCreditsUsed: {
            type: Number,
            default: 0,
            min: 0,
        },
        emailCreditsUnlimited: {
            type: Boolean,
            default: true,
            index: true,
        },
        maxQuestions: {
            type: Number,
            default: 0,
            min: 0,
        },
        questionsUnlimited: {
            type: Boolean,
            default: true,
            index: true,
        },
        maxClassrooms: {
            type: Number,
            default: 0,
            min: 0,
        },
        classroomsUnlimited: {
            type: Boolean,
            default: true,
            index: true,
        },
        maxStudents: {
            type: Number,
            default: 0,
            min: 0,
        },
        studentsUnlimited: {
            type: Boolean,
            default: true,
            index: true,
        },
        maxAssessments: {
            type: Number,
            default: 0,
            min: 0,
        },
        assessmentsUnlimited: {
            type: Boolean,
            default: true,
            index: true,
        },
        allocationMode: {
            type: String,
            enum: ['monthly', 'yearly', 'lifetime', 'custom'],
            default: 'custom',
            index: true,
        },
        planCode: {
            type: String,
            trim: true,
        },
        lastUpdatedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        lastResourceUpdateAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

export const TeacherResourceAccount = mongoose.model<ITeacherResourceAccount>('TeacherResourceAccount', TeacherResourceAccountSchema);
