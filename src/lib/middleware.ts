/**
 * Middleware Utilities for API Routes
 *
 * Provides reusable middleware for:
 * - Error handling
 * - Rate limiting
 * - Authentication
 * - Request validation
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { UserRole } from "@prisma/client";
import {
  ApiError,
  formatErrorResponse,
  AuthenticationError,
  AuthorizationError,
  handlePrismaError,
  isOperationalError,
} from "./errors";
import { RateLimiter, getIdentifier, getRateLimitHeaders } from "./rate-limit";
import { z } from "zod";
import { validateRequest } from "./validation";

/**
 * API Handler type
 */
type ApiHandler = (request: NextRequest, context?: any) => Promise<NextResponse>;

/**
 * Middleware function type
 */
type Middleware = (
  request: NextRequest,
  context: any,
  next: () => Promise<NextResponse>
) => Promise<NextResponse>;

/**
 * Compose multiple middleware functions
 */
export function composeMiddleware(...middlewares: Middleware[]): Middleware {
  return async (request: NextRequest, context: any, handler: () => Promise<NextResponse>) => {
    let index = 0;

    const next = async (): Promise<NextResponse> => {
      if (index >= middlewares.length) {
        return handler();
      }

      const middleware = middlewares[index++];
      return middleware(request, context, next);
    };

    return next();
  };
}

/**
 * Error handling middleware
 * Catches all errors and returns consistent error responses
 */
export function withErrorHandler(handler: ApiHandler): ApiHandler {
  return async (request: NextRequest, context?: any) => {
    try {
      return await handler(request, context);
    } catch (error) {
      // Log error
      if (!isOperationalError(error)) {
        console.error("Unexpected API error:", error);
      }

      // Handle Prisma errors
      if (error && typeof error === "object" && "code" in error) {
        const prismaError = handlePrismaError(error);
        const errorResponse = formatErrorResponse(prismaError);
        return NextResponse.json(
          { error: errorResponse.error, details: errorResponse.details },
          { status: errorResponse.statusCode }
        );
      }

      // Handle custom API errors
      const errorResponse = formatErrorResponse(error);
      return NextResponse.json(
        { error: errorResponse.error, details: errorResponse.details },
        { status: errorResponse.statusCode }
      );
    }
  };
}

/**
 * Rate limiting middleware
 */
export function withRateLimit(rateLimiter: RateLimiter, useUserId = false): Middleware {
  return async (request: NextRequest, context: any, next: () => Promise<NextResponse>) => {
    let identifier: string;

    if (useUserId) {
      // Get user ID from session
      const session = await getServerSession(authOptions);
      identifier = session?.user?.id
        ? getIdentifier(request, session.user.id)
        : getIdentifier(request);
    } else {
      // Use IP address
      identifier = getIdentifier(request);
    }

    // Check rate limit
    await rateLimiter.check(identifier);

    // Get rate limit info
    const info = rateLimiter.getInfo(identifier);

    // Continue with request
    const response = await next();

    // Add rate limit headers
    if (info) {
      const headers = getRateLimitHeaders(info);
      Object.entries(headers).forEach(([key, value]) => {
        response.headers.set(key, value);
      });
    }

    return response;
  };
}

/**
 * Authentication middleware
 * Ensures user is authenticated
 */
export function withAuth(handler: ApiHandler): ApiHandler {
  return async (request: NextRequest, context?: any) => {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      throw new AuthenticationError("You must be logged in to access this resource");
    }

    // Check if user is suspended
    if (session.user.suspendedAt) {
      throw new AuthorizationError(
        "Your account has been suspended. Please contact support.",
        {
          suspendedAt: session.user.suspendedAt,
          suspensionReason: session.user.suspensionReason,
        }
      );
    }

    return handler(request, context);
  };
}

/**
 * Role-based authorization middleware
 */
export function withRole(...allowedRoles: UserRole[]): Middleware {
  return async (request: NextRequest, context: any, next: () => Promise<NextResponse>) => {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      throw new AuthenticationError("You must be logged in to access this resource");
    }

    if (!allowedRoles.includes(session.user.role as UserRole)) {
      throw new AuthorizationError(
        `This resource requires one of the following roles: ${allowedRoles.join(", ")}`,
        {
          required: allowedRoles,
          current: session.user.role,
        }
      );
    }

    // Check if user is suspended
    if (session.user.suspendedAt) {
      throw new AuthorizationError(
        "Your account has been suspended. Please contact support.",
        {
          suspendedAt: session.user.suspendedAt,
          suspensionReason: session.user.suspensionReason,
        }
      );
    }

    return next();
  };
}

/**
 * Request body validation middleware
 */
export function withValidation<T extends z.ZodTypeAny>(schema: T): Middleware {
  return async (request: NextRequest, context: any, next: () => Promise<NextResponse>) => {
    // Only validate for methods with body
    if (["POST", "PUT", "PATCH"].includes(request.method)) {
      const body = await request.json();
      const validated = await validateRequest(schema, body);

      // Attach validated data to context
      context.validatedData = validated;
    }

    return next();
  };
}

/**
 * Query parameter validation middleware
 */
export function withQueryValidation<T extends z.ZodTypeAny>(schema: T): Middleware {
  return async (request: NextRequest, context: any, next: () => Promise<NextResponse>) => {
    const { searchParams } = new URL(request.url);
    const query = Object.fromEntries(searchParams.entries());
    const validated = await validateRequest(schema, query);

    // Attach validated query to context
    context.validatedQuery = validated;

    return next();
  };
}

/**
 * URL params validation middleware
 */
export function withParamsValidation<T extends z.ZodTypeAny>(schema: T): Middleware {
  return async (request: NextRequest, context: any, next: () => Promise<NextResponse>) => {
    const validated = await validateRequest(schema, context.params);

    // Attach validated params to context
    context.validatedParams = validated;

    return next();
  };
}

/**
 * Helper to create API route handler with middleware
 */
export function createApiHandler(
  handler: ApiHandler,
  ...middlewares: Middleware[]
): ApiHandler {
  const composedMiddleware = composeMiddleware(...middlewares);

  return withErrorHandler(async (request: NextRequest, context?: any) => {
    const ctx = context || {};

    return composedMiddleware(request, ctx, async () => {
      return handler(request, ctx);
    });
  });
}

/**
 * CORS middleware
 */
export function withCors(
  allowedOrigins: string[] = ["http://localhost:3000"]
): Middleware {
  return async (request: NextRequest, context: any, next: () => Promise<NextResponse>) => {
    const origin = request.headers.get("origin") || "";
    const isAllowed = allowedOrigins.includes(origin) || allowedOrigins.includes("*");

    const response = await next();

    if (isAllowed) {
      response.headers.set("Access-Control-Allow-Origin", origin || "*");
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS"
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, x-cron-secret"
      );
      response.headers.set("Access-Control-Max-Age", "86400");
    }

    return response;
  };
}

/**
 * Request logging middleware
 */
export function withLogging(): Middleware {
  return async (request: NextRequest, context: any, next: () => Promise<NextResponse>) => {
    const startTime = Date.now();
    const { method, url } = request;

    console.log(`[API] ${method} ${url} - Started`);

    const response = await next();

    const duration = Date.now() - startTime;
    console.log(`[API] ${method} ${url} - ${response.status} (${duration}ms)`);

    return response;
  };
}

/**
 * Cache control middleware
 */
export function withCache(maxAge: number): Middleware {
  return async (request: NextRequest, context: any, next: () => Promise<NextResponse>) => {
    const response = await next();

    // Only cache successful GET requests
    if (request.method === "GET" && response.status === 200) {
      response.headers.set("Cache-Control", `public, max-age=${maxAge}, s-maxage=${maxAge}`);
    }

    return response;
  };
}

/**
 * Pre-configured middleware combinations
 */

// Public API endpoint (rate limited, with error handling)
export const publicApiMiddleware = [withLogging()];

// Authenticated API endpoint
export const authenticatedApiMiddleware = [withLogging()];

// Admin-only API endpoint
export const adminApiMiddleware = [withLogging()];

// Helper function to wrap handler with common middleware
export function publicApi(handler: ApiHandler): ApiHandler {
  return createApiHandler(handler, ...publicApiMiddleware);
}

export function authenticatedApi(handler: ApiHandler): ApiHandler {
  return createApiHandler(withAuth(handler), ...authenticatedApiMiddleware);
}

export function adminApi(handler: ApiHandler): ApiHandler {
  return createApiHandler(
    withAuth(handler),
    withRole(UserRole.ADMIN),
    ...adminApiMiddleware
  );
}

export default {
  composeMiddleware,
  withErrorHandler,
  withRateLimit,
  withAuth,
  withRole,
  withValidation,
  withQueryValidation,
  withParamsValidation,
  withCors,
  withLogging,
  withCache,
  createApiHandler,
  publicApi,
  authenticatedApi,
  adminApi,
};
