import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import UserLayout from '../../components/Layout/UserLayout';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import TeacherProfileModal from '../../components/TeacherProfileModal';

/* ─── Types ───────────────────────────────────────────────────────── */
interface Quiz {
    _id: string;
    title: string;
    description?: string;
    numberOfQuestions: number;
    duration: number;
    passingMarks: number;
    marksPerQuestion: number;
    attemptLimit: number;
    attemptCount: number;
    attemptsRemaining: number | null;
    isLocked: boolean;
    type?: 'manual' | 'category' | 'assessment';
    configId?: string;
    creditCost?: number;
    startTime?: string;
    endTime?: string;
    classroom?: { _id: string; name: string };
    teacher?: {
        _id: string;
        fullName: string;
        profileImage?: string;
        professionalTitle?: string;
        organization?: string;
        subjects?: string;
        bio?: string;
    };
    resultVisible?: boolean;
    allowedUntil?: string;
    serverTime?: string;
    result?: {
        id: string;
        assessmentName: string;
        submittedAt: string;
        score: number;
        totalMarks: number;
        percentage: number;
        passed: boolean;
        timeTaken: number;
        timeTakenDisplay?: string;
        correctAnswers: number;
        incorrectAnswers: number;
        totalQuestions: number;
        passingMarks: number;
    } | null;
}

interface DashboardData {
    profile: {
        id: string;
        fullName: string;
        email: string;
        credits: number;
        modules: { practiceModule: boolean; teacherAssessments: boolean };
    };
    practiceStats: {
        totalAttempts: number;
        bookmarksCount: number;
        mistakesCount: number;
        accuracy: number;
        credits: number;
    } | null;
    classroomStats: {
        totalAssessments: number;
        upcomingAssessments: number;
        submittedAttempts: number;
        classroomCount: number;
        classrooms: { id: string; name: string; teacherName: string }[];
        nextAssessment: {
            id: string; name: string; classroom: string;
            startTime: string; endTime: string; durationMinutes: number; totalQuestions: number;
        } | null;
    } | null;
    recentActivity: { type: string; title: string; description: string; timestamp: string }[];
}

type TabId = 'overview' | 'practice' | 'assessments';
type AssessmentStatus = 'upcoming' | 'live' | 'submitted' | 'missed' | 'locked';

/* ─── Helpers ─────────────────────────────────────────────────────── */
function getStatus(quiz: Quiz, now: Date): AssessmentStatus {
    if (quiz.allowedUntil && quiz.startTime && quiz.endTime && now >= new Date(quiz.startTime) && now < new Date(quiz.endTime)) return 'live';
    if (quiz.attemptCount > 0) return 'submitted';
    if (quiz.isLocked) return 'locked';
    if (quiz.startTime && now < new Date(quiz.startTime)) return 'upcoming';
    if (quiz.startTime && quiz.endTime && now >= new Date(quiz.startTime) && now < new Date(quiz.endTime)) return 'live';
    if (quiz.endTime && now >= new Date(quiz.endTime)) return 'missed';
    return 'upcoming';
}

function formatCountdown(ms: number): string {
    if (ms <= 0) return '00:00:00';
    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hrs = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (days > 0) return `${days}d ${pad(hrs)}h ${pad(mins)}m`;
    return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
}

function getAssessmentTimer(quiz: Quiz, now: Date): { label: string; ms: number } | null {
    if (!quiz.startTime || !quiz.endTime) return null;
    const start = new Date(quiz.startTime).getTime();
    const end = new Date(quiz.endTime).getTime();
    const current = now.getTime();
    if (current < start) return { label: 'Starts In', ms: start - current };
    if (current >= start && current < end) {
        // Allotted completion time: full quiz duration before starting, per-attempt time once started.
        const allowedMs = quiz.allowedUntil ? new Date(quiz.allowedUntil).getTime() - current : Number.POSITIVE_INFINITY;
        const durationMs = Number(quiz.duration || 0) * 60000;
        const remainingFromDuration = quiz.attemptCount === 0 ? durationMs : allowedMs;
        return { label: 'Remaining', ms: Math.min(end - current, remainingFromDuration) };
    }
    return null;
}

// Time left to *attempt* the assessment — i.e. the live availability window.
// Non-null only while the assessment is currently available to start (real-time, ticks with `now`).
function getAttemptWindowMs(quiz: Quiz, now: Date): number | null {
    if (!quiz.startTime || !quiz.endTime) return null;
    const start = new Date(quiz.startTime).getTime();
    const end = new Date(quiz.endTime).getTime();
    const current = now.getTime();
    if (current < start || current >= end) return null;
    return end - current;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr: string): string {
    return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return formatDate(dateStr);
}

const statusConfig: Record<AssessmentStatus, { label: string; cssClass: string }> = {
    live: { label: 'Live Now', cssClass: 'assessment-status-live' },
    upcoming: { label: 'Upcoming', cssClass: 'assessment-status-upcoming' },
    submitted: { label: 'Submitted', cssClass: 'assessment-status-submitted' },
    missed: { label: 'Missed', cssClass: 'assessment-status-missed' },
    locked: { label: 'Locked', cssClass: 'assessment-status-locked' },
};

/* ─── SVG Icons ───────────────────────────────────────────────────── */
const IconCredits = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" /><path d="M12 18V6" />
    </svg>
);
const IconTarget = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
);
const IconCalendar = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);
const IconTrend = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
);
const IconBookmark = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
);
const IconMistake = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
    </svg>
);
const IconChart = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
);
const IconClock = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
);
const IconCheckSquare = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
);
const IconClipboard = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" />
    </svg>
);

/* ─── Assessment Card ─────────────────────────────────────────────── */
const AssessmentCard: React.FC<{ quiz: Quiz; now: Date; onStart: (q: Quiz) => void; onResults: () => void; onViewTeacher: (teacherId: string) => void }> = ({ quiz, now, onStart, onResults, onViewTeacher }) => {
    const status = getStatus(quiz, now);
    const cfg = statusConfig[status];
    const totalMarks = quiz.numberOfQuestions * quiz.marksPerQuestion;
    const timer = getAssessmentTimer(quiz, now);
    const attemptWindowMs = getAttemptWindowMs(quiz, now);

    return (
        <div className={`assessment-card status-${status}`}>
            <div className="assessment-card-header">
                <div style={{ minWidth: 0 }}>
                    <div className="assessment-card-title">{quiz.title}</div>
                    {quiz.classroom && <div className="assessment-card-classroom">{quiz.classroom.name}</div>}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <span className="assessment-type-badge">Classroom Assessment</span>
                    <span className={`assessment-status ${cfg.cssClass}`}>
                        {status === 'live' && <span className="live-dot" />}
                        {cfg.label}
                    </span>
                </div>
            </div>

            {quiz.teacher && (
                <div className="compact-teacher-card" onClick={() => onViewTeacher(quiz.teacher!._id)}>
                    <div className="teacher-avatar">
                        {quiz.teacher.profileImage ? (
                            <img src={quiz.teacher.profileImage} alt={quiz.teacher.fullName} />
                        ) : (
                            <div className="avatar-placeholder">{quiz.teacher.fullName.charAt(0)}</div>
                        )}
                    </div>
                    <div className="teacher-info-compact">
                        <div className="teacher-name">{quiz.teacher.fullName}</div>
                        <div className="teacher-title">
                            {quiz.teacher.professionalTitle} {quiz.teacher.organization && `• ${quiz.teacher.organization}`}
                        </div>
                    </div>
                    <div className="view-profile-btn">View Profile</div>
                </div>
            )}

            <div className="assessment-card-details">
                <div className="assessment-detail-item">
                    <div className="assessment-detail-icon"><IconCheckSquare /></div>
                    <div><div className="assessment-detail-label">Questions</div><div className="assessment-detail-value">{quiz.numberOfQuestions}</div></div>
                </div>
                <div className="assessment-detail-item">
                    <div className="assessment-detail-icon"><IconClock /></div>
                    <div><div className="assessment-detail-label">Duration</div><div className="assessment-detail-value">{quiz.duration} min</div></div>
                </div>
                <div className="assessment-detail-item">
                    <div className="assessment-detail-icon"><IconTrend /></div>
                    <div><div className="assessment-detail-label">Total Marks</div><div className="assessment-detail-value">{totalMarks}</div></div>
                </div>
                <div className="assessment-detail-item">
                    <div className="assessment-detail-icon"><IconTarget /></div>
                    <div><div className="assessment-detail-label">Pass</div><div className="assessment-detail-value">{quiz.passingMarks}%</div></div>
                </div>
            </div>
            {quiz.startTime && quiz.endTime && (
                <div className="assessment-window">
                    <div className="assessment-window-inner">
                        <div className="assessment-window-icon"><IconCalendar /></div>
                        <div>
                            <div className="assessment-window-label">Assessment Window</div>
                            <div className="assessment-window-date">{formatDate(quiz.startTime)}</div>
                            <div className="assessment-window-time">{formatTime(quiz.startTime)} to {formatTime(quiz.endTime)}</div>
                        </div>
                    </div>
                </div>
            )}
            {timer && (status === 'upcoming' || status === 'live') && (
                <div className="assessment-countdown">
                    <div className="assessment-countdown-inner">
                        <div className="assessment-countdown-label">{timer.label}</div>
                        <div className="assessment-countdown-timer">{formatCountdown(timer.ms)}</div>
                    </div>
                </div>
            )}
            {status === 'live' && attemptWindowMs !== null && (
                <div className="assessment-countdown assessment-attempt-window">
                    <div className="assessment-countdown-inner">
                        <div className="assessment-countdown-label">Time Left to Attempt</div>
                        <div className="assessment-countdown-timer">{formatCountdown(attemptWindowMs)}</div>
                    </div>
                </div>
            )}
            {status === 'live' && (
                <div className="assessment-live-banner">
                    <div className="assessment-live-banner-inner">
                        <span className="live-dot" /><span className="assessment-live-text">Assessment Available - Start Now</span>
                    </div>
                </div>
            )}
            <div className="assessment-card-action">
                <div className="assessment-action-info">
                    {status === 'live' && <>{quiz.attemptsRemaining} attempt{quiz.attemptsRemaining !== 1 ? 's' : ''} remaining</>}
                    {status === 'submitted' && <>Attempt{quiz.attemptCount > 1 ? 's' : ''}: <strong>{quiz.attemptCount}/{quiz.attemptLimit}</strong></>}
                    {status === 'missed' && <>Assessment window closed</>}
                    {status === 'locked' && <>Attempt limit reached</>}
                </div>
                {status === 'live' && <button className="btn btn-assessment-start" onClick={() => onStart(quiz)}>Start Assessment</button>}
                {status === 'submitted' && quiz.resultVisible && quiz.result && <button className="btn btn-secondary btn-sm" onClick={onResults}>View Results</button>}
                {status === 'submitted' && (!quiz.resultVisible || !quiz.result) && <button className="btn btn-secondary btn-sm" disabled>Results Pending</button>}
                {status === 'upcoming' && <button className="btn btn-secondary btn-sm" disabled>Not Yet Available</button>}
                {status === 'missed' && <button className="btn btn-secondary btn-sm" disabled>Assessment Ended</button>}
                {status === 'locked' && <button className="btn btn-secondary btn-sm" disabled>Locked</button>}
            </div>
        </div>
    );
};

/* ─── Main Dashboard ──────────────────────────────────────────────── */
const UserDashboard: React.FC = () => {
    const [quizzes, setQuizzes] = useState<Quiz[]>([]);
    const [dashData, setDashData] = useState<DashboardData | null>(null);
    const [credits, setCredits] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(new Date());
    const [serverOffsetMs, setServerOffsetMs] = useState(0);
    const [activeTab, setActiveTab] = useState<TabId>('overview');
    const { user, login } = useAuth();
    const [emailVerified, setEmailVerified] = useState(user?.emailVerified ?? false);
    const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (user?.mustChangePassword) {
            navigate('/user/change-password');
            return;
        }

        setLoading(true);
        api.get('/user/profile')
            .then((profileRes) => {
                const isVerified = profileRes.data.emailVerified ?? false;
                setEmailVerified(isVerified);
                setCredits(profileRes.data.credits ?? 0);

                const promises = [];

                // Fetch classroom assessments if enabled
                const hasAssessments = profileRes.data.modules?.teacherAssessments ?? false;
                if (hasAssessments) {
                    promises.push(api.get('/user/classroom-assessments'));
                } else {
                    promises.push(Promise.resolve({ data: [] }));
                }

                // Fetch quizzes only if practice is enabled and user is verified
                const hasPractice = profileRes.data.modules?.practiceModule ?? false;
                if (hasPractice && isVerified) {
                    promises.push(api.get('/user/quizzes'));
                } else {
                    promises.push(Promise.resolve({ data: [] }));
                }

                // Fetch dashboard stats
                promises.push(api.get('/user/dashboard-data').catch((err) => {
                    if (err.response?.status === 403) {
                        return {
                            data: {
                                profile: profileRes.data,
                                practiceStats: null,
                                classroomStats: null,
                                recentActivity: [],
                            },
                        };
                    }
                    throw err;
                }));

                return Promise.all(promises).then(([assessmentsRes, quizzesRes, dashRes]) => {
                    const assessmentItems = Array.isArray(assessmentsRes.data) ? assessmentsRes.data : [];
                    const serverTime = assessmentItems.find((item: Quiz) => item.serverTime)?.serverTime;
                    if (serverTime) {
                        const offset = new Date(serverTime).getTime() - Date.now();
                        setServerOffsetMs(offset);
                        setNow(new Date(Date.now() + offset));
                    }
                    const practiceItems = Array.isArray(quizzesRes.data) ? quizzesRes.data : [];
                    setQuizzes([...assessmentItems, ...practiceItems]);
                    setDashData(dashRes.data);
                });
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [user, navigate]);

    // Live countdown tick
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date(Date.now() + serverOffsetMs)), 1000);
        return () => clearInterval(timer);
    }, [serverOffsetMs]);

    const assessments = quizzes.filter(q => q.type === 'assessment');
    const practiceQuizzes = quizzes.filter(q => q.type !== 'assessment');
    const releasedAssessmentResults = assessments.filter(q => q.resultVisible && q.result);
    const modules = dashData?.profile?.modules || user?.modules || { practiceModule: true, teacherAssessments: false };
    // Practice module requires a verified email. Until the student verifies, the
    // Practice section is not presented as available (even for teacher-enrolled
    // students who also have classroom assessments). Backend practice routes are
    // independently gated by requireVerifiedEmailIfPractice.
    const practiceUnlocked = modules.practiceModule && emailVerified;

    const handleAttempt = useCallback((quiz: Quiz) => {
        if (quiz.isLocked) return;
        if (quiz.type === 'assessment') navigate(`/user/quiz/${quiz._id}?type=assessment`);
        else if (quiz.type === 'category' && quiz.configId) navigate(`/user/quiz/${quiz.configId}?type=category`);
        else navigate(`/user/quiz/${quiz._id}`);
    }, [navigate]);

    const scrollToResults = useCallback(() => {
        document.getElementById('student-results-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    // Shared verification actions (used by the overview notice and the practice tab prompt).
    const handleRefreshVerification = useCallback(async () => {
        try {
            const profileRes = await api.get('/user/profile');
            if (profileRes.data.emailVerified) {
                setEmailVerified(true);
                const updatedUser = { ...user, ...profileRes.data };
                const token = localStorage.getItem('token');
                if (token) login(token, updatedUser);
            } else {
                alert('Email is still unverified. Please check your inbox.');
            }
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to refresh verification status.');
        }
    }, [user, login]);

    const handleResendVerification = useCallback(async () => {
        try {
            const email = user?.email || dashData?.profile?.email;
            if (email) {
                const res = await api.post('/auth/resend-verification', { email });
                alert(res.data.message || 'Verification email resent!');
            }
        } catch (err: any) {
            alert(err.response?.data?.message || 'Failed to resend email.');
        }
    }, [user, dashData]);

    const firstName = user?.fullName?.split(' ')[0] || dashData?.profile?.fullName?.split(' ')[0] || 'Student';

    // Live/next assessment countdown shown in the hero header (real-time, ticks with `now`).
    // Live  -> time left to attempt (availability window). Upcoming -> time until it starts.
    const heroCountdown = (() => {
        if (!modules.teacherAssessments) return null;
        const candidates = assessments
            .map(q => {
                const status = getStatus(q, now);
                if (status === 'live') {
                    return { status, ms: getAttemptWindowMs(q, now), label: 'Time Left to Attempt' };
                }
                if (status === 'upcoming' && q.startTime) {
                    return { status, ms: new Date(q.startTime).getTime() - now.getTime(), label: 'Starts In' };
                }
                return { status, ms: null as number | null, label: '' };
            })
            .filter((x): x is { status: AssessmentStatus; ms: number; label: string } =>
                x.ms !== null && x.ms > 0);
        if (candidates.length === 0) return null;
        // Prefer a live assessment, otherwise the one resolving soonest
        candidates.sort((a, b) => {
            const liveDiff = (a.status === 'live' ? 0 : 1) - (b.status === 'live' ? 0 : 1);
            return liveDiff !== 0 ? liveDiff : a.ms - b.ms;
        });
        return candidates[0];
    })();

    // Determine available tabs
    const tabs: { id: TabId; label: string; count?: number }[] = [{ id: 'overview', label: 'Overview' }];
    if (practiceUnlocked) tabs.push({ id: 'practice', label: 'My Practice', count: practiceQuizzes.length });
    if (modules.teacherAssessments) tabs.push({ id: 'assessments', label: 'Classroom Assessments', count: assessments.length });

    return (
        <UserLayout>
            {loading ? (
                <div className="loading-overlay"><div className="loading-spinner" />Loading your dashboard...</div>
            ) : (
                <>
                    {/* ─── Hero Section ─── */}
                    <div className="ud-hero">
                        <div className="ud-hero-content">
                            <div className="ud-hero-text">
                                <h1>Welcome back, {firstName}</h1>
                                <p>
                                    {practiceUnlocked && modules.teacherAssessments
                                        ? `${practiceQuizzes.length} practice quizzes and ${assessments.length} classroom assessments available`
                                        : practiceUnlocked
                                            ? `${practiceQuizzes.length} practice quiz${practiceQuizzes.length !== 1 ? 'zes' : ''} available`
                                            : modules.teacherAssessments
                                                ? `${assessments.length} classroom assessment${assessments.length !== 1 ? 's' : ''} assigned`
                                                : 'Verify your email to unlock the Practice section'}
                                </p>
                            </div>
                            <div className="ud-hero-stats">
                                {heroCountdown && (
                                    <div className="ud-hero-stat">
                                        <div className="ud-hero-stat-value" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                            {formatCountdown(heroCountdown.ms)}
                                        </div>
                                        <div className="ud-hero-stat-label">
                                            {heroCountdown.label}
                                        </div>
                                    </div>
                                )}
                                {practiceUnlocked && (
                                    <div className="ud-hero-stat">
                                        <div className="ud-hero-stat-value">{credits ?? 0}</div>
                                        <div className="ud-hero-stat-label">Credits</div>
                                    </div>
                                )}
                                {practiceUnlocked && dashData?.practiceStats && (
                                    <div className="ud-hero-stat">
                                        <div className="ud-hero-stat-value">{dashData.practiceStats.accuracy}%</div>
                                        <div className="ud-hero-stat-label">Accuracy</div>
                                    </div>
                                )}
                                {modules.teacherAssessments && dashData?.classroomStats && (
                                    <div className="ud-hero-stat">
                                        <div className="ud-hero-stat-value">{dashData.classroomStats.upcomingAssessments}</div>
                                        <div className="ud-hero-stat-label">Upcoming</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ─── Tab Navigation ─── */}
                    {tabs.length > 1 && (
                        <div className="ud-tabs">
                            {tabs.map(tab => (
                                <button
                                    key={tab.id}
                                    className={`ud-tab${activeTab === tab.id ? ' active' : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    {tab.label}
                                    {tab.count !== undefined && <span className="ud-tab-badge">{tab.count}</span>}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ─── Overview Tab ─── */}
                    {activeTab === 'overview' && (
                        <>
                            {/* KPI Cards */}
                            <div className="ud-kpi-grid">
                                {modules.practiceModule && (
                                    emailVerified ? (
                                        <>
                                            <div className="ud-kpi-card">
                                                <div className="ud-kpi-icon orange"><IconCredits /></div>
                                                <div><div className="ud-kpi-value">{credits ?? 0}</div><div className="ud-kpi-label">Available Credits</div></div>
                                            </div>
                                            <div className="ud-kpi-card">
                                                <div className="ud-kpi-icon green"><IconTarget /></div>
                                                <div><div className="ud-kpi-value">{dashData?.practiceStats?.totalAttempts ?? 0}</div><div className="ud-kpi-label">Practice Attempts</div></div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="ud-kpi-card verification-warning-card" style={{ gridColumn: 'span 2', background: 'var(--color-warning-bg)', border: '1px solid #fbd5b0', display: 'flex', alignItems: 'flex-start', gap: '16px', padding: '16px 20px', borderRadius: '12px' }}>
                                            <div style={{ background: '#e8620a', color: '#fff', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: '20px', height: '20px' }}>
                                                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                                                </svg>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '0.95rem' }}>Verify Your Email to Unlock Practice</div>
                                                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: '2px' }}>
                                                    A verification link was sent to <strong>{user?.email || dashData?.profile?.email}</strong>. The Practice section unlocks once your email is verified.
                                                </div>
                                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '12px' }}>
                                                    <button className="btn btn-accent btn-sm" onClick={handleRefreshVerification}>Refresh Verification Status</button>
                                                    <button className="btn btn-outline btn-sm" onClick={handleResendVerification}>Resend Verification Email</button>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                )}
                                {modules.teacherAssessments && (
                                    <>
                                        <div className="ud-kpi-card">
                                            <div className="ud-kpi-icon blue"><IconCalendar /></div>
                                            <div><div className="ud-kpi-value">{dashData?.classroomStats?.upcomingAssessments ?? 0}</div><div className="ud-kpi-label">Upcoming Assessments</div></div>
                                        </div>
                                        <div className="ud-kpi-card">
                                            <div className="ud-kpi-icon purple"><IconChart /></div>
                                            <div><div className="ud-kpi-value">{dashData?.classroomStats?.submittedAttempts ?? 0}</div><div className="ud-kpi-label">Submissions</div></div>
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Quick Actions */}
                            <div className="ud-quick-actions">
                                {modules.practiceModule && emailVerified && (
                                    <>
                                        <Link to="/user/bookmarks" className="ud-quick-action"><IconBookmark /> Bookmarks ({dashData?.practiceStats?.bookmarksCount ?? 0})</Link>
                                        <Link to="/user/mistakes" className="ud-quick-action"><IconMistake /> Mistake Book ({dashData?.practiceStats?.mistakesCount ?? 0})</Link>
                                        <Link to="/user/reports" className="ud-quick-action"><IconChart /> Performance Reports</Link>
                                    </>
                                )}
                                <Link to="/user/results" className="ud-quick-action"><IconTrend /> View All Results</Link>
                            </div>

                            {/* Content Grid: Next Assessment + Activity */}
                            <div className="ud-content-grid">
                                {/* Next Assessment / Classrooms */}
                                {modules.teacherAssessments && dashData?.classroomStats && (
                                    <div>
                                        {dashData.classroomStats.nextAssessment && (
                                            <>
                                                <div className="ud-section-header">
                                                    <h3 className="ud-section-title">Next Assessment</h3>
                                                </div>
                                                <div className="ud-next-assessment" style={{ marginBottom: 16 }}>
                                                    <div className="ud-next-assessment-label">
                                                        {new Date(dashData.classroomStats.nextAssessment.startTime) <= now ? 'Live Now' : 'Coming Up'}
                                                    </div>
                                                    <div className="ud-next-assessment-name">{dashData.classroomStats.nextAssessment.name}</div>
                                                    <div className="ud-next-assessment-classroom">{dashData.classroomStats.nextAssessment.classroom}</div>
                                                    <div className="ud-next-assessment-meta">
                                                        <div className="ud-next-assessment-meta-item">
                                                            <IconClock /> {dashData.classroomStats.nextAssessment.durationMinutes} min
                                                        </div>
                                                        <div className="ud-next-assessment-meta-item">
                                                            <IconCheckSquare /> {dashData.classroomStats.nextAssessment.totalQuestions} questions
                                                        </div>
                                                        <div className="ud-next-assessment-meta-item">
                                                            <IconCalendar /> {formatDate(dashData.classroomStats.nextAssessment.startTime)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                        {dashData.classroomStats.classrooms.length > 0 && (
                                            <>
                                                <div className="ud-section-header">
                                                    <h3 className="ud-section-title">My Classrooms <span className="ud-section-count">{dashData.classroomStats.classroomCount}</span></h3>
                                                </div>
                                                <div className="ud-classrooms">
                                                    {dashData.classroomStats.classrooms.map(c => (
                                                        <div key={c.id} className="ud-classroom-item">
                                                            <div className="ud-classroom-avatar">{c.name.charAt(0).toUpperCase()}</div>
                                                            <div className="ud-classroom-info">
                                                                <div className="ud-classroom-name">{c.name}</div>
                                                                <div className="ud-classroom-teacher">{c.teacherName}</div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* Recent Activity */}
                                <div>
                                    <div className="ud-section-header">
                                        <h3 className="ud-section-title">Recent Activity</h3>
                                    </div>
                                    <div className="ud-timeline">
                                        {dashData?.recentActivity && dashData.recentActivity.length > 0 ? (
                                            dashData.recentActivity.slice(0, 8).map((item, i) => (
                                                <div key={i} className="ud-timeline-item">
                                                    <div className={`ud-timeline-dot ${item.type === 'practice_result' ? 'practice' : 'assessment'}`} />
                                                    <div className="ud-timeline-content">
                                                        <div className="ud-timeline-title">{item.title}</div>
                                                        <div className="ud-timeline-desc">{item.description}</div>
                                                        <div className="ud-timeline-time">{timeAgo(item.timestamp)}</div>
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <div className="ud-timeline-empty">No recent activity yet. Start a quiz or assessment to see your progress here.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ─── Practice Tab ─── */}
                    {activeTab === 'practice' && modules.practiceModule && (
                        !emailVerified ? (
                            <div className="ud-empty-state" style={{ padding: '60px 40px', background: 'var(--color-surface)', borderRadius: '12px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
                                <div className="auth-status-icon warning" aria-hidden="true" style={{ margin: '0 auto 16px', background: 'var(--color-warning-bg) !important', color: 'var(--color-warning) !important' }}>
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: '32px', height: '32px' }}>
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="16" x2="12" y2="12" />
                                        <line x1="12" y1="8" x2="12.01" y2="8" />
                                    </svg>
                                </div>
                                <h3 className="ud-empty-title" style={{ fontFamily: 'Outfit, sans-serif', fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '8px' }}>
                                    Please verify your email address before accessing the Practice Module.
                                </h3>
                                <p className="ud-empty-desc" style={{ color: 'var(--color-text-secondary)', maxWidth: '500px', margin: '0 auto 24px', lineHeight: 1.6 }}>
                                    A verification link was sent to <strong style={{ color: 'var(--color-text-primary)' }}>{user?.email || dashData?.profile?.email}</strong>. Once verified, you will gain full access to practice quizzes, bookmarking, credits, and reports.
                                </p>

                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <button className="btn btn-accent" onClick={handleRefreshVerification}>
                                        Refresh Verification Status
                                    </button>
                                    <button className="btn btn-outline" onClick={handleResendVerification}>
                                        Resend Verification Email
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Credits Card */}
                                {credits !== null && (
                                    <div style={{
                                        background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-light) 100%)',
                                        color: '#fff', padding: '1.25rem 1.5rem', borderRadius: '0.75rem', marginBottom: '1.5rem',
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        boxShadow: '0 4px 12px rgba(13, 47, 105, 0.3)',
                                    }}>
                                        <div>
                                            <span style={{ fontSize: '0.85rem', opacity: 0.9 }}>Remaining Credits</span>
                                            <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.1 }}>{credits}</div>
                                        </div>
                                        {credits === 0 && (
                                            <a href="https://wa.me/923154832988?text=Hello%2C%20I%20need%20additional%20quiz%20credits%20for%20ExamAssess."
                                                target="_blank" rel="noopener noreferrer"
                                                style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                                                    background: 'var(--color-success)', color: '#fff', padding: '0.55rem 1.1rem',
                                                    borderRadius: '50px', fontSize: '0.82rem', fontWeight: 600,
                                                    textDecoration: 'none', transition: 'transform 0.15s ease',
                                                }}>
                                                Need More Credits? Contact Admin
                                            </a>
                                        )}
                                    </div>
                                )}

                                {/* Quick Links */}
                                <div className="ud-quick-actions">
                                    <Link to="/user/bookmarks" className="ud-quick-action"><IconBookmark /> Bookmarks ({dashData?.practiceStats?.bookmarksCount ?? 0})</Link>
                                    <Link to="/user/mistakes" className="ud-quick-action"><IconMistake /> Mistake Book ({dashData?.practiceStats?.mistakesCount ?? 0})</Link>
                                    <Link to="/user/reports" className="ud-quick-action"><IconChart /> Performance Reports</Link>
                                    <Link to="/user/results" className="ud-quick-action"><IconTrend /> Results History</Link>
                                </div>

                                {/* Practice Quizzes */}
                                {practiceQuizzes.length === 0 ? (
                                    <div className="ud-empty-state">
                                        <div className="ud-empty-icon"><IconClipboard /></div>
                                        <div className="ud-empty-title">No Practice Quizzes Available</div>
                                        <div className="ud-empty-desc">Practice quizzes will appear here once they are assigned to your test category.</div>
                                    </div>
                                ) : (
                                    <>
                                        <div className="ud-section-header">
                                            <h3 className="ud-section-title">Practice Quizzes <span className="ud-section-count">{practiceQuizzes.length}</span></h3>
                                        </div>
                                        <div className="quiz-grid">
                                            {practiceQuizzes.map(quiz => (
                                                <div key={quiz._id} className={`quiz-card ${quiz.isLocked ? 'locked' : ''}`}>
                                                    <div className="quiz-card-header">
                                                        <div className="quiz-card-title">{quiz.title}</div>
                                                        {quiz.description && <div className="quiz-card-desc">{quiz.description}</div>}
                                                    </div>
                                                    <div className="quiz-card-body">
                                                        <div className="quiz-meta">
                                                            <div className="quiz-meta-item"><IconCheckSquare /> {quiz.numberOfQuestions} Questions</div>
                                                            <div className="quiz-meta-item"><IconClock /> {quiz.duration} Minutes</div>
                                                            <div className="quiz-meta-item"><IconTrend /> {quiz.numberOfQuestions * quiz.marksPerQuestion} Total Marks</div>
                                                            <div className="quiz-meta-item"><IconTarget /> Pass: {quiz.passingMarks} marks</div>
                                                        </div>
                                                        <div style={{
                                                            background: quiz.isLocked ? 'var(--color-danger-bg)' : 'var(--color-surface-2)',
                                                            borderRadius: 'var(--radius-md)', padding: '10px 14px',
                                                            border: `1px solid ${quiz.isLocked ? '#fca5a5' : 'var(--color-border)'}`,
                                                            fontSize: '0.82rem', color: quiz.isLocked ? '#dc2626' : 'var(--color-text-secondary)',
                                                        }}>
                                                            {quiz.type === 'category' ? (
                                                                <span>Dynamic quiz | {quiz.attemptCount} taken | Remaining Attempts: {credits ?? 0}</span>
                                                            ) : quiz.attemptLimit === 0 ? (
                                                                <span>Unlimited attempts | {quiz.attemptCount} taken</span>
                                                            ) : quiz.isLocked ? (
                                                                <span>Attempt limit reached ({quiz.attemptCount}/{quiz.attemptLimit})</span>
                                                            ) : (
                                                                <span>{quiz.attemptCount}/{quiz.attemptLimit} attempts used | {quiz.attemptsRemaining} remaining</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="quiz-card-footer">
                                                        {quiz.attemptCount > 0 && <button className="btn btn-secondary btn-sm" onClick={() => navigate('/user/results')}>View Results</button>}
                                                        <button
                                                            id={`attempt-quiz-${quiz._id}`}
                                                            className={`btn btn-sm ${quiz.isLocked ? 'btn-secondary' : 'btn-accent'}`}
                                                            onClick={() => handleAttempt(quiz)}
                                                            disabled={quiz.isLocked}
                                                            style={{ marginLeft: 'auto' }}
                                                        >
                                                            {quiz.isLocked ? 'Locked' : quiz.attemptCount > 0 ? 'Attempt Again' : 'Start Quiz'}
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </>)
                    )}

                    {/* ─── Assessments Tab ─── */}
                    {activeTab === 'assessments' && modules.teacherAssessments && (
                        <>
                            {/* Released Results */}
                            {releasedAssessmentResults.length > 0 && (
                                <section id="student-results-section" className="student-results-section">
                                    <div className="ud-section-header">
                                        <h3 className="ud-section-title">My Results <span className="ud-section-count">{releasedAssessmentResults.length}</span></h3>
                                    </div>
                                    <div className="student-results-grid">
                                        {releasedAssessmentResults.map((quiz) => {
                                            const result = quiz.result!;
                                            const incorrect = result.incorrectAnswers ?? Math.max(0, result.totalQuestions - result.correctAnswers);
                                            return (
                                                <article className="student-result-card" key={result.id}>
                                                    <div className="student-result-card-header">
                                                        <div>
                                                            <h3>{quiz.title}</h3>
                                                            <p>{result.submittedAt ? new Date(result.submittedAt).toLocaleString() : 'Submitted'}</p>
                                                        </div>
                                                        <span className={`badge ${result.passed ? 'badge-success' : 'badge-danger'}`}>
                                                            {result.passed ? 'Pass' : 'Fail'}
                                                        </span>
                                                    </div>
                                                    <div className="student-result-score-row">
                                                        <div className="student-result-ring" style={{ ['--score' as any]: `${Math.min(100, Math.max(0, result.percentage))}%` }}>
                                                            <span>{result.percentage}%</span>
                                                        </div>
                                                        <div className="student-result-summary">
                                                            <strong>{result.score} / {result.totalMarks}</strong>
                                                            <span>Marks Obtained</span>
                                                            <p>Time: {result.timeTakenDisplay || `${Math.floor(result.timeTaken / 60)}m ${String(result.timeTaken % 60).padStart(2, '0')}s`}</p>
                                                        </div>
                                                    </div>
                                                    <div className="student-result-stats">
                                                        <div><span>Correct</span><strong>{result.correctAnswers}</strong></div>
                                                        <div><span>Incorrect</span><strong>{incorrect}</strong></div>
                                                        <div><span>Questions</span><strong>{result.totalQuestions}</strong></div>
                                                        <div><span>Passing</span><strong>{result.passingMarks}%</strong></div>
                                                    </div>
                                                    <div className="student-result-bar">
                                                        <span style={{ width: `${Math.min(100, Math.max(0, result.percentage))}%` }} />
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                </section>
                            )}

                            {/* Assessment Cards */}
                            {assessments.length === 0 ? (
                                <div className="ud-empty-state">
                                    <div className="ud-empty-icon"><IconClipboard /></div>
                                    <div className="ud-empty-title">No Assessments Assigned</div>
                                    <div className="ud-empty-desc">Your teacher will assign assessments when ready. Check back later.</div>
                                </div>
                            ) : (
                                <>
                                    <div className="ud-section-header">
                                        <h3 className="ud-section-title">Classroom Assessments <span className="ud-section-count">{assessments.length}</span></h3>
                                    </div>
                                    <div className="assessment-grid">
                                        {assessments.map(quiz => (
                                            <AssessmentCard key={quiz._id} quiz={quiz} now={now} onStart={handleAttempt} onResults={scrollToResults} onViewTeacher={() => {}} />
                                        ))}
                                    </div>
                                </>
                            )}
                        </>
                    )}

                    {/* ─── Fallback: No modules ─── */}
                    {!modules.practiceModule && !modules.teacherAssessments && (
                        <div className="ud-empty-state">
                            <div className="ud-empty-icon"><IconClipboard /></div>
                            <div className="ud-empty-title">Welcome to ExamAssess</div>
                            <div className="ud-empty-desc">Your account is being set up. You'll see your quizzes and assessments here once they're ready.</div>
                        </div>
                    )}
                </>
            )}
            {selectedTeacherId && (
                <TeacherProfileModal
                    teacherId={selectedTeacherId}
                    onClose={() => setSelectedTeacherId(null)}
                />
            )}
        </UserLayout>
    );
};

export default UserDashboard;
