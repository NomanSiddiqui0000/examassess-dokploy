import mongoose, { Document, Schema } from 'mongoose';
import { DEFAULT_QUESTION_DIFFICULTY, QUESTION_DIFFICULTIES, QuestionDifficulty } from '../constants/questionDifficulty';

export type LearningQuestionSource = 'mcq' | 'teacher_question';

export interface IStudentQuestionBookmark extends Document {
    userId: mongoose.Types.ObjectId;
    sourceType: LearningQuestionSource;
    sourceQuestionId: mongoose.Types.ObjectId;
    questionText: string;
    options: string[];
    correctAnswer: number;
    category: string;
    difficulty?: QuestionDifficulty;
    marks: number;
    createdAt: Date;
    updatedAt: Date;
}

const StudentQuestionBookmarkSchema = new Schema<IStudentQuestionBookmark>(
    {
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        sourceType: { type: String, enum: ['mcq', 'teacher_question'], required: true },
        sourceQuestionId: { type: Schema.Types.ObjectId, required: true, index: true },
        questionText: { type: String, required: true, trim: true },
        options: {
            type: [String],
            required: true,
            validate: {
                validator: (value: string[]) => value.length === 4,
                message: 'Bookmarked question must have exactly 4 options',
            },
        },
        correctAnswer: { type: Number, required: true, min: 0, max: 3 },
        category: { type: String, required: true, trim: true, index: true },
        difficulty: { type: String, enum: [...QUESTION_DIFFICULTIES], default: DEFAULT_QUESTION_DIFFICULTY, index: true },
        marks: { type: Number, default: 1, min: 1 },
    },
    { timestamps: true }
);

StudentQuestionBookmarkSchema.index({ userId: 1, sourceType: 1, sourceQuestionId: 1 }, { unique: true });
StudentQuestionBookmarkSchema.index({ userId: 1, category: 1, difficulty: 1, createdAt: -1 });

export const StudentQuestionBookmark = mongoose.model<IStudentQuestionBookmark>('StudentQuestionBookmark', StudentQuestionBookmarkSchema);
