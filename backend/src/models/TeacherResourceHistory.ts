import mongoose, { Document, Schema } from 'mongoose';

export type TeacherResourceType =
    | 'assessment_credits'
    | 'email_credits'
    | 'question_limit'
    | 'classroom_limit'
    | 'student_limit'
    | 'assessment_limit';

export type TeacherResourceAction =
    | 'add'
    | 'deduct'
    | 'reset'
    | 'set_unlimited'
    | 'set_limited'
    | 'increase_limit'
    | 'decrease_limit'
    | 'consume';

export interface ITeacherResourceHistory extends Document {
    teacherId: mongoose.Types.ObjectId;
    resourceType: TeacherResourceType;
    action: TeacherResourceAction;
    previousValue: string;
    newValue: string;
    reason?: string;
    updatedBy?: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const TeacherResourceHistorySchema = new Schema<ITeacherResourceHistory>(
    {
        teacherId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        resourceType: {
            type: String,
            enum: ['assessment_credits', 'email_credits', 'question_limit', 'classroom_limit', 'student_limit', 'assessment_limit'],
            required: true,
            index: true,
        },
        action: {
            type: String,
            enum: ['add', 'deduct', 'reset', 'set_unlimited', 'set_limited', 'increase_limit', 'decrease_limit', 'consume'],
            required: true,
            index: true,
        },
        previousValue: {
            type: String,
            required: true,
        },
        newValue: {
            type: String,
            required: true,
        },
        reason: {
            type: String,
            trim: true,
        },
        updatedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            index: true,
        },
    },
    { timestamps: true }
);

TeacherResourceHistorySchema.index({ teacherId: 1, createdAt: -1 });

export const TeacherResourceHistory = mongoose.model<ITeacherResourceHistory>('TeacherResourceHistory', TeacherResourceHistorySchema);
