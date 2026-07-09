import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';
import { ClassroomStudent } from '../models/ClassroomStudent';

dotenv.config();

/**
 * Safe migration script: Retroactively assign module flags to existing users.
 * 
 * Logic:
 * - Users with ClassroomStudent records → teacherAssessments: true
 * - Users with testCategory set OR registrationSource: 'self_student' → practiceModule: true
 * - Users with registrationSource: 'teacher_invite' (and no testCategory) → teacherAssessments: true, practiceModule: false
 * - Users with registrationSource: 'admin_created' → practiceModule: true (admin-created students use practice)
 * 
 * This script is IDEMPOTENT — safe to run multiple times.
 * It does NOT delete any existing data.
 */

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI!);
        console.log('✅ Connected to MongoDB');

        // Find all student users
        const students = await User.find({ role: 'user' }).select('_id email username testCategory registrationSource modules');
        console.log(`📋 Found ${students.length} student accounts to process`);

        // Get all student IDs that have classroom enrollments
        const classroomStudentIds = new Set(
            (await ClassroomStudent.find({ status: { $ne: 'removed' } }).distinct('studentId'))
                .map((id: any) => id.toString())
        );
        console.log(`🏫 Found ${classroomStudentIds.size} students with classroom enrollments`);

        let updated = 0;
        let skipped = 0;

        for (const student of students) {
            const studentId = student._id.toString();
            const hasClassroom = classroomStudentIds.has(studentId);
            const hasPractice = !!student.testCategory || student.registrationSource === 'self_student' || student.registrationSource === 'admin_created';

            // Skip if modules already correctly set
            const currentModules = student.modules || { practiceModule: false, teacherAssessments: false };
            const targetModules = {
                practiceModule: hasPractice || currentModules.practiceModule,
                teacherAssessments: hasClassroom || currentModules.teacherAssessments,
            };

            // If nothing to change, skip
            if (currentModules.practiceModule === targetModules.practiceModule &&
                currentModules.teacherAssessments === targetModules.teacherAssessments) {
                skipped++;
                continue;
            }

            // If both are false, at least set based on registration source
            if (!targetModules.practiceModule && !targetModules.teacherAssessments) {
                if (student.registrationSource === 'teacher_invite') {
                    targetModules.teacherAssessments = true;
                } else {
                    targetModules.practiceModule = true;
                }
            }

            student.modules = targetModules;
            await student.save();
            updated++;

            console.log(`  ✓ ${student.email || student.username}: practice=${targetModules.practiceModule}, assessments=${targetModules.teacherAssessments}`);
        }

        console.log(`\n✅ Migration complete!`);
        console.log(`   Updated: ${updated}`);
        console.log(`   Skipped (already correct): ${skipped}`);
        console.log(`   Total processed: ${students.length}`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration error:', error);
        process.exit(1);
    }
}

migrate();
