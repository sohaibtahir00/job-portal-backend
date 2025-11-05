/**
 * Custom Error Classes for API Error Handling
 *
 * Provides standardized error types with consistent HTTP status codes
 * and error response formats across the application.
 */

/**
 * Base API Error class
 * All custom errors extend from this
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: any;

  constructor(message: string, statusCode: number, isOperational = true, details?: any) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);

    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this);
  }

  toJSON() {
    return {
      error: this.message,
      statusCode: this.statusCode,
      ...(this.details && { details: this.details }),
    };
  }
}

/**
 * 400 - Bad Request
 * Invalid input or malformed request
 */
export class ValidationError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 400, true, details);
    this.name = "ValidationError";
  }
}

/**
 * 401 - Unauthorized
 * Authentication required or invalid credentials
 */
export class AuthenticationError extends ApiError {
  constructor(message = "Authentication required", details?: any) {
    super(message, 401, true, details);
    this.name = "AuthenticationError";
  }
}

/**
 * 403 - Forbidden
 * Authenticated but insufficient permissions
 */
export class AuthorizationError extends ApiError {
  constructor(message = "Insufficient permissions", details?: any) {
    super(message, 403, true, details);
    this.name = "AuthorizationError";
  }
}

/**
 * 404 - Not Found
 * Resource does not exist
 */
export class NotFoundError extends ApiError {
  constructor(resource: string, details?: any) {
    super(`${resource} not found`, 404, true, details);
    this.name = "NotFoundError";
  }
}

/**
 * 409 - Conflict
 * Resource already exists or state conflict
 */
export class ConflictError extends ApiError {
  constructor(message: string, details?: any) {
    super(message, 409, true, details);
    this.name = "ConflictError";
  }
}

/**
 * 429 - Too Many Requests
 * Rate limit exceeded
 */
export class RateLimitError extends ApiError {
  constructor(message = "Too many requests. Please try again later.", details?: any) {
    super(message, 429, true, details);
    this.name = "RateLimitError";
  }
}

/**
 * 500 - Internal Server Error
 * Unexpected server error
 */
export class InternalServerError extends ApiError {
  constructor(message = "Internal server error", details?: any) {
    super(message, 500, false, details);
    this.name = "InternalServerError";
  }
}

/**
 * 503 - Service Unavailable
 * External service or database unavailable
 */
export class ServiceUnavailableError extends ApiError {
  constructor(message = "Service temporarily unavailable", details?: any) {
    super(message, 503, true, details);
    this.name = "ServiceUnavailableError";
  }
}

/**
 * Error response formatter
 * Converts errors to consistent API response format
 */
export function formatErrorResponse(error: unknown): {
  error: string;
  details?: any;
  statusCode: number;
} {
  // Handle custom ApiError instances
  if (error instanceof ApiError) {
    return {
      error: error.message,
      statusCode: error.statusCode,
      ...(error.details && { details: error.details }),
    };
  }

  // Handle standard Error instances
  if (error instanceof Error) {
    // Log unexpected errors
    console.error("Unexpected error:", error);

    return {
      error:
        process.env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : error.message,
      statusCode: 500,
      ...(process.env.NODE_ENV !== "production" && {
        details: {
          name: error.name,
          stack: error.stack,
        },
      }),
    };
  }

  // Handle unknown error types
  console.error("Unknown error type:", error);
  return {
    error: "An unexpected error occurred",
    statusCode: 500,
  };
}

/**
 * Check if error is operational (expected) or programming error
 */
export function isOperationalError(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Prisma error handler
 * Converts Prisma errors to appropriate ApiError instances
 */
export function handlePrismaError(error: any): ApiError {
  // Unique constraint violation
  if (error.code === "P2002") {
    const field = error.meta?.target?.[0] || "field";
    return new ConflictError(`A record with this ${field} already exists`, {
      field,
      constraint: error.meta?.target,
    });
  }

  // Foreign key constraint violation
  if (error.code === "P2003") {
    return new ValidationError("Invalid reference to related record", {
      field: error.meta?.field_name,
    });
  }

  // Record not found
  if (error.code === "P2025") {
    return new NotFoundError("Record", {
      cause: error.meta?.cause,
    });
  }

  // Required field missing
  if (error.code === "P2011") {
    return new ValidationError("Required field is missing", {
      field: error.meta?.constraint,
    });
  }

  // Data validation error
  if (error.code === "P2006") {
    return new ValidationError("Invalid data provided", {
      field: error.meta?.field_name,
    });
  }

  // Connection error
  if (error.code === "P1001" || error.code === "P1002") {
    return new ServiceUnavailableError("Database connection failed");
  }

  // Default to internal server error
  return new InternalServerError("Database operation failed", {
    code: error.code,
    message: error.message,
  });
}

/**
 * Async error handler wrapper
 * Wraps async route handlers to catch errors
 */
export function asyncHandler<T extends (...args: any[]) => Promise<any>>(fn: T) {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error) {
      throw error;
    }
  };
}

/**
 * Helper to throw validation error with field details
 */
export function throwValidationError(
  message: string,
  fields?: Record<string, string[]>
): never {
  throw new ValidationError(message, { fields });
}

/**
 * Helper to throw not found error
 */
export function throwNotFound(resource: string): never {
  throw new NotFoundError(resource);
}

/**
 * Helper to throw authentication error
 */
export function throwAuthError(message?: string): never {
  throw new AuthenticationError(message);
}

/**
 * Helper to throw authorization error
 */
export function throwAuthzError(message?: string): never {
  throw new AuthorizationError(message);
}

export default {
  ApiError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  InternalServerError,
  ServiceUnavailableError,
  formatErrorResponse,
  isOperationalError,
  handlePrismaError,
  asyncHandler,
  throwValidationError,
  throwNotFound,
  throwAuthError,
  throwAuthzError,
};
