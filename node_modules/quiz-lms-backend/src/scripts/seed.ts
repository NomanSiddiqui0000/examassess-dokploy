import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { User } from '../models/User';
import { MCQ } from '../models/MCQ';
import { Quiz } from '../models/Quiz';
import { TestCategory } from '../models/TestCategory';

dotenv.config();

const sampleCategories = [
    { name: 'Geography', defaultCredits: 10 },
    { name: 'Mathematics', defaultCredits: 10 },
    { name: 'Science', defaultCredits: 10 },
    { name: 'Literature', defaultCredits: 10 },
    { name: 'History', defaultCredits: 10 },
    { name: 'Technology', defaultCredits: 10 },
];

const sampleMCQTemplates = [
    { questionText: 'What is the capital of France?', options: ['London', 'Berlin', 'Paris', 'Madrid'], correctAnswer: 2, category: 'GEOGRAPHY', difficulty: 'Easy' },
    { questionText: 'What is 2 + 2?', options: ['3', '4', '5', '6'], correctAnswer: 1, category: 'MATHEMATICS', difficulty: 'Easy' },
    { questionText: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Saturn'], correctAnswer: 1, category: 'SCIENCE', difficulty: 'Easy' },
    { questionText: 'Who wrote "Romeo and Juliet"?', options: ['Charles Dickens', 'William Shakespeare', 'Jane Austen', 'Mark Twain'], correctAnswer: 1, category: 'LITERATURE', difficulty: 'Medium' },
    { questionText: 'What is the largest ocean on Earth?', options: ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean', 'Pacific Ocean'], correctAnswer: 3, category: 'GEOGRAPHY', difficulty: 'Easy' },
    { questionText: 'What is the square root of 64?', options: ['6', '7', '8', '9'], correctAnswer: 2, category: 'MATHEMATICS', difficulty: 'Easy' },
    { questionText: 'Which gas do plants absorb from the atmosphere?', options: ['Oxygen', 'Nitrogen', 'Carbon Dioxide', 'Hydrogen'], correctAnswer: 2, category: 'SCIENCE', difficulty: 'Medium' },
    { questionText: 'In which year did World War II end?', options: ['1943', '1944', '1945', '1946'], correctAnswer: 2, category: 'HISTORY', difficulty: 'Medium' },
    { questionText: 'What is the smallest prime number?', options: ['0', '1', '2', '3'], correctAnswer: 2, category: 'MATHEMATICS', difficulty: 'Medium' },
    { questionText: 'Which programming language is known as the "language of the web"?', options: ['Python', 'Java', 'JavaScript', 'C++'], correctAnswer: 2, category: 'TECHNOLOGY', difficulty: 'Easy' },
];

const seed = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('✅ Connected to MongoDB');

        // Clear existing data
        await User.deleteMany({});
        await MCQ.deleteMany({});
        await Quiz.deleteMany({});
        await TestCategory.deleteMany({});
        console.log('🗑️  Cleared existing data');

        // ── Create Super Admin ────────────────────────────────────────────────
        const superAdminPassword = await bcrypt.hash('SuperAdmin@123', 12);
        const superAdmin = await User.create({
            username: 'superadmin',
            password: superAdminPassword,
            role: 'super_admin',
            isActive: true,
            mustChangePassword: false,
        });
        console.log('👑 Created Super Admin  (username: superadmin, password: SuperAdmin@123)');

        // ── Create Admin ──────────────────────────────────────────────────────
        const adminPassword = await bcrypt.hash('Admin@123', 12);
        await User.create({
            username: 'admin',
            password: adminPassword,
            role: 'admin',
            isActive: true,
            mustChangePassword: true,
        });
        console.log('🔧 Created Admin         (username: admin, password: Admin@123)');

        // ── Create Content Manager ────────────────────────────────────────────
        const cmPassword = await bcrypt.hash('Content@123', 12);
        await User.create({
            username: 'contentmgr',
            password: cmPassword,
            role: 'content_manager',
            isActive: true,
            mustChangePassword: true,
        });
        console.log('📝 Created Content Mgr   (username: contentmgr, password: Content@123)');

        // ── Create Sample Student ─────────────────────────────────────────────
        const userPassword = await bcrypt.hash('user123', 10);
        await User.create({
            username: 'testuser',
            password: userPassword,
            role: 'user',
            isActive: true,
        });
        console.log('👤 Created Test User     (username: testuser, password: user123)');

        // ── Create Sample Categories ──────────────────────────────────────────
        const categories = await TestCategory.insertMany(sampleCategories);
        const categoryMap = new Map(categories.map((c) => [c.name, c._id]));
        console.log(`🗂️  Created ${categories.length} test categories`);

        // ── Create Sample MCQs ────────────────────────────────────────────────
        const mcqs = await MCQ.insertMany(
            sampleMCQTemplates.map((mcq) => ({
                ...mcq,
                category: categoryMap.get(mcq.category),
                createdBy: superAdmin._id,
            }))
        );
        console.log(`📋 Created ${mcqs.length} sample MCQs`);

        // ── Create Sample Quiz ────────────────────────────────────────────────
        const quiz = await Quiz.create({
            title: 'General Knowledge Quiz',
            description: 'A quiz covering various topics including geography, mathematics, science, and more.',
            testCategory: categoryMap.get('GEOGRAPHY'),
            mcqIds: mcqs.map((mcq) => mcq._id),
            numberOfQuestions: 5,
            duration: 10,
            passingMarks: 50,
            marksPerQuestion: 1,
            isActive: true,
            createdBy: superAdmin._id,
        });
        console.log(`🎯 Created sample quiz: ${quiz.title}`);

        console.log('\n✅ Database seeded successfully!');
        console.log('\n📋 Login Credentials:');
        console.log('   Super Admin    — username: superadmin,  password: SuperAdmin@123');
        console.log('   Admin          — username: admin,        password: Admin@123');
        console.log('   Content Mgr    — username: contentmgr,  password: Content@123');
        console.log('   Student        — username: testuser,     password: user123');

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding error:', error);
        process.exit(1);
    }
};

seed();
