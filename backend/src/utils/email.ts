import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';

// ─── Lazy-initialized SMTP Transport (Brevo) ────────────────────────────────
// The transporter is created on first use, NOT at import time.
// This ensures dotenv.config() has already been called in server.ts.
let _transporter: Mail | null = null;

function envValue(...keys: string[]) {
    for (const key of keys) {
        const value = process.env[key];
        if (value && value.trim()) return value.trim();
    }
    return '';
}

function getSmtpConfig() {
    const port = Number(envValue('SMTP_PORT', 'BREVO_SMTP_PORT')) || 587;
    const secureEnv = envValue('SMTP_SECURE', 'BREVO_SMTP_SECURE').toLowerCase();
    return {
        host: envValue('SMTP_HOST', 'BREVO_SMTP_HOST') || 'smtp-relay.brevo.com',
        port,
        secure: secureEnv ? secureEnv === 'true' : port === 465,
        user: envValue('SMTP_USER', 'SMTP_USERNAME', 'BREVO_SMTP_USER', 'BREVO_SMTP_LOGIN'),
        pass: envValue('SMTP_PASS', 'SMTP_PASSWORD', 'BREVO_SMTP_PASS', 'BREVO_SMTP_KEY', 'BREVO_API_KEY'),
        from: envValue('EMAIL_FROM', 'SMTP_FROM', 'BREVO_EMAIL_FROM') || 'ExamAssess <noreply@uniassess.live>',
    };
}

function requireSmtpConfig(config: ReturnType<typeof getSmtpConfig>) {
    if (!config.user || !config.pass) {
        throw new Error('SMTP credentials are not configured. Set SMTP_USER and SMTP_PASS, or Brevo aliases BREVO_SMTP_USER/BREVO_SMTP_KEY, in the environment.');
    }
}

function getTransporter(): Mail {
    if (!_transporter) {
        const smtp = getSmtpConfig();
        requireSmtpConfig(smtp);

        console.log('[Email] Initializing SMTP transporter...');
        console.log('[Email]   SMTP_HOST:', smtp.host);
        console.log('[Email]   SMTP_PORT:', smtp.port);
        console.log('[Email]   SMTP_SECURE:', smtp.secure);
        console.log('[Email]   SMTP_USER:', smtp.user ? '***set***' : '***NOT SET***');
        console.log('[Email]   SMTP_PASS:', smtp.pass ? '***set***' : '***NOT SET***');
        console.log('[Email]   EMAIL_FROM:', smtp.from);

        _transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure,
            auth: {
                user: smtp.user,
                pass: smtp.pass,
            },
            tls: {
                rejectUnauthorized: false,
            },
        });

        // Verify SMTP connection
        _transporter.verify((error, success) => {
            if (error) {
                console.error('[Email] ❌ SMTP connection failed:', error.message);
            } else {
                console.log('[Email] ✅ SMTP server ready to send emails');
            }
        });
    }
    return _transporter;
}

const getEmailFrom = () => getSmtpConfig().from;
const getFrontendUrl = () => envValue('FRONTEND_URL', 'APP_URL') || 'https://examassess-exam-bt2dei-582625-34-153-65-85.sslip.io';
const getInvitationLoginUrl = () => envValue('INVITATION_LOGIN_URL') || `${getFrontendUrl().replace(/\/$/, '')}/login`;
const escapeHtml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * Send a verification email with a clickable link.
 * @param toEmail - recipient email address
 * @param token - raw (unhashed) verification token
 */
export async function sendVerificationEmail(toEmail: string, token: string): Promise<void> {
    const frontendUrl = getFrontendUrl();
    const emailFrom = getEmailFrom();
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

    console.log(`[Email] Preparing verification email for: ${toEmail}`);
    console.log(`[Email] FROM: ${emailFrom}`);

    const mailOptions = {
        from: emailFrom,
        to: toEmail,
        subject: 'Verify your ExamAssess account',
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
                <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">ExamAssess</h1>
                </div>
                <div style="background: #ffffff; border: 1px solid #e8e8e8; border-radius: 12px; padding: 32px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 16px;">✉️</div>
                    <h2 style="color: #1a1a2e; margin: 0 0 12px;">Verify Your Email</h2>
                    <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
                        Thank you for registering at ExamAssess.<br/>
                        Please verify your email by clicking the button below:
                    </p>
                    <a href="${verifyUrl}"
                       style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                              color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px;
                              font-weight: 600; font-size: 15px; letter-spacing: 0.3px;">
                        Verify Email Address
                    </a>
                    <p style="color: #888; font-size: 13px; margin: 24px 0 0; line-height: 1.5;">
                        This link will expire in <strong>24 hours</strong>.<br/>
                        If you did not create this account, please ignore this email.
                    </p>
                </div>
                <p style="color: #aaa; font-size: 12px; text-align: center; margin-top: 24px;">
                    &copy; ${new Date().getFullYear()} ExamAssess. All rights reserved.
                </p>
            </div>
        `,
    };

    try {
        const info = await getTransporter().sendMail(mailOptions);
        console.log(`[Email] ✅ Verification email sent successfully to: ${toEmail}`);
        console.log(`[Email]    Message ID: ${info.messageId}`);
        console.log(`[Email]    Response: ${info.response}`);
    } catch (error: any) {
        console.error(`[Email] ❌ Failed to send email to: ${toEmail}`);
        console.error(`[Email]    Error name: ${error.name}`);
        console.error(`[Email]    Error message: ${error.message}`);
        if (error.code) console.error(`[Email]    Error code: ${error.code}`);
        if (error.responseCode) console.error(`[Email]    SMTP response code: ${error.responseCode}`);
        if (error.response) console.error(`[Email]    SMTP response: ${error.response}`);
        throw error;
    }
}

/**
 * Send a simple test email to verify SMTP connectivity.
 */
export async function sendTestEmail(toEmail: string): Promise<{ success: boolean; messageId?: string; error?: string }> {
    console.log(`[Email] Sending test email to: ${toEmail}`);

    try {
        const info = await getTransporter().sendMail({
            from: getEmailFrom(),
            to: toEmail,
            subject: 'ExamAssess SMTP Test',
            html: `
                <div style="font-family: sans-serif; padding: 20px; text-align: center;">
                    <h2>SMTP Test Successful</h2>
                    <p>This email confirms that ExamAssess email delivery is working.</p>
                    <p style="color: #888; font-size: 12px;">Sent at: ${new Date().toISOString()}</p>
                </div>
            `,
        });

        console.log(`[Email] ✅ Test email sent. Message ID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (error: any) {
        console.error(`[Email] ❌ Test email failed:`, error.message);
        return { success: false, error: error.message };
    }
}

/**
 * Send a password reset email with a clickable link.
 * @param toEmail - recipient email address
 * @param token - raw (unhashed) reset token
 */
export async function sendPasswordResetEmail(toEmail: string, token: string): Promise<void> {
    const frontendUrl = getFrontendUrl();
    const emailFrom = getEmailFrom();
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    console.log(`[Email] Preparing password reset email for: ${toEmail}`);

    const mailOptions = {
        from: emailFrom,
        to: toEmail,
        subject: 'Reset your ExamAssess password',
        html: `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
                <div style="text-align: center; margin-bottom: 32px;">
                    <h1 style="color: #1a1a2e; margin: 0; font-size: 24px;">ExamAssess</h1>
                </div>
                <div style="background: #ffffff; border: 1px solid #e8e8e8; border-radius: 12px; padding: 32px; text-align: center;">
                    <div style="font-size: 48px; margin-bottom: 16px;">🔑</div>
                    <h2 style="color: #1a1a2e; margin: 0 0 12px;">Reset Your Password</h2>
                    <p style="color: #555; line-height: 1.6; margin: 0 0 24px;">
                        We received a request to reset your password.<br/>
                        Click the button below to set a new password:
                    </p>
                    <a href="${resetUrl}"
                       style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                              color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px;
                              font-weight: 600; font-size: 15px; letter-spacing: 0.3px;">
                        Reset Password
                    </a>
                    <p style="color: #888; font-size: 13px; margin: 24px 0 0; line-height: 1.5;">
                        This link will expire in <strong>1 hour</strong>.<br/>
                        If you did not request a password reset, please ignore this email.
                    </p>
                </div>
                <p style="color: #aaa; font-size: 12px; text-align: center; margin-top: 24px;">
                    &copy; ${new Date().getFullYear()} ExamAssess. All rights reserved.
                </p>
            </div>
        `,
    };

    try {
        const info = await getTransporter().sendMail(mailOptions);
        console.log(`[Email] ✅ Password reset email sent successfully to: ${toEmail}`);
        console.log(`[Email]    Message ID: ${info.messageId}`);
    } catch (error: any) {
        console.error(`[Email] ❌ Failed to send password reset email to: ${toEmail}`);
        console.error(`[Email]    Error: ${error.message}`);
        throw error;
    }
}

export async function sendClassroomInvitationEmail(
    toEmail: string,
    payload: {
        studentName?: string;
        teacherName: string;
        classroomName: string;
        loginEmail: string;
        temporaryPassword?: string;
        assessmentName?: string;
        assessmentStart?: Date;
        assessmentEnd?: Date;
        durationMinutes?: number;
        totalQuestions?: number;
        lateJoinPolicy?: 'allow' | 'block';
        verificationToken?: string;
    }
): Promise<void> {
    const portalUrl = getInvitationLoginUrl();
    const verificationUrl = payload.verificationToken
        ? `${getFrontendUrl()}/verify-email?token=${payload.verificationToken}`
        : '';
    const studentName = escapeHtml(payload.studentName || 'Student');
    const teacherName = escapeHtml(payload.teacherName);
    const classroomName = escapeHtml(payload.classroomName);
    const loginEmail = escapeHtml(payload.loginEmail);
    const temporaryPassword = payload.temporaryPassword ? escapeHtml(payload.temporaryPassword) : '';
    const assessmentName = payload.assessmentName ? escapeHtml(payload.assessmentName) : '';
    const assessmentRows = payload.assessmentName
        ? `
                        <tr><td style="padding:8px 0;color:#64748b;width:42%;">Assessment</td><td style="padding:8px 0;color:#0f172a;font-weight:700;">${assessmentName}</td></tr>
                        ${payload.assessmentStart ? `<tr><td style="padding:8px 0;color:#64748b;">Start Date & Time</td><td style="padding:8px 0;color:#0f172a;font-weight:600;">${escapeHtml(payload.assessmentStart.toLocaleString())}</td></tr>` : ''}
                        ${payload.assessmentEnd ? `<tr><td style="padding:8px 0;color:#64748b;">End Date & Time</td><td style="padding:8px 0;color:#0f172a;font-weight:600;">${escapeHtml(payload.assessmentEnd.toLocaleString())}</td></tr>` : ''}
                        ${payload.durationMinutes ? `<tr><td style="padding:8px 0;color:#64748b;">Quiz Duration</td><td style="padding:8px 0;color:#0f172a;font-weight:600;">${payload.durationMinutes} minutes</td></tr>` : ''}
                        ${payload.totalQuestions ? `<tr><td style="padding:8px 0;color:#64748b;">Total Questions</td><td style="padding:8px 0;color:#0f172a;font-weight:600;">${payload.totalQuestions}</td></tr>` : ''}
        `
        : '';
    const lateJoinMessage = payload.lateJoinPolicy === 'block'
        ? 'Late entry is not permitted. Students must join at the scheduled start time. Missing the assessment window will result in the assessment being marked as failed.'
        : 'Students may join during the assessment window. However, the assessment will automatically close at the scheduled end time.';
    const passwordLine = payload.temporaryPassword
        ? `<tr><td style="padding:6px 0;color:#64748b;">Temporary Password</td><td style="padding:6px 0;color:#0f172a;font-weight:700;">${temporaryPassword}</td></tr>`
        : `<tr><td style="padding:6px 0;color:#64748b;">Password</td><td style="padding:6px 0;color:#0f172a;font-weight:600;">Use your existing ExamAssess password</td></tr>`;
    const verificationText = payload.verificationToken
        ? [
            '',
            'Email Verification',
            'Please verify your email before signing in:',
            verificationUrl,
        ]
        : [];
    const verificationHtml = payload.verificationToken
        ? `
                    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:16px;margin:0 0 22px;">
                        <h2 style="color:#0D2F69;font-size:16px;margin:0 0 8px;">Verify Your Email</h2>
                        <p style="color:#334155;font-size:13px;line-height:1.5;margin:0 0 12px;">For account security, verify your email before signing in. This invitation remains available for up to 7 days.</p>
                        <a href="${escapeHtml(verificationUrl)}" style="display:inline-block;background:#0D2F69;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-weight:700;">Verify Email</a>
                    </div>
        `
        : '';

    const mailOptions = {
        from: getEmailFrom(),
        to: toEmail,
        subject: 'Classroom Invitation - ExamAssess',
        text: [
            `Hello ${payload.studentName || 'Student'},`,
            '',
            'You have been invited to join a classroom on ExamAssess.',
            '',
            `Teacher: ${payload.teacherName}`,
            `Classroom: ${payload.classroomName}`,
            payload.assessmentName ? `Assessment Name: ${payload.assessmentName}` : '',
            payload.assessmentStart ? `Start Date and Time: ${payload.assessmentStart.toLocaleString()}` : '',
            payload.assessmentEnd ? `End Date and Time: ${payload.assessmentEnd.toLocaleString()}` : '',
            payload.durationMinutes ? `Quiz Duration: ${payload.durationMinutes} minutes` : '',
            payload.totalQuestions ? `Total Questions: ${payload.totalQuestions}` : '',
            payload.assessmentName ? `Late Join Policy: ${lateJoinMessage}` : '',
            '',
            'Login Credentials',
            `Email: ${payload.loginEmail}`,
            payload.temporaryPassword ? `Temporary Password: ${payload.temporaryPassword}` : 'Password: Use your existing ExamAssess password',
            ...verificationText,
            `Portal: ${portalUrl}`,
            '',
            payload.verificationToken ? 'After verification, log in and change your temporary password after your first login.' : 'Please log in and change your password after your first login.',
            '',
            'Best Regards,',
            'ExamAssess Team',
        ].filter(Boolean).join('\n'),
        html: `
            <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:640px;margin:0 auto;padding:32px 24px;background:#f8fafc;">
                <div style="background:#0D2F69;border-radius:16px 16px 0 0;padding:28px 32px;color:#ffffff;">
                    <div style="font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#ffb077;margin-bottom:8px;">ExamAssess Classroom Invitation</div>
                    <h1 style="margin:0;font-size:24px;line-height:1.25;color:#ffffff;">You have been invited to an assessment workspace</h1>
                </div>
                <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 16px 16px;padding:30px 32px;">
                    <p style="color:#334155;line-height:1.6;margin:0 0 14px;">Hello ${studentName},</p>
                    <p style="color:#334155;line-height:1.6;margin:0 0 22px;">${teacherName} has added you to <strong>${classroomName}</strong> on ExamAssess. Use the details below to access your assessment when the window opens.</p>
                    ${payload.assessmentName ? `
                    <h2 style="color:#0D2F69;font-size:16px;margin:0 0 10px;">Assessment Schedule</h2>
                    <table style="width:100%;border-collapse:collapse;margin:0 0 22px;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
                        ${assessmentRows}
                    </table>
                    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;color:#9a3412;font-size:13px;line-height:1.5;margin:0 0 24px;">
                        ${escapeHtml(lateJoinMessage)}
                    </div>
                    ` : ''}
                    <h2 style="color:#0D2F69;font-size:16px;margin:0 0 10px;">Login Credentials</h2>
                    <table style="width:100%;border-collapse:collapse;margin:0 0 22px;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">
                        <tr><td style="padding:8px 0;color:#64748b;width:42%;">Email</td><td style="padding:8px 0;color:#0f172a;font-weight:600;">${loginEmail}</td></tr>
                        ${passwordLine}
                        <tr><td style="padding:8px 0;color:#64748b;">Portal</td><td style="padding:8px 0;color:#0f172a;font-weight:600;">${escapeHtml(portalUrl)}</td></tr>
                    </table>
                    ${verificationHtml}
                    <p style="color:#64748b;font-size:13px;margin:0 0 20px;line-height:1.5;">${payload.verificationToken ? 'After verifying your email, sign in and change your temporary password after your first login.' : 'If this is your first ExamAssess login, please change your temporary password after signing in.'}</p>
                    <a href="${escapeHtml(portalUrl)}" style="display:inline-block;background:#FD6A01;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:700;">Sign in to ExamAssess</a>
                    <p style="color:#64748b;font-size:13px;margin:26px 0 0;">Regards,<br/>ExamAssess Academic Operations</p>
                </div>
            </div>
        `,
    };

    try {
        const info = await getTransporter().sendMail(mailOptions);
        console.log(`[Email] ✅ Classroom invitation sent to: ${toEmail}`);
        console.log(`[Email]    Message ID: ${info.messageId}`);
    } catch (error: any) {
        console.error(`[Email] ❌ Failed to send classroom invitation to: ${toEmail}`);
        console.error(`[Email]    Error: ${error.message}`);
        if (error.code) console.error(`[Email]    Error code: ${error.code}`);
        if (error.responseCode) console.error(`[Email]    SMTP response code: ${error.responseCode}`);
        if (error.response) console.error(`[Email]    SMTP response: ${error.response}`);
        throw error;
    }
}

export async function sendAssessmentReminderEmail(
    toEmail: string,
    payload: {
        studentName?: string;
        teacherName: string;
        classroomName: string;
        assessmentName: string;
        assessmentStart: Date;
        minutesBefore: number;
    }
): Promise<void> {
    await getTransporter().sendMail({
        from: getEmailFrom(),
        to: toEmail,
        subject: `Reminder: ${payload.assessmentName} starts soon`,
        html: `
            <div style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;">
                <h1 style="color:#0D2F69;margin:0 0 20px;font-size:24px;">Assessment Reminder</h1>
                <div style="background:#ffffff;border:1px solid #e8e8e8;border-radius:12px;padding:28px;">
                    <p style="color:#555;line-height:1.6;margin:0 0 12px;">${payload.studentName ? `Hello ${payload.studentName},` : 'Hello,'}</p>
                    <p style="color:#555;line-height:1.6;margin:0 0 12px;"><strong>${payload.assessmentName}</strong> for ${payload.classroomName} starts at ${payload.assessmentStart.toLocaleString()}.</p>
                    <p style="color:#555;line-height:1.6;margin:0;">This is your ${payload.minutesBefore}-minute reminder from ${payload.teacherName}.</p>
                </div>
            </div>
        `,
    });
}
