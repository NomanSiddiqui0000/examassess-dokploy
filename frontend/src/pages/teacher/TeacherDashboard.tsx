import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../utils/api';
import BackHomeButton from '../../components/BackHomeButton';
import HomeLogoLink from '../../components/HomeLogoLink';
import { DEFAULT_QUESTION_DIFFICULTY, QUESTION_DIFFICULTIES, QuestionDifficulty } from '../../constants/questionDifficulty';
import TeacherProfileSection from './TeacherProfileSection';

type TabKey = 'overview' | 'classrooms' | 'questions' | 'assessments' | 'students' | 'analytics' | 'profile';
type DistributionRow = { category: string; value: number | '' };
type WorkflowState = 'complete' | 'current' | 'locked';
type IconName = 'overview' | 'classrooms' | 'questions' | 'assessments' | 'students' | 'analytics' | 'logout' | 'menu' | 'close' | 'profile';
type AnalyticsTabKey = 'overview' | 'students' | 'quizzes' | 'topics' | 'questions' | 'attendance' | 'time' | 'classrooms';
type ResultSortKey = 'name' | 'submittedAt' | 'score' | 'percentage' | 'timeTaken';

const analyticsTabs: Array<{ key: AnalyticsTabKey; label: string }> = [
    { key: 'overview', label: 'Overview' },
    { key: 'students', label: 'Students' },
    { key: 'quizzes', label: 'Quizzes' },
    { key: 'topics', label: 'Topic Mastery' },
    { key: 'questions', label: 'Questions' },
    { key: 'attendance', label: 'Attendance' },
    { key: 'time', label: 'Time' },
    { key: 'classrooms', label: 'Classrooms' },
];

const formatPercent = (value: any) => `${Number(value || 0)}%`;

const formatMetric = (value: any) => {
    if (value === null || value === undefined || value === '') return '-';
    if (typeof value === 'number') return value.toLocaleString();
    return String(value);
};

const getStudentStatusClass = (status: string) => {
    if (status === 'Excellent') return 'analytics-status-strong';
    if (status === 'Average') return 'analytics-status-average';
    if (status === 'Needs Attention') return 'analytics-status-risk';
    return 'analytics-status-muted';
};

const getHeatmapCellClass = (level: string) => {
    if (level === 'strong') return 'heatmap-strong';
    if (level === 'average') return 'heatmap-average';
    if (level === 'weak') return 'heatmap-weak';
    return 'heatmap-empty';
};

const metricLabel = (key: string) => key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());

const MiniLineChart = ({ data, keys }: { data: any[]; keys: Array<{ key: string; label: string; color: string }> }) => {
    const width = 520;
    const height = 180;
    const padding = 24;
    const values = data.flatMap((row) => keys.map((item) => Number(row[item.key] || 0)));
    const max = Math.max(100, ...values, 1);
    const xFor = (index: number) => padding + (index * (width - padding * 2)) / Math.max(1, data.length - 1);
    const yFor = (value: number) => height - padding - (Math.max(0, value) / max) * (height - padding * 2);
    return (
        <div className="analytics-chart-frame">
            <svg viewBox={`0 0 ${width} ${height}`} className="analytics-line-chart" role="img">
                {[0, 25, 50, 75, 100].map((tick) => (
                    <line key={tick} x1={padding} x2={width - padding} y1={yFor(tick)} y2={yFor(tick)} className="analytics-grid-line" />
                ))}
                {keys.map((series) => {
                    const points = data.map((row, index) => `${xFor(index)},${yFor(Number(row[series.key] || 0))}`).join(' ');
                    return <polyline key={series.key} points={points} fill="none" stroke={series.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />;
                })}
                {data.map((row, index) => (
                    <text key={`${row.label}-${index}`} x={xFor(index)} y={height - 4} textAnchor="middle" className="analytics-axis-label">{row.label}</text>
                ))}
            </svg>
            <div className="analytics-chart-legend">
                {keys.map((series) => <span key={series.key}><i style={{ background: series.color }} />{series.label}</span>)}
            </div>
        </div>
    );
};

const BarList = ({ data, labelKey, valueKey, suffix = '' }: { data: any[]; labelKey: string; valueKey: string; suffix?: string }) => {
    const max = Math.max(1, ...data.map((row) => Number(row[valueKey] || 0)));
    return (
        <div className="analytics-bar-list">
            {data.map((row, index) => {
                const value = Number(row[valueKey] || 0);
                return (
                    <div className="analytics-bar-row" key={`${row[labelKey]}-${index}`}>
                        <span>{row[labelKey]}</span>
                        <div><i style={{ width: `${Math.max(4, (value / max) * 100)}%` }} /></div>
                        <strong>{value}{suffix}</strong>
                    </div>
                );
            })}
        </div>
    );
};

const DonutChart = ({ data, labelKey, valueKey }: { data: any[]; labelKey: string; valueKey: string }) => {
    const palette = ['#1f4e8c', '#f97316', '#16a34a', '#f59e0b', '#dc2626', '#64748b'];
    const total = data.reduce((sum, row) => sum + Number(row[valueKey] || 0), 0) || 1;
    let cursor = 0;
    const gradient = data.map((row, index) => {
        const start = cursor;
        cursor += (Number(row[valueKey] || 0) / total) * 100;
        return `${palette[index % palette.length]} ${start}% ${cursor}%`;
    }).join(', ');
    return (
        <div className="analytics-donut-wrap">
            <div className="analytics-donut" style={{ background: `conic-gradient(${gradient})` }}>
                <span>{Math.round(total)}</span>
            </div>
            <div className="analytics-donut-legend">
                {data.slice(0, 6).map((row, index) => (
                    <span key={`${row[labelKey]}-${index}`}><i style={{ background: palette[index % palette.length] }} />{row[labelKey]} <strong>{row[valueKey]}</strong></span>
                ))}
            </div>
        </div>
    );
};

const ProgressMeter = ({ value }: { value: number }) => (
    <div className="analytics-progress-meter">
        <i style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} />
    </div>
);

const toDateInputValue = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const toTimeInputValue = (date: Date) => {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
};

const getDefaultAssessmentSchedule = () => {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    start.setSeconds(0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    return {
        date: toDateInputValue(start),
        startTime: toTimeInputValue(start),
        endTime: toTimeInputValue(end),
    };
};

const today = toDateInputValue(new Date());
const defaultAssessmentSchedule = getDefaultAssessmentSchedule();

const workflowSteps: Array<{ key: TabKey; step: number; title: string; description: string }> = [
    { key: 'classrooms', step: 1, title: 'Create Classroom', description: 'Create the teaching space and choose the class roster context.' },
    { key: 'questions', step: 2, title: 'Build Question Bank', description: 'Add MCQs manually or upload a structured CSV/XLSX bank.' },
    { key: 'assessments', step: 3, title: 'Schedule Assessment', description: 'Set timing, duration, question distribution, and security options.' },
    { key: 'students', step: 4, title: 'Invite Students', description: 'Invite learners individually or import the roster after an assessment exists.' },
];

const Icon = ({ name }: { name: IconName }) => {
    const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
    switch (name) {
        case 'overview':
            return <svg viewBox="0 0 24 24" {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
        case 'classrooms':
            return <svg viewBox="0 0 24 24" {...common}><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /><path d="M9 10h.01" /><path d="M15 10h.01" /></svg>;
        case 'questions':
            return <svg viewBox="0 0 24 24" {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /><path d="M9 7h7" /><path d="M9 11h7" /></svg>;
        case 'assessments':
            return <svg viewBox="0 0 24 24" {...common}><path d="M8 2v4" /><path d="M16 2v4" /><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 10h18" /><path d="m9 16 2 2 4-4" /></svg>;
        case 'students':
            return <svg viewBox="0 0 24 24" {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
        case 'analytics':
            return <svg viewBox="0 0 24 24" {...common}><path d="M3 3v18h18" /><path d="M7 16v-5" /><path d="M12 16V7" /><path d="M17 16v-8" /></svg>;
        case 'logout':
            return <svg viewBox="0 0 24 24" {...common}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>;
        case 'menu':
            return <svg viewBox="0 0 24 24" {...common}><path d="M3 6h18" /><path d="M3 12h18" /><path d="M3 18h18" /></svg>;
        case 'close':
            return <svg viewBox="0 0 24 24" {...common}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>;
        case 'profile':
            return <svg viewBox="0 0 24 24" {...common}><circle cx="12" cy="7" r="4" /><path d="M5.5 21v-2a6.5 6.5 0 0 1 13 0v2" /></svg>;
        default:
            return null;
    }
};

const WorkflowGate = ({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel: string; onAction: () => void }) => (
    <div className="workflow-gate card">
        <div className="workflow-gate-icon"><Icon name="assessments" /></div>
        <div>
            <h2>{title}</h2>
            <p>{message}</p>
        </div>
        <button className="btn btn-accent" onClick={onAction}>{actionLabel}</button>
    </div>
);

const formatResourceNumber = (value: any) => Number(value || 0).toLocaleString();

const formatRemaining = (resource: any, suffix: string) => (
    resource?.unlimited ? 'Unlimited' : `${formatResourceNumber(resource?.remaining)} ${suffix}`
);

const resourceProgress = (resource: any) => {
    if (resource?.unlimited || !resource?.max) return 0;
    return Math.min(100, Math.max(0, (Number(resource.current || 0) / Number(resource.max || 1)) * 100));
};

const formatDateOnly = (value?: string) => {
    if (!value) return '-';
    return new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
};

const formatTimeOnly = (value?: string) => {
    if (!value) return '-';
    return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
};

const formatDateTime = (value?: string) => {
    if (!value) return '-';
    return new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const TeacherDashboard: React.FC = () => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const [tab, setTab] = useState<TabKey>('overview');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [dashboard, setDashboard] = useState<any>({});
    const [classrooms, setClassrooms] = useState<any[]>([]);
    const [selectedClassroomId, setSelectedClassroomId] = useState('');
    const [students, setStudents] = useState<any[]>([]);
    const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
    const [questionAnalytics, setQuestionAnalytics] = useState<any>({ total: 0, categoryDistribution: [] });
    const [questions, setQuestions] = useState<any[]>([]);
    const [questionPage, setQuestionPage] = useState(1);
    const [questionLimit] = useState(10);
    const [questionTotal, setQuestionTotal] = useState(0);
    const [questionSearch, setQuestionSearch] = useState('');
    const [questionSubject, setQuestionSubject] = useState('');
    const [questionDifficulty, setQuestionDifficulty] = useState('');
    const [questionSort, setQuestionSort] = useState('createdAt');
    const [questionSortOrder, setQuestionSortOrder] = useState('desc');
    const [mcqCategories, setMcqCategories] = useState<any[]>([]);
    const [assessments, setAssessments] = useState<any[]>([]);
    const [deleteAssessmentId, setDeleteAssessmentId] = useState<string | null>(null);
    const [deleteConfirmationStep, setDeleteConfirmationStep] = useState<number>(0);
    const [results, setResults] = useState<any | null>(null);
    const [live, setLive] = useState<any | null>(null);
    const [selectedResultRow, setSelectedResultRow] = useState<any | null>(null);
    const [resultsModalOpen, setResultsModalOpen] = useState(false);
    const [resultSearch, setResultSearch] = useState('');
    const [resultStatusFilter, setResultStatusFilter] = useState('all');
    const [resultReleaseFilter, setResultReleaseFilter] = useState('all');
    const [resultSort, setResultSort] = useState<ResultSortKey>('percentage');
    const [resultSortOrder, setResultSortOrder] = useState<'asc' | 'desc'>('desc');
    const [resultPage, setResultPage] = useState(1);
    const [teacherAnalytics, setTeacherAnalytics] = useState<any | null>(null);
    const [analyticsView, setAnalyticsView] = useState<AnalyticsTabKey>('overview');
    const [studentAnalyticsSearch, setStudentAnalyticsSearch] = useState('');
    const [studentAnalyticsStatus, setStudentAnalyticsStatus] = useState('all');
    const [studentAnalyticsSort, setStudentAnalyticsSort] = useState('averageScore-desc');
    const [studentAnalyticsPage, setStudentAnalyticsPage] = useState(1);
    const [quizDetail, setQuizDetail] = useState<any | null>(null);
    const [globalCategories] = useState<any[]>([]);
    const [classroomForm, setClassroomForm] = useState({ name: '', description: '', academicSession: '', status: 'active' });
    const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
    const [inviteFile, setInviteFile] = useState<File | null>(null);
    const [inviteFileInputKey, setInviteFileInputKey] = useState(0);
    const [inviteSummary, setInviteSummary] = useState<any | null>(null);
    const [selectedInvitationAssessmentId, setSelectedInvitationAssessmentId] = useState('');
    const [questionFile, setQuestionFile] = useState<File | null>(null);
    const [manualQuestionForm, setManualQuestionForm] = useState({
        questionText: '',
        optionA: '',
        optionB: '',
        optionC: '',
        optionD: '',
        correctAnswer: '0',
        subject: '',
        difficulty: DEFAULT_QUESTION_DIFFICULTY as QuestionDifficulty,
        marks: 1 as number | '',
        explanation: ''
    });
    const [distributionRows, setDistributionRows] = useState<DistributionRow[]>([]);
    const [assessmentForm, setAssessmentForm] = useState({
        name: '',
        classroomId: '',
        questionSource: 'teacher',
        globalCategoryId: '',
        assessmentDate: defaultAssessmentSchedule.date,
        assessmentStartTime: defaultAssessmentSchedule.startTime,
        assessmentEndTime: defaultAssessmentSchedule.endTime,
        durationMinutes: 20 as number | '',
        passingPercentage: 50 as number | '',
        attemptLimit: 1 as number | '',
        distributionMode: 'count',
        totalQuestions: 20 as number | '',
        randomizationMode: 'secure',
        lateJoinPolicy: 'allow',
        resultPolicy: 'manual',
    });

    const selectedClassroom = useMemo(
        () => classrooms.find((classroom) => classroom._id === selectedClassroomId),
        [classrooms, selectedClassroomId]
    );
    const invitationAssessments = useMemo(
        () => assessments.filter((assessment) => {
            const classroomId = assessment.classroomId?._id || assessment.classroomId;
            return !selectedClassroomId || classroomId === selectedClassroomId;
        }),
        [assessments, selectedClassroomId]
    );
    const selectedInvitationAssessment = useMemo(
        () => invitationAssessments.find((assessment) => assessment._id === selectedInvitationAssessmentId),
        [invitationAssessments, selectedInvitationAssessmentId]
    );
    const hasClassrooms = classrooms.length > 0;
    const hasQuestions = Number(questionAnalytics.total || 0) > 0;
    const hasAssessments = assessments.length > 0;
    const hasStudents = Number(dashboard.students || 0) > 0;
    const resultRows = useMemo(() => {
        const rows = results?.rows || [];
        const query = resultSearch.trim().toLowerCase();
        const filtered = rows.filter((row: any) => {
            const matchesSearch = !query || `${row.name} ${row.email}`.toLowerCase().includes(query);
            const matchesStatus = resultStatusFilter === 'all'
                || (resultStatusFilter === 'attempted' && row.attemptId)
                || (resultStatusFilter === 'absent' && !row.attemptId)
                || (resultStatusFilter === 'pass' && row.passed === 'Pass')
                || (resultStatusFilter === 'fail' && row.passed === 'Fail');
            const matchesRelease = resultReleaseFilter === 'all' || String(row.resultReleased || '').toLowerCase() === resultReleaseFilter;
            return matchesSearch && matchesStatus && matchesRelease;
        });
        return [...filtered].sort((a: any, b: any) => {
            const direction = resultSortOrder === 'asc' ? 1 : -1;
            const valueFor = (row: any) => {
                if (resultSort === 'submittedAt') return row.submissionTime ? new Date(row.submissionTime).getTime() : 0;
                if (resultSort === 'score') return Number(row.score || 0);
                if (resultSort === 'percentage') return Number(row.percentage || 0);
                if (resultSort === 'timeTaken') return Number(row.timeTaken || 0);
                return String(row.name || '').toLowerCase();
            };
            const av = valueFor(a);
            const bv = valueFor(b);
            if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * direction;
            return (Number(av) - Number(bv)) * direction;
        });
    }, [results, resultSearch, resultStatusFilter, resultReleaseFilter, resultSort, resultSortOrder]);
    const resultPageSize = 8;
    const resultTotalPages = Math.max(1, Math.ceil(resultRows.length / resultPageSize));
    const pagedResultRows = resultRows.slice((resultPage - 1) * resultPageSize, resultPage * resultPageSize);
    const analyticsStudentRows = useMemo(() => {
        const rows = teacherAnalytics?.students?.table || [];
        const query = studentAnalyticsSearch.trim().toLowerCase();
        const [sortKey, sortDirection] = studentAnalyticsSort.split('-');
        const filtered = rows.filter((row: any) => {
            const matchesSearch = !query || `${row.name} ${row.email}`.toLowerCase().includes(query);
            const matchesStatus = studentAnalyticsStatus === 'all' || row.status === studentAnalyticsStatus;
            return matchesSearch && matchesStatus;
        });
        return [...filtered].sort((a: any, b: any) => {
            const direction = sortDirection === 'asc' ? 1 : -1;
            const av = a[sortKey];
            const bv = b[sortKey];
            if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * direction;
            return (Number(av || 0) - Number(bv || 0)) * direction;
        });
    }, [teacherAnalytics, studentAnalyticsSearch, studentAnalyticsStatus, studentAnalyticsSort]);
    const analyticsStudentPageSize = 10;
    const analyticsStudentTotalPages = Math.max(1, Math.ceil(analyticsStudentRows.length / analyticsStudentPageSize));
    const pagedAnalyticsStudentRows = analyticsStudentRows.slice((studentAnalyticsPage - 1) * analyticsStudentPageSize, studentAnalyticsPage * analyticsStudentPageSize);

    const getWorkflowState = (key: TabKey): WorkflowState => {
        if (key === 'classrooms') return hasClassrooms ? 'complete' : 'current';
        if (key === 'questions') return !hasClassrooms ? 'locked' : hasQuestions ? 'complete' : 'current';
        if (key === 'assessments') return !hasClassrooms || !hasQuestions ? 'locked' : hasAssessments ? 'complete' : 'current';
        if (key === 'students') return !hasClassrooms || !hasQuestions || !hasAssessments ? 'locked' : hasStudents ? 'complete' : 'current';
        return 'current';
    };

    const showMessage = (text: string) => {
        setError('');
        setMessage(text);
        window.setTimeout(() => setMessage(''), 4500);
    };

    const showError = (err: any) => {
        const data = err.response?.data;
        const detailItems = Array.isArray(data?.errors)
            ? data.errors
            : Array.isArray(data?.results)
                ? data.results.map((item: any) => {
                    const row = item.row ? `Row ${item.row}: ` : '';
                    const who = [item.name, item.email].filter(Boolean).join(' - ');
                    return `${row}${who ? `${who}: ` : ''}${item.message || item.status}`;
                })
                : [];
        const details = detailItems.length ? ` ${detailItems.slice(0, 6).join(' ')}` : '';
        setMessage('');
        setError(`${data?.message || err.message || 'Action failed.'}${details}`);
    };

    const getAssessmentStatus = (assessment: any) => {
        if (assessment.statusLabel) return assessment.statusLabel;
        if (assessment.computedStatus === 'scheduled') return 'Scheduled';
        if (assessment.computedStatus === 'live') return 'Live';
        if (assessment.computedStatus === 'completed') return 'Completed';
        if (assessment.computedStatus === 'cancelled') return 'Cancelled';
        if (assessment.status === 'draft') return 'Draft';
        if (assessment.status === 'cancelled') return 'Cancelled';
        const now = new Date();
        const start = new Date(assessment.startTime);
        const end = new Date(assessment.endTime);
        if (now < start) return 'Scheduled';
        if (now >= start && now <= end) return 'Live';
        if (now > end) return 'Completed';
        return 'Draft';
    };

    const getAssessmentStatusClass = (status: string) => {
        if (status === 'Live') return 'badge-success';
        if (status === 'Scheduled') return 'badge-info';
        if (status === 'Completed') return 'badge-secondary';
        if (status === 'Cancelled') return 'badge-danger';
        return 'badge-warning';
    };

    const getInvitationStatus = (row: any) => {
        if (row.status === 'removed') return 'Deleted';
        return row.studentId?.emailVerified ? 'Accepted' : 'Pending';
    };

    const getInvitationStatusClass = (status: string) => {
        if (status === 'Accepted') return 'badge-success';
        if (status === 'Pending') return 'badge-warning';
        return 'badge-secondary';
    };

    const initiateDelete = (id: string) => {
        setDeleteAssessmentId(id);
        setDeleteConfirmationStep(1);
    };

    const executeDelete = async () => {
        if (!deleteAssessmentId) return;
        try {
            await api.delete(`/teacher/assessments/${deleteAssessmentId}`);
            showMessage('Assessment deleted successfully');
            await loadAll();
        } catch (err) {
            showError(err);
        } finally {
            setDeleteAssessmentId(null);
            setDeleteConfirmationStep(0);
        }
    };

    const cancelDelete = () => {
        setDeleteAssessmentId(null);
        setDeleteConfirmationStep(0);
    };

    const confirmDeleteStep1 = () => {
        setDeleteConfirmationStep(2);
    };

    const fetchQuestions = async () => {
        try {
            const query = new URLSearchParams({
                page: questionPage.toString(),
                limit: questionLimit.toString(),
                sortBy: questionSort,
                sortOrder: questionSortOrder,
            });
            if (questionSearch) query.append('search', questionSearch);
            if (questionSubject) query.append('subject', questionSubject);
            if (questionDifficulty) query.append('difficulty', questionDifficulty);

            const res = await api.get(`/teacher/questions?${query.toString()}`);
            setQuestions(res.data.items || []);
            setQuestionTotal(res.data.total || 0);
        } catch (err) {
            console.error('Failed to fetch questions', err);
        }
    };

    const loadAll = async () => {
        setLoading(true);
        try {
            const [dashRes, classRes, qaRes, assessmentRes, catRes, analyticsRes] = await Promise.all([
                api.get('/teacher/dashboard'),
                api.get('/teacher/classrooms'),
                api.get('/teacher/questions/analytics'),
                api.get('/teacher/assessments'),
                api.get('/teacher/questions/categories'),
                api.get('/teacher/analytics/overview'),
            ]);
            setDashboard(dashRes.data);
            setClassrooms(classRes.data);
            setQuestionAnalytics(qaRes.data);
            setAssessments(assessmentRes.data);
            setMcqCategories(catRes.data);
            setTeacherAnalytics(analyticsRes.data);

            const firstClassroomId = selectedClassroomId || classRes.data[0]?._id || '';
            setSelectedClassroomId(firstClassroomId);
            setAssessmentForm((prev) => ({ ...prev, classroomId: prev.classroomId || firstClassroomId }));
            const nextInvitationAssessment = (assessmentRes.data || []).find((assessment: any) => {
                const classroomId = assessment.classroomId?._id || assessment.classroomId;
                return classroomId === firstClassroomId;
            }) || assessmentRes.data[0];
            setSelectedInvitationAssessmentId((current) => {
                const stillExists = (assessmentRes.data || []).some((assessment: any) => assessment._id === current);
                return stillExists ? current : nextInvitationAssessment?._id || '';
            });

            if (distributionRows.length === 0 && catRes.data[0]?.category) {
                setDistributionRows([{ category: catRes.data[0].category, value: 10 }]);
            }
            await fetchQuestions();
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!loading) {
            fetchQuestions();
        }
    }, [questionPage, questionLimit, questionSearch, questionSubject, questionDifficulty, questionSort, questionSortOrder]);

    useEffect(() => {
        loadAll().catch(showError);
    }, []);

    useEffect(() => {
        if (!selectedClassroomId) return;
        setSelectedStudentIds([]);
        api.get(`/teacher/classrooms/${selectedClassroomId}/students`).then((res) => setStudents(res.data)).catch(showError);
    }, [selectedClassroomId]);

    useEffect(() => {
        if (!selectedClassroomId || invitationAssessments.length === 0) {
            setSelectedInvitationAssessmentId('');
            return;
        }
        if (!invitationAssessments.some((assessment) => assessment._id === selectedInvitationAssessmentId)) {
            setSelectedInvitationAssessmentId(invitationAssessments[0]._id);
        }
    }, [selectedClassroomId, invitationAssessments, selectedInvitationAssessmentId]);

    useEffect(() => {
        setResultPage(1);
    }, [resultSearch, resultStatusFilter, resultReleaseFilter, resultSort, resultSortOrder]);

    useEffect(() => {
        setStudentAnalyticsPage(1);
    }, [studentAnalyticsSearch, studentAnalyticsStatus, studentAnalyticsSort]);

    const handleCreateManualQuestion = async (event: React.FormEvent) => {
        event.preventDefault();
        if (manualQuestionForm.marks === '') {
            alert('Please enter a value for Marks.');
            return;
        }
        try {
            const payload = {
                questionText: manualQuestionForm.questionText,
                options: [
                    manualQuestionForm.optionA,
                    manualQuestionForm.optionB,
                    manualQuestionForm.optionC,
                    manualQuestionForm.optionD,
                ],
                correctAnswer: Number(manualQuestionForm.correctAnswer),
                subject: manualQuestionForm.subject,
                difficulty: manualQuestionForm.difficulty,
                marks: manualQuestionForm.marks,
                explanation: manualQuestionForm.explanation,
            };
            await api.post('/teacher/questions', payload);
            setManualQuestionForm({
                questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: '0', subject: '', difficulty: DEFAULT_QUESTION_DIFFICULTY, marks: 1, explanation: ''
            });
            showMessage('Question added manually successfully');
            await loadAll();
        } catch (err) {
            showError(err);
        }
    };

    const selectedCategoryList = assessmentForm.questionSource === 'teacher' ? mcqCategories : globalCategories;

    const createClassroom = async (event: React.FormEvent) => {
        event.preventDefault();
        try {
            await api.post('/teacher/classrooms', classroomForm);
            setClassroomForm({ name: '', description: '', academicSession: '', status: 'active' });
            showMessage('Classroom created');
            await loadAll();
        } catch (err) {
            showError(err);
        }
    };

    const refreshClassroomStudents = async () => {
        if (!selectedClassroomId) return;
        const studentsRes = await api.get(`/teacher/classrooms/${selectedClassroomId}/students`);
        setStudents(studentsRes.data);
        await loadAll();
    };

    const summarizeInviteResponse = (res: any, fallback: string) => {
        const summary = res.data.summary;
        setInviteSummary({ summary, results: res.data.results || [] });
        if (summary) {
            return `Imported: ${summary.imported}. Invitations Sent: ${summary.invitationsSent}. Skipped: ${summary.skipped}. Failed: ${summary.failed}.`;
        }
        return fallback;
    };

    const inviteStudent = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedClassroomId) return;
        const name = inviteForm.name.trim();
        const email = inviteForm.email.trim();
        if (!name || !email) {
            setMessage('');
            setError('Student name and email address are required.');
            return;
        }
        if (!selectedInvitationAssessmentId) {
            setMessage('');
            setError('Select an assessment before sending invitations.');
            return;
        }
        try {
            const res = await api.post(`/teacher/classrooms/${selectedClassroomId}/invite`, {
                assessmentId: selectedInvitationAssessmentId,
                students: [{ name, email }],
            });
            setInviteForm({ name: '', email: '' });
            showMessage(summarizeInviteResponse(res, 'Student invited successfully'));
            await refreshClassroomStudents();
        } catch (err) {
            showError(err);
        }
    };

    const importStudents = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedClassroomId) return;
        if (!inviteFile) {
            setMessage('');
            setError('Please select a CSV or XLSX student file.');
            return;
        }
        if (!selectedInvitationAssessmentId) {
            setMessage('');
            setError('Select an assessment before importing students.');
            return;
        }
        try {
            const data = new FormData();
            data.append('file', inviteFile);
            data.append('assessmentId', selectedInvitationAssessmentId);
            const res = await api.post(`/teacher/classrooms/${selectedClassroomId}/invite`, data, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setInviteFile(null);
            setInviteFileInputKey((key) => key + 1);
            showMessage(summarizeInviteResponse(res, 'Student import completed'));
            await refreshClassroomStudents();
        } catch (err) {
            showError(err);
        }
    };

    const removeStudent = async (studentId: string) => {
        if (!selectedClassroomId || !confirm('Remove this student from the classroom?')) return;
        try {
            await api.delete(`/teacher/classrooms/${selectedClassroomId}/students/${studentId}`);
            showMessage('Student removed from classroom');
            const studentsRes = await api.get(`/teacher/classrooms/${selectedClassroomId}/students`);
            setStudents(studentsRes.data);
            await loadAll();
        } catch (err) {
            showError(err);
        }
    };

    const removeSelectedStudents = async () => {
        if (!selectedClassroomId || selectedStudentIds.length === 0) return;
        if (!confirm(`Remove ${selectedStudentIds.length} selected student(s) from the classroom?`)) return;
        try {
            const res = await api.post(`/teacher/classrooms/${selectedClassroomId}/students/remove`, { studentIds: selectedStudentIds });
            showMessage(`${res.data.removed || 0} student(s) removed`);
            setSelectedStudentIds([]);
            const studentsRes = await api.get(`/teacher/classrooms/${selectedClassroomId}/students`);
            setStudents(studentsRes.data);
            await loadAll();
        } catch (err) {
            showError(err);
        }
    };

    const uploadQuestions = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!questionFile) return;
        try {
            const data = new FormData();
            data.append('file', questionFile);
            const res = await api.post('/teacher/questions/upload', data, { headers: { 'Content-Type': 'multipart/form-data' } });
            setQuestionFile(null);
            showMessage(`${res.data.inserted} MCQ(s) uploaded`);
            await loadAll();
        } catch (err) {
            showError(err);
        }
    };

    const createAssessment = async (event: React.FormEvent) => {
        event.preventDefault();
        if (assessmentForm.durationMinutes === '') {
            setMessage('');
            setError('Duration is required.');
            return;
        }
        if (assessmentForm.passingPercentage === '') {
            setMessage('');
            setError('Passing percentage is required.');
            return;
        }
        if (assessmentForm.attemptLimit === '') {
            setMessage('');
            setError('Attempt limit is required.');
            return;
        }
        if (assessmentForm.distributionMode === 'percentage' && assessmentForm.totalQuestions === '') {
            setMessage('');
            setError('Total questions is required.');
            return;
        }
        if (distributionRows.some(row => row.value === '')) {
            setMessage('');
            setError('Please enter a value for all category distributions.');
            return;
        }
        try {
            const startTime = new Date(`${assessmentForm.assessmentDate}T${assessmentForm.assessmentStartTime}`);
            const endTime = new Date(`${assessmentForm.assessmentDate}T${assessmentForm.assessmentEndTime}`);
            const now = new Date();
            if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
                setMessage('');
                setError('Valid assessment date, start time, and end time are required.');
                return;
            }
            if (endTime <= startTime) {
                setMessage('');
                setError('Assessment end time must be after the start time.');
                return;
            }
            if (endTime <= now) {
                setMessage('');
                setError('This assessment schedule has already expired.');
                return;
            }
            if (startTime <= now) {
                setMessage('');
                setError('Assessment start time must be in the future.');
                return;
            }
            const categoryDistribution = distributionRows
                .filter((row) => row.category && row.value !== '' && Number(row.value) > 0)
                .map((row) => ({ category: row.category, subject: row.category, value: Number(row.value) }));
            const payload = {
                ...assessmentForm,
                durationMinutes: Number(assessmentForm.durationMinutes),
                passingPercentage: Number(assessmentForm.passingPercentage),
                attemptLimit: Number(assessmentForm.attemptLimit),
                totalQuestions: Number(assessmentForm.totalQuestions),
                categoryDistribution,
                subjectDistribution: categoryDistribution,
            };
            await api.post('/teacher/assessments/validate', payload);
            await api.post('/teacher/assessments', payload);
            showMessage('Assessment scheduled');
            await loadAll();
            setTab('students');
        } catch (err) {
            showError(err);
        }
    };

    const loadResults = async (assessmentId: string) => {
        try {
            const [resultsRes, liveRes] = await Promise.all([
                api.get(`/teacher/assessments/${assessmentId}/results`),
                api.get(`/teacher/assessments/${assessmentId}/live`),
            ]);
            setResults(resultsRes.data);
            setLive(liveRes.data);
            setSelectedResultRow((resultsRes.data.rows || []).find((row: any) => row.attemptId) || null);
            setResultSearch('');
            setResultStatusFilter('all');
            setResultReleaseFilter('all');
            setResultSort('percentage');
            setResultSortOrder('desc');
            setResultPage(1);
            setResultsModalOpen(true);
        } catch (err) {
            showError(err);
        }
    };

    const closeResultsModal = () => {
        setResultsModalOpen(false);
        setSelectedResultRow(null);
    };

    const releaseResults = async (assessmentId: string) => {
        try {
            await api.post(`/teacher/assessments/${assessmentId}/release-results`);
            showMessage('Results released to students');
            await loadAll();
            if (results?.assessment?._id === assessmentId) await loadResults(assessmentId);
        } catch (err) {
            showError(err);
        }
    };

    const hideResults = async (assessmentId: string) => {
        try {
            await api.post(`/teacher/assessments/${assessmentId}/hide-results`);
            showMessage('Results hidden from students');
            await loadAll();
            if (results?.assessment?._id === assessmentId) await loadResults(assessmentId);
        } catch (err) {
            showError(err);
        }
    };

    const resendInvitation = async (row: any) => {
        if (!selectedClassroomId || !selectedInvitationAssessmentId) return;
        const student = row.studentId || {};
        const name = student.fullName || row.invitedName || student.username || row.invitedEmail;
        const email = student.email || row.invitedEmail;
        if (!name || !email) {
            setMessage('');
            setError('Student name and email are required to resend an invitation.');
            return;
        }
        try {
            const res = await api.post(`/teacher/classrooms/${selectedClassroomId}/invite`, {
                assessmentId: selectedInvitationAssessmentId,
                resend: true,
                students: [{ name, email }],
            });
            showMessage(summarizeInviteResponse(res, 'Invitation resent successfully'));
            await refreshClassroomStudents();
        } catch (err) {
            showError(err);
        }
    };

    const duplicateAssessment = async (assessmentId: string) => {
        try {
            await api.post(`/teacher/assessments/${assessmentId}/duplicate`, { name: 'Duplicated Assessment' });
            showMessage('Assessment duplicated');
            await loadAll();
        } catch (err) {
            showError(err);
        }
    };

    const downloadBlob = async (urlPath: string, filename: string) => {
        try {
            const res = await api.get(urlPath, { responseType: 'blob' });
            const url = URL.createObjectURL(res.data);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
            URL.revokeObjectURL(url);
        } catch (err) {
            showError(err);
        }
    };

    const openQuizDetail = async (quiz: any) => {
        try {
            const res = await api.get(`/teacher/assessments/${quiz.assessmentId}/results`);
            setQuizDetail({ quiz, report: res.data });
        } catch (err) {
            showError(err);
        }
    };

    const handleLogout = () => {
        logout();
        navigate('/teacher/login');
    };

    const updateDistributionRow = (index: number, patch: Partial<DistributionRow>) => {
        setDistributionRows((rows) => rows.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
    };

    const addDistributionRow = () => {
        const used = new Set(distributionRows.map((row) => row.category));
        const nextCategory = selectedCategoryList.find((item: any) => !used.has(item.category))?.category || selectedCategoryList[0]?.category || '';
        setDistributionRows((rows) => [...rows, { category: nextCategory, value: assessmentForm.distributionMode === 'percentage' ? 10 : 1 }]);
    };

    const teacherResources = dashboard.resources || {};
    const assessmentCreditResource = teacherResources.credits?.assessment || {};
    const emailCreditResource = teacherResources.credits?.email || {};
    const resourceLimits = teacherResources.limits || {};
    const acceptedInvitations = students.filter((row) => row.studentId?.emailVerified).length;
    const pendingInvitations = Math.max(0, students.length - acceptedInvitations);
    const assessmentParticipants = Number(selectedInvitationAssessment?.submittedCount || 0);
    const remainingInvitations = resourceLimits.students?.unlimited
        ? 'Unlimited'
        : formatResourceNumber(resourceLimits.students?.remaining);
    const selectedAssessmentStatus = selectedInvitationAssessment ? getAssessmentStatus(selectedInvitationAssessment) : 'Scheduled';
    const invitationSummaryStats = inviteSummary?.summary || {};

    const renderAnalyticsContent = () => {
        if (!teacherAnalytics) {
            return (
                <div className="card">
                    <div className="card-body">Loading analytics...</div>
                </div>
            );
        }
        const overview = teacherAnalytics.overview || {};
        const kpis = [
            ['Total Students', overview.totalStudents],
            ['Total Classrooms', overview.totalClassrooms],
            ['Total Assessments', overview.totalAssessments],
            ['Total Submissions', overview.totalSubmissions],
            ['Average Score', formatPercent(overview.averageScore)],
            ['Participation', formatPercent(overview.participationRate)],
            ['Pass Percentage', formatPercent(overview.passPercentage)],
            ['Attendance', formatPercent(overview.attendancePercentage)],
            ['Credits Used', overview.creditsUsed],
            ['Credits Remaining', overview.creditsRemaining],
            ['Top Performer', overview.topPerformer],
            ['At-Risk Students', overview.atRiskStudentsCount],
        ];
        const topics = teacherAnalytics.topicMastery?.topics || [];
        const questions = teacherAnalytics.questionAnalytics || {};
        const attendance = teacherAnalytics.attendanceAnalytics || {};
        const time = teacherAnalytics.timeAnalytics || {};
        const quizzes = teacherAnalytics.quizzes?.cards || [];
        const quizTrend = teacherAnalytics.quizzes?.trend || [];
        const topicRecommendations = teacherAnalytics.topicMastery?.recommendations || [];
        const scoreDistribution = teacherAnalytics.scoreDistribution || [];

        return (
            <div className="teacher-analytics-shell">
                <section className="analytics-hero">
                    <div>
                        <p className="teacher-kicker">Teacher Intelligence</p>
                        <h2>Enterprise Analytics</h2>
                        <p>Monitor achievement, participation, weak areas, question quality, and resource usage across your classrooms.</p>
                    </div>
                    <div className="analytics-export-group">
                        <button className="btn btn-secondary btn-sm" onClick={() => downloadBlob('/teacher/analytics/export?format=csv', 'teacher-analytics.csv')}>CSV</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => downloadBlob('/teacher/analytics/export?format=xlsx', 'teacher-analytics.xlsx')}>Excel</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => downloadBlob('/teacher/analytics/export?format=pdf', 'teacher-analytics.pdf')}>PDF</button>
                    </div>
                </section>

                <div className="analytics-tabs">
                    {analyticsTabs.map((item) => (
                        <button key={item.key} className={analyticsView === item.key ? 'active' : ''} onClick={() => setAnalyticsView(item.key)}>
                            {item.label}
                        </button>
                    ))}
                </div>

                {analyticsView === 'overview' && (
                    <>
                        <section className="analytics-kpi-grid">
                            {kpis.map(([label, value]) => (
                                <div className="analytics-kpi-card" key={label}>
                                    <span>{label}</span>
                                    <strong>{formatMetric(value)}</strong>
                                </div>
                            ))}
                        </section>
                        <section className="analytics-grid two-columns">
                            <div className="analytics-panel wide">
                                <div className="analytics-panel-header">
                                    <h3>Weekly Performance Trend</h3>
                                    <span>Last six weeks</span>
                                </div>
                                <MiniLineChart
                                    data={teacherAnalytics.weeklyPerformance || []}
                                    keys={[
                                        { key: 'classAverage', label: 'Class Average', color: '#1f4e8c' },
                                        { key: 'topScore', label: 'Top Score', color: '#f97316' },
                                        { key: 'participation', label: 'Participation', color: '#16a34a' },
                                    ]}
                                />
                            </div>
                            <div className="analytics-panel">
                                <div className="analytics-panel-header">
                                    <h3>Score Distribution</h3>
                                    <span>Student count</span>
                                </div>
                                <BarList data={scoreDistribution} labelKey="range" valueKey="count" />
                            </div>
                            <div className="analytics-panel">
                                <div className="analytics-panel-header">
                                    <h3>Monthly Trends</h3>
                                    <span>Performance, pass rate, participation</span>
                                </div>
                                <MiniLineChart
                                    data={teacherAnalytics.monthlyTrends || []}
                                    keys={[
                                        { key: 'performance', label: 'Performance', color: '#1f4e8c' },
                                        { key: 'passRate', label: 'Pass Rate', color: '#f97316' },
                                        { key: 'participation', label: 'Participation', color: '#16a34a' },
                                    ]}
                                />
                            </div>
                            <div className="analytics-panel">
                                <div className="analytics-panel-header">
                                    <h3>Submission Trends</h3>
                                    <span>Weekly submissions</span>
                                </div>
                                <BarList data={teacherAnalytics.submissionTrends || []} labelKey="label" valueKey="submissions" />
                            </div>
                        </section>
                        <section className="analytics-panel">
                            <div className="analytics-panel-header">
                                <h3>Student Snapshot Grid</h3>
                                <span>Quick academic health view</span>
                            </div>
                            <div className="student-snapshot-grid">
                                {(teacherAnalytics.studentSnapshots || []).map((student: any) => (
                                    <div className="student-snapshot-card" key={student.studentId}>
                                        <div>
                                            <strong>{student.name}</strong>
                                            <span>{student.email}</span>
                                        </div>
                                        <b>{student.averageScore}%</b>
                                        <ProgressMeter value={student.averageScore} />
                                        <span className={`analytics-status-pill ${getStudentStatusClass(student.status)}`}>{student.status}</span>
                                        <small>{student.trend >= 0 ? '+' : ''}{student.trend}% trend</small>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </>
                )}

                {analyticsView === 'students' && (
                    <>
                        {(teacherAnalytics.students?.atRisk || []).length > 0 && (
                            <section className="analytics-alert-panel">
                                <div>
                                    <h3>At-Risk Alert</h3>
                                    <p>{teacherAnalytics.students.atRisk.length} students are below the 65% threshold.</p>
                                </div>
                                <div className="analytics-alert-list">
                                    {teacherAnalytics.students.atRisk.slice(0, 4).map((student: any) => (
                                        <span key={`${student.email}-${student.averageScore}`}>{student.studentName} - {student.averageScore}% - {student.riskLevel}</span>
                                    ))}
                                </div>
                            </section>
                        )}
                        <section className="podium-grid">
                            {(teacherAnalytics.students?.topPerformers || []).map((student: any) => (
                                <div className={`podium-card rank-${student.rank}`} key={student.rank}>
                                    <span>Rank {student.rank}</span>
                                    <strong>{student.studentName}</strong>
                                    <p>{student.averageScore}% average</p>
                                    <small>{student.passRate}% pass rate - {student.assessmentsTaken} assessments</small>
                                </div>
                            ))}
                        </section>
                        <section className="analytics-panel">
                            <div className="analytics-table-toolbar">
                                <input className="form-input" placeholder="Search students..." value={studentAnalyticsSearch} onChange={(e) => setStudentAnalyticsSearch(e.target.value)} />
                                <select className="form-select" value={studentAnalyticsStatus} onChange={(e) => setStudentAnalyticsStatus(e.target.value)}>
                                    <option value="all">All statuses</option>
                                    <option value="Excellent">Excellent</option>
                                    <option value="Average">Average</option>
                                    <option value="Needs Attention">Needs Attention</option>
                                    <option value="No Attempts">No Attempts</option>
                                </select>
                                <select className="form-select" value={studentAnalyticsSort} onChange={(e) => setStudentAnalyticsSort(e.target.value)}>
                                    <option value="averageScore-desc">Average Score high to low</option>
                                    <option value="averageScore-asc">Average Score low to high</option>
                                    <option value="quizzesAttended-desc">Quizzes attended</option>
                                    <option value="trend-desc">Trend high to low</option>
                                </select>
                            </div>
                            <div className="table-responsive">
                                <table className="data-table">
                                    <thead><tr><th className="col-student-name">Student Name</th><th className="col-status">Average Score</th><th className="col-status">Quizzes Attended</th><th className="col-status">Pass %</th><th className="col-status">Trend %</th><th className="col-status">Streak</th><th className="col-status">Progress</th><th className="col-time">Last Activity</th><th className="col-status">Status</th><th className="col-actions">Actions</th></tr></thead>
                                    <tbody>{pagedAnalyticsStudentRows.map((student: any) => (
                                        <tr key={student.studentId}>
                                            <td><strong>{student.name}</strong><br /><span className="muted-cell">{student.email}</span></td>
                                            <td>{student.averageScore}%</td>
                                            <td>{student.quizzesAttended}</td>
                                            <td>{student.passRate}%</td>
                                            <td>{student.trend >= 0 ? '+' : ''}{student.trend}%</td>
                                            <td>{student.currentStreak}</td>
                                            <td><ProgressMeter value={student.progress} /></td>
                                            <td>{student.lastActivity ? formatDateTime(student.lastActivity) : '-'}</td>
                                            <td><span className={`analytics-status-pill ${getStudentStatusClass(student.status)}`}>{student.status}</span></td>
                                            <td><button className="btn btn-sm btn-secondary" onClick={() => setStudentAnalyticsSearch(student.email)}>Focus</button></td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                            <div className="analytics-pagination">
                                <span>Page {studentAnalyticsPage} of {analyticsStudentTotalPages}</span>
                                <button className="btn btn-sm btn-secondary" disabled={studentAnalyticsPage <= 1} onClick={() => setStudentAnalyticsPage((page) => page - 1)}>Previous</button>
                                <button className="btn btn-sm btn-secondary" disabled={studentAnalyticsPage >= analyticsStudentTotalPages} onClick={() => setStudentAnalyticsPage((page) => page + 1)}>Next</button>
                            </div>
                        </section>
                    </>
                )}

                {analyticsView === 'quizzes' && (
                    <>
                        <section className="analytics-panel">
                            <div className="analytics-panel-header"><h3>Quiz Trend Charts</h3><span>Average, attendance, submissions, pass rate</span></div>
                            <div className="quiz-trend-grid">
                                <BarList data={quizTrend} labelKey="quizName" valueKey="averageScore" suffix="%" />
                                <BarList data={quizTrend} labelKey="quizName" valueKey="attendanceRate" suffix="%" />
                            </div>
                        </section>
                        <section className="quiz-analytics-grid">
                            {quizzes.map((quiz: any) => (
                                <button className="quiz-analytics-card" key={quiz.assessmentId} onClick={() => openQuizDetail(quiz)}>
                                    <span className={`badge ${getAssessmentStatusClass(quiz.status)}`}>{quiz.status}</span>
                                    <h3>{quiz.quizName}</h3>
                                    <p>{quiz.classroomName}</p>
                                    <div className="quiz-card-metrics">
                                        <div><span>Questions</span><strong>{quiz.questions}</strong></div>
                                        <div><span>Average</span><strong>{quiz.averageScore}%</strong></div>
                                        <div><span>Top</span><strong>{quiz.topScore}%</strong></div>
                                        <div><span>Lowest</span><strong>{quiz.lowestScore}%</strong></div>
                                        <div><span>Submissions</span><strong>{quiz.submissionCount}</strong></div>
                                        <div><span>Attendance</span><strong>{quiz.attendanceRate}%</strong></div>
                                        <div><span>Pass</span><strong>{quiz.passRate}%</strong></div>
                                    </div>
                                </button>
                            ))}
                        </section>
                    </>
                )}

                {analyticsView === 'topics' && (
                    <section className="analytics-grid two-columns">
                        <div className="analytics-panel wide">
                            <div className="analytics-panel-header"><h3>Horizontal Mastery Bars</h3><span>Accuracy by topic</span></div>
                            <div className="topic-mastery-list">
                                {topics.map((topic: any) => (
                                    <div className={`topic-mastery-row ${topic.mastery.toLowerCase()}`} key={topic.topic}>
                                        <span>{topic.topic}</span>
                                        <ProgressMeter value={topic.accuracy} />
                                        <strong>{topic.accuracy}%</strong>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="analytics-panel">
                            <div className="analytics-panel-header"><h3>Category Mastery</h3><span>Attempt distribution</span></div>
                            <DonutChart data={topics.slice(0, 6)} labelKey="topic" valueKey="attempted" />
                        </div>
                        <div className="analytics-panel wide">
                            <div className="analytics-panel-header"><h3>Student x Topic Heatmap</h3><span>Strong, average, and weak areas</span></div>
                            <div className="analytics-heatmap">
                                <div className="heatmap-header"><span>Student</span>{(teacherAnalytics.topicMastery?.heatmapTopics || []).map((topic: string) => <b key={topic}>{topic}</b>)}</div>
                                {(teacherAnalytics.topicMastery?.heatmap || []).map((row: any) => (
                                    <div className="heatmap-row" key={row.studentName}>
                                        <span>{row.studentName}</span>
                                        {row.cells.map((cell: any) => <i title={`${cell.topic}: ${cell.accuracy ?? 'No data'}`} className={getHeatmapCellClass(cell.level)} key={cell.topic}>{cell.accuracy ?? '-'}</i>)}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="analytics-panel">
                            <div className="analytics-panel-header"><h3>Most Missed Topics</h3><span>Incorrect percentage</span></div>
                            <BarList data={teacherAnalytics.topicMastery?.mostMissedTopics || []} labelKey="topic" valueKey="incorrectRate" suffix="%" />
                        </div>
                        <div className="analytics-panel wide">
                            <div className="analytics-panel-header"><h3>Recommendations</h3><span>Data-driven classroom actions</span></div>
                            <div className="recommendation-list">
                                {topicRecommendations.length > 0 ? topicRecommendations.map((item: string) => <p key={item}>{item}</p>) : <p>Recommendations will appear after more assessment activity.</p>}
                            </div>
                        </div>
                    </section>
                )}

                {analyticsView === 'questions' && (
                    <section className="analytics-grid two-columns">
                        <div className="analytics-kpi-card"><span>Total Questions</span><strong>{questions.totalQuestions || 0}</strong></div>
                        <div className="analytics-kpi-card"><span>Average Question Marks</span><strong>{questions.averageQuestionMarks || 0}</strong></div>
                        <div className="analytics-panel">
                            <div className="analytics-panel-header"><h3>Category Distribution</h3><span>Question bank</span></div>
                            <DonutChart data={questions.categoryDistribution || []} labelKey="category" valueKey="count" />
                        </div>
                        <div className="analytics-panel">
                            <div className="analytics-panel-header"><h3>Difficulty Distribution</h3><span>Question bank</span></div>
                            <BarList data={questions.difficultyDistribution || []} labelKey="difficulty" valueKey="count" />
                        </div>
                        <div className="analytics-panel wide">
                            <div className="analytics-panel-header"><h3>Most Missed Questions</h3><span>Usage and correctness</span></div>
                            <div className="table-responsive">
                                <table className="data-table">
                                    <thead><tr><th className="cell-wrap">Question</th><th className="col-classroom">Category</th><th className="col-status">Difficulty</th><th className="col-status">Correct %</th><th className="col-status">Incorrect %</th><th className="col-status">Usage</th><th className="col-status">Marks</th></tr></thead>
                                    <tbody>{(questions.mostMissedQuestions || []).map((row: any) => (
                                        <tr key={`${row.questionText}-${row.usageCount}`}>
                                            <td>{row.questionText}</td><td>{row.category}</td><td>{row.difficulty}</td><td>{row.correctRate}%</td><td>{row.incorrectRate}%</td><td>{row.usageCount}</td><td>{row.marks}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        </div>
                    </section>
                )}

                {analyticsView === 'attendance' && (
                    <section className="analytics-grid two-columns">
                        {Object.entries(attendance).map(([key, value]) => (
                            <div className="analytics-kpi-card" key={key}><span>{metricLabel(key)}</span><strong>{formatMetric(value)}</strong></div>
                        ))}
                        <div className="analytics-panel wide">
                            <div className="analytics-panel-header"><h3>Attendance Analytics</h3><span>Present, absent, late joiners</span></div>
                            <BarList data={[
                                { label: 'Present Students', value: attendance.presentStudents || 0 },
                                { label: 'Absent Students', value: attendance.absentStudents || 0 },
                                { label: 'Late Joiners', value: attendance.lateJoiners || 0 },
                            ]} labelKey="label" valueKey="value" />
                        </div>
                    </section>
                )}

                {analyticsView === 'time' && (
                    <section className="analytics-grid two-columns">
                        <div className="analytics-kpi-card"><span>Average Time Per Question</span><strong>{time.averageTimePerQuestion}</strong></div>
                        <div className="analytics-kpi-card"><span>Average Completion Time</span><strong>{time.averageCompletionTime}</strong></div>
                        <div className="analytics-panel">
                            <div className="analytics-panel-header"><h3>Fastest Students</h3><span>Average completion time</span></div>
                            <div className="time-list">{(time.fastestStudents || []).map((row: any) => <p key={row.studentName}><span>{row.studentName}</span><strong>{row.averageTime}</strong></p>)}</div>
                        </div>
                        <div className="analytics-panel">
                            <div className="analytics-panel-header"><h3>Slowest Students</h3><span>May need support</span></div>
                            <div className="time-list">{(time.slowestStudents || []).map((row: any) => <p key={row.studentName}><span>{row.studentName}</span><strong>{row.averageTime}</strong></p>)}</div>
                        </div>
                    </section>
                )}

                {analyticsView === 'classrooms' && (
                    <section className="analytics-panel">
                        <div className="analytics-panel-header"><h3>Classroom Comparison</h3><span>Average score, pass rate, attendance, completion</span></div>
                        <div className="table-responsive">
                            <table className="data-table">
                                <thead><tr><th className="col-classroom">Classroom</th><th className="col-status">Average Score</th><th className="col-status">Pass %</th><th className="col-status">Attendance %</th><th className="col-status">Completion %</th><th className="col-status">Submissions</th><th className="col-status">Assessments</th></tr></thead>
                                <tbody>{(teacherAnalytics.classroomComparison || []).map((row: any) => (
                                    <tr key={row.classroomId}>
                                        <td><strong>{row.classroomName}</strong></td>
                                        <td>{row.averageScore}%</td>
                                        <td>{row.passRate}%</td>
                                        <td>{row.attendanceRate}%</td>
                                        <td>{row.completionRate}%</td>
                                        <td>{row.submissions}</td>
                                        <td>{row.assessments}</td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    </section>
                )}
            </div>
        );
    };

    const navItems: { key: TabKey; label: string; icon: IconName }[] = [
        { key: 'overview', label: 'Overview', icon: 'overview' },
        { key: 'classrooms', label: 'Classrooms', icon: 'classrooms' },
        { key: 'questions', label: 'Question Bank', icon: 'questions' },
        { key: 'assessments', label: 'Assessments', icon: 'assessments' },
        { key: 'students', label: 'Students', icon: 'students' },
        { key: 'analytics', label: 'Analytics', icon: 'analytics' },
        { key: 'profile', label: 'My Profile', icon: 'profile' },
    ];

    return (
        <div className="admin-layout">
            {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
            <aside className={`admin-sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
                <div className="sidebar-brand">
                    <HomeLogoLink imgClassName="sidebar-brand-logo" />
                    <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)} aria-label="Close sidebar">
                        <Icon name="close" />
                    </button>
                </div>
                <nav className="sidebar-nav">
                    <div className="sidebar-section-label">Teacher</div>
                    {navItems.map((item) => (
                        <button
                            key={item.key}
                            className={`sidebar-nav-item ${tab === item.key ? 'active' : ''}`}
                            onClick={() => {
                                setTab(item.key);
                                setSidebarOpen(false);
                            }}
                        >
                            <Icon name={item.icon} />
                            {item.label}
                        </button>
                    ))}
                </nav>
                <div className="sidebar-footer">
                    <button className="sidebar-nav-item" onClick={handleLogout}><Icon name="logout" />Logout</button>
                </div>
            </aside>
            <div className="admin-main">
                <header className="admin-topbar">
                    <div className="topbar-left">
                        <BackHomeButton />
                        <div className="topbar-titles">
                            <h1 className="topbar-title">Teacher Workspace</h1>
                            <span className="topbar-subtitle">Manage classrooms, assessments and students.</span>
                        </div>
                    </div>
                    <div className="topbar-user">
                        <div className="topbar-avatar">{user?.fullName?.charAt(0) || user?.username?.charAt(0)}</div>
                        <span className="topbar-username">{user?.fullName || user?.username}</span>
                        <button className="btn btn-accent btn-sm" onClick={handleLogout}>Logout</button>
                        <button className="topbar-menu-btn" onClick={() => setSidebarOpen(true)} aria-label="Open sidebar">
                            <Icon name="menu" />
                        </button>
                    </div>
                </header>
                <main className="admin-content">
                    {message && <div className="alert alert-success">{message}</div>}
                    {error && <div className="alert alert-error">{error}</div>}
                    {loading ? (
                        <div className="loading-overlay"><div className="loading-spinner" />Loading teacher workspace...</div>
                    ) : (
                        <>
                            {tab === 'overview' && (
                                <div className="teacher-overview">
                                    <section className="teacher-workflow-hero">
                                        <div>
                                            <p className="teacher-kicker">Teacher Workspace</p>
                                            <h2>Assessment workflow</h2>
                                            <p>Move through classroom setup, question banking, scheduling, and invitations in order.</p>
                                        </div>
                                        <div className="teacher-workflow-summary">
                                            <span>{workflowSteps.filter((step) => getWorkflowState(step.key) === 'complete').length} of 4 complete</span>
                                            <strong>{hasAssessments ? 'Ready for invitations' : hasQuestions ? 'Ready to schedule' : hasClassrooms ? 'Build the bank next' : 'Start with a classroom'}</strong>
                                        </div>
                                    </section>
                                    <section className="teacher-workflow-steps" aria-label="Teacher workflow">
                                        {workflowSteps.map((step) => {
                                            const state = getWorkflowState(step.key);
                                            return (
                                                <button
                                                    key={step.key}
                                                    className={`teacher-workflow-step ${state}`}
                                                    onClick={() => setTab(step.key)}
                                                >
                                                    <span className="teacher-step-number">Step {step.step}</span>
                                                    <span className="teacher-step-icon"><Icon name={step.key === 'questions' ? 'questions' : step.key} /></span>
                                                    <span className="teacher-step-title">{step.title}</span>
                                                    <span className="teacher-step-desc">{step.description}</span>
                                                    <span className={`teacher-step-state ${state}`}>{state === 'complete' ? 'Complete' : state === 'locked' ? 'Locked' : 'Current'}</span>
                                                </button>
                                            );
                                        })}
                                    </section>
                                    <div className="grid-4">
                                        {[
                                            ['Classrooms', dashboard.classrooms || 0, 'classrooms' as IconName],
                                            ['Students', dashboard.students || 0, 'students' as IconName],
                                            ['Active Assessments', dashboard.activeAssessments || 0, 'assessments' as IconName],
                                            ['Personal MCQs', dashboard.teacherQuestions || 0, 'questions' as IconName],
                                        ].map(([label, value, icon]) => (
                                            <div className="stat-card" key={label}>
                                                <div className="stat-icon primary"><Icon name={icon as IconName} /></div>
                                                <div><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
                                            </div>
                                        ))}
                                    </div>
                                    <section className="teacher-resource-card">
                                        <div className="teacher-resource-main">
                                            <div>
                                                <p className="teacher-kicker">Assessment Credits</p>
                                                <h2>{formatRemaining(assessmentCreditResource, 'Credits Remaining')}</h2>
                                                <p>Assessment credits are consumed only when a student submission is successfully recorded.</p>
                                            </div>
                                            <div className="teacher-resource-badge">
                                                <span>Capacity</span>
                                                <strong>{assessmentCreditResource.unlimited ? 'Unlimited' : formatResourceNumber(assessmentCreditResource.estimatedRemainingCapacity)}</strong>
                                            </div>
                                        </div>
                                        <div className="teacher-resource-stats">
                                            <div><span>Credits Used</span><strong>{formatResourceNumber(assessmentCreditResource.used)}</strong></div>
                                            <div><span>Total Student Submissions</span><strong>{formatResourceNumber(assessmentCreditResource.totalStudentSubmissions)}</strong></div>
                                            <div><span>Email Credits</span><strong>{formatRemaining(emailCreditResource, 'Remaining')}</strong></div>
                                            <div><span>Email Credits Used</span><strong>{formatResourceNumber(emailCreditResource.used)}</strong></div>
                                        </div>
                                        <div className="teacher-resource-limits">
                                            {[
                                                ['Question Bank', resourceLimits.questions],
                                                ['Classrooms', resourceLimits.classrooms],
                                                ['Students', resourceLimits.students],
                                                ['Assessments', resourceLimits.assessments],
                                            ].map(([label, resource]: any) => (
                                                <div className="teacher-resource-limit" key={label}>
                                                    <div>
                                                        <span>{label}</span>
                                                        <strong>{resource?.unlimited ? `${formatResourceNumber(resource?.current)} / Unlimited` : `${formatResourceNumber(resource?.current)} / ${formatResourceNumber(resource?.max)}`}</strong>
                                                    </div>
                                                    <div className="teacher-resource-meter"><span style={{ width: `${resourceProgress(resource)}%` }} /></div>
                                                </div>
                                            ))}
                                        </div>
                                    </section>
                                    <div className="grid-2">
                                        <div className="card">
                                            <div className="card-header"><h2 className="card-title">Upcoming Assessments</h2></div>
                                            <div className="card-body">
                                                {assessments.slice(0, 5).map((assessment) => (
                                                    <div className="info-row" key={assessment._id}>
                                                        <span className="info-label">{assessment.name}</span>
                                                        <span className="info-value">{new Date(assessment.startTime).toLocaleString()}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="card">
                                            <div className="card-header"><h2 className="card-title">MCQ Category Distribution</h2></div>
                                            <div className="card-body">
                                                {(questionAnalytics.categoryDistribution || []).length === 0 ? (
                                                    <p className="text-muted">No teacher MCQs uploaded yet.</p>
                                                ) : (questionAnalytics.categoryDistribution || []).map((item: any) => (
                                                    <div className="info-row" key={item.category}>
                                                        <span className="info-label">{item.category}</span>
                                                        <span className="info-value">{item.count}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {tab === 'classrooms' && (
                                <div className="grid-2">
                                    <div className="card">
                                        <div className="card-header"><h2 className="card-title">Step 1: Create Classroom</h2></div>
                                        <form className="card-body flex flex-col gap-4" onSubmit={createClassroom}>
                                            <div className="form-group"><label className="form-label">Name</label><input className="form-input" value={classroomForm.name} onChange={(e) => setClassroomForm({ ...classroomForm, name: e.target.value })} required /></div>
                                            <div className="form-group"><label className="form-label">Description</label><textarea className="form-textarea" value={classroomForm.description} onChange={(e) => setClassroomForm({ ...classroomForm, description: e.target.value })} /></div>
                                            <div className="form-group"><label className="form-label">Academic Session</label><input className="form-input" value={classroomForm.academicSession} onChange={(e) => setClassroomForm({ ...classroomForm, academicSession: e.target.value })} /></div>
                                            <button className="btn btn-accent">Create Classroom</button>
                                        </form>
                                    </div>
                                    <div className="card">
                                        <div className="card-header"><h2 className="card-title">Classrooms</h2></div>
                                        <div className="table-responsive">
                                            <table className="data-table">
                                                <thead><tr><th className="col-classroom">Name</th><th className="col-status">Students</th><th className="col-status">Active</th><th className="col-status">Join Code</th></tr></thead>
                                                <tbody>{classrooms.map((classroom) => (
                                                    <tr key={classroom._id} onClick={() => setSelectedClassroomId(classroom._id)} style={{ cursor: 'pointer', background: selectedClassroomId === classroom._id ? 'var(--color-surface-2)' : undefined }}>
                                                        <td>{classroom.name}</td><td>{classroom.totalStudents}</td><td>{classroom.activeAssessments}</td><td>{classroom.joinCode}</td>
                                                    </tr>
                                                ))}</tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {tab === 'questions' && (
                                !hasClassrooms ? (
                                    <WorkflowGate
                                        title="Create a classroom first."
                                        message="Question banks are organized around your classroom workflow. Create at least one classroom before building MCQs."
                                        actionLabel="Go to Classrooms"
                                        onAction={() => setTab('classrooms')}
                                    />
                                ) : (
                                    <div className="grid-2">
                                        <div className="card" style={{ gridColumn: '1 / -1' }}>
                                            <div className="card-header">
                                                <h2 className="card-title">Step 2: Build Your Question Bank</h2>
                                            </div>
                                        </div>

                                        <div className="card" style={{ gridColumn: '1 / -1' }}>
                                            <div className="card-header"><h2 className="card-title">Manual MCQ Entry</h2></div>
                                            <form className="card-body flex flex-col gap-4" onSubmit={handleCreateManualQuestion}>
                                                <div className="form-group">
                                                    <label className="form-label">Question Text</label>
                                                    <textarea className="form-textarea" required rows={3} value={manualQuestionForm.questionText} onChange={e => setManualQuestionForm({ ...manualQuestionForm, questionText: e.target.value })} placeholder="Enter the question text here..." />
                                                </div>
                                                <div className="grid-2">
                                                    <div className="form-group">
                                                        <label className="form-label">Option A</label>
                                                        <input className="form-input" required value={manualQuestionForm.optionA} onChange={e => setManualQuestionForm({ ...manualQuestionForm, optionA: e.target.value })} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Option B</label>
                                                        <input className="form-input" required value={manualQuestionForm.optionB} onChange={e => setManualQuestionForm({ ...manualQuestionForm, optionB: e.target.value })} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Option C</label>
                                                        <input className="form-input" required value={manualQuestionForm.optionC} onChange={e => setManualQuestionForm({ ...manualQuestionForm, optionC: e.target.value })} />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Option D</label>
                                                        <input className="form-input" required value={manualQuestionForm.optionD} onChange={e => setManualQuestionForm({ ...manualQuestionForm, optionD: e.target.value })} />
                                                    </div>
                                                </div>
                                                <div className="grid-4" style={{ gap: '1rem' }}>
                                                    <div className="form-group">
                                                        <label className="form-label">Correct Answer</label>
                                                        <select className="form-select" required value={manualQuestionForm.correctAnswer} onChange={e => setManualQuestionForm({ ...manualQuestionForm, correctAnswer: e.target.value })}>
                                                            <option value="0">Option A</option>
                                                            <option value="1">Option B</option>
                                                            <option value="2">Option C</option>
                                                            <option value="3">Option D</option>
                                                        </select>
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Category / Subject</label>
                                                        <input className="form-input" required value={manualQuestionForm.subject} onChange={e => setManualQuestionForm({ ...manualQuestionForm, subject: e.target.value })} placeholder="e.g. Mathematics" />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Difficulty</label>
                                                        <select className="form-select" required value={manualQuestionForm.difficulty} onChange={e => setManualQuestionForm({ ...manualQuestionForm, difficulty: e.target.value as QuestionDifficulty })}>
                                                            {QUESTION_DIFFICULTIES.map((difficulty) => (
                                                                <option key={difficulty} value={difficulty}>{difficulty}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Marks</label>
                                                        <input className="form-input" type="number" min="1" required value={manualQuestionForm.marks} onChange={e => setManualQuestionForm({ ...manualQuestionForm, marks: e.target.value === '' ? '' : Number(e.target.value) })} />
                                                    </div>
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">Explanation (Optional)</label>
                                                    <input className="form-input" value={manualQuestionForm.explanation} onChange={e => setManualQuestionForm({ ...manualQuestionForm, explanation: e.target.value })} />
                                                </div>
                                                <div className="action-buttons">
                                                    <button className="btn btn-accent">Add Question</button>
                                                    <button className="btn btn-secondary">Save To Bank</button>
                                                </div>
                                            </form>
                                        </div>

                                        <div className="card">
                                            <div className="card-header">
                                                <h2 className="card-title">Bulk Upload MCQ Bank</h2>
                                                <button className="btn btn-secondary btn-sm" onClick={() => downloadBlob('/teacher/questions/template', 'teacher-mcq-template.csv')}>Download MCQ Template</button>
                                            </div>
                                            <form className="card-body flex flex-col gap-4" onSubmit={uploadQuestions}>
                                                <p className="text-sm text-muted">Required columns: Question, OptionA, OptionB, OptionC, OptionD, CorrectAnswer, Category, Difficulty.</p>
                                                <input className="form-input" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setQuestionFile(e.target.files?.[0] || null)} required />
                                                <button className="btn btn-accent">Upload Questions</button>
                                            </form>
                                        </div>
                                        <div className="card">
                                            <div className="card-header"><h2 className="card-title">Bank Analytics</h2></div>
                                            <div className="card-body">
                                                <div className="stat-value">{questionAnalytics.total}</div>
                                                <div className="stat-label mb-4">Total MCQs</div>
                                                {(questionAnalytics.categoryDistribution || []).map((item: any) => (
                                                    <div className="info-row" key={item.category}><span className="info-label">{item.category}</span><span className="info-value">{item.count}</span></div>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="card" style={{ gridColumn: '1 / -1' }}>
                                            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                                                <h2 className="card-title" style={{ margin: 0 }}>Question Preview Table</h2>
                                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                    <input type="text" className="form-input" style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} placeholder="Search questions..." value={questionSearch} onChange={e => { setQuestionSearch(e.target.value); setQuestionPage(1); }} />
                                                    <select className="form-select" style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} value={questionSubject} onChange={e => { setQuestionSubject(e.target.value); setQuestionPage(1); }}>
                                                        <option value="">All Categories</option>
                                                        {mcqCategories.map(c => <option key={c.category} value={c.category}>{c.category}</option>)}
                                                    </select>
                                                    <select className="form-select" style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} value={questionDifficulty} onChange={e => { setQuestionDifficulty(e.target.value); setQuestionPage(1); }}>
                                                        <option value="">All Difficulties</option>
                                                        {QUESTION_DIFFICULTIES.map((difficulty) => (
                                                            <option key={difficulty} value={difficulty}>{difficulty}</option>
                                                        ))}
                                                    </select>
                                                    <select className="form-select" style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.875rem' }} value={`${questionSort}-${questionSortOrder}`} onChange={e => { const [s, o] = e.target.value.split('-'); setQuestionSort(s); setQuestionSortOrder(o); }}>
                                                        <option value="createdAt-desc">Newest First</option>
                                                        <option value="createdAt-asc">Oldest First</option>
                                                        <option value="marks-desc">Highest Marks</option>
                                                        <option value="marks-asc">Lowest Marks</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="table-responsive">
                                                <table className="data-table">
                                                    <thead><tr><th className="cell-wrap">Question</th><th className="col-classroom">MCQ Category</th><th className="col-status">Difficulty</th><th className="col-status">Marks</th><th className="col-date">Created</th></tr></thead>
                                                    <tbody>{questions.length > 0 ? questions.map((q) => <tr key={q._id}><td>{q.questionText}</td><td>{q.subject}</td><td>{q.difficulty}</td><td>{q.marks}</td><td>{new Date(q.createdAt).toLocaleDateString()}</td></tr>) : <tr><td colSpan={5} style={{ textAlign: 'center', padding: '1rem' }}>No questions found.</td></tr>}</tbody>
                                                </table>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', borderTop: '1px solid var(--color-border)' }}>
                                                <div className="text-sm text-muted">Showing {questionTotal > 0 ? (questionPage - 1) * questionLimit + 1 : 0} to {Math.min(questionPage * questionLimit, questionTotal)} of {questionTotal} entries</div>
                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }} disabled={questionPage === 1} onClick={() => setQuestionPage(p => p - 1)}>Previous</button>
                                                    <button className="btn btn-secondary" style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }} disabled={questionPage * questionLimit >= questionTotal} onClick={() => setQuestionPage(p => p + 1)}>Next</button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            )}

                            {tab === 'assessments' && (
                                !hasClassrooms ? (
                                    <WorkflowGate
                                        title="Create a classroom first."
                                        message="Assessments need a classroom target before they can be scheduled."
                                        actionLabel="Go to Classrooms"
                                        onAction={() => setTab('classrooms')}
                                    />
                                ) : !hasQuestions ? (
                                    <WorkflowGate
                                        title="Add questions before creating assessments."
                                        message="Build the question bank first so scheduling can validate category distribution and question availability."
                                        actionLabel="Go to Question Bank"
                                        onAction={() => setTab('questions')}
                                    />
                                ) : (
                                    <div className="grid-2">
                                        <div className="card">
                                            <div className="card-header"><h2 className="card-title">Step 3: Schedule Assessment</h2></div>
                                            <form className="card-body flex flex-col gap-4" onSubmit={createAssessment}>
                                                <div className="form-group"><label className="form-label">Assessment Name</label><input className="form-input" value={assessmentForm.name} onChange={(e) => setAssessmentForm({ ...assessmentForm, name: e.target.value })} required /></div>
                                                <div className="form-grid">
                                                    <div className="form-group"><label className="form-label">Classroom</label><select className="form-select" value={assessmentForm.classroomId} onChange={(e) => setAssessmentForm({ ...assessmentForm, classroomId: e.target.value })} required>{classrooms.map((c) => <option value={c._id} key={c._id}>{c.name}</option>)}</select></div>
                                                    <div className="form-group"><label className="form-label">Question Source</label><select className="form-select" value={assessmentForm.questionSource} onChange={(e) => setAssessmentForm({ ...assessmentForm, questionSource: e.target.value })}><option value="teacher">Teacher Uploaded Bank</option><option value="global">ExamAssess Global Bank</option></select></div>
                                                </div>
                                                {assessmentForm.questionSource === 'global' && (
                                                    <div className="alert alert-warning">Global bank assessments use ExamAssess MCQ type names for MCQ Category Distribution.</div>
                                                )}
                                                <div className="form-grid-3">
                                                    <div className="form-group"><label className="form-label">Date</label><input className="form-input" type="date" min={today} value={assessmentForm.assessmentDate} onChange={(e) => setAssessmentForm({ ...assessmentForm, assessmentDate: e.target.value })} required /></div>
                                                    <div className="form-group"><label className="form-label">Start</label><input className="form-input" type="time" value={assessmentForm.assessmentStartTime} onChange={(e) => setAssessmentForm({ ...assessmentForm, assessmentStartTime: e.target.value })} required /></div>
                                                    <div className="form-group"><label className="form-label">End</label><input className="form-input" type="time" value={assessmentForm.assessmentEndTime} onChange={(e) => setAssessmentForm({ ...assessmentForm, assessmentEndTime: e.target.value })} required /></div>
                                                </div>
                                                <div className="form-grid-3">
                                                    <div className="form-group"><label className="form-label">Duration</label><input className="form-input" type="number" min={1} value={assessmentForm.durationMinutes} onChange={(e) => setAssessmentForm({ ...assessmentForm, durationMinutes: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
                                                    <div className="form-group"><label className="form-label">Passing %</label><input className="form-input" type="number" min={0} max={100} value={assessmentForm.passingPercentage} onChange={(e) => setAssessmentForm({ ...assessmentForm, passingPercentage: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
                                                    <div className="form-group"><label className="form-label">Attempt Limit</label><input className="form-input" type="number" min={1} value={assessmentForm.attemptLimit} onChange={(e) => setAssessmentForm({ ...assessmentForm, attemptLimit: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
                                                </div>
                                                <div className="form-grid">
                                                    <div className="form-group"><label className="form-label">Distribution Mode</label><select className="form-select" value={assessmentForm.distributionMode} onChange={(e) => setAssessmentForm({ ...assessmentForm, distributionMode: e.target.value })}><option value="count">By Count</option><option value="percentage">By Percentage</option></select></div>
                                                    {assessmentForm.distributionMode === 'percentage' && <div className="form-group"><label className="form-label">Total Questions</label><input className="form-input" type="number" min={1} value={assessmentForm.totalQuestions} onChange={(e) => setAssessmentForm({ ...assessmentForm, totalQuestions: e.target.value === '' ? '' : Number(e.target.value) })} /></div>}
                                                </div>
                                                <div className="form-group">
                                                    <label className="form-label">MCQ Category Distribution</label>
                                                    {mcqCategories.length === 0 && assessmentForm.questionSource === 'teacher' ? (
                                                        <div className="alert alert-warning">Upload teacher MCQs before creating teacher-bank assessments.</div>
                                                    ) : distributionRows.map((row, index) => (
                                                        <div className="form-grid" key={`${row.category}-${index}`} style={{ marginBottom: 8 }}>
                                                            <select className="form-select" value={row.category} onChange={(e) => updateDistributionRow(index, { category: e.target.value })}>
                                                                {selectedCategoryList.map((item: any) => <option value={item.category} key={item.category}>{item.category} ({item.count})</option>)}
                                                            </select>
                                                            <div className="flex gap-2">
                                                                <input className="form-input" type="number" min={1} value={row.value} onChange={(e) => updateDistributionRow(index, { value: e.target.value === '' ? '' : Number(e.target.value) })} />
                                                                <button type="button" className="btn btn-danger btn-sm" onClick={() => setDistributionRows((rows) => rows.filter((_, idx) => idx !== index))}>Remove</button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <button type="button" className="btn btn-secondary btn-sm" onClick={addDistributionRow} disabled={selectedCategoryList.length === 0}>Add Category</button>
                                                </div>
                                                <div className="form-grid-3">
                                                    <div className="form-group"><label className="form-label">Randomization</label><select className="form-select" value={assessmentForm.randomizationMode} onChange={(e) => setAssessmentForm({ ...assessmentForm, randomizationMode: e.target.value })}><option value="strict">Strict Exam</option><option value="secure">Secure Exam</option><option value="practice">Practice</option></select></div>
                                                    <div className="form-group"><label className="form-label">Late Join</label><select className="form-select" value={assessmentForm.lateJoinPolicy} onChange={(e) => setAssessmentForm({ ...assessmentForm, lateJoinPolicy: e.target.value })}><option value="allow">Allow reduced time</option><option value="block">Block late joiners</option></select></div>
                                                    <div className="form-group"><label className="form-label">Results</label><select className="form-select" value={assessmentForm.resultPolicy} onChange={(e) => setAssessmentForm({ ...assessmentForm, resultPolicy: e.target.value })}><option value="manual">Release by teacher</option><option value="immediate">Show immediately</option></select></div>
                                                </div>
                                                <button className="btn btn-accent">Create Assessment</button>
                                            </form>
                                        </div>
                                        <div className="card">
                                            <div className="card-header"><h2 className="card-title">Assessments</h2></div>
                                            <div className="table-responsive">
                                                <table className="data-table">
                                                    <thead><tr><th className="col-assessment-name">Name</th><th className="col-classroom">Classroom</th><th className="col-status">Status</th><th className="col-time">Start</th><th className="col-time">Submitted</th><th className="col-actions">Actions</th></tr></thead>
                                                    <tbody>{assessments.map((assessment) => {
                                                        const status = getAssessmentStatus(assessment);
                                                        return (
                                                            <tr key={assessment._id}>
                                                                <td>{assessment.name}</td>
                                                                <td>{assessment.classroomId?.name}</td>
                                                                <td>
                                                                    <span className={`badge ${getAssessmentStatusClass(status)}`}>
                                                                        {status}
                                                                    </span>
                                                                </td>
                                                                <td>{new Date(assessment.startTime).toLocaleString()}</td>
                                                                <td>{assessment.submittedCount || 0}</td>
                                                                <td>
                                                                    <div className="action-buttons">
                                                                        <button className="btn btn-sm btn-secondary" onClick={() => loadResults(assessment._id)}>View Result</button>
                                                                        <button className="btn btn-sm btn-ghost" onClick={() => duplicateAssessment(assessment._id)}>Duplicate</button>
                                                                        {assessment.resultsReleased ? (
                                                                            <button className="btn btn-sm btn-ghost" onClick={() => hideResults(assessment._id)}>Hide Results</button>
                                                                        ) : (
                                                                            <button className="btn btn-sm btn-accent" onClick={() => releaseResults(assessment._id)}>Release Results</button>
                                                                        )}
                                                                        <button className="btn btn-sm btn-danger" onClick={() => initiateDelete(assessment._id)}>Delete</button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}</tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )
                            )}

                            {tab === 'students' && (
                                !hasClassrooms ? (
                                    <WorkflowGate
                                        title="Create a classroom first."
                                        message="Student invitations need a classroom to attach each learner to."
                                        actionLabel="Go to Classrooms"
                                        onAction={() => setTab('classrooms')}
                                    />
                                ) : !hasAssessments ? (
                                    <WorkflowGate
                                        title="Create an assessment before inviting students."
                                        message="Invitations open after the first assessment is scheduled, keeping students tied to a clear classroom activity."
                                        actionLabel="Go to Assessments"
                                        onAction={() => setTab('assessments')}
                                    />
                                ) : (
                                    <div className="students-workflow invite-workflow">
                                        <section className="invite-hero">
                                            <div>
                                                <p className="teacher-kicker">Step 4</p>
                                                <h2>Invite Students</h2>
                                                <p>Assign students and send invitations for your scheduled assessment.</p>
                                            </div>
                                            <div className="invite-hero-status">
                                                <span>Selected Assessment</span>
                                                <strong>{selectedInvitationAssessment?.name || 'Select assessment'}</strong>
                                            </div>
                                        </section>

                                        <section className="invite-selection-grid">
                                            <div className="invite-control-card">
                                                <div className="invite-control-number">1</div>
                                                <div>
                                                    <h3>Select Classroom</h3>
                                                    <p>Choose the roster that will receive assessment invitations.</p>
                                                </div>
                                                <select className="form-select" value={selectedClassroomId} onChange={(e) => setSelectedClassroomId(e.target.value)}>
                                                    {classrooms.map((c) => <option value={c._id} key={c._id}>{c.name}</option>)}
                                                </select>
                                            </div>
                                            <div className="invite-control-card">
                                                <div className="invite-control-number">2</div>
                                                <div>
                                                    <h3>Select Assessment</h3>
                                                    <p>Pick the scheduled exam that students will see in their invitation email.</p>
                                                </div>
                                                <select className="form-select" value={selectedInvitationAssessmentId} onChange={(e) => setSelectedInvitationAssessmentId(e.target.value)}>
                                                    {invitationAssessments.map((assessment) => <option value={assessment._id} key={assessment._id}>{assessment.name}</option>)}
                                                </select>
                                            </div>
                                            {selectedInvitationAssessment && (
                                                <div className="invite-assessment-summary">
                                                    <div className="invite-summary-header">
                                                        <div>
                                                            <span>Assessment Summary</span>
                                                            <h3>{selectedInvitationAssessment.name}</h3>
                                                        </div>
                                                        <span className={`badge ${getAssessmentStatusClass(selectedAssessmentStatus)}`}>{selectedAssessmentStatus}</span>
                                                    </div>
                                                    <div className="invite-summary-grid">
                                                        <div><span>Date</span><strong>{formatDateOnly(selectedInvitationAssessment.startTime)}</strong></div>
                                                        <div><span>Schedule</span><strong>{formatTimeOnly(selectedInvitationAssessment.startTime)} - {formatTimeOnly(selectedInvitationAssessment.endTime)}</strong></div>
                                                        <div><span>Duration</span><strong>{selectedInvitationAssessment.durationMinutes} Minutes</strong></div>
                                                        <div><span>Questions</span><strong>{selectedInvitationAssessment.totalQuestions}</strong></div>
                                                        <div><span>Total Marks</span><strong>{selectedInvitationAssessment.totalMarks || selectedInvitationAssessment.totalQuestions}</strong></div>
                                                        <div><span>Shuffle</span><strong>{selectedInvitationAssessment.randomizationMode === 'strict' ? 'Disabled' : 'Enabled'}</strong></div>
                                                        <div><span>Late Join</span><strong>{selectedInvitationAssessment.lateJoinPolicy === 'block' ? 'Not permitted' : 'Allowed within window'}</strong></div>
                                                        <div><span>Classroom</span><strong>{selectedClassroom?.name || selectedInvitationAssessment.classroomId?.name || '-'}</strong></div>
                                                    </div>
                                                </div>
                                            )}
                                        </section>

                                        <section className="invite-progress-grid">
                                            <div><span>Students Invited</span><strong>{students.length}</strong></div>
                                            <div><span>Verified Students</span><strong>{acceptedInvitations}</strong></div>
                                            <div><span>Assessment Participants</span><strong>{assessmentParticipants}</strong></div>
                                            <div><span>Remaining Invitations</span><strong>{remainingInvitations}</strong></div>
                                        </section>

                                        <section className="invite-action-grid">
                                            <div className="invite-action-card">
                                                <div className="invite-card-header">
                                                    <div>
                                                        <h3>Manual Entry</h3>
                                                        <p>Add one learner and send their assessment invitation.</p>
                                                    </div>
                                                </div>
                                                <form className="invite-form" onSubmit={inviteStudent}>
                                                    <div className="form-group">
                                                        <label className="form-label">Name</label>
                                                        <input className="form-input" placeholder="Ali Khan" value={inviteForm.name} onChange={(e) => setInviteForm({ ...inviteForm, name: e.target.value })} required />
                                                    </div>
                                                    <div className="form-group">
                                                        <label className="form-label">Email</label>
                                                        <input className="form-input" type="email" placeholder="ali@example.com" value={inviteForm.email} onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })} required />
                                                    </div>
                                                    <button className="btn btn-accent" disabled={!selectedClassroomId || !selectedInvitationAssessmentId}>Add Student</button>
                                                </form>
                                            </div>

                                            <div className="invite-action-card">
                                                <div className="invite-card-header">
                                                    <div>
                                                        <h3>Bulk Upload</h3>
                                                        <p>Import CSV or Excel files with Name and Email columns.</p>
                                                    </div>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => downloadBlob('/teacher/templates/students', 'student-template.csv')}>Download Template</button>
                                                </div>
                                                <form className="invite-form" onSubmit={importStudents}>
                                                    <div className="form-group invite-file-field">
                                                        <label className="form-label">Upload File</label>
                                                        <input key={inviteFileInputKey} className="form-input" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setInviteFile(e.target.files?.[0] || null)} />
                                                        {inviteFile && (
                                                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setInviteFile(null); setInviteFileInputKey((key) => key + 1); }}>Clear File</button>
                                                        )}
                                                    </div>
                                                    <button className="btn btn-accent" disabled={!selectedClassroomId || !inviteFile || !selectedInvitationAssessmentId}>Import Students</button>
                                                </form>
                                            </div>
                                        </section>

                                        <section className="invite-metrics-card">
                                            <div><span>Total Students</span><strong>{students.length}</strong></div>
                                            <div><span>Invitations Sent</span><strong>{invitationSummaryStats.invitationsSent ?? students.length}</strong></div>
                                            <div><span>Pending Invitations</span><strong>{pendingInvitations}</strong></div>
                                            <div><span>Accepted Invitations</span><strong>{acceptedInvitations}</strong></div>
                                        </section>

                                        {inviteSummary && (inviteSummary.results || []).length > 0 && (
                                            <section className="invite-result-card">
                                                <div className="invite-card-header">
                                                    <div>
                                                        <h3>Latest Import Result</h3>
                                                        <p>{inviteSummary.summary ? `Imported ${inviteSummary.summary.imported}, sent ${inviteSummary.summary.invitationsSent}, skipped ${inviteSummary.summary.skipped}.` : 'Recent invitation response.'}</p>
                                                    </div>
                                                </div>
                                                <div className="table-responsive">
                                                    <table className="data-table">
                                                        <thead><tr><th>Row</th><th className="col-student-name">Name</th><th className="col-email">Email</th><th className="col-status">Status</th><th className="cell-wrap">Message</th></tr></thead>
                                                        <tbody>{inviteSummary.results.map((item: any, index: number) => (
                                                            <tr key={`${item.email || item.name}-${index}`}>
                                                                <td>{item.row || '-'}</td>
                                                                <td>{item.name || '-'}</td>
                                                                <td>{item.email || '-'}</td>
                                                                <td><span className={`badge ${item.status === 'skipped' || item.status === 'failed' ? 'badge-warning' : 'badge-success'}`}>{item.status}</span></td>
                                                                <td>{item.message || item.emailError || (item.emailStatus === 'sent' ? 'Invitation email sent' : '-')}</td>
                                                            </tr>
                                                        ))}</tbody>
                                                    </table>
                                                </div>
                                            </section>
                                        )}

                                        <section className="invite-table-card">
                                            <div className="invite-card-header">
                                                <div>
                                                    <h3>Invitation Table</h3>
                                                    <p>Track roster status and manage invitations for the selected classroom.</p>
                                                </div>
                                                <button className="btn btn-danger btn-sm" disabled={selectedStudentIds.length === 0} onClick={removeSelectedStudents}>Delete Selected</button>
                                            </div>
                                            <div className="table-responsive">
                                                <table className="data-table">
                                                    <thead><tr><th><input type="checkbox" checked={students.length > 0 && selectedStudentIds.length === students.length} onChange={(e) => setSelectedStudentIds(e.target.checked ? students.map((row) => row.studentId?._id || row._id) : [])} /></th><th className="col-student-name">Student Name</th><th className="col-email">Email</th><th className="col-status">Status</th><th className="col-date">Invitation Date</th><th className="col-actions">Actions</th></tr></thead>
                                                    <tbody>{students.length > 0 ? students.map((row) => {
                                                        const studentId = row.studentId?._id || row._id;
                                                        const invitationStatus = getInvitationStatus(row);
                                                        return (
                                                            <tr key={row._id}>
                                                                <td><input type="checkbox" checked={selectedStudentIds.includes(studentId)} onChange={(e) => setSelectedStudentIds((ids) => e.target.checked ? [...ids, studentId] : ids.filter((id) => id !== studentId))} /></td>
                                                                <td><strong>{row.studentId?.fullName || row.invitedName || row.studentId?.username}</strong></td>
                                                                <td>{row.studentId?.email || row.invitedEmail}</td>
                                                                <td><span className={`badge ${getInvitationStatusClass(invitationStatus)}`}>{invitationStatus}</span></td>
                                                                <td>{formatDateTime(row.invitedAt)}</td>
                                                                <td>
                                                                    <div className="action-buttons">
                                                                        <button className="btn btn-secondary btn-sm" onClick={() => resendInvitation(row)} disabled={!selectedInvitationAssessmentId}>Resend Invitation</button>
                                                                        <button className="btn btn-danger btn-sm" onClick={() => removeStudent(studentId)}>Delete</button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    }) : (
                                                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1.25rem' }}>No students invited yet.</td></tr>
                                                    )}</tbody>
                                                </table>
                                            </div>
                                        </section>
                                    </div>
                                )
                            )}

                            {tab === 'profile' && (
                                <TeacherProfileSection />
                            )}

                            {tab === 'analytics' && (
                                !hasClassrooms ? (
                                    <WorkflowGate
                                        title="Create a classroom first."
                                        message="Analytics are reported by classroom once assessment activity exists."
                                        actionLabel="Go to Classrooms"
                                        onAction={() => setTab('classrooms')}
                                    />
                                ) : !hasAssessments ? (
                                    <WorkflowGate
                                        title="Create an assessment before viewing analytics."
                                        message="Assessment analytics will appear after scheduled assessments collect attempts and attendance."
                                        actionLabel="Go to Assessments"
                                        onAction={() => setTab('assessments')}
                                    />
                                ) : (
                                    renderAnalyticsContent()
                                )
                            )}
                        </>
                    )}
                </main>
            </div>
            {resultsModalOpen && results && (
                <div className="teacher-modal-backdrop" role="dialog" aria-modal="true">
                    <div className="teacher-results-modal">
                        <header className="teacher-results-modal-header">
                            <div>
                                <p className="teacher-kicker">Assessment Results</p>
                                <h2>{results.assessment.name}</h2>
                                <span>{results.assessment.classroomId?.name || selectedClassroom?.name || 'Classroom'} - {resultRows.length} visible rows</span>
                            </div>
                            <div className="teacher-results-header-actions">
                                <button className="btn btn-sm btn-secondary" onClick={() => downloadBlob(`/teacher/assessments/${results.assessment._id}/export?format=csv`, 'assessment-report.csv')}>CSV</button>
                                <button className="btn btn-sm btn-secondary" onClick={() => downloadBlob(`/teacher/assessments/${results.assessment._id}/export?format=xlsx`, 'assessment-report.xlsx')}>Excel</button>
                                <button className="btn btn-sm btn-secondary" onClick={() => downloadBlob(`/teacher/assessments/${results.assessment._id}/export?format=pdf`, 'assessment-report.pdf')}>PDF</button>
                                <button className="btn btn-ghost btn-sm" onClick={closeResultsModal}>Close</button>
                            </div>
                        </header>

                        <section className="teacher-results-stat-grid">
                            {live && Object.entries(live).map(([key, value]) => (
                                <div className="result-stat" key={key}>
                                    <div className="result-stat-value">{String(value)}</div>
                                    <div className="result-stat-label">{metricLabel(key)}</div>
                                </div>
                            ))}
                            {Object.entries(results.analytics || {}).map(([key, value]) => (
                                <div className="result-stat" key={key}>
                                    <div className="result-stat-value">{String(value)}</div>
                                    <div className="result-stat-label">{metricLabel(key)}</div>
                                </div>
                            ))}
                        </section>

                        <section className="teacher-results-toolbar">
                            <input className="form-input" placeholder="Search student or email..." value={resultSearch} onChange={(e) => setResultSearch(e.target.value)} />
                            <select className="form-select" value={resultStatusFilter} onChange={(e) => setResultStatusFilter(e.target.value)}>
                                <option value="all">All results</option>
                                <option value="attempted">Attempted</option>
                                <option value="absent">Absent</option>
                                <option value="pass">Pass</option>
                                <option value="fail">Fail</option>
                            </select>
                            <select className="form-select" value={resultReleaseFilter} onChange={(e) => setResultReleaseFilter(e.target.value)}>
                                <option value="all">All release states</option>
                                <option value="released">Released</option>
                                <option value="hidden">Hidden</option>
                            </select>
                            <select className="form-select" value={`${resultSort}-${resultSortOrder}`} onChange={(e) => {
                                const [sortKey, sortOrder] = e.target.value.split('-') as [ResultSortKey, 'asc' | 'desc'];
                                setResultSort(sortKey);
                                setResultSortOrder(sortOrder);
                            }}>
                                <option value="percentage-desc">Percentage high to low</option>
                                <option value="percentage-asc">Percentage low to high</option>
                                <option value="score-desc">Score high to low</option>
                                <option value="submittedAt-desc">Newest submissions</option>
                                <option value="timeTaken-asc">Fastest first</option>
                                <option value="name-asc">Name A to Z</option>
                            </select>
                            {results.assessment.resultsReleased ? (
                                <button className="btn btn-sm btn-secondary" onClick={() => hideResults(results.assessment._id)}>Hide Results</button>
                            ) : (
                                <button className="btn btn-sm btn-accent" onClick={() => releaseResults(results.assessment._id)}>Release Results</button>
                            )}
                        </section>

                        <div className="teacher-results-body">
                            <div className="teacher-results-table-wrap">
                                <div className="table-responsive">
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th className="col-student-name">Student Name</th><th className="col-email">Email</th><th className="col-time">Submission Time</th><th className="col-time">Time Taken</th><th className="col-status">Score</th><th className="col-status">Correct</th><th className="col-status">Incorrect</th><th className="col-status">Percentage</th><th className="col-status">Pass / Fail</th><th className="col-status">Result Released</th><th className="col-actions">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>{pagedResultRows.map((row: any) => (
                                            <tr key={row.attemptId || row.email}>
                                                <td><strong>{row.name}</strong></td>
                                                <td>{row.email}</td>
                                                <td>{row.submissionTime ? formatDateTime(row.submissionTime) : row.attendance}</td>
                                                <td>{row.timeTakenDisplay || '-'}</td>
                                                <td>{row.score !== '' ? `${row.score} / ${row.totalMarks}` : '-'}</td>
                                                <td>{row.attemptId ? row.correctAnswers : '-'}</td>
                                                <td>{row.attemptId ? row.incorrectAnswers : '-'}</td>
                                                <td>{row.percentage !== '' ? `${row.percentage}%` : '-'}</td>
                                                <td><span className={`badge ${row.passed === 'Pass' ? 'badge-success' : row.passed === 'Fail' ? 'badge-danger' : 'badge-secondary'}`}>{row.passed || row.attendance}</span></td>
                                                <td><span className={`badge ${row.resultReleased === 'Released' ? 'badge-success' : 'badge-secondary'}`}>{row.resultReleased || 'Hidden'}</span></td>
                                                <td>
                                                    <div className="action-buttons">
                                                        <button className="btn btn-sm btn-secondary" disabled={!row.attemptId} onClick={() => setSelectedResultRow(row)}>View Details</button>
                                                        {results.assessment.resultsReleased ? (
                                                            <button className="btn btn-sm btn-ghost" onClick={() => hideResults(results.assessment._id)}>Hide Result</button>
                                                        ) : (
                                                            <button className="btn btn-sm btn-accent" onClick={() => releaseResults(results.assessment._id)}>Release Result</button>
                                                        )}
                                                        <button className="btn btn-sm btn-ghost" onClick={() => downloadBlob(`/teacher/assessments/${results.assessment._id}/export?format=pdf`, 'student-result.pdf')}>Download</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}</tbody>
                                    </table>
                                </div>
                                <div className="analytics-pagination">
                                    <span>Page {resultPage} of {resultTotalPages}</span>
                                    <button className="btn btn-sm btn-secondary" disabled={resultPage <= 1} onClick={() => setResultPage((page) => page - 1)}>Previous</button>
                                    <button className="btn btn-sm btn-secondary" disabled={resultPage >= resultTotalPages} onClick={() => setResultPage((page) => page + 1)}>Next</button>
                                </div>
                            </div>

                            <aside className="teacher-result-detail-panel">
                                {selectedResultRow ? (
                                    <>
                                        <div className="teacher-review-header">
                                            <div>
                                                <h3>{selectedResultRow.name}</h3>
                                                <p>{selectedResultRow.email} - {selectedResultRow.score} / {selectedResultRow.totalMarks} - {selectedResultRow.percentage}%</p>
                                                <p>Submitted: {selectedResultRow.submissionTime ? formatDateTime(selectedResultRow.submissionTime) : '-'} - Time: {selectedResultRow.timeTakenDisplay || '-'}</p>
                                            </div>
                                            <span className={`badge ${selectedResultRow.passed === 'Pass' ? 'badge-success' : 'badge-danger'}`}>{selectedResultRow.passed}</span>
                                        </div>
                                        <div className="teacher-review-list">
                                            {(selectedResultRow.questionReview || []).map((question: any, index: number) => (
                                                <div className={`teacher-review-question ${question.correct ? 'correct' : 'incorrect'}`} key={`${question.questionText}-${index}`}>
                                                    <div className="teacher-review-question-title">
                                                        <span>Q{index + 1}</span>
                                                        <strong>{question.questionText}</strong>
                                                    </div>
                                                    <div className="teacher-review-options">
                                                        <div><span>Student Answer</span><strong>{question.selectedAnswerText || 'Not answered'}</strong></div>
                                                        <div><span>Correct Answer</span><strong>{question.correctAnswerText}</strong></div>
                                                        <div><span>Marks</span><strong>{question.correct ? question.marks : 0} / {question.marks}</strong></div>
                                                        <div><span>Topic</span><strong>{question.subject || 'General'}</strong></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <div className="empty-state compact">
                                        Select a submitted student to review their question-wise performance.
                                    </div>
                                )}
                            </aside>
                        </div>
                    </div>
                </div>
            )}
            {quizDetail && (
                <div className="teacher-modal-backdrop" role="dialog" aria-modal="true">
                    <div className="teacher-quiz-detail-modal">
                        <header className="teacher-results-modal-header">
                            <div>
                                <p className="teacher-kicker">Quiz Detail</p>
                                <h2>{quizDetail.quiz.quizName}</h2>
                                <span>{quizDetail.quiz.classroomName} - {quizDetail.quiz.submissionCount} submissions</span>
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => setQuizDetail(null)}>Close</button>
                        </header>
                        <div className="table-responsive">
                            <table className="data-table">
                                <thead><tr><th className="col-student-name">Student</th><th className="col-status">Score</th><th className="col-status">Percentage</th><th className="col-time">Submission Time</th><th className="col-time">Time Taken</th><th className="col-status">Pass/Fail</th></tr></thead>
                                <tbody>{(quizDetail.report.rows || []).map((row: any) => (
                                    <tr key={row.attemptId || row.email}>
                                        <td><strong>{row.name}</strong><br /><span className="muted-cell">{row.email}</span></td>
                                        <td>{row.score !== '' ? `${row.score} / ${row.totalMarks}` : '-'}</td>
                                        <td>{row.percentage !== '' ? `${row.percentage}%` : '-'}</td>
                                        <td>{row.submissionTime ? formatDateTime(row.submissionTime) : row.attendance}</td>
                                        <td>{row.timeTakenDisplay || '-'}</td>
                                        <td><span className={`badge ${row.passed === 'Pass' ? 'badge-success' : row.passed === 'Fail' ? 'badge-danger' : 'badge-secondary'}`}>{row.passed || row.attendance}</span></td>
                                    </tr>
                                ))}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
            {deleteConfirmationStep > 0 && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div className="card" style={{ maxWidth: 500, width: '100%', padding: '2rem' }}>
                        <h2 className="card-title text-danger mb-4">Delete Assessment</h2>
                        {deleteConfirmationStep === 1 ? (
                            <>
                                <p className="mb-4">Are you sure you want to permanently delete this assessment?</p>
                                <p className="mb-4 font-semibold">This action cannot be undone.</p>
                                <div className="flex justify-end gap-2 mt-4">
                                    <button className="btn btn-secondary" onClick={cancelDelete}>Cancel</button>
                                    <button className="btn btn-danger" onClick={confirmDeleteStep1}>Delete Assessment</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="mb-4">Please confirm you want to permanently remove this assessment and its associated scheduling information.</p>
                                <div className="flex justify-end gap-2 mt-4">
                                    <button className="btn btn-secondary" onClick={cancelDelete}>Cancel</button>
                                    <button className="btn btn-danger" onClick={executeDelete}>Confirm Delete</button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TeacherDashboard;
