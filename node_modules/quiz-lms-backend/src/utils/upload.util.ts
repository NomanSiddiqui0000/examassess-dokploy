import * as XLSX from 'xlsx';
import { QuestionDifficulty, normalizeQuestionDifficulty, QUESTION_DIFFICULTY_MESSAGE } from '../constants/questionDifficulty';

export interface ParsedMCQ {
    questionText: string;
    options: string[];
    correctAnswer: number;
    difficulty?: QuestionDifficulty;
    typeName?: string;
}

export interface ParseResult {
    success: boolean;
    mcqs: ParsedMCQ[];
    errors: string[];
}

/**
 * Canonical header keys (lowercase, no spaces) → friendly label used in the template.
 * We match incoming headers by stripping spaces and lowercasing so that
 * "Question  Text", "QUESTION TEXT", "question_text" all resolve correctly.
 */
const HEADER_MAP: Record<string, string> = {
    questiontext: 'Question Text',
    optiona: 'Option A',
    optionb: 'Option B',
    optionc: 'Option C',
    optiond: 'Option D',
    correctanswer: 'Correct Answer',
    categorytopic: 'Category/Topic',
    difficultylevel: 'Difficulty Level',
    type: 'MCQ Type',
    mcqtype: 'MCQ Type',
};

/** Normalize a header string for comparison: trim, lowercase, strip non-alphanumerics */
const normalizeHeader = (h: string): string =>
    String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, '');

/** Check if every value in a row object is empty / whitespace */
const isEmptyRow = (row: Record<string, any>): boolean =>
    Object.values(row).every(
        (v) => v === undefined || v === null || String(v).trim() === ''
    );

export const parseExcelFile = (buffer: Buffer): ParseResult => {
    const errors: string[] = [];
    const mcqs: ParsedMCQ[] = [];

    try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        // raw: true keeps original header strings so we can normalize them ourselves
        const rawData: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rawData.length === 0) {
            errors.push('File is empty');
            return { success: false, mcqs: [], errors };
        }

        // Build a mapping from the actual column headers in the file to canonical keys
        const sampleRow = rawData[0];
        const colMap: Record<string, string> = {}; // canonical -> actual header
        for (const actualHeader of Object.keys(sampleRow)) {
            const norm = normalizeHeader(actualHeader);
            if (HEADER_MAP[norm]) {
                colMap[HEADER_MAP[norm]] = actualHeader;
            }
        }

        // Helper to read a value by canonical name
        const getValue = (row: any, canonical: string): string => {
            const key = colMap[canonical];
            if (!key) return '';
            return String(row[key] ?? '').trim();
        };

        rawData.forEach((row: any, index: number) => {
            const rowNum = index + 2; // +2 because Excel is 1-indexed and has header row

            // Skip entirely empty rows (common at the bottom of spreadsheets)
            if (isEmptyRow(row)) return;

            const questionText = getValue(row, 'Question Text');
            const optA = getValue(row, 'Option A');
            const optB = getValue(row, 'Option B');
            const optC = getValue(row, 'Option C');
            const optD = getValue(row, 'Option D');
            const correctAnswerRaw = getValue(row, 'Correct Answer');

            // Validate required fields
            if (!questionText) {
                errors.push(`Row ${rowNum}: Missing question text`);
                return;
            }

            if (!optA || !optB || !optC || !optD) {
                errors.push(`Row ${rowNum}: Missing one or more options`);
                return;
            }

            if (!correctAnswerRaw) {
                errors.push(`Row ${rowNum}: Missing correct answer`);
                return;
            }

            // Resolve correct answer: accept A/B/C/D letters OR exact option text
            const letterMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
            const upperAnswer = correctAnswerRaw.toUpperCase();
            let correctAnswer: number | undefined;

            if (['A', 'B', 'C', 'D'].includes(upperAnswer)) {
                correctAnswer = letterMap[upperAnswer];
            } else {
                // Try matching by exact option text (case-insensitive)
                const options = [optA, optB, optC, optD];
                const matchIdx = options.findIndex(
                    (o) => o.toLowerCase() === correctAnswerRaw.toLowerCase()
                );
                if (matchIdx !== -1) {
                    correctAnswer = matchIdx;
                }
            }

            if (correctAnswer === undefined) {
                errors.push(
                    `Row ${rowNum}: Correct answer must be A, B, C, D or match one of the option texts`
                );
                return;
            }

            // Validate difficulty if provided
            const diffRaw = getValue(row, 'Difficulty Level');
            let difficulty: QuestionDifficulty | undefined;
            if (diffRaw) {
                difficulty = normalizeQuestionDifficulty(diffRaw) || undefined;
                if (!difficulty) {
                    errors.push(`Row ${rowNum}: ${QUESTION_DIFFICULTY_MESSAGE}`);
                    return;
                }
            }

            // Extract optional type name
            const typeName = getValue(row, 'MCQ Type') || undefined;

            mcqs.push({
                questionText,
                options: [optA, optB, optC, optD],
                correctAnswer,
                difficulty,
                typeName,
            });
        });

        return {
            success: errors.length === 0,
            mcqs,
            errors,
        };
    } catch (error) {
        errors.push('Failed to parse file: ' + (error as Error).message);
        return { success: false, mcqs: [], errors };
    }
};

export const generateTemplate = (): Buffer => {
    const data = [
        {
            'Question Text': 'What is 2 + 2?',
            'Option A': '3',
            'Option B': '4',
            'Option C': '5',
            'Option D': '6',
            'Correct Answer': 'B',
            'Category/Topic': 'Mathematics',
            'Difficulty Level': 'Easy',
            'MCQ Type': 'Algebra',
        },
        {
            'Question Text': 'What is the capital of France?',
            'Option A': 'London',
            'Option B': 'Berlin',
            'Option C': 'Paris',
            'Option D': 'Madrid',
            'Correct Answer': 'C',
            'Category/Topic': 'Geography',
            'Difficulty Level': 'Easy',
            'MCQ Type': 'World Capitals',
        },
        {
            'Question Text': 'Which planet is known as the Red Planet?',
            'Option A': 'Venus',
            'Option B': 'Mars',
            'Option C': 'Jupiter',
            'Option D': 'Saturn',
            'Correct Answer': 'B',
            'Category/Topic': 'Science',
            'Difficulty Level': 'Medium',
            'MCQ Type': 'Astronomy',
        },
        {
            'Question Text': 'What does CPU stand for?',
            'Option A': 'Central Processing Unit',
            'Option B': 'Central Program Utility',
            'Option C': 'Computer Personal Unit',
            'Option D': 'Central Processor Unifier',
            'Correct Answer': 'A',
            'Category/Topic': 'Computer Science',
            'Difficulty Level': 'Hard',
            'MCQ Type': 'Hardware',
        },
    ];

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'MCQs');

    return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
