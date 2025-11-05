# Authentication System Guide

This project uses NextAuth.js v4 with JWT sessions and bcrypt password hashing for authentication.

## Overview

- **Authentication Provider**: NextAuth.js with Credentials Provider
- **Session Strategy**: JWT (JSON Web Tokens)
- **Password Hashing**: bcrypt with 12 rounds
- **Role-Based Access Control**: ADMIN, EMPLOYER, CANDIDATE
- **Database**: PostgreSQL via Prisma ORM

## Features

✅ Email/Password Authentication
✅ JWT Session Strategy
✅ Role-Based Access Control (RBAC)
✅ Password Hashing with bcrypt
✅ Protected Routes via Middleware
✅ Server-Side Auth Helpers
✅ Account Status Checking (ACTIVE, INACTIVE, SUSPENDED)
✅ Password Validation
✅ Email Validation

## File Structure

```
src/
├── app/
│   └── api/
│       ├── auth/
│       │   ├── [...nextauth]/
│       │   │   └── route.ts          # NextAuth configuration
│       │   └── register/
│       │       └── route.ts          # User registration endpoint
│       └── profile/
│           └── route.ts              # Protected profile endpoint (example)
├── lib/
│   ├── auth.ts                       # Auth helper functions
│   └── prisma.ts                     # Prisma client
├── types/
│   └── next-auth.d.ts                # NextAuth TypeScript types
└── middleware.ts                     # Route protection middleware
```

## Configuration

### Environment Variables

Required in `.env`:

```env
# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-generated-secret-here"

# Database
DATABASE_URL="postgresql://..."
```

### NextAuth Configuration

Located in: `src/app/api/auth/[...nextauth]/route.ts`

Key features:
- Credentials provider with email/password
- JWT session strategy (30 days)
- Role and status added to session
- Custom sign-in and error pages
- Password verification with bcrypt

## User Registration

### POST /api/auth/register

Register a new user with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123",
  "name": "John Doe",
  "role": "CANDIDATE"  // Optional: CANDIDATE (default), EMPLOYER, ADMIN
}
```

**Password Requirements:**
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number

**Response (201):**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "clx...",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "CANDIDATE",
    "status": "ACTIVE",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Automatic Profile Creation:**
- `CANDIDATE` → Creates a Candidate profile
- `EMPLOYER` → Creates an Employer profile
- `ADMIN` → No additional profile created

## Authentication

### Sign In

NextAuth.js provides automatic endpoints:

**POST /api/auth/signin**

Use NextAuth's `signIn` function from the client:

```typescript
import { signIn } from "next-auth/react";

const result = await signIn("credentials", {
  email: "user@example.com",
  password: "SecurePass123",
  redirect: false,
});

if (result?.error) {
  console.error("Login failed:", result.error);
} else {
  console.log("Login successful!");
}
```

### Sign Out

**POST /api/auth/signout**

```typescript
import { signOut } from "next-auth/react";

await signOut({ callbackUrl: "/" });
```

### Get Session (Client-Side)

```typescript
import { useSession } from "next-auth/react";

export default function Component() {
  const { data: session, status } = useSession();

  if (status === "loading") return <div>Loading...</div>;
  if (status === "unauthenticated") return <div>Not logged in</div>;

  return (
    <div>
      <p>Logged in as: {session.user.email}</p>
      <p>Role: {session.user.role}</p>
    </div>
  );
}
```

## Auth Helper Functions

Located in: `src/lib/auth.ts`

### Server-Side Helpers

Use these in Server Components, Route Handlers, and API routes:

#### Get Session
```typescript
import { getSession } from "@/lib/auth";

const session = await getSession();
```

#### Get Current User
```typescript
import { getCurrentUser } from "@/lib/auth";

const user = await getCurrentUser();
// Returns user with role, status, etc. or null
```

#### Check Authentication
```typescript
import { isAuthenticated } from "@/lib/auth";

if (await isAuthenticated()) {
  // User is logged in
}
```

#### Role Checking
```typescript
import { hasRole, isAdmin, isEmployer, isCandidate } from "@/lib/auth";

if (await isAdmin()) {
  // User is an admin
}

if (await hasRole(UserRole.EMPLOYER)) {
  // User is an employer
}
```

#### Require Authentication (throws error)
```typescript
import { requireAuth, requireRole, requireAdmin } from "@/lib/auth";

// In API routes
export async function GET() {
  try {
    await requireAuth(); // Throws if not authenticated

    // Your protected logic here
  } catch (error) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

// Require specific role
await requireRole(UserRole.ADMIN);
await requireAdmin(); // Shorthand for admin

// Require any of multiple roles
await requireAnyRole([UserRole.ADMIN, UserRole.EMPLOYER]);
```

#### Password Utilities
```typescript
import { hashPassword, validatePassword } from "@/lib/auth";

// Hash a password
const hashed = await hashPassword("MyPassword123");

// Validate password strength
const validation = validatePassword("weak");
console.log(validation.isValid); // false
console.log(validation.errors); // ["Password must be...", ...]
```

## Protected Routes

### Middleware Configuration

Located in: `src/middleware.ts`

The middleware automatically:
1. Checks if routes require authentication
2. Verifies user has required role for the route
3. Redirects unauthenticated users to sign-in
4. Redirects users without proper role to their dashboard
5. Checks account status (blocks INACTIVE/SUSPENDED users)

### Protected Route Patterns

| Route Pattern | Allowed Roles |
|--------------|---------------|
| `/dashboard/admin` | ADMIN |
| `/dashboard/employer` | EMPLOYER, ADMIN |
| `/dashboard/candidate` | CANDIDATE, ADMIN |
| `/dashboard` | All authenticated users |
| `/api/admin/*` | ADMIN |
| `/api/employer/*` | EMPLOYER, ADMIN |
| `/api/candidate/*` | CANDIDATE, ADMIN |
| `/api/profile/*` | All authenticated users |
| `/api/messages/*` | All authenticated users |

### Adding New Protected Routes

Edit `src/middleware.ts` and add to the `protectedRoutes` object:

```typescript
const protectedRoutes = {
  // Your new route
  "/api/my-route": [UserRole.ADMIN, UserRole.EMPLOYER],
  // ... existing routes
};
```

## Role-Based Access Control

### User Roles

```typescript
enum UserRole {
  ADMIN      // Full system access
  EMPLOYER   // Can post jobs, view applications
  CANDIDATE  // Can apply to jobs, view placements
}
```

### User Status

```typescript
enum UserStatus {
  ACTIVE     // Can log in and use system
  INACTIVE   // Account disabled, cannot log in
  SUSPENDED  // Account suspended, cannot log in
}
```

## Example: Protected API Route

```typescript
// src/app/api/jobs/route.ts
import { NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Only EMPLOYER and ADMIN can access
    await requireAnyRole([UserRole.EMPLOYER, UserRole.ADMIN]);

    const jobs = await prisma.job.findMany();

    return NextResponse.json({ jobs });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (error instanceof Error && error.message.includes("Forbidden")) {
      return NextResponse.json(
        { error: "Insufficient permissions" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

## Example: Protected Server Component

```typescript
// src/app/dashboard/page.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/signin");
  }

  return (
    <div>
      <h1>Welcome, {user.name}!</h1>
      <p>Role: {user.role}</p>
    </div>
  );
}
```

## Session Management

### Session Duration
- JWT tokens are valid for 30 days
- Sessions are stored client-side in HTTP-only cookies
- No server-side session storage required

### Token Refresh
NextAuth automatically handles token refresh on page navigation.

## Security Best Practices

1. **Password Hashing**: bcrypt with 12 rounds (industry standard)
2. **JWT Secrets**: Strong random secret (generated with crypto.randomBytes)
3. **HTTPS Only**: Always use HTTPS in production
4. **HTTP-Only Cookies**: Session tokens stored in HTTP-only cookies
5. **Role Validation**: Both client and server-side role checking
6. **Password Validation**: Enforced strong password requirements

## Testing Authentication

### 1. Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123",
    "name": "Test User",
    "role": "CANDIDATE"
  }'
```

### 2. Sign In
Use NextAuth's built-in endpoints or implement a custom sign-in form.

### 3. Access Protected Route
```bash
# Will redirect to sign-in if not authenticated
curl http://localhost:3000/api/profile
```

## Troubleshooting

### "NEXTAUTH_SECRET not set"
- Ensure `NEXTAUTH_SECRET` is set in `.env`
- Generate a new one: `openssl rand -base64 32`

### "Invalid password"
- Check password meets requirements (8+ chars, uppercase, lowercase, number)
- Verify password is being hashed before storage

### "Unauthorized" errors
- Check if route is protected in middleware
- Verify JWT token is valid and not expired
- Ensure user status is ACTIVE

### Middleware not running
- Check `middleware.ts` matcher configuration
- Verify middleware is at project root: `src/middleware.ts`

## Next Steps

1. **Custom Sign-In Page**: Create `/app/auth/signin/page.tsx`
2. **Custom Sign-Up Page**: Create `/app/auth/signup/page.tsx`
3. **Email Verification**: Add email verification flow
4. **Password Reset**: Implement forgot password functionality
5. **OAuth Providers**: Add Google, GitHub, etc. providers
6. **Two-Factor Auth**: Add 2FA for enhanced security

## Resources

- [NextAuth.js Documentation](https://next-auth.js.org)
- [Prisma Documentation](https://www.prisma.io/docs)
- [bcrypt Documentation](https://github.com/kelektiv/node.bcrypt.js)
