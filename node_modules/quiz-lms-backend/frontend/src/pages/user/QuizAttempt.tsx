import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../../utils/api';

interface MCQ {
    _id: string;
    questionText: string;
    options: string[];
}

interface QuizInfo {
    id: string;
    title: string;
    description?: string;
    duration: number;
    numberOfQuestions: number;
    marksPerQuestion: number;
    totalMarks: number;
    allowedUntil?: string;
    serverTime?: string;
}

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

// ─── Error Code → User-Friendly Message Mapping ──────────────────────────────
type ErrorIconName = 'search' | 'pause' | 'lock' | 'block' | 'card' | 'clipboard' | 'settings' | 'warning';

const ErrorIcon = ({ name }: { name: ErrorIconName }) => {
    const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    if (name === 'search') return <svg viewBox="0 0 24 24" {...common}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>;
    if (name === 'pause') return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="10" /><path d="M10 8v8" /><path d="M14 8v8" /></svg>;
    if (name === 'lock') return <svg viewBox="0 0 24 24" {...common}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>;
    if (name === 'block') return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="10" /><path d="m5 5 14 14" /></svg>;
    if (name === 'card') return <svg viewBox="0 0 24 24" {...common}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /><path d="M7 15h4" /></svg>;
    if (name === 'clipboard') return <svg viewBox="0 0 24 24" {...common}><rect x="8" y="3" width="8" height="4" rx="1" /><path d="M16 5h2a2 2 0 0 1 2 2v14H4V7a2 2 0 0 1 2-2h2" /></svg>;
    if (name === 'settings') return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="3" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="m4.93 4.93 2.12 2.12" /><path d="m16.95 16.95 2.12 2.12" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="m4.93 19.07 2.12-2.12" /><path d="m16.95 7.05 2.12-2.12" /></svg>;
    return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="10" /><path d="M12 8v5" /><path d="M12 17h.01" /></svg>;
};

const ERROR_MESSAGES: Record<string, { icon: ErrorIconName; title: string; message: string }> = {
    QUIZ_NOT_FOUND: {
        icon: 'search',
        title: 'Quiz Not Found',
        message: 'This quiz could not be found. It may have been removed or is no longer available.',
    },
    QUIZ_NOT_ACTIVE: {
        icon: 'pause',
        title: 'Quiz Unavailable',
        message: 'This quiz is currently unavailable. Please try again later or contact the administrator.',
    },
    QUIZ_ACCESS_DENIED: {
        icon: 'lock',
        title: 'Access Denied',
        message: 'You do not have permission to access this quiz.',
    },
    QUIZ_ATTEMPT_LIMIT_REACHED: {
        icon: 'block',
        title: 'Attempt Limit Reached',
        message: 'You have reached the maximum number of attempts for this quiz.',
    },
    NO_CREDITS_REMAINING: {
        icon: 'card',
        title: 'No Attempts Remaining',
        message: 'You have no remaining attempts. Please contact the administrator to get more credits.',
    },
    MCQ_POOL_INSUFFICIENT: {
        icon: 'clipboard',
        title: 'Insufficient Questions',
        message: 'Not enough questions are available to generate this quiz. Please contact the administrator.',
    },
    QUIZ_CONFIGURATION_INVALID: {
        icon: 'settings',
        title: 'Configuration Issue',
        message: 'This quiz configuration is invalid. Please contact the administrator.',
    },
    UNKNOWN_SERVER_ERROR: {
        icon: 'warning',
        title: 'Unable to Start Quiz',
        message: 'Something went wrong while starting the quiz. Please try again later or contact the administrator if the issue persists.',
    },
};

const DEFAULT_ERROR = {
    icon: 'warning' as ErrorIconName,
    title: 'Unable to Start Quiz',
    message: 'We couldn\'t start the quiz right now. Please try again later or contact the administrator if the issue persists.',
};

function getErrorInfo(errorCode?: string, fallbackMessage?: string) {
    if (errorCode && ERROR_MESSAGES[errorCode]) {
        return ERROR_MESSAGES[errorCode];
    }
    if (fallbackMessage) {
        return { ...DEFAULT_ERROR, message: fallbackMessage };
    }
    return DEFAULT_ERROR;
}

const QuizAttempt: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const quizType = searchParams.get('type') || 'manual';
    const practiceSource = searchParams.get('source') === 'mistakes' ? 'mistakes' : 'bookmarks';
    const practiceMinutes = Math.max(1, Number(searchParams.get('minutes') || 15));
    const navigate = useNavigate();
    const [quiz, setQuiz] = useState<QuizInfo | null>(null);
    const [mcqs, setMcqs] = useState<MCQ[]>([]);
    const [mcqIds, setMcqIds] = useState<string[]>([]);
    const [correctAnswerMap, setCorrectAnswerMap] = useState<any[]>([]);
    const [answers, setAnswers] = useState<(number | null)[]>([]);
    const [currentQ, setCurrentQ] = useState(0);
    const [timeLeft, setTimeLeft] = useState(0);
    const [startTime, setStartTime] = useState<Date | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const submittedRef = useRef(false);
    const startedRef = useRef(false);
    const serverOffsetRef = useRef(0);
    const quizRef = useRef<QuizInfo | null>(null);
    const answersRef = useRef<(number | null)[]>([]);
    const mcqIdsRef = useRef<string[]>([]);
    const correctAnswerMapRef = useRef<any[]>([]);
    const startTimeRef = useRef<Date | null>(null);

    useEffect(() => { quizRef.current = quiz; }, [quiz]);
    useEffect(() => { answersRef.current = answers; }, [answers]);
    useEffect(() => { mcqIdsRef.current = mcqIds; }, [mcqIds]);
    useEffect(() => { correctAnswerMapRef.current = correctAnswerMap; }, [correctAnswerMap]);
    useEffect(() => { startTimeRef.current = startTime; }, [startTime]);

    // ─── Copy Prevention (quiz attempt page only) ─────────────────────────────
    useEffect(() => {
        const preventContextMenu = (e: MouseEvent) => e.preventDefault();
        const preventKeyboard = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase();
            if (e.ctrlKey && (key === 'c' || key === 'a' || key === 'x' || key === 'u')) {
                e.preventDefault();
            }
        };
        document.addEventListener('contextmenu', preventContextMenu);
        document.addEventListener('keydown', preventKeyboard);
        return () => {
            document.removeEventListener('contextmenu', preventContextMenu);
            document.removeEventListener('keydown', preventKeyboard);
        };
    }, []);

    useEffect(() => {
        // Guard against React StrictMode double-mount firing this twice
        if (startedRef.current) return;
        startedRef.current = true;

        const startUrl = quizType === 'assessment'
            ? `/user/classroom-assessments/${id}/start`
            : quizType === 'category'
            ? `/user/category-quiz/${id}/start`
            : quizType === 'personal'
            ? '/user/personal-practice/start'
            : `/user/quizzes/${id}/start`;

        const startBody = quizType === 'personal' ? { source: practiceSource, durationMinutes: practiceMinutes } : undefined;

        api.post(startUrl, startBody)
            .then(res => {
                setQuiz(res.data.quiz);
                setMcqs(res.data.mcqs);
                setMcqIds(res.data.mcqIds || []);
                if (res.data.correctAnswerMap) {
                    setCorrectAnswerMap(res.data.correctAnswerMap);
                }
                setAnswers(new Array(res.data.mcqs.length).fill(null));
                const serverNow = res.data.serverTime ? new Date(res.data.serverTime).getTime() : Date.now();
                serverOffsetRef.current = serverNow - Date.now();
                const allowedUntil = res.data.quiz.allowedUntil ? new Date(res.data.quiz.allowedUntil).getTime() : null;
                setTimeLeft(allowedUntil ? Math.max(0, Math.ceil((allowedUntil - serverNow) / 1000)) : res.data.quiz.duration * 60);
                setStartTime(new Date(res.data.startTime));
            })
            .catch(err => {
                const data = err.response?.data;
                const info = getErrorInfo(data?.errorCode, data?.message);
                setError(JSON.stringify(info));
            })
            .finally(() => setLoading(false));
    }, [id, quizType, practiceSource, practiceMinutes]);

    const handleSubmit = async () => {
        if (submittedRef.current) return;
        submittedRef.current = true;
        if (timerRef.current) clearInterval(timerRef.current);
        setSubmitting(true);
        try {
            const currentQuiz = quizRef.current;
            const submitUrl = quizType === 'assessment'
                ? `/user/classroom-assessments/${id}/submit`
                : quizType === 'category'
                ? `/user/category-quiz/${id}/submit`
                : quizType === 'personal'
                ? `/user/personal-practice/${currentQuiz?.id}/submit`
                : `/user/quizzes/${id}/submit`;

            const body: any = {
                answers: answersRef.current.map(a => a ?? -1),
                startTime: startTimeRef.current,
                mcqIds: mcqIdsRef.current,
            };
            if (correctAnswerMapRef.current.length > 0) {
                body.correctAnswerMap = correctAnswerMapRef.current;
            }

            const res = await api.post(submitUrl, body);
            navigate('/user/result', { state: { result: res.data.result, quizTitle: currentQuiz?.title } });
        } catch (err: any) {
            setError(err.response?.data?.message || 'Submission failed');
            submittedRef.current = false;
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => {
        if (!quiz) return;
        const fallbackDeadline = Date.now() + serverOffsetRef.current + Number(quiz.duration || 0) * 60000;
        const deadline = quiz.allowedUntil ? new Date(quiz.allowedUntil).getTime() : fallbackDeadline;
        const tick = () => {
            const serverNow = Date.now() + serverOffsetRef.current;
            const next = Math.max(0, Math.ceil((deadline - serverNow) / 1000));
            setTimeLeft(next);
            if (next <= 0 && !submittedRef.current) {
                if (timerRef.current) clearInterval(timerRef.current);
                handleSubmit();
            }
        };
        tick();
        timerRef.current = setInterval(tick, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [quiz?.allowedUntil, quiz?.duration]);

    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    };

    const answered = answers.filter(a => a !== null).length;
    const progress = mcqs.length > 0 ? (answered / mcqs.length) * 100 : 0;
    const isWarning = timeLeft <= 60 && timeLeft > 0;

    if (loading) return (
        <div className="loading-overlay" style={{ minHeight: '100vh' }}>
            <div className="loading-spinner" />
            Starting quiz...
        </div>
    );

    if (error) {
        let errorInfo = DEFAULT_ERROR;
        try {
            errorInfo = JSON.parse(error);
        } catch { /* use default */ }

        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--color-bg)' }}>
                <div className="card" style={{ maxWidth: 520, width: '100%', textAlign: 'center', overflow: 'hidden' }}>
                    {/* Accent top bar */}
                    <div style={{ height: 4, background: 'linear-gradient(90deg, var(--color-primary), var(--color-accent))' }} />
                    <div className="card-body" style={{ padding: '40px 32px' }}>
                        <div className="quiz-attempt-error-icon" aria-hidden="true">
                            <ErrorIcon name={errorInfo.icon} />
                        </div>
                        <h2 style={{ marginBottom: 10, fontSize: '1.4rem', color: 'var(--color-text-primary)' }}>
                            {errorInfo.title}
                        </h2>
                        {quiz?.title && (
                            <div style={{ fontWeight: 600, color: 'var(--color-primary)', marginBottom: 12, fontSize: '1.1rem' }}>
                                {quiz.title}
                            </div>
                        )}
                        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 32, lineHeight: 1.6, fontSize: '0.95rem' }}>
                            {errorInfo.message}
                        </p>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <button
                                className="btn btn-primary"
                                style={{ width: '100%', padding: '12px 24px', fontSize: '0.95rem' }}
                                onClick={() => window.location.reload()}
                            >
                                Retry Assessment
                            </button>
                            <button
                                className="btn btn-secondary"
                                style={{ width: '100%', padding: '12px 24px', fontSize: '0.95rem' }}
                                onClick={() => navigate('/user/dashboard')}
                            >
                                Back to Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!quiz || mcqs.length === 0) return null;

    const currentMCQ = mcqs[currentQ];

    return (
        <div className="quiz-attempt-page">
            {/* Header */}
            <div className="quiz-attempt-header">
                <div>
                    <div className="quiz-attempt-title">{quiz.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                        {answered} of {mcqs.length} answered
                    </div>
                </div>
                <div className={`quiz-timer ${isWarning ? 'warning' : ''}`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    {formatTime(timeLeft)}
                </div>
            </div>

            {/* Progress bar */}
            <div style={{ background: 'var(--color-primary-dark)', height: 4 }}>
                <div style={{ height: '100%', background: 'var(--color-accent)', width: `${progress}%`, transition: 'width 0.3s ease' }} />
            </div>

            {/* Body */}
            <div className="quiz-attempt-body">
                {/* Question panel */}
                <div className="quiz-question-panel">
                    <div className="quiz-question-card">
                        <div className="quiz-question-num">
                            Question {currentQ + 1} of {mcqs.length}
                        </div>
                        <div className="quiz-question-text">{currentMCQ.questionText}</div>
                        <div className="quiz-options">
                            {currentMCQ.options.map((opt, idx) => (
                                <div
                                    key={idx}
                                    className={`quiz-option ${answers[currentQ] === idx ? 'selected' : ''}`}
                                    onClick={() => {
                                        const newAnswers = [...answers];
                                        newAnswers[currentQ] = idx;
                                        setAnswers(newAnswers);
                                    }}
                                >
                                    <div className="quiz-option-letter">{OPTION_LETTERS[idx]}</div>
                                    <div className="quiz-option-text">{opt}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Navigation */}
                    <div className="quiz-nav-buttons">
                        <button
                            className="btn btn-secondary"
                            onClick={() => setCurrentQ(q => Math.max(0, q - 1))}
                            disabled={currentQ === 0}
                        >
                            Previous
                        </button>
                        <div className="flex gap-2">
                            {currentQ < mcqs.length - 1 ? (
                                <button
                                    className="btn btn-primary"
                                    onClick={() => setCurrentQ(q => Math.min(mcqs.length - 1, q + 1))}
                                >
                                    Next
                                </button>
                            ) : (
                                <button
                                    id="submit-quiz-btn"
                                    className="btn btn-accent"
                                    onClick={() => {
                                        const unanswered = answers.filter(a => a === null).length;
                                        if (unanswered > 0 && !confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
                                        handleSubmit();
                                    }}
                                    disabled={submitting}
                                >
                                    {submitting ? 'Submitting...' : 'Submit Quiz'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="quiz-sidebar">
                    <div className="quiz-sidebar-card">
                        <div className="quiz-sidebar-title">Question Navigator</div>
                        <div className="quiz-question-grid">
                            {mcqs.map((_, idx) => (
                                <button
                                    key={idx}
                                    className={`quiz-q-btn ${answers[idx] !== null ? 'answered' : ''} ${idx === currentQ ? 'current' : ''}`}
                                    onClick={() => setCurrentQ(idx)}
                                >
                                    {idx + 1}
                                </button>
                            ))}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div className="flex gap-2 items-center">
                                <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--color-accent)' }} />
                                Answered ({answered})
                            </div>
                            <div className="flex gap-2 items-center">
                                <div style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--color-surface-2)', border: '1.5px solid var(--color-border)' }} />
                                Not answered ({mcqs.length - answered})
                            </div>
                        </div>
                        <button
                            className="btn btn-accent btn-full"
                            style={{ marginTop: 16 }}
                            onClick={() => {
                                const unanswered = answers.filter(a => a === null).length;
                                if (unanswered > 0 && !confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) return;
                                handleSubmit();
                            }}
                            disabled={submitting}
                        >
                            {submitting ? 'Submitting...' : 'Submit Quiz'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuizAttempt;
