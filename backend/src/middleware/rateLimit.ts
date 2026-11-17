import rateLimit from 'express-rate-limit';

// Stricter rate limit for invitation validation to prevent token brute force
export const invitationRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many invitation validation requests. Please try again later.' },
  statusCode: 429
});

// Upload rate limiter
export const uploadRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 uploads per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many upload attempts. Please try again later.' },
  statusCode: 429
});

// General API rate limiter for admin endpoints
export const generalApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  statusCode: 429
});
