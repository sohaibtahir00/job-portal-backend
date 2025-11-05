# Quick Reference - Job Portal Backend

## Project Status

✅ Next.js 14 with TypeScript
✅ Prisma ORM with PostgreSQL
✅ NextAuth.js Authentication
✅ Complete Database Schema (11 models)
✅ Role-Based Access Control
✅ Password Hashing (bcrypt)
✅ Protected Routes Middleware

## Quick Commands

```bash
# Development
npm run dev              # Start dev server on http://localhost:3000

# Database
npx prisma generate      # Generate Prisma Client
npx prisma migrate dev   # Create and apply migration
npx prisma studio        # Open Prisma Studio GUI
npx prisma db push       # Push schema without migration

# Build
npm run build           # Build for production
npm start               # Start production server

# Linting
npm run lint            # Run ESLint
```

## Environment Variables

Required in `.env`:

```env
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="ws2dK96C982ymSlUpOYxN3HJYOq3c/5WYmwB/L04mLU="
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
RESEND_API_KEY="re_..."
NODE_ENV="development"
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/signin` - Sign in (NextAuth)
- `POST /api/auth/signout` - Sign out (NextAuth)
- `GET /api/auth/session` - Get session (NextAuth)

### User Profile
- `GET /api/profile` - Get current user profile (Protected)
- `PATCH /api/profile` - Update current user profile (Protected)

### Jobs API (✅ Complete)
- `GET /api/jobs` - List all jobs with filters & pagination
- `POST /api/jobs` - Create new job (EMPLOYER/ADMIN)
- `GET /api/jobs/[id]` - Get single job details
- `PATCH /api/jobs/[id]` - Update job (Owner/ADMIN)
- `DELETE /api/jobs/[id]` - Soft delete job (Owner/ADMIN)
- `POST /api/jobs/[id]/claim` - Claim aggregated job (EMPLOYER)

**See [JOBS_API.md](JOBS_API.md) for complete documentation**

### Candidates API (✅ Complete)
- `GET /api/candidates/profile` - Get candidate profile (CANDIDATE/ADMIN)
- `POST /api/candidates/profile` - Create candidate profile (CANDIDATE/ADMIN)
- `PATCH /api/candidates/profile` - Update candidate profile (CANDIDATE/ADMIN)
- `POST /api/candidates/resume` - Upload resume (CANDIDATE/ADMIN)
- `DELETE /api/candidates/resume` - Delete resume (CANDIDATE/ADMIN)
- `GET /api/candidates/[id]` - Get public candidate profile
- `PATCH /api/candidates/profile/status` - Update availability (CANDIDATE/ADMIN)

**See [CANDIDATES_API.md](CANDIDATES_API.md) for complete documentation**

### Applications API (✅ Complete)
- `POST /api/applications` - Submit application (CANDIDATE/ADMIN)
- `GET /api/applications` - List applications (role-based access)
- `GET /api/applications/[id]` - Get single application
- `DELETE /api/applications/[id]` - Withdraw application (CANDIDATE/ADMIN)
- `PATCH /api/applications/[id]/status` - Update status (EMPLOYER/ADMIN)
- `POST /api/applications/[id]/notes` - Add employer notes (EMPLOYER/ADMIN)
- `GET /api/applications/[id]/notes` - Get notes (EMPLOYER/ADMIN)

**See [APPLICATIONS_API.md](APPLICATIONS_API.md) for complete documentation**

## User Roles

```typescript
enum UserRole {
  ADMIN      // Full system access
  EMPLOYER   // Post jobs, view applications
  CANDIDATE  // Apply to jobs
}
```

## Auth Helper Functions

```typescript
// Import from lib/auth.ts
import {
  getSession,           // Get session
  getCurrentUser,       // Get user details
  requireAuth,          // Require authentication (throws)
  requireRole,          // Require specific role (throws)
  requireAdmin,         // Require admin role (throws)
  hashPassword,         // Hash password
  validatePassword      // Validate password strength
} from "@/lib/auth";
```

## Database Models

1. **User** - Authentication and base profile
2. **Candidate** - Job seeker profiles
3. **Employer** - Company profiles
4. **Job** - Job postings
5. **Application** - Job applications
6. **TestResult** - Candidate test results
7. **Placement** - Successful placements
8. **Message** - Internal messaging
9. **EmailCampaign** - Email campaigns
10. **Referral** - Referral tracking
11. **BlogPost** - Blog content

## Protected Route Middleware

Routes are automatically protected based on patterns in `src/middleware.ts`:

- `/dashboard/admin` → ADMIN only
- `/dashboard/employer` → EMPLOYER, ADMIN
- `/dashboard/candidate` → CANDIDATE, ADMIN
- `/api/admin/*` → ADMIN only
- `/api/employer/*` → EMPLOYER, ADMIN
- `/api/candidate/*` → CANDIDATE, ADMIN

## File Structure

```
job-portal-backend/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── [...nextauth]/route.ts
│   │   │   │   └── register/route.ts
│   │   │   └── profile/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── lib/
│   │   ├── auth.ts         # Auth helpers
│   │   └── prisma.ts       # Prisma client
│   ├── types/
│   │   └── next-auth.d.ts  # NextAuth types
│   └── middleware.ts        # Route protection
├── prisma/
│   └── schema.prisma       # Database schema
├── .env                    # Environment variables
├── AUTH_GUIDE.md           # Full auth documentation
└── README.md               # Main documentation
```

## Common Tasks

### Register a New User

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

### Create Protected API Route

```typescript
// src/app/api/my-route/route.ts
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  try {
    await requireAuth();

    // Your protected logic here
    return NextResponse.json({ message: "Success" });
  } catch (error) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }
}
```

### Use Auth in Server Component

```typescript
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Page() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/auth/signin");
  }

  return <div>Welcome {user.name}!</div>;
}
```

## Next Steps

1. **Connect Railway Database**
   - Get DATABASE_URL from Railway
   - Update `.env`
   - Run `npx prisma migrate dev --name init`

2. **Build Auth UI**
   - Create `/app/auth/signin/page.tsx`
   - Create `/app/auth/signup/page.tsx`
   - Create dashboard pages

3. **Implement API Routes**
   - Jobs CRUD
   - Applications management
   - Messaging system
   - Payment integration

4. **Add Features**
   - Email verification
   - Password reset
   - File uploads (resume, logos)
   - Search and filters

## Documentation

- [README.md](README.md) - Main documentation
- [AUTH_GUIDE.md](AUTH_GUIDE.md) - Complete authentication guide
- [Prisma Schema](prisma/schema.prisma) - Database schema

## Support

For issues or questions:
- Check the documentation files
- Review the code comments
- Check NextAuth.js docs: https://next-auth.js.org
- Check Prisma docs: https://www.prisma.io/docs
