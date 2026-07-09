import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import { PERMISSIONS } from './context/AuthContext';

// Admin pages
import AdminLogin from './pages/admin/AdminLogin';
import AdminDashboard from './pages/admin/AdminDashboard';
import UserManagement from './pages/admin/UserManagement';
import MCQBank from './pages/admin/MCQBank';
import QuizConfiguration from './pages/admin/QuizConfiguration';
import CategoryQuizConfigPage from './pages/admin/CategoryQuizConfig';
import ResultsView from './pages/admin/ResultsView';
import AdminManagement from './pages/admin/AdminManagement';
import AuditLogs from './pages/admin/AuditLogs';
import MyAccount from './pages/admin/MyAccount';
import TestCategoryManagement from './pages/admin/TestCategoryManagement';
import MCQTypeManagement from './pages/admin/MCQTypeManagement';
import TeacherManagement from './pages/admin/TeacherManagement';

// User pages
import UserLogin from './pages/user/UserLogin';
import StudentRegister from './pages/user/StudentRegister';
import UserDashboard from './pages/user/UserDashboard';
import QuizAttempt from './pages/user/QuizAttempt';
import QuizResult from './pages/user/QuizResult';
import ResultsHistory from './pages/user/ResultsHistory';
import AnswerReview from './pages/user/AnswerReview';
import Bookmarks from './pages/user/Bookmarks';
import MistakeBook from './pages/user/MistakeBook';
import PerformanceReports from './pages/user/PerformanceReports';
import VerifyEmail from './pages/user/VerifyEmail';
import VerifyEmailPending from './pages/user/VerifyEmailPending';
import ForgotPassword from './pages/user/ForgotPassword';
import ResetPassword from './pages/user/ResetPassword';
import ChangePassword from './pages/user/ChangePassword';
import TeacherLogin from './pages/teacher/TeacherLogin';
import TeacherRegister from './pages/teacher/TeacherRegister';
import TeacherDashboard from './pages/teacher/TeacherDashboard';
import Homepage from './pages/Homepage';

const App: React.FC = () => {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    {/* Default route — Homepage */}
                    <Route path="/" element={<Homepage />} />

                    {/* Convenience redirects */}
                    <Route path="/login" element={<Navigate to="/user/login" replace />} />
                    <Route path="/register" element={<Navigate to="/user/register" replace />} />

                    {/* Admin auth */}
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/teacher/login" element={<TeacherLogin />} />
                    <Route path="/teacher/register" element={<TeacherRegister />} />
                    <Route
                        path="/teacher/dashboard"
                        element={
                            <ProtectedRoute requiredRole="teacher">
                                <TeacherDashboard />
                            </ProtectedRoute>
                        }
                    />

                    {/* Dashboard — super_admin + admin */}
                    <Route
                        path="/admin/dashboard"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.VIEW_DASHBOARD}>
                                <AdminDashboard />
                            </ProtectedRoute>
                        }
                    />

                    {/* Student management — super_admin + admin */}
                    <Route
                        path="/admin/users"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.MANAGE_STUDENTS}>
                                <UserManagement />
                            </ProtectedRoute>
                        }
                    />

                    {/* MCQ Bank — all admin roles */}
                    <Route
                        path="/admin/mcqs"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.MANAGE_MCQS}>
                                <MCQBank />
                            </ProtectedRoute>
                        }
                    />

                    {/* MCQ Types — all admin roles */}
                    <Route
                        path="/admin/mcq-types"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.MANAGE_MCQS}>
                                <MCQTypeManagement />
                            </ProtectedRoute>
                        }
                    />

                    {/* Quizzes — super_admin + admin */}
                    <Route
                        path="/admin/quizzes"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.MANAGE_QUIZZES}>
                                <QuizConfiguration />
                            </ProtectedRoute>
                        }
                    />

                    {/* Results — super_admin + admin */}
                    <Route
                        path="/admin/results"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.VIEW_RESULTS}>
                                <ResultsView />
                            </ProtectedRoute>
                        }
                    />

                    {/* Admin account management — super_admin only */}
                    <Route
                        path="/admin/admins"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.MANAGE_ADMINS}>
                                <AdminManagement />
                            </ProtectedRoute>
                        }
                    />

                    {/* Teacher monitoring - super_admin only */}
                    <Route
                        path="/admin/teachers"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.MANAGE_ADMINS}>
                                <TeacherManagement />
                            </ProtectedRoute>
                        }
                    />

                    {/* Audit logs — super_admin only */}
                    <Route
                        path="/admin/audit-logs"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.VIEW_AUDIT_LOGS}>
                                <AuditLogs />
                            </ProtectedRoute>
                        }
                    />

                    {/* Test Categories — super_admin only */}
                    <Route
                        path="/admin/test-categories"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.MANAGE_ADMINS}>
                                <TestCategoryManagement />
                            </ProtectedRoute>
                        }
                    />

                    {/* Category Quiz Config — super_admin + admin */}
                    <Route
                        path="/admin/category-quiz-configs"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.MANAGE_QUIZZES}>
                                <CategoryQuizConfigPage />
                            </ProtectedRoute>
                        }
                    />

                    {/* My Account — super_admin only */}
                    <Route
                        path="/admin/me"
                        element={
                            <ProtectedRoute requiredRole="admin" requiredPermission={PERMISSIONS.MANAGE_OWN_CREDENTIALS}>
                                <MyAccount />
                            </ProtectedRoute>
                        }
                    />

                    {/* User routes */}
                    <Route path="/user/login" element={<UserLogin />} />
                    <Route path="/user/register" element={<StudentRegister />} />
                    <Route path="/verify-email" element={<VerifyEmail />} />
                    <Route
                        path="/verify-email-pending"
                        element={
                            <ProtectedRoute requiredRole="user" allowUnverified={true}>
                                <VerifyEmailPending />
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route
                        path="/user/change-password"
                        element={
                            <ProtectedRoute requiredRole="user">
                                <ChangePassword />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/user/dashboard"
                        element={
                            <ProtectedRoute requiredRole="user">
                                <UserDashboard />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/user/quiz/:id"
                        element={
                            <ProtectedRoute requiredRole="user">
                                <QuizAttempt />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/user/result"
                        element={
                            <ProtectedRoute requiredRole="user">
                                <QuizResult />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/user/results"
                        element={
                            <ProtectedRoute requiredRole="user">
                                <ResultsHistory />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/user/bookmarks"
                        element={
                            <ProtectedRoute requiredRole="user">
                                <Bookmarks />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/user/mistakes"
                        element={
                            <ProtectedRoute requiredRole="user">
                                <MistakeBook />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/user/reports"
                        element={
                            <ProtectedRoute requiredRole="user">
                                <PerformanceReports />
                            </ProtectedRoute>
                        }
                    />
                    <Route
                        path="/user/review/:resultId"
                        element={
                            <ProtectedRoute requiredRole="user">
                                <AnswerReview />
                            </ProtectedRoute>
                        }
                    />

                    {/* 404 */}
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
};

export default App;
