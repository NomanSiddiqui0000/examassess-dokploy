import { Request, Response, NextFunction } from 'express';

type RateLimitOptions = {
    windowMs: number;
    max: number;
    keyPrefix: string;
    message: string;
};

type RateEntry = {
    count: number;
    resetAt: number;
};

const buckets = new Map<string, RateEntry>();

function getClientIp(req: Request) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    return forwarded || req.ip || req.socket.remoteAddress || 'unknown';
}

setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of buckets.entries()) {
        if (entry.resetAt <= now) buckets.delete(key);
    }
}, 60 * 1000).unref();

export function createRateLimiter(options: RateLimitOptions) {
    return (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        const key = `${options.keyPrefix}:${getClientIp(req)}`;
        const current = buckets.get(key);

        if (!current || current.resetAt <= now) {
            buckets.set(key, { count: 1, resetAt: now + options.windowMs });
            return next();
        }

        if (current.count >= options.max) {
            const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
            res.setHeader('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({ message: options.message });
        }

        current.count += 1;
        buckets.set(key, current);
        return next();
    };
}

export const registrationRateLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyPrefix: 'auth-register',
    message: 'Too many registration attempts. Please wait 10 minutes and try again.',
});

export const emailActionRateLimiter = createRateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 5,
    keyPrefix: 'auth-email-action',
    message: 'Too many email requests. Please wait 10 minutes and try again.',
});

