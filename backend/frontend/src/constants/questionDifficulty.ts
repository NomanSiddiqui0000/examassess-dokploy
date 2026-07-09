export const QUESTION_DIFFICULTIES = ['Easy', 'Medium', 'Hard'] as const;

export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

export const DEFAULT_QUESTION_DIFFICULTY: QuestionDifficulty = 'Medium';
