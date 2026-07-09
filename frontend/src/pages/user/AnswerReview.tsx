import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import UserLayout from '../../components/Layout/UserLayout';
import api from '../../utils/api';
import { DEFAULT_QUESTION_DIFFICULTY } from '../../constants/questionDifficulty';
import './AnswerReview.css';

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

interface ReviewQuestion {
    sourceType: 'mcq' | 'teacher_question';
    sourceQuestionId: string;
    questionText: string;
    displayedOptions: string[];
    correctAnswerIndex: number;
    userAnswerIndex: number;
    isCorrect: boolean;
    category: string;
    difficulty?: string;
    marks?: number;
    bookmarked?: boolean;
    bookmarkId?: string | null;
}

interface ReviewData {
    resultId: string;
    score: number;
    totalMarks: number;
    passed: boolean;
    timeTaken: number;
    submittedAt: string;
    questions: ReviewQuestion[];
}

const AnswerReview: React.FC = () => {
    const { resultId } = useParams<{ resultId: string }>();
    const navigate = useNavigate();
    const [review, setReview] = useState<ReviewData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [actionError, setActionError] = useState('');
    const [bookmarkBusy, setBookmarkBusy] = useState<string | null>(null);

    useEffect(() => {
        api.get(`/user/results/${resultId}/review`)
            .then(res => setReview(res.data))
            .catch(err => setError(err.response?.data?.message || 'Failed to load review'))
            .finally(() => setLoading(false));
    }, [resultId]);

    // ─── Copy Prevention ──────────────────────────────────────────────────────
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

    const formatTime = (s: number) => `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;

    const updateQuestionBookmark = (index: number, patch: Partial<ReviewQuestion>) => {
        setReview((current) => current
            ? { ...current, questions: current.questions.map((question, idx) => idx === index ? { ...question, ...patch } : question) }
            : current
        );
    };

    const toggleBookmark = async (question: ReviewQuestion, index: number) => {
        if (!question.sourceType || !question.sourceQuestionId) {
            setActionError('This question cannot be bookmarked because its source reference is missing.');
            return;
        }
        const key = `${question.sourceType}-${question.sourceQuestionId}`;
        setBookmarkBusy(key);
        setActionError('');
        try {
            if (question.bookmarked && question.bookmarkId) {
                await api.delete(`/user/bookmarks/${question.bookmarkId}`);
                updateQuestionBookmark(index, { bookmarked: false, bookmarkId: null });
            } else {
                const res = await api.post('/user/bookmarks', {
                    sourceType: question.sourceType,
                    sourceQuestionId: question.sourceQuestionId,
                    questionText: question.questionText,
                    options: question.displayedOptions,
                    correctAnswer: question.correctAnswerIndex,
                    category: question.category,
                    difficulty: question.difficulty || DEFAULT_QUESTION_DIFFICULTY,
                    marks: question.marks || 1,
                });
                updateQuestionBookmark(index, { bookmarked: true, bookmarkId: res.data.bookmark?._id });
            }
        } catch (err: any) {
            const status = err.response?.status;
            const message = err.response?.data?.message;
            setActionError(message || (status ? `Bookmark request failed with HTTP ${status}.` : 'Bookmark request failed. Please check your connection and try again.'));
        } finally {
            setBookmarkBusy(null);
        }
    };

    if (loading) {
        return (
            <UserLayout>
                <div className="review-loading">
                    <div className="loading-spinner" />
                    Loading review...
                </div>
            </UserLayout>
        );
    }

    if (error || !review) {
        return (
            <UserLayout>
                <div className="review-error">
                    <div className="review-error-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                    </div>
                    <h2 style={{ marginBottom: 8 }}>Could Not Load Review</h2>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>
                        {error || 'Review data not available.'}
                    </p>
                    <button className="btn btn-primary" onClick={() => navigate('/user/results')}>
                        Back to Results
                    </button>
                </div>
            </UserLayout>
        );
    }

    const correctCount = review.questions.filter(q => q.isCorrect).length;
    const incorrectCount = review.questions.length - correctCount;
    const percentage = review.totalMarks > 0
        ? Math.round((review.score / review.totalMarks) * 100)
        : 0;

    return (
        <UserLayout>
            <div className="review-page">

                {/* Header */}
                <div className="review-header">
                    <div className="review-header-left">
                        <h1>Answer Review</h1>
                        <p>
                            Submitted on {new Date(review.submittedAt).toLocaleString('en-US', {
                                month: 'short', day: 'numeric', year: 'numeric',
                                hour: '2-digit', minute: '2-digit',
                            })} | {formatTime(review.timeTaken)}
                        </p>
                    </div>
                    <button className="btn btn-secondary" onClick={() => navigate('/user/results')}>
                        Back to Results
                    </button>
                </div>

                {/* Summary chips */}
                <div className="review-summary">
                    <span className={`review-summary-chip ${review.passed ? 'pass' : 'fail'}`}>
                        {review.passed ? 'PASSED' : 'FAILED'} - {percentage}%
                    </span>
                    <span className="review-summary-chip">
                        Score: {review.score} / {review.totalMarks}
                    </span>
                    <span className="review-summary-chip correct">
                        {correctCount} Correct
                    </span>
                    <span className="review-summary-chip incorrect">
                        {incorrectCount} Incorrect
                    </span>
                </div>
                {actionError && <div className="alert alert-error">{actionError}</div>}

                {/* Questions */}
                {review.questions.map((question, qIdx) => (
                    <div
                        key={qIdx}
                        className={`review-question-card ${question.isCorrect ? 'correct-card' : 'incorrect-card'}`}
                    >
                        {/* Question header */}
                        <div className="review-question-header">
                            <span className="review-question-num">
                                Q{qIdx + 1} of {review.questions.length}
                            </span>
                            <span className={`review-badge ${question.isCorrect ? 'correct' : 'incorrect'}`}>
                                {question.isCorrect ? 'Correct' : 'Incorrect'}
                            </span>
                            <button
                                className="btn btn-secondary btn-sm review-bookmark-btn"
                                onClick={() => toggleBookmark(question, qIdx)}
                                disabled={bookmarkBusy === `${question.sourceType}-${question.sourceQuestionId}` || !question.sourceType || !question.sourceQuestionId}
                            >
                                {question.bookmarked ? 'Remove Bookmark' : 'Save Question'}
                            </button>
                        </div>

                        {/* Question text — no-select applied via CSS */}
                        <div className="review-question-text">
                            {question.questionText}
                        </div>

                        {/* Options — no-select applied via CSS */}
                        <div className="review-options">
                            {question.displayedOptions.map((opt, oIdx) => {
                                const isCorrect = oIdx === question.correctAnswerIndex;
                                const isUserWrong =
                                    oIdx === question.userAnswerIndex &&
                                    question.userAnswerIndex !== question.correctAnswerIndex;
                                const isUserUnanswered = question.userAnswerIndex === -1;

                                let optionClass = '';
                                let icon = '';

                                if (isCorrect) {
                                    optionClass = 'option-correct';
                                    icon = 'Correct';
                                } else if (isUserWrong) {
                                    optionClass = 'option-wrong';
                                    icon = 'Incorrect';
                                }

                                return (
                                    <div key={oIdx} className={`review-option ${optionClass}`}>
                                        <div className="review-option-letter">
                                            {OPTION_LETTERS[oIdx]}
                                        </div>
                                        <div className="review-option-text">{opt}</div>
                                        {icon && (
                                            <div className="review-option-icon">{icon}</div>
                                        )}
                                        {isCorrect && (
                                            <div style={{
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                color: '#10b981',
                                                flexShrink: 0,
                                                whiteSpace: 'nowrap',
                                            }}>
                                                Correct Answer
                                            </div>
                                        )}
                                        {isUserWrong && (
                                            <div style={{
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                color: '#ef4444',
                                                flexShrink: 0,
                                                whiteSpace: 'nowrap',
                                            }}>
                                                Your Answer
                                            </div>
                                        )}
                                        {!isUserUnanswered &&
                                            oIdx === question.userAnswerIndex &&
                                            question.isCorrect && (
                                                <div style={{
                                                    fontSize: '0.72rem',
                                                    fontWeight: 700,
                                                    color: '#10b981',
                                                    flexShrink: 0,
                                                    whiteSpace: 'nowrap',
                                                }}>
                                                    Your Answer
                                                </div>
                                            )}
                                        {isUserUnanswered && isCorrect && (
                                            <div style={{
                                                fontSize: '0.72rem',
                                                fontWeight: 700,
                                                color: '#6b7280',
                                                flexShrink: 0,
                                            }}>
                                                (Not answered)
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}

                {/* Bottom back button */}
                <div className="review-back-row">
                    <button className="btn btn-secondary" onClick={() => navigate('/user/results')}>
                        Back to Results
                    </button>
                    <button className="btn btn-primary" onClick={() => navigate('/user/dashboard')}>
                        Go to Dashboard
                    </button>
                </div>

            </div>
        </UserLayout>
    );
};

export default AnswerReview;
