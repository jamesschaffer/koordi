import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

/**
 * Rate limiter for invitation endpoints
 * Limits invitations to 10 per calendar per hour to prevent abuse
 *
 * Key format: calendar-{calendarId}
 * This ensures rate limiting is per calendar, not per user
 */
export const invitationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each calendar to 10 invitations per hour
  message: {
    error: 'Too many invitations sent',
    message: 'You have reached the maximum number of invitations (10) for this calendar in the last hour. Please try again later.',
    retryAfter: '1 hour',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers

  // Key generator: rate limit per calendar, not per IP or user
  keyGenerator: (req: Request): string => {
    const calendarId = req.params.calendarId;
    if (!calendarId) {
      throw new Error('Calendar ID is required for rate limiting');
    }
    return `calendar-${calendarId}`;
  },

  // Custom handler for rate limit exceeded
  handler: (_req, res) => {
    res.status(429).json({
      error: 'Too many invitations sent',
      message: 'You have reached the maximum number of invitations (10) for this calendar in the last hour. Please try again later.',
    });
  },

  // Skip rate limiting in test environment
  skip: (req) => process.env.NODE_ENV === 'test',
});
