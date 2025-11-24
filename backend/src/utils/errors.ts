/**
 * Custom error classes for improved error handling and categorization
 */

/**
 * Base application error with context
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONFIGURATION_ERROR', 500, context);
  }
}

/**
 * Database operation errors
 */
export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'DATABASE_ERROR', 500, context);
  }
}

/**
 * External API errors (Google Calendar, Google Maps, etc.)
 */
export class ExternalAPIError extends AppError {
  constructor(
    message: string,
    public readonly service: string,
    statusCode: number = 502,
    context?: Record<string, any>
  ) {
    super(message, 'EXTERNAL_API_ERROR', statusCode, { ...context, service });
  }
}

/**
 * Authentication/Authorization errors
 */
export class AuthenticationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'AUTHENTICATION_ERROR', 401, context);
  }
}

/**
 * Validation errors
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'VALIDATION_ERROR', 400, context);
  }
}

/**
 * Resource not found errors
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string, context?: Record<string, any>) {
    const message = identifier
      ? `${resource} with identifier '${identifier}' not found`
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404, { ...context, resource, identifier });
  }
}

/**
 * Conflict errors (e.g., duplicate resources, race conditions)
 */
export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONFLICT', 409, context);
  }
}

/**
 * Rate limiting errors
 */
export class RateLimitError extends AppError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    context?: Record<string, any>
  ) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { ...context, retryAfter });
  }
}

/**
 * Encryption/Decryption errors
 */
export class EncryptionError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'ENCRYPTION_ERROR', 500, context);
  }
}

/**
 * Helper to determine if an error is operational (expected) vs programming error
 */
export function isOperationalError(error: Error): boolean {
  return error instanceof AppError;
}

/**
 * Format error for logging
 */
export function formatErrorForLogging(error: Error): Record<string, any> {
  const baseLog = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  if (error instanceof AppError) {
    return {
      ...baseLog,
      code: error.code,
      statusCode: error.statusCode,
      context: error.context,
      isOperational: true,
    };
  }

  return {
    ...baseLog,
    isOperational: false,
  };
}

/**
 * Safely extract error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}

/**
 * Create a safe error response for API responses
 */
export function createErrorResponse(error: Error) {
  if (error instanceof AppError) {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(process.env.NODE_ENV !== 'production' && { context: error.context }),
      },
      statusCode: error.statusCode,
    };
  }

  // Don't leak internal error details in production
  return {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production'
        ? 'An internal server error occurred'
        : error.message,
    },
    statusCode: 500,
  };
}
