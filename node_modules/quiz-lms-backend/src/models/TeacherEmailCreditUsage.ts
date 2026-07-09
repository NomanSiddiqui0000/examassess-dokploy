import mongoose, { Document, Schema } from 'mongoose';

export interface ITeacherEmailCreditUsage extends Document {
    teacherId: mongoose.Types.ObjectId;
    classroomId?: mongoose.Types.ObjectId;
    studentId?: mongoose.Types.ObjectId;
    email: string;
    studentName?: string;
    emailType: 'classroom_invitation';
    sentAt: Date;
    creditsConsumed: number;
    createdAt: Date;
    updatedAt: Date;
}

const TeacherEmailCreditUsageSchema = new Schema<ITeacherEmailCreditUsage>(
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
            index: true,
        },
        studentId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        studentName: {
            type: String,
            trim: true,
        },
        emailType: {
            type: String,
            enum: ['classroom_invitation'],
            default: 'classroom_invitation',
            index: true,
        },
        sentAt: {
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

TeacherEmailCreditUsageSchema.index({ teacherId: 1, sentAt: -1 });

export const TeacherEmailCreditUsage = mongoose.model<ITeacherEmailCreditUsage>('TeacherEmailCreditUsage', TeacherEmailCreditUsageSchema);
