export type AdminSubRole = 'super_admin' | 'admin' | 'content_manager';
export type UserRole = AdminSubRole | 'user' | 'teacher';

export interface UserModules {
    practiceModule: boolean;
    teacherAssessments: boolean;
}

export interface User {
    id: string;
    username: string;
    email?: string;
    fullName?: string;
    role: 'super_admin' | 'admin' | 'content_manager' | 'user' | 'teacher';
    mustChangePassword?: boolean;
    testCategory?: string | { _id: string; name: string };
    credits?: number;
    modules?: UserModules;
    emailVerified?: boolean;
}

export interface TestCategory {
    _id: string;
    name: string;
    defaultCredits: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
}


export interface MCQ {
    _id: string;
    questionText: string;
    options: string[];
    correctAnswer?: number;
    category?: string;
    difficulty?: 'Easy' | 'Medium' | 'Hard';
    createdBy?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface Quiz {
    _id: string;
    title: string;
    description?: string;
    mcqIds: string[] | MCQ[];
    numberOfQuestions: number;
    duration: number;
    passingMarks: number;
    marksPerQuestion: number;
    isActive: boolean;
    createdBy?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface Result {
    _id: string;
    userId: string | User;
    quizId: string | Quiz;
    answers: number[];
    score: number;
    totalMarks: number;
    passed: boolean;
    timeTaken: number;
    submittedAt: string;
}

export interface AuthResponse {
    token: string;
    user: User;
}

export interface QuizStartResponse {
    quiz: {
        id: string;
        title: string;
        description?: string;
        duration: number;
        numberOfQuestions: number;
        marksPerQuestion: number;
        totalMarks: number;
    };
    mcqs: Array<{
        _id: string;
        questionText: string;
        options: string[];
    }>;
    startTime: string;
}

export interface QuizSubmitResponse {
    message: string;
    result: {
        id: string;
        score: number;
        totalMarks: number;
        passed: boolean;
        timeTaken: number;
        submittedAt: string;
    };
}
