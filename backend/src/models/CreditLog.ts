import mongoose, { Document, Schema } from 'mongoose';

export type CreditAction = 'initial_assignment' | 'admin_recharge' | 'quiz_deduction';

export interface ICreditLog extends Document {
    userId: mongoose.Types.ObjectId;
    action: CreditAction;
    amount: number;
    balanceAfter: number;
    performedBy: mongoose.Types.ObjectId;
    reason?: string;
    quizId?: mongoose.Types.ObjectId;
    timestamp: Date;
}

const CreditLogSchema = new Schema<ICreditLog>(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        action: {
            type: String,
            enum: ['initial_assignment', 'admin_recharge', 'quiz_deduction'],
            required: true,
        },
        amount: {
            type: Number,
            required: true,
        },
        balanceAfter: {
            type: Number,
            required: true,
        },
        performedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        reason: {
            type: String,
            trim: true,
        },
        quizId: {
            type: Schema.Types.ObjectId,
            ref: 'Quiz',
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: false,
    }
);

CreditLogSchema.index({ userId: 1, timestamp: -1 });
CreditLogSchema.index({ timestamp: -1 });

export const CreditLog = mongoose.model<ICreditLog>('CreditLog', CreditLogSchema);
