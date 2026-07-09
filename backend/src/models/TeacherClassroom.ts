import mongoose, { Document, Schema } from 'mongoose';

export type ClassroomStatus = 'active' | 'archived';

export interface ITeacherClassroom extends Document {
    teacherId: mongoose.Types.ObjectId;
    name: string;
    description?: string;
    academicSession?: string;
    status: ClassroomStatus;
    joinCode: string;
    createdAt: Date;
    updatedAt: Date;
}

const TeacherClassroomSchema = new Schema<ITeacherClassroom>(
    {
        teacherId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        academicSession: {
            type: String,
            trim: true,
        },
        status: {
            type: String,
            enum: ['active', 'archived'],
            default: 'active',
            index: true,
        },
        joinCode: {
            type: String,
            required: true,
            unique: true,
            uppercase: true,
            trim: true,
        },
    },
    { timestamps: true }
);

TeacherClassroomSchema.index({ teacherId: 1, status: 1 });

export const TeacherClassroom = mongoose.model<ITeacherClassroom>('TeacherClassroom', TeacherClassroomSchema);
