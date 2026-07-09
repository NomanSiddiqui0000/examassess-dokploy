import { Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { TestCategory } from '../models/TestCategory';
import { CreditLog } from '../models/CreditLog';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendVerificationEmail, sendPasswordResetEmail } from '../utils/email';
import { provisionNewTeacherResources } from '../services/teacher-resource.service';
import {
    createEmailVerificationToken,
    getUnverifiedAccountExpiry,
    normalizeEmailAddress,
    validateEmailAddress,
    validateEmailForAccount,
} from '../utils/email-security';

const ADMIN_ROLES = ['super_admin', 'admin', 'content_manager'];
const MAX_DAILY_RESETS = 5;

function escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function emailIdentityQuery(email: string) {
    const exact = normalizeEmailAddress(email);
    const insensitive = new RegExp(`^${escapeRegex(exact)}$`, 'i');
    return {
        $or: [
            { email: exact },
            { username: exact },
            { email: insensitive },
            { username: insensitive },
        ],
    };
}

export const adminLogin = async (req: AuthRequest, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        // Find any admin sub-role user
        const user = await User.findOne({
            username,
            role: { $in: ADMIN_ROLES },
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!user.isActive) {
            return res.status(403).json({ message: 'Account is disabled. Contact your Super Admin.' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        user.lastLogin = new Date();
        await user.save();

        const jwtSecret = process.env.JWT_SECRET!;
        const jwtExpiry = process.env.JWT_EXPIRES_IN || '7d';

        // @ts-ignore
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            jwtSecret,
            { expiresIn: jwtExpiry }
        );

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role,
                mustChangePassword: user.mustChangePassword,
            },
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const userLogin = async (req: AuthRequest, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const normalizedLogin = normalizeEmailAddress(username);
        const trimmedPassword = password.trim();

        // Support login by username OR email
        const user = await User.findOne({
            role: 'user',
            $or: [
                { username: normalizedLogin },
                { email: normalizedLogin },
            ],
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (!user.isActive) {
            return res.status(403).json({ message: 'Account is disabled' });
        }

        // NO credit check here — login always succeeds with valid credentials
        console.log(`[Login] Attempting login for: ${user.email || user.username}`);
        const isPasswordValid = await bcrypt.compare(trimmedPassword, user.password);
        console.log(`[Login] Password valid: ${isPasswordValid}`);

        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // ─── Email Verification Check ─────────────────────────────────────────
        // Student users ('user' role) bypass this block at login because they
        // are gated on individual practice routes and redirected on the frontend.
        if (user.role !== 'user' && !user.emailVerified) {
            return res.status(403).json({
                errorCode: 'EMAIL_NOT_VERIFIED',
                message: 'Please verify your email before logging in. Check your inbox for the verification link.',
                email: user.email,
            });
        }
        // ─── End Email Verification Check ─────────────────────────────────────

        user.lastLogin = new Date();
        await user.save();

        const jwtSecret = process.env.JWT_SECRET!;
        const jwtExpiry = process.env.JWT_EXPIRES_IN || '7d';

        // @ts-ignore
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            jwtSecret,
            { expiresIn: jwtExpiry }
        );

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                credits: user.credits,
                testCategory: user.testCategory,
                mustChangePassword: user.mustChangePassword,
                modules: user.modules,
            },
        });
    } catch (error) {
        console.error('User login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const teacherLogin = async (req: AuthRequest, res: Response) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Email and password are required' });
        }

        const normalized = String(username).trim().toLowerCase();
        const user = await User.findOne({
            role: 'teacher',
            $or: [{ username: normalized }, { email: normalized }],
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (!user.isActive) {
            return res.status(403).json({ message: 'Account is disabled' });
        }

        const isPasswordValid = await bcrypt.compare(String(password).trim(), user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                errorCode: 'EMAIL_NOT_VERIFIED',
                message: 'Please verify your email before logging in. Check your inbox for the verification link.',
                email: user.email,
            });
        }

        user.lastLogin = new Date();
        await user.save();

        const jwtSecret = process.env.JWT_SECRET!;
        const jwtExpiry = process.env.JWT_EXPIRES_IN || '7d';

        // @ts-ignore
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            jwtSecret,
            { expiresIn: jwtExpiry }
        );

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                mustChangePassword: user.mustChangePassword,
            },
        });
    } catch (error) {
        console.error('Teacher login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

export const teacherRegister = async (req: AuthRequest, res: Response) => {
    try {
        const { fullName, email, password } = req.body;

        if (!fullName || !email || !password) {
            return res.status(400).json({ message: 'Full name, email, and password are required' });
        }

        const emailValidation = validateEmailForAccount(email);
        if (!emailValidation.valid) {
            return res.status(400).json({ message: emailValidation.message });
        }
        const normalizedEmail = emailValidation.email;
        const trimmedPassword = String(password).trim();

        if (trimmedPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        const existingUser = await User.findOne(emailIdentityQuery(normalizedEmail));
        if (existingUser) {
            return res.status(409).json({ message: 'This email is already registered.' });
        }

        const hashedPassword = await bcrypt.hash(trimmedPassword, 10);
        const { verificationToken, hashedToken, expiresAt } = createEmailVerificationToken();
        const user = await User.create({
            username: normalizedEmail,
            email: normalizedEmail,
            fullName: String(fullName).trim(),
            password: hashedPassword,
            role: 'teacher',
            isActive: true,
            emailVerified: false,
            emailVerificationToken: hashedToken,
            emailVerificationExpires: expiresAt,
            registrationSource: 'teacher_self',
            unverifiedAccountExpiresAt: getUnverifiedAccountExpiry('teacher_self'),
            credits: 0,
        });

        // Grant the default signup quota (limited email credits, classrooms,
        // students, question bank, and assessments). Best-effort: a failure here
        // must not block account creation — the teacher account already exists.
        try {
            await provisionNewTeacherResources(user._id as any);
        } catch (provisionError: any) {
            console.error(`[TeacherRegister] Failed to provision default resources for ${normalizedEmail}:`, provisionError?.message || provisionError);
        }

        try {
            await sendVerificationEmail(normalizedEmail, verificationToken);
        } catch (emailError: any) {
            console.error(`[TeacherRegister] Failed to send verification email to ${normalizedEmail}:`, emailError.message);
            return res.status(500).json({
                message: 'Teacher account created, but verification email could not be sent. Please contact support or try resend verification.',
                email: normalizedEmail,
                requiresVerification: true,
            });
        }

        res.status(201).json({
            message: 'Teacher registration successful. Please check your email to verify your account.',
            requiresVerification: true,
            email: normalizedEmail,
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
            },
        });
    } catch (error) {
        console.error('Teacher registration error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ─── Student Self-Registration ────────────────────────────────────────────────

export const studentRegister = async (req: AuthRequest, res: Response) => {
    try {
        const { fullName, email, password, testCategoryId } = req.body;

        if (!fullName || !email || !password || !testCategoryId) {
            return res.status(400).json({
                message: 'Full name, email, password, and test category are required',
            });
        }

        const emailValidation = validateEmailForAccount(email);
        if (!emailValidation.valid) {
            return res.status(400).json({ message: emailValidation.message });
        }

        const normalizedEmail = emailValidation.email;
        const trimmedPassword = password.trim();

        if (trimmedPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters' });
        }

        // Check if email/username already exists
        const existingUser = await User.findOne(emailIdentityQuery(normalizedEmail));

        // ─── Unified Identity: Activate practice module for existing accounts ──
        if (existingUser) {
            // Non-student accounts cannot be upgraded
            if (existingUser.role !== 'user') {
                return res.status(409).json({ message: 'This email is already registered.' });
            }

            // Already has practice module — truly duplicate registration
            if (existingUser.modules?.practiceModule) {
                return res.status(409).json({ message: 'This email is already registered.' });
            }

            // Existing student without practice module (teacher-invited) — activate it
            const category = await TestCategory.findById(testCategoryId);
            if (!category || !category.isActive) {
                return res.status(400).json({ message: 'Invalid or inactive test category' });
            }

            // Update password (teacher-set temporary → student-chosen)
            existingUser.password = await bcrypt.hash(trimmedPassword, 10);
            existingUser.mustChangePassword = false;

            // Activate practice module
            existingUser.modules = {
                practiceModule: true,
                teacherAssessments: existingUser.modules?.teacherAssessments ?? true,
            };
            existingUser.testCategory = category._id;
            existingUser.credits = (existingUser.credits || 0) + category.defaultCredits;
            if (!existingUser.fullName && fullName) {
                existingUser.fullName = fullName.trim();
            }
            if (!existingUser.registrationSource || existingUser.registrationSource === 'teacher_invite') {
                existingUser.registrationSource = 'self_student';
            }

            // ─── Practice access requires its own email verification ──────────
            // Activating the practice module ALWAYS forces a fresh email
            // verification — even if this account was already verified for
            // classroom assessments. The student must confirm via email before
            // the Practice Module unlocks (enforced by requireVerifiedEmailIfPractice).
            // Classroom-assessment routes do not depend on emailVerified, so the
            // student's existing assessment access is unaffected.
            const { verificationToken, hashedToken, expiresAt } = createEmailVerificationToken();
            existingUser.emailVerified = false;
            existingUser.emailVerificationToken = hashedToken;
            existingUser.emailVerificationExpires = expiresAt;
            existingUser.unverifiedAccountExpiresAt = getUnverifiedAccountExpiry('self_student');

            await existingUser.save();

            // Log credit assignment
            await CreditLog.create({
                userId: existingUser._id,
                action: 'initial_assignment',
                amount: category.defaultCredits,
                balanceAfter: existingUser.credits,
                performedBy: existingUser._id,
                reason: `Practice module activated with category: ${category.name}`,
                timestamp: new Date(),
            });

            // Send the verification email — practice activation always requires it
            try {
                console.log(`[Register] Sending verification email for practice activation to: ${normalizedEmail}`);
                await sendVerificationEmail(normalizedEmail, verificationToken);
            } catch (emailError: any) {
                console.error(`[Register] Failed to send verification email to ${normalizedEmail}:`, emailError.message);
                return res.status(500).json({
                    message: 'Practice module activated, but verification email could not be sent. Please check your SMTP settings or try again.',
                    requiresVerification: true,
                    email: normalizedEmail,
                });
            }

            return res.status(200).json({
                message: 'Practice module activated! Please check your email to verify your account before accessing the Practice Module.',
                moduleActivated: true,
                requiresVerification: true,
                email: normalizedEmail,
            });
        }

        // ─── New account registration (no existing user) ──────────────────────

        // Fetch test category for default credits
        const category = await TestCategory.findById(testCategoryId);
        if (!category || !category.isActive) {
            return res.status(400).json({ message: 'Invalid or inactive test category' });
        }

        const hashedPassword = await bcrypt.hash(trimmedPassword, 10);

        // ─── Generate verification token ──────────────────────────────────────
        const { verificationToken, hashedToken, expiresAt } = createEmailVerificationToken();


        // ─── Create user using constructor + explicit assignment + save ────────
        const user = new User();
        user.username = normalizedEmail;
        user.email = normalizedEmail;
        user.fullName = fullName.trim();
        user.password = hashedPassword;
        user.role = 'user';
        user.isActive = true;
        user.testCategory = category._id;
        user.credits = category.defaultCredits;
        user.modules = { practiceModule: true, teacherAssessments: false };
        user.emailVerified = false;
        user.emailVerificationToken = hashedToken;
        user.emailVerificationExpires = expiresAt;
        user.registrationSource = 'self_student';
        user.unverifiedAccountExpiresAt = getUnverifiedAccountExpiry('self_student');

        await user.save();

        // Log initial credit assignment
        await CreditLog.create({
            userId: user._id,
            action: 'initial_assignment',
            amount: category.defaultCredits,
            balanceAfter: category.defaultCredits,
            performedBy: user._id,
            reason: `Self-registration with category: ${category.name}`,
            timestamp: new Date(),
        });

        try {
            console.log(`[Register] Sending verification email to: ${normalizedEmail}`);
            await sendVerificationEmail(normalizedEmail, verificationToken);
        } catch (emailError: any) {
            console.error(`[Register] Failed to send verification email to ${normalizedEmail}:`, emailError.message);
            return res.status(500).json({
                message: 'Registration created, but verification email could not be sent. Please contact support or try resend verification.',
                requiresVerification: true,
                email: normalizedEmail,
            });
        }


        res.status(201).json({
            message: 'Registration successful. Please check your email to verify your account.',
            requiresVerification: true,
            email: normalizedEmail,
        });
    } catch (error) {
        console.error('Student registration error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};


// ─── Email Verification ───────────────────────────────────────────────────────

export const verifyEmail = async (req: AuthRequest, res: Response) => {
    try {
        const { token } = req.query;

        console.log('[VerifyEmail] ── Request received ──');
        console.log('[VerifyEmail] Token from URL:', token ? `${String(token).substring(0, 10)}...` : 'MISSING');

        if (!token || typeof token !== 'string') {
            return res.status(400).json({ message: 'Verification token is required.' });
        }

        // Hash the incoming token and find matching user
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        // First try exact match
        const user = await User.findOne({
            emailVerificationToken: hashedToken,
        });


        // (in case token was stored unhashed by mistake)
        if (!user) {
            const userByPlainToken = await User.findOne({
                emailVerificationToken: token,
            });


            if (userByPlainToken) {
                // Token was stored unhashed — fix it and verify
                console.log('[VerifyEmail] ⚠️ Token was stored as plain text, verifying and fixing...');
                userByPlainToken.emailVerified = true;
                userByPlainToken.emailVerificationToken = undefined;
                userByPlainToken.emailVerificationExpires = undefined;
                userByPlainToken.unverifiedAccountExpiresAt = undefined;
                await userByPlainToken.save();


                return res.json({
                    message: 'Email successfully verified! You can now log in.',
                    verified: true,
                    role: userByPlainToken.role,
                });
            }

            // No match at all — also check if any user has this email and is already verified

            return res.status(400).json({
                message: 'This verification link has already been used or is invalid. Please request a new one.',
                expired: true,
            });
        }

        console.log('[VerifyEmail] User email:', user.email);
        console.log('[VerifyEmail] User emailVerified:', user.emailVerified);
        console.log('[VerifyEmail] Token expires:', user.emailVerificationExpires);
        console.log('[VerifyEmail] DB token (first 16 chars):', user.emailVerificationToken?.substring(0, 16));

        // Already verified
        if (user.emailVerified) {
            user.emailVerificationToken = undefined;
            user.emailVerificationExpires = undefined;
            user.unverifiedAccountExpiresAt = undefined;
            await user.save();
            return res.json({
                message: 'Your email is already verified. You can log in.',
                verified: true,
                role: user.role,
            });
        }

        // Check token expiry
        if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
            console.log('[VerifyEmail] ❌ Token expired');
            return res.status(400).json({
                message: 'This verification link has expired. Please request a new one.',
                expired: true,
            });
        }

        // Mark email as verified and clear token fields (single-use)
        user.emailVerified = true;
        user.emailVerificationToken = undefined;
        user.emailVerificationExpires = undefined;
        user.unverifiedAccountExpiresAt = undefined;
        await user.save();

        console.log(`[VerifyEmail] ✅ Email verified for: ${user.email}`);

        res.json({
            message: 'Email successfully verified! You can now log in.',
            verified: true,
            role: user.role,
        });
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ message: 'Something went wrong. Please try again later.' });
    }
};

// ─── Resend Verification Email ────────────────────────────────────────────────

export const resendVerification = async (req: AuthRequest, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required.' });
        }

        const emailValidation = validateEmailAddress(email);
        if (!emailValidation.valid) {
            return res.status(400).json({ message: emailValidation.message });
        }

        const normalizedEmail = emailValidation.email;
        const user = await User.findOne({ email: normalizedEmail, role: { $in: ['user', 'teacher'] } });

        if (!user) {
            // Don't reveal whether account exists
            return res.json({ message: 'If an account with that email exists, a verification email has been sent.' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ message: 'This email is already verified. You can log in.' });
        }

        // Rate limit: if token was generated less than 1 minute ago, reject
        if (user.emailVerificationExpires) {
            const tokenAge = 24 * 60 * 60 * 1000 - (user.emailVerificationExpires.getTime() - Date.now());
            if (tokenAge < 60 * 1000) { // less than 1 minute since last send
                return res.status(429).json({
                    message: 'Please wait at least 1 minute before requesting another verification email.',
                });
            }
        }

        // Generate new token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');

        user.emailVerificationToken = hashedToken;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        if (!user.unverifiedAccountExpiresAt || user.unverifiedAccountExpiresAt < new Date()) {
            user.unverifiedAccountExpiresAt = getUnverifiedAccountExpiry(user.registrationSource === 'teacher_invite' ? 'teacher_invite' : user.role === 'teacher' ? 'teacher_self' : 'self_student');
        }
        await user.save();

        try {
            console.log(`[Resend] Sending verification email to: ${normalizedEmail}`);
            await sendVerificationEmail(normalizedEmail, verificationToken);
            console.log(`[Resend] ✅ Verification email sent successfully to: ${normalizedEmail}`);
        } catch (emailError: any) {
            console.error(`[Resend] ❌ Failed to send verification email to ${normalizedEmail}:`, emailError.message);
            return res.status(500).json({ message: 'Failed to send verification email. Please try again later.' });
        }

        res.json({ message: 'Verification email sent. Please check your inbox.' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ message: 'Something went wrong. Please try again later.' });
    }
};

// ─── Forgot Password ──────────────────────────────────────────────────────────

export const forgotPassword = async (req: AuthRequest, res: Response) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ message: 'Email is required.' });
        }

        const emailValidation = validateEmailAddress(email);
        if (!emailValidation.valid) {
            return res.status(400).json({ message: emailValidation.message });
        }

        const normalizedEmail = emailValidation.email;
        const user = await User.findOne({ email: normalizedEmail, role: { $in: ['user', 'teacher'] } });

        // Generic response — never reveal if email exists
        const genericResponse = { message: 'If an account with that email exists, a password reset link has been sent.' };

        if (!user) {
            return res.json(genericResponse);
        }

        // ─── Daily Rate Limit ─────────────────────────────────────────────────
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Reset counter if last request was >24h ago
        if (!user.passwordResetLastRequest || user.passwordResetLastRequest < oneDayAgo) {
            user.passwordResetCount = 0;
        }

        if (user.passwordResetCount >= MAX_DAILY_RESETS) {
            return res.status(429).json({ message: 'Please try again later.' });
        }
        // ─── End Rate Limit ───────────────────────────────────────────────────

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        user.passwordResetCount = (user.passwordResetCount || 0) + 1;
        user.passwordResetLastRequest = now;
        await user.save();

        // Send reset email
        try {
            console.log(`[ForgotPassword] Sending password reset email to: ${normalizedEmail}`);
            await sendPasswordResetEmail(normalizedEmail, resetToken);
            console.log(`[ForgotPassword] ✅ Password reset email sent to: ${normalizedEmail}`);
        } catch (emailError: any) {
            console.error(`[ForgotPassword] ❌ Failed to send reset email to ${normalizedEmail}:`, emailError.message);
            return res.status(500).json({ message: 'Failed to send reset email. Please try again later.' });
        }

        res.json(genericResponse);
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ message: 'Something went wrong. Please try again later.' });
    }
};

// ─── Reset Password ───────────────────────────────────────────────────────────

export const resetPassword = async (req: AuthRequest, res: Response) => {
    try {
        const { token, password } = req.body;

        if (!token || !password) {
            return res.status(400).json({ message: 'Token and new password are required.' });
        }

        const trimmedPassword = password.trim();

        if (trimmedPassword.length < 6) {
            return res.status(400).json({ message: 'Password must be at least 6 characters.' });
        }

        // Hash the incoming token and find matching user
        const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: new Date() },
        });

        if (!user) {
            return res.status(400).json({
                message: 'Invalid or expired reset link. Please request a new one.',
                expired: true,
            });
        }

        // Hash and save new password
        user.password = await bcrypt.hash(trimmedPassword, 10);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        user.lastPasswordChange = new Date();
        await user.save();

        console.log(`[ResetPassword] ✅ Password reset successful for: ${user.email}`);

        res.json({ message: 'Password reset successful! You can now log in with your new password.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ message: 'Something went wrong. Please try again later.' });
    }
};

/**
 * Allows unverified students to change their email address and triggers a new verification email.
 */
export const changeEmail = async (req: AuthRequest, res: Response) => {
    try {
        const { newEmail } = req.body;
        if (!newEmail) {
            return res.status(400).json({ message: 'New email is required' });
        }

        const emailValidation = validateEmailForAccount(newEmail);
        if (!emailValidation.valid) {
            return res.status(400).json({ message: emailValidation.message });
        }

        const normalizedEmail = emailValidation.email;

        // Check if the email is already taken by another user
        const existingUser = await User.findOne({
            _id: { $ne: req.user!.id },
            $or: [
                { email: normalizedEmail },
                { username: normalizedEmail }
            ]
        });

        if (existingUser) {
            return res.status(409).json({ message: 'This email is already registered to another account.' });
        }

        const user = await User.findById(req.user!.id);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.emailVerified) {
            return res.status(400).json({ message: 'Email is already verified. You cannot change it here.' });
        }

        // Update email and username
        user.email = normalizedEmail;
        user.username = normalizedEmail;

        // Generate new verification token
        const { verificationToken, hashedToken, expiresAt } = createEmailVerificationToken();
        user.emailVerificationToken = hashedToken;
        user.emailVerificationExpires = expiresAt;
        user.unverifiedAccountExpiresAt = getUnverifiedAccountExpiry('self_student');

        await user.save();

        // Send verification email
        try {
            console.log(`[ChangeEmail] Sending verification email to: ${normalizedEmail}`);
            await sendVerificationEmail(normalizedEmail, verificationToken);
        } catch (emailError: any) {
            console.error(`[ChangeEmail] Failed to send verification email:`, emailError.message);
            return res.status(500).json({
                message: 'Email updated in profile, but verification email could not be sent. Please check your SMTP settings or try again.',
                email: normalizedEmail,
            });
        }

        res.json({
            message: 'Email updated successfully. A new verification link has been sent to your new email.',
            email: normalizedEmail,
        });
    } catch (error) {
        console.error('Change email error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

