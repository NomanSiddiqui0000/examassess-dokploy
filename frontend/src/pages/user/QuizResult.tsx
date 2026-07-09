import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import UserLayout from '../../components/Layout/UserLayout';
import './QuizResult.css';

interface ResultData {
    id: string;
    score: number;
    totalMarks: number;
    passed: boolean;
    timeTaken: number;
    correctAnswers: number;
    totalQuestions: number;
    passingMarks: number;
    percentage: number;
    hidden?: boolean;
}

// ─── Animated Circular Progress ───────────────────────────────────────────────
const RADIUS = 54;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const SIZE = 160;
const CENTER = SIZE / 2;

interface CircleProps {
    percentage: number;
    passed: boolean;
}

const ResultCircle: React.FC<CircleProps> = ({ percentage, passed }) => {
    const [animatedDash, setAnimatedDash] = useState(0);
    const [showIcon, setShowIcon] = useState(false);
    const hasAnimated = useRef(false);

    useEffect(() => {
        if (hasAnimated.current) return;
        hasAnimated.current = true;

        // Phase 1: animate the arc (1s)
        const targetDash = (percentage / 100) * CIRCUMFERENCE;
        const startTime = performance.now();
        const duration = 1000;

        const animateArc = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // ease-out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setAnimatedDash(eased * targetDash);
            if (progress < 1) {
                requestAnimationFrame(animateArc);
            } else {
                // Phase 2: show icon after arc completes
                setTimeout(() => setShowIcon(true), 100);
            }
        };

        requestAnimationFrame(animateArc);
    }, [percentage]);

    const passColor = '#10b981';
    const failColor = '#ef4444';
    const arcColor = passed ? passColor : failColor;

    return (
        <div className="result-circle-wrap">
            <svg
                width={SIZE}
                height={SIZE}
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                className="result-circle-svg"
            >
                {/* Track */}
                <circle
                    cx={CENTER}
                    cy={CENTER}
                    r={RADIUS}
                    fill="none"
                    stroke="rgba(255,255,255,0.12)"
                    strokeWidth={STROKE}
                />
                {/* Animated arc — starts at top (−90°) */}
                <circle
                    cx={CENTER}
                    cy={CENTER}
                    r={RADIUS}
                    fill="none"
                    stroke={arcColor}
                    strokeWidth={STROKE}
                    strokeLinecap="round"
                    strokeDasharray={`${animatedDash} ${CIRCUMFERENCE}`}
                    strokeDashoffset={CIRCUMFERENCE * 0.25}
                    style={{ filter: `drop-shadow(0 0 6px ${arcColor}88)` }}
                />

                {/* Percentage text */}
                <text
                    x={CENTER}
                    y={CENTER - 8}
                    textAnchor="middle"
                    fill="white"
                    fontSize="26"
                    fontWeight="800"
                    fontFamily="Outfit, sans-serif"
                >
                    {percentage}%
                </text>
                <text
                    x={CENTER}
                    y={CENTER + 12}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.6)"
                    fontSize="11"
                    fontFamily="Inter, sans-serif"
                    fontWeight="500"
                    letterSpacing="1"
                >
                    SCORE
                </text>
            </svg>

            {/* Pass tick / Fail cross — rendered outside SVG for CSS animation */}
            <div className={`result-icon-badge ${passed ? 'pass' : 'fail'} ${showIcon ? 'visible' : ''}`}>
                {passed ? (
                    // Animated SVG tick
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-tick">
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                ) : (
                    // Animated SVG cross
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="icon-cross">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                )}
            </div>
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────
const QuizResult: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const result: ResultData = location.state?.result;
    const quizTitle: string = location.state?.quizTitle || 'Quiz';

    if (!result) {
        navigate('/user/dashboard');
        return null;
    }

    if (result.hidden) {
        return (
            <UserLayout>
                <div className="result-page">
                    <div className="result-card">
                        <div className="result-status pass">Assessment Submitted Successfully</div>
                        <p className="result-message">
                            Thank you for completing the assessment. Your responses have been submitted successfully.
                        </p>
                        <div className="result-actions">
                            <button className="btn btn-accent btn-lg" onClick={() => navigate('/user/dashboard')}>
                                Back to Dashboard
                            </button>
                        </div>
                    </div>
                </div>
            </UserLayout>
        );
    }

    // Derive all values strictly from backend result — no assumptions
    const percentage = result.percentage ?? (
        result.totalMarks > 0 ? Math.round((result.score / result.totalMarks) * 100) : 0
    );
    const incorrectAnswers = result.totalQuestions - result.correctAnswers;
    const formatTime = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}m ${String(sec).padStart(2, '0')}s`;
    };

    const stats = [
        { label: 'Marks Scored', value: `${result.score} / ${result.totalMarks}`, highlight: false },
        { label: 'Passing Marks', value: result.passingMarks, highlight: false },
        { label: 'Correct', value: result.correctAnswers, highlight: true, color: '#10b981' },
        { label: 'Incorrect', value: incorrectAnswers, highlight: true, color: '#ef4444' },
        { label: 'Questions', value: result.totalQuestions, highlight: false },
        { label: 'Time Taken', value: formatTime(result.timeTaken), highlight: false },
    ];

    return (
        <UserLayout>
            <div className="result-page">
                <div className={`result-card ${result.passed ? 'pass' : 'fail'}`}>

                    {/* Quiz title */}
                    <div className="result-quiz-title">{quizTitle}</div>

                    {/* Pass / Fail badge */}
                    <div className={`result-status-badge ${result.passed ? 'pass' : 'fail'}`}>
                        {result.passed ? 'PASSED' : 'FAILED'}
                    </div>

                    {/* Animated circular progress with icon */}
                    <ResultCircle percentage={percentage} passed={result.passed} />

                    {/* Stats grid */}
                    <div className="result-stats">
                        {stats.map((s) => (
                            <div className="result-stat" key={s.label}>
                                <div
                                    className="result-stat-value"
                                    style={s.highlight ? { color: s.color } : undefined}
                                >
                                    {s.value}
                                </div>
                                <div className="result-stat-label">{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Contextual message */}
                    <div className={`result-message ${result.passed ? 'pass' : 'fail'}`}>
                        {result.passed
                            ? `Congratulations! You passed with ${percentage}%. Well done!`
                            : `You scored ${percentage}%. You needed ${result.passingMarks} marks to pass. Keep practicing!`
                        }
                    </div>

                    {/* Actions */}
                    <div className="result-actions">
                        <button
                            className="btn btn-secondary btn-lg"
                            onClick={() => navigate('/user/results')}
                        >
                            View All Results
                        </button>
                        {result.id && (
                            <button
                                className="btn btn-primary btn-lg"
                                onClick={() => navigate(`/user/review/${result.id}`)}
                            >
                                Review Answers
                            </button>
                        )}
                        <button
                            className="btn btn-accent btn-lg"
                            onClick={() => navigate('/user/dashboard')}
                        >
                            Back to Dashboard
                        </button>
                    </div>
                </div>
            </div>
        </UserLayout>
    );
};

export default QuizResult;
