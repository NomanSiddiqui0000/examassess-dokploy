import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
    actor: mongoose.Types.ObjectId;
    actorUsername: string;
    action: string;
    targetUser?: mongoose.Types.ObjectId;
    targetUsername?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
    {
        actor: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        actorUsername: {
            type: String,
            required: true,
        },
        action: {
            type: String,
            required: true,
        },
        targetUser: {
            type: Schema.Types.ObjectId,
            ref: 'User',
        },
        targetUsername: {
            type: String,
        },
        details: {
            type: Schema.Types.Mixed,
        },
        ipAddress: {
            type: String,
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

// Index for efficient querying
AuditLogSchema.index({ actor: 1, timestamp: -1 });
AuditLogSchema.index({ timestamp: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
