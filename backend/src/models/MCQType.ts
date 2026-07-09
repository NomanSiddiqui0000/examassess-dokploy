import mongoose, { Document, Schema } from 'mongoose';

export interface IMCQType extends Document {
    name: string;
    categoryId: mongoose.Types.ObjectId;
    status: 'active' | 'inactive';
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}

const MCQTypeSchema = new Schema<IMCQType>(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        categoryId: {
            type: Schema.Types.ObjectId,
            ref: 'TestCategory',
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active',
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Unique type name within a category
MCQTypeSchema.index({ categoryId: 1, name: 1 }, { unique: true });

export const MCQType = mongoose.model<IMCQType>('MCQType', MCQTypeSchema);
