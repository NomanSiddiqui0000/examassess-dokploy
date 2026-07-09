import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs/promises';
import { User } from '../models/User';
import { TeacherClassroom } from '../models/TeacherClassroom';
import { TeacherAssessment } from '../models/TeacherAssessment';
import { TeacherQuestion } from '../models/TeacherQuestion';
import { ClassroomStudent } from '../models/ClassroomStudent';
import sharp from 'sharp';
import mongoose from 'mongoose';

const imagesDir = path.resolve(__dirname, '../../teacher-images');
fs.mkdir(imagesDir, { recursive: true }).catch(console.error);

export const getTeacherProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const user = await User.findById(userId).select('-password');
        
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const [classrooms, assessments, questions] = await Promise.all([
            TeacherClassroom.countDocuments({ teacherId: userId }),
            TeacherAssessment.countDocuments({ teacherId: userId }),
            TeacherQuestion.countDocuments({ teacherId: userId })
        ]);

        const enrollments = await ClassroomStudent.find({ teacherId: userId });
        const studentSet = new Set<string>();
        enrollments.forEach(e => {
            studentSet.add(e.studentId?.toString() || e.invitedEmail);
        });
        const totalStudents = studentSet.size;

        res.json({
            profile: {
                profileImage: user.profileImage,
                professionalTitle: user.professionalTitle,
                organization: user.organization,
                subjects: user.subjects,
                bio: user.bio,
                fullName: user.fullName,
                email: user.email,
                memberSince: user.createdAt,
            },
            stats: {
                totalClassrooms: classrooms,
                totalStudents: totalStudents,
                totalAssessments: assessments,
                totalQuestionsUploaded: questions
            }
        });
    } catch (error) {
        console.error('Error fetching teacher profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const updateTeacherProfile = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const { professionalTitle, organization, subjects, bio } = req.body;

        const updateData: any = {};
        if (professionalTitle !== undefined) updateData.professionalTitle = professionalTitle;
        if (organization !== undefined) updateData.organization = organization;
        if (subjects !== undefined) updateData.subjects = subjects;
        if (bio !== undefined) updateData.bio = bio;

        const user = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true, runValidators: true }
        ).select('-password');

        res.json({ message: 'Profile updated successfully', profile: user });
    } catch (error) {
        console.error('Error updating teacher profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const uploadProfileImage = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        
        if (!req.file) {
            return res.status(400).json({ message: 'No image uploaded' });
        }

        const filename = `teacher_${userId}_${Date.now()}.webp`;
        const filepath = path.join(imagesDir, filename);

        await sharp(req.file.buffer)
            .resize({ width: 400, height: 400, fit: 'cover' })
            .webp({ quality: 80 })
            .toFile(filepath);

        const relativePath = `/teacher-images/${filename}`;

        const user = await User.findByIdAndUpdate(
            userId,
            { profileImage: relativePath },
            { new: true }
        );

        res.json({ message: 'Profile image updated', profileImage: relativePath });
    } catch (error) {
        console.error('Error uploading profile image:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const removeProfileImage = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user._id;
        const user = await User.findById(userId);

        if (user && user.profileImage) {
            const filename = path.basename(user.profileImage);
            const filepath = path.join(imagesDir, filename);
            
            try {
                await fs.unlink(filepath);
            } catch (err: any) {
                if (err.code !== 'ENOENT') {
                    console.error('Failed to delete image file:', err);
                }
            }

            user.profileImage = undefined;
            await user.save();
        }

        res.json({ message: 'Profile image removed' });
    } catch (error) {
        console.error('Error removing profile image:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

export const getPublicTeacherProfile = async (req: Request, res: Response) => {
    try {
        const teacherId = req.params.teacherId;
        
        if (!mongoose.Types.ObjectId.isValid(teacherId)) {
            return res.status(400).json({ message: 'Invalid teacher ID' });
        }

        const user = await User.findById(teacherId).select('fullName profileImage professionalTitle organization subjects bio createdAt');
        
        if (!user) {
            return res.status(404).json({ message: 'Teacher not found' });
        }

        const [classrooms, assessments, questions] = await Promise.all([
            TeacherClassroom.countDocuments({ teacherId }),
            TeacherAssessment.countDocuments({ teacherId }),
            TeacherQuestion.countDocuments({ teacherId })
        ]);

        const enrollments = await ClassroomStudent.find({ teacherId });
        const studentSet = new Set<string>();
        enrollments.forEach(e => {
            studentSet.add(e.studentId?.toString() || e.invitedEmail);
        });
        const totalStudents = studentSet.size;

        res.json({
            profile: {
                fullName: user.fullName,
                profileImage: user.profileImage,
                professionalTitle: user.professionalTitle,
                organization: user.organization,
                subjects: user.subjects,
                bio: user.bio,
                memberSince: user.createdAt,
            },
            stats: {
                totalClassrooms: classrooms,
                totalStudents: totalStudents,
                totalAssessments: assessments,
                totalQuestionsUploaded: questions
            }
        });
    } catch (error) {
        console.error('Error fetching public teacher profile:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};
