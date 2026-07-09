import crypto from 'crypto';

export type RegistrationSource = 'self_student' | 'teacher_self' | 'teacher_invite' | 'admin_created';

export const SELF_REGISTRATION_CLEANUP_HOURS = 48;
export const INVITED_STUDENT_CLEANUP_DAYS = 7;

const DISPOSABLE_EMAIL_DOMAINS = new Set([
    '10minutemail.com',
    '10minutemail.net',
    '10minutemail.org',
    'guerrillamail.com',
    'guerrillamail.net',
    'guerrillamail.org',
    'guerrillamailblock.com',
    'mailinator.com',
    'mailinator.net',
    'mailinator.org',
    'temp-mail.org',
    'tempmail.com',
    'tempmail.net',
    'throwawaymail.com',
    'trashmail.com',
    'yopmail.com',
    'yopmail.fr',
    'yopmail.net',
]);

export function normalizeEmailAddress(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
}

function hasControlOrWhitespace(value: string) {
    return /[\s\u0000-\u001F\u007F]/.test(value);
}

function isValidDomainLabel(label: string) {
    return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label);
}

export function getEmailDomain(email: string) {
    return normalizeEmailAddress(email).split('@')[1] || '';
}

export function isDisposableEmailDomain(domain: string) {
    const normalizedDomain = normalizeEmailAddress(domain);
    if (!normalizedDomain) return false;
    return Array.from(DISPOSABLE_EMAIL_DOMAINS).some((blockedDomain) => (
        normalizedDomain === blockedDomain || normalizedDomain.endsWith(`.${blockedDomain}`)
    ));
}

export function validateEmailAddress(value: unknown): { valid: boolean; email: string; message?: string } {
    const email = normalizeEmailAddress(value);

    if (!email) return { valid: false, email, message: 'Invalid email address.' };
    if (email.length > 254 || hasControlOrWhitespace(email)) {
        return { valid: false, email, message: 'Invalid email address.' };
    }

    const atIndex = email.indexOf('@');
    if (atIndex <= 0 || atIndex !== email.lastIndexOf('@') || atIndex === email.length - 1) {
        return { valid: false, email, message: 'Invalid email address.' };
    }

    const [localPart, domain] = email.split('@');
    if (!localPart || localPart.length > 64 || localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
        return { valid: false, email, message: 'Invalid email address.' };
    }

    if (!/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(localPart)) {
        return { valid: false, email, message: 'Invalid email address.' };
    }

    if (!domain || domain.length > 253 || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
        return { valid: false, email, message: 'Invalid email address.' };
    }

    const labels = domain.split('.');
    if (labels.length < 2 || labels.some((label) => !isValidDomainLabel(label))) {
        return { valid: false, email, message: 'Invalid email address.' };
    }

    const tld = labels[labels.length - 1];
    if (tld.length < 2 || (!/^[a-z]+$/.test(tld) && !tld.startsWith('xn--'))) {
        return { valid: false, email, message: 'Invalid email address.' };
    }

    return { valid: true, email };
}

export function validateEmailForAccount(value: unknown): { valid: boolean; email: string; message?: string } {
    const result = validateEmailAddress(value);
    if (!result.valid) return result;

    if (isDisposableEmailDomain(getEmailDomain(result.email))) {
        return {
            valid: false,
            email: result.email,
            message: 'Disposable email providers are not supported.',
        };
    }

    return result;
}

export function createEmailVerificationToken(validHours = 24) {
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    return {
        verificationToken,
        hashedToken,
        expiresAt: new Date(Date.now() + validHours * 60 * 60 * 1000),
    };
}

export function getUnverifiedAccountExpiry(source: RegistrationSource) {
    const hours = source === 'teacher_invite'
        ? INVITED_STUDENT_CLEANUP_DAYS * 24
        : SELF_REGISTRATION_CLEANUP_HOURS;
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}

