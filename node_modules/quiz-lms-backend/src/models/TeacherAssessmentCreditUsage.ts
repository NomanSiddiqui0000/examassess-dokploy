import mongoose, { Document, Schema } from 'mongoose';

export interface ITeacherAssessmentCreditUsage extends Document {
    teacherId: mongoose.Types.ObjectId;
    assessmentId: mongoose.Types.ObjectId;
    classroomId: mongoose.Types.ObjectId;
    studentId: mongoose.Types.ObjectId;
    attemptId: mongoose.Types.ObjectId;
    assessmentName: string;
    studentName?: string;
    studentEmail?: string;
    submittedAt: Date;
    creditsConsumed: number;
    createdAt: Date;
    updatedAt: Date;
}

const TeacherAssessmentCreditUsageSchema = new Schema<ITeacherAssessmentCreditUsage>(
    {
        teacherId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
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
        studentId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        attemptId: {
            type: Schema.Types.ObjectId,
            ref: 'AssessmentAttempt',
            required: true,
            unique: true,
            index: true,
        },
        assessmentName: {
            type: String,
            required: true,
            trim: true,
        },
        studentName: {
            type: String,
            trim: true,
        },
        studentEmail: {
            type: String,
            trim: true,
            lowercase: true,
        },
        submittedAt: {
            type: Date,
            required: true,
            index: true,
        },
        creditsConsumed: {
            type: Number,
            default: 1,
            min: 1,
        },
    },
    { timestamps: true }
);

TeacherAssessmentCreditUsageSchema.index({ teacherId: 1, submittedAt: -1 });
TeacherAssessmentCreditUsageSchema.index({ teacherId: 1, assessmentId: 1, studentId: 1 });

export const TeacherAssessmentCreditUsage = mongoose.model<ITeacherAssessmentCreditUsage>('TeacherAssessmentCreditUsage', TeacherAssessmentCreditUsageSchema);
