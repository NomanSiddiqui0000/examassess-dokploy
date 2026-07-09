import React, { useEffect, useState } from 'react';
import api from '../utils/api';
import './TeacherProfileModal.css';

interface TeacherProfileModalProps {
    teacherId: string;
    onClose: () => void;
}

interface TeacherProfile {
    profile: {
        fullName: string;
        profileImage?: string;
        professionalTitle?: string;
        organization?: string;
        subjects?: string;
        bio?: string;
        memberSince: string;
    };
    stats: {
        totalClassrooms: number;
        totalStudents: number;
        totalAssessments: number;
        totalQuestionsUploaded: number;
    };
}

const TeacherProfileModal: React.FC<TeacherProfileModalProps> = ({ teacherId, onClose }) => {
    const [data, setData] = useState<TeacherProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        api.get(`/user/teacher-profile/${teacherId}`)
            .then(res => setData(res.data))
            .catch(err => setError(err.response?.data?.message || 'Failed to load profile'))
            .finally(() => setLoading(false));
    }, [teacherId]);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content teacher-profile-modal" onClick={e => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>&times;</button>
                {loading ? (
                    <div className="loading-spinner" style={{ margin: '40px auto' }} />
                ) : error ? (
                    <div className="error-message">{error}</div>
                ) : data && (
                    <div className="teacher-profile-details">
                        <div className="profile-header">
                            <div className="profile-avatar-large">
                                {data.profile.profileImage ? (
                                    <img src={data.profile.profileImage} alt={data.profile.fullName} />
                                ) : (
                                    <div className="avatar-placeholder">
                                        {data.profile.fullName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </div>
                            <div className="profile-title-area">
                                <h2>{data.profile.fullName}</h2>
                                {data.profile.professionalTitle && (
                                    <div className="profile-subtitle">{data.profile.professionalTitle}</div>
                                )}
                                {data.profile.organization && (
                                    <div className="profile-org">{data.profile.organization}</div>
                                )}
                            </div>
                        </div>

                        {data.profile.bio && (
                            <div className="profile-section">
                                <h3>About</h3>
                                <p>{data.profile.bio}</p>
                            </div>
                        )}

                        {data.profile.subjects && (
                            <div className="profile-section">
                                <h3>Subjects</h3>
                                <p>{data.profile.subjects}</p>
                            </div>
                        )}

                        <div className="profile-stats-grid">
                            <div className="stat-box">
                                <div className="stat-value">{data.stats.totalClassrooms}</div>
                                <div className="stat-label">Classrooms</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-value">{data.stats.totalStudents}</div>
                                <div className="stat-label">Students</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-value">{data.stats.totalAssessments}</div>
                                <div className="stat-label">Assessments</div>
                            </div>
                            <div className="stat-box">
                                <div className="stat-value">{data.stats.totalQuestionsUploaded}</div>
                                <div className="stat-label">Questions</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TeacherProfileModal;
