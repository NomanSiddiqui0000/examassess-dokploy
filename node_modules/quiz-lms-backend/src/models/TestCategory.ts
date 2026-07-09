import mongoose, { Document, Schema } from 'mongoose';

export interface ITestCategory extends Document {
    name: string;
    defaultCredits: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

const TestCategorySchema = new Schema<ITestCategory>(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            uppercase: true,
        },
        defaultCredits: {
            type: Number,
            required: true,
            min: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

export const TestCategory = mongoose.model<ITestCategory>('TestCategory', TestCategorySchema);
