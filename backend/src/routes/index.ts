import { Router } from 'express';
import multer from 'multer';
import { adminLogin, userLogin, teacherLogin, teacherRegister, studentRegister, verifyEmail, resendVerification, forgotPassword, resetPassword, changeEmail } from '../controllers/auth.controller';
import { sendTestEmail } from '../utils/email';
import {
    createUser,
    getAllUsers,
    updateUser,
    deleteUser,
    getUserProfile,
    getStudentDetails,
} from '../controllers/user.controller';
import {
    createMCQ,
    getAllMCQs,
    updateMCQ,
    deleteMCQ,
    bulkUploadMCQs,
    downloadTemplate,
} from '../controllers/mcq.controller';
import {
    createMCQType,
    getAllMCQTypes,
    updateMCQType,
    deleteMCQType,
} from '../controllers/mcq-type.controller';
import {
    createQuiz,
    getAllQuizzes,
    updateQuiz,
    deleteQuiz,
    toggleQuizStatus,
    enrollUsers,
    getEnrolledUsers,
    getAdminDashboardStats,
} from '../controllers/quiz.controller';
import {
    getAllResults,
    getResultsByQuiz,
    getResultsByUser,
} from '../controllers/result.controller';
import {
    getAvailableQuizzes,
    startQuiz,
    submitQuiz,
    getUserResults,
    startCategoryQuiz,
    submitCategoryQuiz,
    getResultReview,
} from '../controllers/user-quiz.controller';
import {
    listBookmarks,
    saveBookmark,
    removeBookmark,
    listMistakes,
    startPersonalPractice,
    submitPersonalPractice,
    getSubjectReports,
} from '../controllers/student-learning.controller';
import {
    createCategoryQuizConfig,
    getAllCategoryQuizConfigs,
    updateCategoryQuizConfig,
    deleteCategoryQuizConfig,
    getCategoryMCQCount,
} from '../controllers/category-quiz-config.controller';
import {
    getAllAdmins,
    createAdminAccount,
    updateAdminAccount,
    deleteAdminAccount,
    resetAdminPassword,
    changeSelfPassword,
    changeSelfUsername,
    getAuditLogs,
} from '../controllers/admin-management.controller';
import {
    createTestCategory,
    getAllTestCategories,
    getPublicTestCategories,
    updateTestCategory,
    deleteTestCategory,
    hardDeleteTestCategory,
} from '../controllers/test-category.controller';
import {
    rechargeCredits,
    getCreditLogs,
} from '../controllers/credit.controller';
import {
    authenticate,
    requireAdmin,
    requireSuperAdmin,
    requireUser,
    requireTeacher,
    requirePermission,
    requireVerifiedEmailIfPractice,
    PERMISSIONS,
} from '../middleware/auth.middleware';
import { emailActionRateLimiter, registrationRateLimiter } from '../middleware/rate-limit.middleware';
import {
    getTeacherDashboard,
    createClassroom,
    getClassrooms,
    updateClassroom,
    inviteStudents,
    getClassroomStudents,
    removeClassroomStudent,
    removeClassroomStudents,
    downloadStudentTemplate,
    downloadTeacherQuestionTemplate,
    createTeacherQuestion,
    uploadTeacherQuestions,
    getQuestionBankAnalytics,
    getTeacherQuestionCategories,
    getTeacherQuestions,
    validateAssessmentConfig,
    createAssessment,
    getAssessments,
    deleteAssessment,
    duplicateAssessment,
    releaseAssessmentResults,
    hideAssessmentResults,
    getAssessmentResults,
    getLiveAssessmentTracking,
    getClassroomAnalytics,
    getTeacherAnalyticsOverview,
    exportTeacherAnalytics,
    exportAssessmentReport,
    getStudentClassroomAssessments,
    startStudentAssessment,
    submitStudentAssessment,
    changeOwnPassword,
} from '../controllers/teacher.controller';
import {
    getTeacherManagementOverview,
    getTeacherManagementDetails,
    getTeacherResources,
    updateTeacherResources,
} from '../controllers/teacher-management.controller';
import {
    getStudentDashboardData,
} from '../controllers/student-dashboard.controller';
import {
    getTeacherProfile,
    updateTeacherProfile,
    uploadProfileImage,
    removeProfileImage,
    getPublicTeacherProfile,
} from '../controllers/teacher-profile.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// ─── Auth Routes ──────────────────────────────────────────────────────────────
router.post('/auth/admin/login', adminLogin);
router.post('/auth/user/login', userLogin);
router.post('/auth/teacher/login', teacherLogin);
router.post('/auth/teacher/register', registrationRateLimiter, teacherRegister);
router.post('/auth/user/register', registrationRateLimiter, studentRegister);
router.get('/auth/verify-email', verifyEmail as any);
router.post('/auth/resend-verification', emailActionRateLimiter, resendVerification as any);
router.post('/auth/forgot-password', emailActionRateLimiter, forgotPassword as any);
router.post('/auth/reset-password', resetPassword as any);
router.post('/auth/change-email', authenticate, requireUser, changeEmail);

// ─── Public Routes (no auth) ─────────────────────────────────────────────────
router.get('/auth/test-categories/public', getPublicTestCategories);

// ─── Email Debug Test (protected — super_admin only) ─────────────────────────
router.get('/test-email', authenticate, requireSuperAdmin, async (req, res) => {
    const email = req.query.email as string;
    if (!email) {
        return res.status(400).json({ message: 'Provide ?email=your@email.com query parameter' });
    }
    const result = await sendTestEmail(email);
    if (result.success) {
        res.json({ message: 'Email test sent successfully', messageId: result.messageId });
    } else {
        res.status(500).json({ message: 'Email test failed', error: result.error });
    }
});

// ─── Admin: Dashboard ─────────────────────────────────────────────────────────
router.get('/admin/dashboard/stats',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.VIEW_DASHBOARD),
    getAdminDashboardStats
);

// ─── Admin: Student Management (super_admin + admin) ─────────────────────────
router.post('/admin/users',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_STUDENTS),
    createUser
);
router.get('/admin/users',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_STUDENTS),
    getAllUsers
);
router.put('/admin/users/:id',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_STUDENTS),
    updateUser
);
router.get('/admin/users/:id/details',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_STUDENTS),
    getStudentDetails
);
router.delete('/admin/users/:id',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_STUDENTS),
    deleteUser
);

// ─── Admin: Credit Management (super_admin + admin) ───────────────────────────
router.post('/admin/users/:id/recharge-credits',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_CREDITS),
    rechargeCredits
);
router.get('/admin/users/:id/credit-logs',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_CREDITS),
    getCreditLogs
);

// ─── Admin: MCQ Management (all admin roles) ──────────────────────────────────
router.post('/admin/mcqs',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_MCQS),
    createMCQ
);
router.get('/admin/mcqs',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_MCQS),
    getAllMCQs
);
router.put('/admin/mcqs/:id',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_MCQS),
    updateMCQ
);
router.delete('/admin/mcqs/:id',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_MCQS),
    deleteMCQ
);
router.post('/admin/mcqs/bulk-upload',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_MCQS),
    upload.single('file'), bulkUploadMCQs
);
router.get('/admin/mcqs/template',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_MCQS),
    downloadTemplate
);

// ─── Admin: MCQ Type Management (all admin roles) ─────────────────────────────
router.post('/admin/mcq-types',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_MCQS),
    createMCQType
);
router.get('/admin/mcq-types',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_MCQS),
    getAllMCQTypes
);
router.put('/admin/mcq-types/:id',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_MCQS),
    updateMCQType
);
router.delete('/admin/mcq-types/:id',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_MCQS),
    deleteMCQType
);

// ─── Admin: Quiz Management (super_admin + admin) ─────────────────────────────
router.post('/admin/quizzes',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    createQuiz
);
router.get('/admin/quizzes',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    getAllQuizzes
);
router.put('/admin/quizzes/:id',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    updateQuiz
);
router.delete('/admin/quizzes/:id',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    deleteQuiz
);
router.patch('/admin/quizzes/:id/toggle',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    toggleQuizStatus
);
router.post('/admin/quizzes/:id/enroll',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    enrollUsers
);
router.get('/admin/quizzes/:id/enrolled',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    getEnrolledUsers
);

// ─── Admin: Category Quiz Config (super_admin + admin) ────────────────────────
router.post('/admin/category-quiz-configs',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    createCategoryQuizConfig
);
router.get('/admin/category-quiz-configs',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    getAllCategoryQuizConfigs
);
router.put('/admin/category-quiz-configs/:id',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    updateCategoryQuizConfig
);
router.delete('/admin/category-quiz-configs/:id',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    deleteCategoryQuizConfig
);
router.get('/admin/category-quiz-configs/mcq-count/:categoryId',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.MANAGE_QUIZZES),
    getCategoryMCQCount
);

// ─── Admin: Results (super_admin + admin) ─────────────────────────────────────
router.get('/admin/results',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.VIEW_RESULTS),
    getAllResults
);
router.get('/admin/results/quiz/:quizId',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.VIEW_RESULTS),
    getResultsByQuiz
);
router.get('/admin/results/user/:userId',
    authenticate, requireAdmin, requirePermission(PERMISSIONS.VIEW_RESULTS),
    getResultsByUser
);

// ─── Admin: Test Category Management (SuperAdmin CRUD, any admin can read) ────
router.post('/admin/test-categories',
    authenticate, requireSuperAdmin,
    createTestCategory
);
router.get('/admin/test-categories',
    authenticate, requireAdmin,
    getAllTestCategories
);
router.put('/admin/test-categories/:id',
    authenticate, requireSuperAdmin,
    updateTestCategory
);
router.delete('/admin/test-categories/:id',
    authenticate, requireSuperAdmin,
    deleteTestCategory
);
router.post('/admin/test-categories/:id/hard-delete',
    authenticate, requireSuperAdmin,
    hardDeleteTestCategory
);

// ─── Super Admin: Admin Account Management ────────────────────────────────────
router.get('/admin/admins',
    authenticate, requireSuperAdmin,
    getAllAdmins
);
router.post('/admin/admins',
    authenticate, requireSuperAdmin,
    createAdminAccount
);
router.put('/admin/admins/:id',
    authenticate, requireSuperAdmin,
    updateAdminAccount
);
router.delete('/admin/admins/:id',
    authenticate, requireSuperAdmin,
    deleteAdminAccount
);
router.post('/admin/admins/:id/reset-password',
    authenticate, requireSuperAdmin,
    resetAdminPassword
);

// Super Admin: Teacher Monitoring
router.get('/admin/teachers',
    authenticate, requireSuperAdmin,
    getTeacherManagementOverview
);
router.get('/admin/teachers/:id/details',
    authenticate, requireSuperAdmin,
    getTeacherManagementDetails
);
router.get('/admin/teachers/:id/resources',
    authenticate, requireSuperAdmin,
    getTeacherResources
);
router.post('/admin/teachers/:id/resources',
    authenticate, requireSuperAdmin,
    updateTeacherResources
);

// ─── Super Admin: Self Credential Management ──────────────────────────────────
router.post('/admin/me/change-password',
    authenticate, requireSuperAdmin,
    changeSelfPassword
);
router.post('/admin/me/change-username',
    authenticate, requireSuperAdmin,
    changeSelfUsername
);

// ─── Super Admin: Audit Logs ──────────────────────────────────────────────────
router.get('/admin/audit-logs',
    authenticate, requireSuperAdmin,
    getAuditLogs
);

// ─── User Routes ──────────────────────────────────────────────────────────────
router.get('/user/profile', authenticate, requireUser, getUserProfile);
router.get('/user/dashboard-data', authenticate, requireUser, getStudentDashboardData);
router.get('/user/quizzes', authenticate, requireUser, requireVerifiedEmailIfPractice, getAvailableQuizzes);
router.post('/user/quizzes/:id/start', authenticate, requireUser, requireVerifiedEmailIfPractice, startQuiz);
router.post('/user/quizzes/:id/submit', authenticate, requireUser, requireVerifiedEmailIfPractice, submitQuiz);
router.get('/user/results', authenticate, requireUser, getUserResults);
router.get('/user/results/:resultId/review', authenticate, requireUser, getResultReview);
router.post('/user/category-quiz/:configId/start', authenticate, requireUser, requireVerifiedEmailIfPractice, startCategoryQuiz);
router.post('/user/category-quiz/:configId/submit', authenticate, requireUser, requireVerifiedEmailIfPractice, submitCategoryQuiz);
router.get('/user/bookmarks', authenticate, requireUser, requireVerifiedEmailIfPractice, listBookmarks);
router.post('/user/bookmarks', authenticate, requireUser, requireVerifiedEmailIfPractice, saveBookmark);
router.delete('/user/bookmarks/:id', authenticate, requireUser, requireVerifiedEmailIfPractice, removeBookmark);
router.get('/user/mistakes', authenticate, requireUser, requireVerifiedEmailIfPractice, listMistakes);
router.post('/user/personal-practice/start', authenticate, requireUser, requireVerifiedEmailIfPractice, startPersonalPractice);
router.post('/user/personal-practice/:id/submit', authenticate, requireUser, requireVerifiedEmailIfPractice, submitPersonalPractice);
router.get('/user/reports/subjects', authenticate, requireUser, requireVerifiedEmailIfPractice, getSubjectReports);

// ─── User: Classroom Assessments ──────────────────────────────────────────────
router.get('/user/classroom-assessments', authenticate, requireUser, getStudentClassroomAssessments);
router.post('/user/classroom-assessments/:id/start', authenticate, requireUser, startStudentAssessment);
router.post('/user/classroom-assessments/:id/submit', authenticate, requireUser, submitStudentAssessment);

// ─── User: Change Password ────────────────────────────────────────────────────
router.post('/user/change-password', authenticate, requireUser, changeOwnPassword);

// ─── Teacher Routes ───────────────────────────────────────────────────────────
router.get('/teacher/dashboard', authenticate, requireTeacher, getTeacherDashboard);
router.post('/teacher/classrooms', authenticate, requireTeacher, createClassroom);
router.get('/teacher/classrooms', authenticate, requireTeacher, getClassrooms);
router.put('/teacher/classrooms/:id', authenticate, requireTeacher, updateClassroom);
router.post('/teacher/classrooms/:id/invite', authenticate, requireTeacher, upload.single('file'), inviteStudents);
router.get('/teacher/classrooms/:id/students', authenticate, requireTeacher, getClassroomStudents);
router.delete('/teacher/classrooms/:id/students/:studentId', authenticate, requireTeacher, removeClassroomStudent);
router.post('/teacher/classrooms/:id/students/remove', authenticate, requireTeacher, removeClassroomStudents);
router.get('/teacher/classrooms/:id/analytics', authenticate, requireTeacher, getClassroomAnalytics);
router.get('/teacher/analytics/overview', authenticate, requireTeacher, getTeacherAnalyticsOverview);
router.get('/teacher/analytics/export', authenticate, requireTeacher, exportTeacherAnalytics);
router.get('/teacher/templates/students', authenticate, requireTeacher, downloadStudentTemplate);
router.get('/teacher/questions/template', authenticate, requireTeacher, downloadTeacherQuestionTemplate);
router.post('/teacher/questions', authenticate, requireTeacher, createTeacherQuestion);
router.post('/teacher/questions/upload', authenticate, requireTeacher, upload.single('file'), uploadTeacherQuestions);
router.get('/teacher/questions/analytics', authenticate, requireTeacher, getQuestionBankAnalytics);
router.get('/teacher/questions/categories', authenticate, requireTeacher, getTeacherQuestionCategories);
router.get('/teacher/questions', authenticate, requireTeacher, getTeacherQuestions);
router.post('/teacher/assessments/validate', authenticate, requireTeacher, validateAssessmentConfig);
router.post('/teacher/assessments', authenticate, requireTeacher, createAssessment);
router.get('/teacher/assessments', authenticate, requireTeacher, getAssessments);
router.delete('/teacher/assessments/:id', authenticate, requireTeacher, deleteAssessment);
router.post('/teacher/assessments/:id/duplicate', authenticate, requireTeacher, duplicateAssessment);
router.post('/teacher/assessments/:id/release-results', authenticate, requireTeacher, releaseAssessmentResults);
router.post('/teacher/assessments/:id/hide-results', authenticate, requireTeacher, hideAssessmentResults);
router.get('/teacher/assessments/:id/results', authenticate, requireTeacher, getAssessmentResults);
router.get('/teacher/assessments/:id/live', authenticate, requireTeacher, getLiveAssessmentTracking);
router.get('/teacher/assessments/:id/export', authenticate, requireTeacher, exportAssessmentReport);
router.post('/teacher/change-password', authenticate, requireTeacher, changeOwnPassword);

// ─── Teacher Profile Routes ───────────────────────────────────────────────────
router.get('/teacher/profile', authenticate, requireTeacher, getTeacherProfile);
router.put('/teacher/profile', authenticate, requireTeacher, updateTeacherProfile);
router.post('/teacher/profile/image', authenticate, requireTeacher, upload.single('file'), uploadProfileImage);
router.delete('/teacher/profile/image', authenticate, requireTeacher, removeProfileImage);

// ─── Public Teacher Profile Route (for students) ──────────────────────────────
router.get('/user/teacher-profile/:teacherId', authenticate, requireUser, getPublicTeacherProfile);

export default router;

