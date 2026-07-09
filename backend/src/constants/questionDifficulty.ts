export const QUESTION_DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;

export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export const DEFAULT_QUESTION_DIFFICULTY: QuestionDifficulty = 'Medium';

export const QUESTION_DIFFICULTY_MESSAGE = 'Difficulty must be Easy, Medium, or Hard';

export function normalizeQuestionDifficulty(value: unknown): QuestionDifficulty | null {
    const normalized = String(value ?? '').trim().toLowerCase();
    return QUESTION_DIFFICULTIES.find((difficulty) => difficulty.toLowerCase() === normalized) || null;
}
