import React, { useEffect, useMemo, useState } from 'react';
import AdminLayout from '../../components/Layout/AdminLayout';
import api from '../../utils/api';

interface TeacherRow {
    _id: string;
    name: string;
    email: string;
    registrationDate: string;
    verificationStatus: string;
    totalStudents: number;
    totalClassrooms: number;
    totalAssessments: number;
    totalQuestionBankSize: number;
    lastLogin?: string;
    accountStatus: string;
    averageScore: number;
}

interface OverviewStats {
    totalTeachers: number;
    activeTeachers: number;
    totalClassrooms: number;
    totalTeacherStudents: number;
    totalTeacherAssessments: number;
    totalTeacherQuestions: number;
    averagePerformance: number;
}

interface ResourceActionForm {
    resourceType: string;
    action: string;
    amount: number | '';
    value: number | '';
    reason: string;
}

const formatDate = (value?: string) => {
    if (!value) return 'Never';
    return new Date(value).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

const PercentBar = ({ value }: { value: number }) => (
    <div className="tm-percent">
        <span style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }} />
    </div>
);

const MoreIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="1.8" />
        <circle cx="12" cy="12" r="1.8" />
        <circle cx="12" cy="19" r="1.8" />
    </svg>
);

const formatNumber = (value: any) => Number(value || 0).toLocaleString();
const isCreditResource = (resourceType: string) => resourceType === 'assessment_credits' || resourceType === 'email_credits';
const creditDisplay = (resource: any) => resource?.unlimited ? 'Unlimited' : `${formatNumber(resource?.remaining)} remaining`;
const limitDisplay = (resource: any) => resource?.unlimited ? `${formatNumber(resource?.current)} / Unlimited` : `${formatNumber(resource?.current)} / ${formatNumber(resource?.max)}`;
const limitRemainingDisplay = (resource: any) => resource?.unlimited ? 'Unlimited' : `${formatNumber(resource?.remaining)} remaining`;

const resourceTypeOptions = [
    { value: 'assessment_credits', label: 'Assessment Credits', kind: 'credit' },
    { value: 'email_credits', label: 'Email Invitation Credits', kind: 'credit' },
    { value: 'question_limit', label: 'MCQ Bank Limit', kind: 'limit' },
    { value: 'classroom_limit', label: 'Classroom Limit', kind: 'limit' },
    { value: 'student_limit', label: 'Student Limit', kind: 'limit' },
    { value: 'assessment_limit', label: 'Assessment Limit', kind: 'limit' },
];

const creditActionOptions = [
    { value: 'add', label: 'Add Credits' },
    { value: 'deduct', label: 'Deduct Credits' },
    { value: 'reset', label: 'Reset Credits' },
    { value: 'set_limited', label: 'Set Limited Balance' },
    { value: 'set_unlimited', label: 'Set Unlimited Credits' },
];

const limitActionOptions = [
    { value: 'increase_limit', label: 'Increase Limit' },
    { value: 'decrease_limit', label: 'Decrease Limit' },
    { value: 'set_limited', label: 'Set Fixed Limit' },
    { value: 'set_unlimited', label: 'Set Unlimited Access' },
];

const TeacherManagement: React.FC = () => {
    const [stats, setStats] = useState<OverviewStats | null>(null);
    const [teachers, setTeachers] = useState<TeacherRow[]>([]);
    const [selectedTeacherId, setSelectedTeacherId] = useState('');
    const [details, setDetails] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [resourceSaving, setResourceSaving] = useState(false);
    const [resourceForm, setResourceForm] = useState<ResourceActionForm>({
        resourceType: 'assessment_credits',
        action: 'add',
        amount: 100,
        value: 100,
        reason: '',
    });

    useEffect(() => {
        api.get('/admin/teachers')
            .then((res) => {
                setStats(res.data.stats);
                setTeachers(res.data.teachers || []);
            })
            .catch((err) => setError(err.response?.data?.message || 'Unable to load teacher management data'))
            .finally(() => setLoading(false));
    }, []);

    const filteredTeachers = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return teachers;
        return teachers.filter((teacher) =>
            teacher.name.toLowerCase().includes(term) ||
            teacher.email.toLowerCase().includes(term)
        );
    }, [teachers, search]);

    const loadDetails = async (teacherId: string) => {
        setSelectedTeacherId(teacherId);
        setDetails(null);
        setDetailsLoading(true);
        setSuccess('');
        try {
            const res = await api.get(`/admin/teachers/${teacherId}/details`);
            setDetails(res.data);
        } catch (err: any) {
            setError(err.response?.data?.message || 'Unable to load teacher details');
        } finally {
            setDetailsLoading(false);
        }
    };

    const updateResourceField = (patch: Partial<ResourceActionForm>) => {
        setResourceForm((form) => ({ ...form, ...patch }));
    };

    const handleResourceTypeChange = (resourceType: string) => {
        updateResourceField({
            resourceType,
            action: isCreditResource(resourceType) ? 'add' : 'increase_limit',
        });
    };

    const submitResourceUpdate = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!selectedTeacherId) return;
        if (showAmountInput && resourceForm.amount === '') {
            setError('Please enter a valid amount.');
            return;
        }
        if (showValueInput && resourceForm.value === '') {
            setError('Please enter a valid value.');
            return;
        }
        setResourceSaving(true);
        setError('');
        setSuccess('');
        const payload: any = {
            resourceType: resourceForm.resourceType,
            action: resourceForm.action,
            reason: resourceForm.reason,
        };
        if (['add', 'deduct', 'increase_limit', 'decrease_limit'].includes(resourceForm.action)) {
            payload.amount = Number(resourceForm.amount);
        }
        if (['reset', 'set_limited'].includes(resourceForm.action)) {
            payload.value = Number(resourceForm.value);
        }
        try {
            const res = await api.post(`/admin/teachers/${selectedTeacherId}/resources`, payload);
            setDetails((current: any) => current ? { ...current, resources: res.data.resources } : current);
            setSuccess('Teacher resources updated successfully');
            setResourceForm((form) => ({ ...form, reason: '' }));
        } catch (err: any) {
            setError(err.response?.data?.message || 'Unable to update teacher resources');
        } finally {
            setResourceSaving(false);
        }
    };

    const statCards = [
        ['Total Teachers', stats?.totalTeachers || 0],
        ['Active Teachers', stats?.activeTeachers || 0],
        ['Total Classrooms', stats?.totalClassrooms || 0],
        ['Teacher Students', stats?.totalTeacherStudents || 0],
        ['Teacher Assessments', stats?.totalTeacherAssessments || 0],
        ['Teacher Questions', stats?.totalTeacherQuestions || 0],
        ['Average Performance', `${stats?.averagePerformance || 0}%`],
    ];
    const actionOptions = isCreditResource(resourceForm.resourceType) ? creditActionOptions : limitActionOptions;
    const selectedAction = resourceForm.action;
    const showAmountInput = ['add', 'deduct', 'increase_limit', 'decrease_limit'].includes(selectedAction);
    const showValueInput = ['reset', 'set_limited'].includes(selectedAction);

    return (
        <AdminLayout title="Teacher Management">
            <div className="teacher-management-page">
                <section className="tm-hero">
                    <div>
                        <p className="tm-kicker">Super Admin Monitoring</p>
                        <h2>Teacher Management</h2>
                        <p>Monitor teacher activity, classrooms, student participation, assessments, question banks, and performance trends from one enterprise view.</p>
                    </div>
                </section>

                {error && <div className="alert alert-error">{error}</div>}
                {success && <div className="alert alert-success">{success}</div>}

                {loading ? (
                    <div className="loading-overlay"><div className="loading-spinner" />Loading teacher monitoring...</div>
                ) : (
                    <>
                        <div className="tm-stat-grid">
                            {statCards.map(([label, value]) => (
                                <div className="tm-stat-card" key={label}>
                                    <span>{label}</span>
                                    <strong>{value}</strong>
                                </div>
                            ))}
                        </div>

                        <section className="card">
                            <div className="card-header tm-table-header">
                                <div>
                                    <h2 className="card-title">Registered Teachers</h2>
                                    <p className="text-sm text-muted">Live operational summary across teacher-owned LMS activity.</p>
                                </div>
                                <div className="search-bar">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                    <input
                                        className="search-input"
                                        placeholder="Search teachers..."
                                        value={search}
                                        onChange={(event) => setSearch(event.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="table-responsive">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th className="col-student-name">Teacher Name</th>
                                            <th className="col-email">Email</th>
                                            <th className="col-date">Registered</th>
                                            <th className="col-status">Verification</th>
                                            <th className="col-status">Students</th>
                                            <th className="col-status">Classrooms</th>
                                            <th className="col-status">Assessments</th>
                                            <th className="col-status">Questions</th>
                                            <th className="col-time">Last Login</th>
                                            <th className="col-status">Status</th>
                                            <th className="col-actions">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredTeachers.map((teacher) => (
                                            <tr key={teacher._id} className={selectedTeacherId === teacher._id ? 'tm-row-active' : ''}>
                                                <td><strong>{teacher.name}</strong></td>
                                                <td>{teacher.email}</td>
                                                <td>{formatDate(teacher.registrationDate)}</td>
                                                <td><span className={`badge ${teacher.verificationStatus === 'Verified' ? 'badge-success' : 'badge-warning'}`}>{teacher.verificationStatus}</span></td>
                                                <td>{teacher.totalStudents}</td>
                                                <td>{teacher.totalClassrooms}</td>
                                                <td>{teacher.totalAssessments}</td>
                                                <td>{teacher.totalQuestionBankSize}</td>
                                                <td>{formatDate(teacher.lastLogin)}</td>
                                                <td><span className={`badge ${teacher.accountStatus === 'Active' ? 'badge-success' : 'badge-danger'}`}>{teacher.accountStatus}</span></td>
                                                <td>
                                                    <button className="tm-menu-button" onClick={() => loadDetails(teacher._id)} aria-label={`View ${teacher.name} details`}>
                                                        <MoreIcon />
                                                        <span>View Details</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {filteredTeachers.length === 0 && (
                                            <tr><td colSpan={11} style={{ textAlign: 'center', padding: 28 }}>No teachers found.</td></tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>

                        {detailsLoading && (
                            <div className="card"><div className="loading-overlay"><div className="loading-spinner" />Loading teacher details...</div></div>
                        )}

                        {details && (
                            <section className="tm-details">
                                <div className="tm-profile-card">
                                    <div>
                                        {details.teacher.profileImage ? (
                                            <div className="tm-avatar" style={{ overflow: 'hidden' }}>
                                                <img src={details.teacher.profileImage} alt={details.teacher.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                            </div>
                                        ) : (
                                            <span className="tm-avatar">{details.teacher.name?.charAt(0)}</span>
                                        )}
                                    </div>
                                    <div>
                                        <p className="tm-kicker">Teacher Profile</p>
                                        <h2>{details.teacher.name}</h2>
                                        <p>{details.teacher.email}</p>
                                        <div className="tm-profile-badges">
                                            <span className={`badge ${details.teacher.verificationStatus === 'Verified' ? 'badge-success' : 'badge-warning'}`}>{details.teacher.verificationStatus}</span>
                                            <span className={`badge ${details.teacher.accountStatus === 'Active' ? 'badge-success' : 'badge-danger'}`}>{details.teacher.accountStatus}</span>
                                            <span className="badge badge-info">Registered {formatDate(details.teacher.registrationDate)}</span>
                                        </div>
                                        
                                        {(details.teacher.professionalTitle || details.teacher.organization || details.teacher.subjects || details.teacher.bio) && (
                                            <div className="tm-teacher-extended-profile" style={{ marginTop: '16px', padding: '12px', background: '#f8f9fa', borderRadius: '8px', fontSize: '14px', color: '#4b5563' }}>
                                                {details.teacher.professionalTitle && <div style={{ marginBottom: '4px' }}><strong>Title:</strong> {details.teacher.professionalTitle}</div>}
                                                {details.teacher.organization && <div style={{ marginBottom: '4px' }}><strong>Organization:</strong> {details.teacher.organization}</div>}
                                                {details.teacher.subjects && <div style={{ marginBottom: '4px' }}><strong>Subjects:</strong> {details.teacher.subjects}</div>}
                                                {details.teacher.bio && <div style={{ marginTop: '8px' }}><strong>Bio:</strong> {details.teacher.bio}</div>}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="tm-panel tm-resource-panel">
                                    <div className="tm-resource-heading">
                                        <div>
                                            <h3>Resource Usage</h3>
                                            <p>Manage teacher entitlements for subscription preparation without changing classroom workflows.</p>
                                        </div>
                                        <span>Last updated {formatDate(details.resources?.lastResourceUpdateAt)}</span>
                                    </div>
                                    <div className="tm-resource-grid">
                                        <div className="tm-resource-tile tm-resource-credit">
                                            <span>Assessment Credits</span>
                                            <strong>{creditDisplay(details.resources?.credits?.assessment)}</strong>
                                            <small>{formatNumber(details.resources?.credits?.assessment?.used)} used | {formatNumber(details.resources?.credits?.assessment?.totalStudentSubmissions)} submissions</small>
                                        </div>
                                        <div className="tm-resource-tile tm-resource-credit">
                                            <span>Email Invitation Credits</span>
                                            <strong>{creditDisplay(details.resources?.credits?.email)}</strong>
                                            <small>{formatNumber(details.resources?.credits?.email?.used)} consumed</small>
                                        </div>
                                        <div className="tm-resource-tile">
                                            <span>Question Bank Usage</span>
                                            <strong>{limitDisplay(details.resources?.limits?.questions)}</strong>
                                            <small>{limitRemainingDisplay(details.resources?.limits?.questions)}</small>
                                        </div>
                                        <div className="tm-resource-tile">
                                            <span>Classroom Usage</span>
                                            <strong>{limitDisplay(details.resources?.limits?.classrooms)}</strong>
                                            <small>{limitRemainingDisplay(details.resources?.limits?.classrooms)}</small>
                                        </div>
                                        <div className="tm-resource-tile">
                                            <span>Student Usage</span>
                                            <strong>{limitDisplay(details.resources?.limits?.students)}</strong>
                                            <small>{limitRemainingDisplay(details.resources?.limits?.students)}</small>
                                        </div>
                                        <div className="tm-resource-tile">
                                            <span>Assessment Usage</span>
                                            <strong>{limitDisplay(details.resources?.limits?.assessments)}</strong>
                                            <small>{limitRemainingDisplay(details.resources?.limits?.assessments)}</small>
                                        </div>
                                    </div>

                                    <form className="tm-resource-form" onSubmit={submitResourceUpdate}>
                                        <div className="form-group">
                                            <label className="form-label">Resource</label>
                                            <select className="form-select" value={resourceForm.resourceType} onChange={(event) => handleResourceTypeChange(event.target.value)}>
                                                {resourceTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Action</label>
                                            <select className="form-select" value={resourceForm.action} onChange={(event) => updateResourceField({ action: event.target.value })}>
                                                {actionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                            </select>
                                        </div>
                                        {showAmountInput && (
                                            <div className="form-group">
                                                <label className="form-label">Amount</label>
                                                <input className="form-input" type="number" min={1} value={resourceForm.amount} onChange={(event) => updateResourceField({ amount: event.target.value === '' ? '' : Number(event.target.value) })} />
                                            </div>
                                        )}
                                        {showValueInput && (
                                            <div className="form-group">
                                                <label className="form-label">New Value</label>
                                                <input className="form-input" type="number" min={0} value={resourceForm.value} onChange={(event) => updateResourceField({ value: event.target.value === '' ? '' : Number(event.target.value) })} />
                                            </div>
                                        )}
                                        <div className="form-group tm-resource-reason">
                                            <label className="form-label">Reason</label>
                                            <input className="form-input" value={resourceForm.reason} onChange={(event) => updateResourceField({ reason: event.target.value })} placeholder="Administrative adjustment, subscription prep, support request..." />
                                        </div>
                                        <button className="btn btn-accent" disabled={resourceSaving}>{resourceSaving ? 'Updating...' : 'Update Resources'}</button>
                                    </form>

                                    <div className="tm-resource-history">
                                        <div>
                                            <h4>Recent Resource History</h4>
                                            <div className="tm-list">
                                                {(details.resources?.resourceHistory || []).slice(0, 6).map((item: any) => (
                                                    <div className="tm-list-item" key={item._id}>
                                                        <strong>{String(item.resourceType || '').replace(/_/g, ' ')} | {String(item.action || '').replace(/_/g, ' ')}</strong>
                                                        <span>{item.previousValue} to {item.newValue} | {formatDate(item.createdAt)}{item.reason ? ` | ${item.reason}` : ''}</span>
                                                    </div>
                                                ))}
                                                {(details.resources?.resourceHistory || []).length === 0 && <p className="text-muted">No resource adjustments recorded yet.</p>}
                                            </div>
                                        </div>
                                        <div>
                                            <h4>Recent Credit Usage</h4>
                                            <div className="tm-list">
                                                {(details.resources?.usageHistory?.assessmentCredits || []).slice(0, 4).map((item: any) => (
                                                    <div className="tm-list-item" key={item._id}>
                                                        <strong>{item.assessmentName}</strong>
                                                        <span>{item.studentName || item.studentEmail} | {formatDate(item.submittedAt)} | {item.creditsConsumed} credit</span>
                                                    </div>
                                                ))}
                                                {(details.resources?.usageHistory?.emailCredits || []).slice(0, 4).map((item: any) => (
                                                    <div className="tm-list-item" key={item._id}>
                                                        <strong>Invitation email</strong>
                                                        <span>{item.email} | {formatDate(item.sentAt)} | {item.creditsConsumed} credit</span>
                                                    </div>
                                                ))}
                                                {((details.resources?.usageHistory?.assessmentCredits || []).length + (details.resources?.usageHistory?.emailCredits || []).length) === 0 && <p className="text-muted">No credit usage recorded yet.</p>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="tm-detail-grid">
                                    <div className="tm-panel">
                                        <h3>Assessment Counts</h3>
                                        <div className="tm-mini-stats">
                                            <div><span>Total</span><strong>{details.assessmentCounts.total}</strong></div>
                                            <div><span>Upcoming</span><strong>{details.assessmentCounts.upcoming}</strong></div>
                                            <div><span>Completed</span><strong>{details.assessmentCounts.completed}</strong></div>
                                        </div>
                                    </div>
                                    <div className="tm-panel">
                                        <h3>Student Performance</h3>
                                        <div className="tm-mini-stats">
                                            <div><span>Average Score</span><strong>{details.studentPerformance.averageScores}%</strong></div>
                                            <div><span>Submissions</span><strong>{details.studentPerformance.submissions}</strong></div>
                                            <div><span>Pass Rate</span><strong>{details.studentPerformance.passRate}%</strong></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="tm-detail-grid">
                                    <div className="tm-panel">
                                        <h3>Question Bank Analytics</h3>
                                        <div className="tm-mini-stats">
                                            <div><span>Total Questions</span><strong>{details.questionBank.totalQuestions}</strong></div>
                                            <div><span>Average Marks</span><strong>{details.questionBank.averageMarks}</strong></div>
                                        </div>
                                        <div className="tm-distribution">
                                            <h4>Question Categories</h4>
                                            {(details.questionBank.categoryDistribution || []).slice(0, 6).map((item: any) => (
                                                <div className="tm-distribution-row" key={item.label}>
                                                    <span>{item.label}</span>
                                                    <PercentBar value={details.questionBank.totalQuestions ? (item.count / details.questionBank.totalQuestions) * 100 : 0} />
                                                    <strong>{item.count}</strong>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="tm-distribution">
                                            <h4>Difficulty Distribution</h4>
                                            {(details.questionBank.difficultyDistribution || []).map((item: any) => (
                                                <div className="tm-distribution-row" key={item.label}>
                                                    <span>{item.label}</span>
                                                    <PercentBar value={details.questionBank.totalQuestions ? (item.count / details.questionBank.totalQuestions) * 100 : 0} />
                                                    <strong>{item.count}</strong>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="tm-panel">
                                        <h3>Classrooms</h3>
                                        <div className="tm-list">
                                            {(details.classrooms || []).slice(0, 8).map((classroom: any) => (
                                                <div className="tm-list-item" key={classroom._id}>
                                                    <strong>{classroom.name}</strong>
                                                    <span>{classroom.academicSession || 'No session'} | {classroom.status}</span>
                                                </div>
                                            ))}
                                            {(details.classrooms || []).length === 0 && <p className="text-muted">No classrooms created yet.</p>}
                                        </div>
                                    </div>
                                </div>

                                <div className="tm-panel">
                                    <h3>Students Under Teacher</h3>
                                    <div className="table-responsive">
                                        <table className="data-table">
                                            <thead><tr><th className="col-student-name">Student Name</th><th className="col-email">Email</th><th className="col-status">Assessment Count</th><th className="col-status">Attempt Count</th><th className="col-status">Average Score</th><th className="col-time">Last Activity</th></tr></thead>
                                            <tbody>{(details.students || []).map((student: any) => (
                                                <tr key={student.studentId}>
                                                    <td>{student.name}</td>
                                                    <td>{student.email}</td>
                                                    <td>{student.assessmentCount}</td>
                                                    <td>{student.attemptCount}</td>
                                                    <td>{student.averageScore}%</td>
                                                    <td>{formatDate(student.lastActivity)}</td>
                                                </tr>
                                            ))}</tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="tm-panel">
                                    <h3>Assessment Monitoring</h3>
                                    <div className="table-responsive">
                                        <table className="data-table">
                                            <thead><tr><th className="col-assessment-name">Assessment</th><th className="col-time">Schedule</th><th className="col-status">Duration</th><th className="col-status">Questions</th><th className="col-status">Assigned</th><th className="col-status">Submissions</th><th className="col-status">Average</th><th className="col-status">Pass %</th><th className="col-status">Status</th></tr></thead>
                                            <tbody>{(details.assessmentHistory || []).map((assessment: any) => (
                                                <tr key={assessment._id}>
                                                    <td><strong>{assessment.name}</strong><div className="text-muted text-sm">{assessment.classroomName}</div></td>
                                                    <td>{formatDate(assessment.schedule.startTime)}<div className="text-muted text-sm">Ends {formatDate(assessment.schedule.endTime)}</div></td>
                                                    <td>{assessment.duration} min</td>
                                                    <td>{assessment.questionCount}</td>
                                                    <td>{assessment.assignedStudents}</td>
                                                    <td>{assessment.submissionCount}</td>
                                                    <td>{assessment.averageScore}%</td>
                                                    <td>{assessment.passPercentage}%</td>
                                                    <td><span className="badge badge-info">{assessment.completionStatus}</span></td>
                                                </tr>
                                            ))}</tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="tm-panel">
                                    <h3>Recent Activity</h3>
                                    <div className="tm-list">
                                        {(details.recentActivity || []).map((activity: any) => (
                                            <div className="tm-list-item" key={activity._id}>
                                                <strong>{activity.studentName} submitted {activity.assessmentName}</strong>
                                                <span>{formatDate(activity.submittedAt)} | {activity.percentage}% | {activity.passed ? 'Pass' : 'Fail'}</span>
                                            </div>
                                        ))}
                                        {(details.recentActivity || []).length === 0 && <p className="text-muted">No recent submissions yet.</p>}
                                    </div>
                                </div>
                            </section>
                        )}
                    </>
                )}
            </div>
        </AdminLayout>
    );
};

export default TeacherManagement;
