# Error Handling & Validation System

Comprehensive documentation for the centralized error handling, validation, and middleware system.

## Table of Contents

1. [Overview](#overview)
2. [Error Classes](#error-classes)
3. [Validation Schemas](#validation-schemas)
4. [Middleware](#middleware)
5. [Rate Limiting](#rate-limiting)
6. [Usage Examples](#usage-examples)
7. [Best Practices](#best-practices)

---

## Overview

The error handling and validation system provides:

- **Custom Error Classes** - Type-safe errors with consistent HTTP status codes
- **Zod Validation** - Runtime type checking and validation for all API inputs
- **Middleware** - Composable middleware for auth, rate limiting, validation
- **Rate Limiting** - Protect endpoints from abuse
- **Consistent Responses** - Standard error response format across all endpoints

### File Structure

```
src/lib/
  ├── errors.ts       # Custom error classes and error handling
  ├── validation.ts   # Zod schemas for all API inputs
  ├── middleware.ts   # Reusable middleware functions
  └── rate-limit.ts   # Rate limiting implementation
```

---

## Error Classes

Located in `src/lib/errors.ts`

### Available Error Classes

All errors extend from `ApiError` base class.

| Error Class | Status Code | Use Case |
|------------|-------------|----------|
| `ValidationError` | 400 | Invalid input or malformed request |
| `AuthenticationError` | 401 | Authentication required or invalid credentials |
| `AuthorizationError` | 403 | Insufficient permissions |
| `NotFoundError` | 404 | Resource does not exist |
| `ConflictError` | 409 | Resource already exists or state conflict |
| `RateLimitError` | 429 | Rate limit exceeded |
| `InternalServerError` | 500 | Unexpected server error |
| `ServiceUnavailableError` | 503 | External service unavailable |

### Usage

```typescript
import {
  ValidationError,
  NotFoundError,
  AuthenticationError,
  throwValidationError,
  throwNotFound,
} from "@/lib/errors";

// Throw with details
throw new ValidationError("Invalid email format", {
  field: "email",
  value: "not-an-email",
});

// Throw resource not found
throw new NotFoundError("Job", { id: "123" });

// Helper functions
throwValidationError("Invalid input", {
  email: ["Invalid format"],
  password: ["Too short", "Missing uppercase"],
});

throwNotFound("User");
```

### Error Response Format

All errors return a consistent JSON format:

```json
{
  "error": "Validation failed",
  "details": {
    "fields": {
      "email": ["Invalid email address"],
      "age": ["Must be at least 18 years old"]
    }
  }
}
```

### Prisma Error Handling

Automatically converts Prisma errors to appropriate ApiError instances:

```typescript
import { handlePrismaError } from "@/lib/errors";

try {
  await prisma.user.create({ data });
} catch (error) {
  throw handlePrismaError(error);
}
```

Common Prisma error codes handled:
- `P2002` - Unique constraint violation → `ConflictError`
- `P2025` - Record not found → `NotFoundError`
- `P2003` - Foreign key violation → `ValidationError`
- `P1001/P1002` - Connection error → `ServiceUnavailableError`

---

## Validation Schemas

Located in `src/lib/validation.ts`

All validation schemas use [Zod](https://zod.dev/) for runtime type safety.

### Common Schemas

```typescript
import {
  paginationSchema,
  idSchema,
  emailSchema,
  phoneSchema,
  urlSchema,
} from "@/lib/validation";

// Pagination (page, limit)
const query = paginationSchema.parse({ page: 1, limit: 20 });

// UUID validation
const params = idSchema.parse({ id: "uuid-here" });

// Email validation
const email = emailSchema.parse("user@example.com");
```

### Available Schemas

#### Auth
- `signUpSchema` - User registration
- `signInSchema` - User login
- `forgotPasswordSchema` - Password reset request
- `resetPasswordSchema` - Password reset

#### Jobs
- `createJobSchema` - Create job posting
- `updateJobSchema` - Update job posting
- `jobSearchSchema` - Job search with filters

#### Applications
- `createApplicationSchema` - Submit job application
- `updateApplicationStatusSchema` - Update application status

#### Candidates
- `updateCandidateProfileSchema` - Update candidate profile
- `candidateSearchSchema` - Search candidates (employer)

#### Employers
- `updateEmployerProfileSchema` - Update employer profile

#### Messages
- `sendMessageSchema` - Send message
- `messageSearchSchema` - Search messages

#### Admin
- `approveJobSchema` - Approve/reject job
- `suspendUserSchema` - Suspend/unsuspend user
- `verifyTestSchema` - Verify/reject test result

### Validation Helpers

```typescript
import { validateRequest, validateQuery, validateParams } from "@/lib/validation";

// Validate request body
const body = await request.json();
const validated = await validateRequest(createJobSchema, body);

// Validate query parameters
const { searchParams } = new URL(request.url);
const query = await validateQuery(jobSearchSchema, searchParams);

// Validate URL parameters
const params = await validateParams(idSchema, { id: "123" });
```

### Custom Validation

Create your own schemas:

```typescript
import { z } from "zod";

const customSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
  age: z.number().int().min(18).max(120),
  role: z.enum(["USER", "ADMIN"]),
  settings: z.object({
    theme: z.enum(["light", "dark"]),
    notifications: z.boolean(),
  }).optional(),
});

// Use with validation helper
const data = await validateRequest(customSchema, body);
```

---

## Middleware

Located in `src/lib/middleware.ts`

### Available Middleware

#### `withErrorHandler(handler)`

Catches all errors and returns consistent error responses.

```typescript
import { withErrorHandler } from "@/lib/middleware";

export const GET = withErrorHandler(async (request) => {
  // Any thrown error is caught and formatted
  throw new NotFoundError("Resource");
});
```

#### `withAuth(handler)`

Requires authenticated user session.

```typescript
import { withAuth } from "@/lib/middleware";

export const GET = withAuth(async (request) => {
  const session = await getServerSession(authOptions);
  // session.user is guaranteed to exist
  return NextResponse.json({ user: session.user });
});
```

#### `withRole(...roles)`

Requires specific user role(s).

```typescript
import { createApiHandler, withRole } from "@/lib/middleware";
import { UserRole } from "@prisma/client";

export const GET = createApiHandler(
  async (request) => {
    // Only admins can access
    return NextResponse.json({ message: "Admin only" });
  },
  withRole(UserRole.ADMIN)
);
```

#### `withRateLimit(rateLimiter, useUserId?)`

Apply rate limiting to endpoint.

```typescript
import { createApiHandler, withRateLimit } from "@/lib/middleware";
import { publicApiRateLimiter } from "@/lib/rate-limit";

export const POST = createApiHandler(
  async (request) => {
    return NextResponse.json({ message: "Success" });
  },
  withRateLimit(publicApiRateLimiter) // Rate limit by IP
);
```

#### `withValidation(schema)`

Validate request body with Zod schema.

```typescript
import { createApiHandler, withValidation } from "@/lib/middleware";
import { createJobSchema } from "@/lib/validation";

export const POST = createApiHandler(
  async (request, context) => {
    // Access validated data from context
    const data = context.validatedData;
    return NextResponse.json({ data });
  },
  withValidation(createJobSchema)
);
```

#### `withQueryValidation(schema)`

Validate query parameters.

```typescript
import { createApiHandler, withQueryValidation } from "@/lib/middleware";
import { jobSearchSchema } from "@/lib/validation";

export const GET = createApiHandler(
  async (request, context) => {
    const query = context.validatedQuery;
    return NextResponse.json({ query });
  },
  withQueryValidation(jobSearchSchema)
);
```

#### `withLogging()`

Log all requests with timing.

```typescript
import { createApiHandler, withLogging } from "@/lib/middleware";

export const GET = createApiHandler(
  async (request) => {
    return NextResponse.json({ message: "Hello" });
  },
  withLogging() // Logs: [API] GET /api/example - 200 (45ms)
);
```

#### `withCors(allowedOrigins?)`

Add CORS headers to response.

```typescript
import { createApiHandler, withCors } from "@/lib/middleware";

export const GET = createApiHandler(
  async (request) => {
    return NextResponse.json({ message: "Hello" });
  },
  withCors(["https://example.com"])
);
```

#### `withCache(maxAge)`

Set cache headers for GET requests.

```typescript
import { createApiHandler, withCache } from "@/lib/middleware";

export const GET = createApiHandler(
  async (request) => {
    return NextResponse.json({ data: "cacheable" });
  },
  withCache(3600) // Cache for 1 hour
);
```

### Composing Middleware

Use `createApiHandler` to compose multiple middleware:

```typescript
import {
  createApiHandler,
  withAuth,
  withRole,
  withValidation,
  withRateLimit,
  withLogging,
} from "@/lib/middleware";
import { authenticatedRateLimiter } from "@/lib/rate-limit";
import { createJobSchema } from "@/lib/validation";
import { UserRole } from "@prisma/client";

export const POST = createApiHandler(
  async (request, context) => {
    const data = context.validatedData;
    // Handler logic
    return NextResponse.json({ success: true });
  },
  withLogging(), // 1. Log request
  withAuth, // 2. Require authentication (using withAuth directly)
  withRole(UserRole.EMPLOYER), // 3. Require employer role
  withRateLimit(authenticatedRateLimiter, true), // 4. Rate limit by user ID
  withValidation(createJobSchema) // 5. Validate request body
);
```

**Note**: When using `withAuth` as middleware (not as a wrapper), pass it directly without calling it as a function. The `createApiHandler` will handle it correctly.

### Pre-configured Helpers

```typescript
import { publicApi, authenticatedApi, adminApi } from "@/lib/middleware";

// Public endpoint (error handling + logging)
export const GET = publicApi(async (request) => {
  return NextResponse.json({ message: "Public" });
});

// Authenticated endpoint (auth + error handling + logging)
export const GET = authenticatedApi(async (request) => {
  return NextResponse.json({ message: "Authenticated" });
});

// Admin-only endpoint (auth + role check + error handling + logging)
export const GET = adminApi(async (request) => {
  return NextResponse.json({ message: "Admin only" });
});
```

---

## Rate Limiting

Located in `src/lib/rate-limit.ts`

### Pre-configured Rate Limiters

```typescript
import {
  authRateLimiter,
  publicApiRateLimiter,
  authenticatedRateLimiter,
  expensiveOperationRateLimiter,
  uploadRateLimiter,
  emailRateLimiter,
} from "@/lib/rate-limit";
```

| Rate Limiter | Window | Max Requests | Use Case |
|--------------|--------|--------------|----------|
| `authRateLimiter` | 15 min | 5 | Login, signup, password reset |
| `publicApiRateLimiter` | 1 min | 30 | Public endpoints |
| `authenticatedRateLimiter` | 1 min | 100 | Authenticated endpoints |
| `expensiveOperationRateLimiter` | 1 hour | 10 | Heavy operations |
| `uploadRateLimiter` | 1 hour | 20 | File uploads |
| `emailRateLimiter` | 1 hour | 5 | Sending emails |

### Custom Rate Limiter

```typescript
import { RateLimiter } from "@/lib/rate-limit";

const customRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 50,
  message: "Custom rate limit exceeded",
  keyGenerator: (id) => `custom:${id}`,
  skip: (id) => id.startsWith("admin:"), // Skip for admins
});
```

### Usage

```typescript
import { createApiHandler, withRateLimit } from "@/lib/middleware";
import { authRateLimiter } from "@/lib/rate-limit";

export const POST = createApiHandler(
  async (request) => {
    // Login logic
    return NextResponse.json({ success: true });
  },
  withRateLimit(authRateLimiter) // 5 requests per 15 minutes per IP
);
```

### Rate Limit Headers

Responses include rate limit information:

```http
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 2024-01-15T12:00:00.000Z
```

### Rate Limit Error Response

```json
{
  "error": "Too many requests. Please try again later.",
  "details": {
    "limit": 30,
    "windowMs": 60000,
    "retryAfter": 45,
    "resetTime": "2024-01-15T12:00:00.000Z"
  }
}
```

---

## Usage Examples

### Example 1: Simple GET Endpoint

```typescript
import { NextRequest, NextResponse } from "next/server";
import { publicApi } from "@/lib/middleware";
import { NotFoundError } from "@/lib/errors";

export const GET = publicApi(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    throw new ValidationError("ID is required");
  }

  const item = await prisma.item.findUnique({ where: { id } });

  if (!item) {
    throw new NotFoundError("Item", { id });
  }

  return NextResponse.json({ item });
});
```

### Example 2: POST Endpoint with Validation

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createApiHandler, withAuth, withValidation, withRateLimit } from "@/lib/middleware";
import { authenticatedRateLimiter } from "@/lib/rate-limit";
import { createJobSchema } from "@/lib/validation";

export const POST = createApiHandler(
  async (request: NextRequest, context: any) => {
    const session = await getServerSession(authOptions);
    const data = context.validatedData;

    const job = await prisma.job.create({
      data: {
        ...data,
        employerId: session.user.employer.id,
      },
    });

    return NextResponse.json({ success: true, job });
  },
  withAuth, // Pass directly without calling
  withRateLimit(authenticatedRateLimiter, true),
  withValidation(createJobSchema)
);
```

### Example 3: Admin-Only Endpoint

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createApiHandler, withRole, withValidation } from "@/lib/middleware";
import { UserRole } from "@prisma/client";
import { suspendUserSchema } from "@/lib/validation";
import { NotFoundError } from "@/lib/errors";

export const PATCH = createApiHandler(
  async (request: NextRequest, context: any) => {
    const { id } = context.params;
    const { action, reason } = context.validatedData;

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundError("User", { id });

    const updated = await prisma.user.update({
      where: { id },
      data: {
        suspendedAt: action === "suspend" ? new Date() : null,
        suspensionReason: action === "suspend" ? reason : null,
      },
    });

    return NextResponse.json({ success: true, user: updated });
  },
  withRole(UserRole.ADMIN),
  withValidation(suspendUserSchema)
);
```

### Example 4: Search Endpoint with Query Validation

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createApiHandler, withQueryValidation } from "@/lib/middleware";
import { jobSearchSchema } from "@/lib/validation";

export const GET = createApiHandler(
  async (request: NextRequest, context: any) => {
    const query = context.validatedQuery;

    const jobs = await prisma.job.findMany({
      where: {
        ...(query.q && {
          OR: [
            { title: { contains: query.q, mode: "insensitive" } },
            { description: { contains: query.q, mode: "insensitive" } },
          ],
        }),
        ...(query.type && { type: query.type }),
        ...(query.location && { location: query.location }),
      },
      take: query.limit,
    });

    return NextResponse.json({ jobs });
  },
  withQueryValidation(jobSearchSchema)
);
```

### Example 5: File Upload with Rate Limiting

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createApiHandler, withAuth, withRateLimit } from "@/lib/middleware";
import { uploadRateLimiter } from "@/lib/rate-limit";

export const POST = createApiHandler(
  async (request: NextRequest) => {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      throw new ValidationError("File is required");
    }

    // Upload logic
    const url = await uploadFile(file);

    return NextResponse.json({ success: true, url });
  },
  withAuth, // Pass directly
  withRateLimit(uploadRateLimiter, true) // 20 uploads per hour per user
);
```

---

## Best Practices

### 1. Always Use Error Handling

Wrap all route handlers with error handling:

```typescript
// ✅ Good
export const GET = publicApi(async (request) => {
  throw new NotFoundError("Resource");
});

// ❌ Bad
export async function GET(request: NextRequest) {
  // Errors not handled consistently
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
```

### 2. Use Appropriate Error Classes

Choose the right error class for the situation:

```typescript
// User not found
throw new NotFoundError("User", { id });

// Invalid input
throw new ValidationError("Email is required");

// Not logged in
throw new AuthenticationError();

// Insufficient permissions
throw new AuthorizationError("Admin access required");

// Duplicate record
throw new ConflictError("Email already exists");
```

### 3. Validate All Inputs

Always validate request inputs with Zod schemas:

```typescript
// ✅ Good
export const POST = createApiHandler(
  async (request, context) => {
    const data = context.validatedData; // Type-safe and validated
    return NextResponse.json({ data });
  },
  withValidation(createJobSchema)
);

// ❌ Bad
export async function POST(request: NextRequest) {
  const body = await request.json(); // No validation
  // body could be anything
}
```

### 4. Apply Rate Limiting

Protect endpoints from abuse:

```typescript
// Public endpoints
withRateLimit(publicApiRateLimiter)

// Auth endpoints (strict)
withRateLimit(authRateLimiter)

// Authenticated endpoints
withRateLimit(authenticatedRateLimiter, true) // Rate limit by user ID

// Expensive operations
withRateLimit(expensiveOperationRateLimiter, true)
```

### 5. Use Middleware Composition

Compose middleware in the correct order:

```typescript
createApiHandler(
  handler,
  withLogging(),           // 1. Log first
  withAuth,                // 2. Authenticate (pass directly)
  withRole(UserRole.ADMIN),// 3. Check role
  withRateLimit(limiter),  // 4. Rate limit
  withValidation(schema)   // 5. Validate last
)
```

### 6. Handle Prisma Errors

Use the Prisma error handler for database operations:

```typescript
import { handlePrismaError } from "@/lib/errors";

try {
  await prisma.user.create({ data });
} catch (error) {
  throw handlePrismaError(error);
}
```

### 7. Provide Helpful Error Details

Include relevant details in errors (but not sensitive data):

```typescript
// ✅ Good
throw new ValidationError("Invalid email format", {
  field: "email",
  format: "user@example.com",
});

// ❌ Bad
throw new ValidationError("Invalid email"); // No context
```

### 8. Log Unexpected Errors

The error handler logs non-operational errors automatically:

```typescript
// Operational errors (expected) - not logged as errors
throw new ValidationError("Invalid input");

// Programming errors (unexpected) - logged automatically
throw new Error("Database connection failed");
```

### 9. Use Type-Safe Validation

Zod provides type inference:

```typescript
const schema = z.object({
  name: z.string(),
  age: z.number(),
});

const data = await validateRequest(schema, body);
// data is typed as { name: string; age: number }
```

### 10. Test Error Scenarios

Always test error handling:

```typescript
// Test validation errors
it("should reject invalid email", async () => {
  const response = await POST(invalidRequest);
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({
    error: "Validation failed",
  });
});

// Test rate limiting
it("should rate limit after max requests", async () => {
  // Make maxRequests + 1 requests
  const response = await POST(request);
  expect(response.status).toBe(429);
});
```

---

## Migration Guide

### Updating Existing Endpoints

1. **Add error handling**:
   ```typescript
   // Before
   export async function GET(request: NextRequest) { }

   // After
   export const GET = publicApi(async (request: NextRequest) => { });
   ```

2. **Replace manual validation with Zod**:
   ```typescript
   // Before
   const body = await request.json();
   if (!body.email || typeof body.email !== "string") {
     return NextResponse.json({ error: "Invalid email" }, { status: 400 });
   }

   // After
   export const POST = createApiHandler(
     async (request, context) => {
       const data = context.validatedData; // Already validated
     },
     withValidation(schema)
   );
   ```

3. **Replace manual error responses**:
   ```typescript
   // Before
   return NextResponse.json({ error: "Not found" }, { status: 404 });

   // After
   throw new NotFoundError("Resource");
   ```

4. **Add rate limiting**:
   ```typescript
   export const POST = createApiHandler(
     handler,
     withRateLimit(publicApiRateLimiter)
   );
   ```

---

## Troubleshooting

### ValidationError on Valid Input

Check your schema definition:

```typescript
// Make optional fields actually optional
z.string().optional() // Can be undefined
z.string().nullable() // Can be null
z.string().nullish()  // Can be null or undefined
```

### Rate Limit Not Working

Ensure you're using the correct identifier:

```typescript
// Rate limit by IP (default)
withRateLimit(limiter)

// Rate limit by user ID
withRateLimit(limiter, true)
```

### Middleware Order Issues

Middleware executes in the order provided:

```typescript
createApiHandler(
  handler,
  withValidation(schema), // Runs first
  withAuth                // Runs second (pass directly)
)
```

### TypeScript Errors with Context

The context object is typed as `any` by default. You can create a typed version:

```typescript
interface ApiContext {
  validatedData?: any;
  validatedQuery?: any;
  params?: any;
}

const handler = async (request: NextRequest, context: ApiContext) => {
  const data = context.validatedData;
};
```

---

## Summary

The error handling and validation system provides:

- ✅ Consistent error responses
- ✅ Type-safe validation with Zod
- ✅ Composable middleware
- ✅ Rate limiting protection
- ✅ Automatic Prisma error handling
- ✅ Comprehensive logging
- ✅ Easy-to-use helper functions

All new endpoints should use this system for consistency and reliability.
