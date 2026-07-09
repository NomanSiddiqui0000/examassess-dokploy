import React, { useEffect, useState, useRef } from 'react';
import api from '../../utils/api';
import './TeacherProfileSection.css';

interface TeacherProfileData {
    profile: {
        profileImage?: string;
        professionalTitle?: string;
        organization?: string;
        subjects?: string;
        bio?: string;
        fullName: string;
        email: string;
        memberSince: string;
    };
    stats: {
        totalClassrooms: number;
        totalStudents: number;
        totalAssessments: number;
        totalQuestionsUploaded: number;
    };
}

const TeacherProfileSection: React.FC = () => {
    const [data, setData] = useState<TeacherProfileData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [form, setForm] = useState({
        professionalTitle: '',
        organization: '',
        subjects: '',
        bio: ''
    });

    const loadProfile = () => {
        setLoading(true);
        api.get('/teacher/profile')
            .then(res => {
                setData(res.data);
                setForm({
                    professionalTitle: res.data.profile.professionalTitle || '',
                    organization: res.data.profile.organization || '',
                    subjects: res.data.profile.subjects || '',
                    bio: res.data.profile.bio || ''
                });
            })
            .catch(err => setError(err.response?.data?.message || 'Failed to load profile'))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        loadProfile();
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage('');
        setError('');
        try {
            await api.put('/teacher/profile', form);
            setMessage('Profile updated successfully.');
            loadProfile();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to update profile.');
        } finally {
            setSaving(false);
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            await api.post('/teacher/profile/image', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            loadProfile();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to upload image.');
        }
    };

    const handleRemoveImage = async () => {
        if (!window.confirm('Are you sure you want to remove your profile image?')) return;
        try {
            await api.delete('/teacher/profile/image');
            loadProfile();
        } catch (err: any) {
            setError(err.response?.data?.message || 'Failed to remove image.');
        }
    };

    if (loading) return <div className="loading-spinner" style={{ margin: '40px auto' }} />;
    if (error && !data) return <div className="error-message">{error}</div>;
    if (!data) return null;

    return (
        <div className="teacher-profile-section">
            <div className="profile-header-banner">
                <h2>My Profile</h2>
                <p>Manage your professional details and public appearance.</p>
            </div>

            {message && <div className="success-message" style={{ marginBottom: '20px' }}>{message}</div>}
            {error && <div className="error-message" style={{ marginBottom: '20px' }}>{error}</div>}

            <div className="profile-content-grid">
                <div className="profile-card profile-image-card">
                    <h3>Profile Image</h3>
                    <div className="profile-image-container">
                        {data.profile.profileImage ? (
                            <img src={data.profile.profileImage} alt={data.profile.fullName} />
                        ) : (
                            <div className="profile-image-placeholder">
                                {data.profile.fullName.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                    <div className="profile-image-actions">
                        <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}>
                            Upload Image
                        </button>
                        {data.profile.profileImage && (
                            <button className="btn btn-danger" onClick={handleRemoveImage}>
                                Remove
                            </button>
                        )}
                        <input
                            type="file"
                            accept="image/*"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            onChange={handleImageUpload}
                        />
                    </div>
                    <p className="image-help-text">Images will be resized and converted to WEBP automatically.</p>

                    <div className="profile-stats-summary">
                        <h4>Your Impact</h4>
                        <div className="stats-mini-grid">
                            <div className="stat-item">
                                <span>{data.stats.totalStudents}</span>
                                <label>Students</label>
                            </div>
                            <div className="stat-item">
                                <span>{data.stats.totalAssessments}</span>
                                <label>Assessments</label>
                            </div>
                            <div className="stat-item">
                                <span>{data.stats.totalClassrooms}</span>
                                <label>Classrooms</label>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="profile-card profile-details-card">
                    <h3>Professional Details</h3>
                    <form onSubmit={handleSave}>
                        <div className="form-group">
                            <label>Full Name</label>
                            <input type="text" className="form-control" value={data.profile.fullName} disabled />
                            <small>Managed in account settings.</small>
                        </div>
                        <div className="form-group">
                            <label>Email</label>
                            <input type="text" className="form-control" value={data.profile.email} disabled />
                            <small>Managed in account settings.</small>
                        </div>
                        
                        <div className="form-group">
                            <label>Professional Title</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                name="professionalTitle" 
                                value={form.professionalTitle} 
                                onChange={handleInputChange} 
                                placeholder="e.g. Senior Mathematics Teacher"
                            />
                        </div>
                        
                        <div className="form-group">
                            <label>Organization / School</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                name="organization" 
                                value={form.organization} 
                                onChange={handleInputChange} 
                                placeholder="e.g. Springfield High School"
                            />
                        </div>
                        
                        <div className="form-group">
                            <label>Subjects</label>
                            <input 
                                type="text" 
                                className="form-control" 
                                name="subjects" 
                                value={form.subjects} 
                                onChange={handleInputChange} 
                                placeholder="e.g. Algebra, Calculus, Physics"
                            />
                        </div>

                        <div className="form-group">
                            <label>Bio (Optional)</label>
                            <textarea 
                                className="form-control" 
                                name="bio" 
                                value={form.bio} 
                                onChange={handleInputChange} 
                                rows={4}
                                placeholder="Write a short professional bio..."
                                maxLength={200}
                            />
                        </div>

                        <button type="submit" className="btn btn-primary" disabled={saving}>
                            {saving ? 'Saving...' : 'Save Profile Details'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default TeacherProfileSection;
