import mongoose, { Document, Schema } from 'mongoose';

export type ClassroomStudentStatus = 'invited' | 'active' | 'removed';

export interface IClassroomStudent extends Document {
    classroomId: mongoose.Types.ObjectId;
    teacherId: mongoose.Types.ObjectId;
    studentId: mongoose.Types.ObjectId;
    invitedEmail: string;
    invitedName?: string;
    status: ClassroomStudentStatus;
    invitedAt: Date;
    joinedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ClassroomStudentSchema = new Schema<IClassroomStudent>(
    {
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
        invitedEmail: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
        },
        invitedName: {
            type: String,
            trim: true,
        },
        status: {
            type: String,
            enum: ['invited', 'active', 'removed'],
            default: 'invited',
            index: true,
        },
        invitedAt: {
            type: Date,
            default: Date.now,
        },
        joinedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

ClassroomStudentSchema.index({ classroomId: 1, studentId: 1 }, { unique: true });
ClassroomStudentSchema.index({ teacherId: 1, invitedEmail: 1 });

export const ClassroomStudent = mongoose.model<IClassroomStudent>('ClassroomStudent', ClassroomStudentSchema);
