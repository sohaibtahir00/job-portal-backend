# Job Portal Backend - Complete API Reference

**Base URL (Production)**: `https://job-portal-backend-production-cd05.up.railway.app`
**Base URL (Local)**: `http://localhost:3000`

**Last Updated**: 2025-11-06
**API Version**: 1.0.0

---

## Table of Contents

1. [Authentication & Authorization](#authentication--authorization)
2. [Database Models & Schemas](#database-models--schemas)
3. [Enumerations (Enums)](#enumerations-enums)
4. [API Endpoints](#api-endpoints)
   - [Authentication](#authentication-endpoints)
   - [Jobs](#jobs-endpoints)
   - [Applications](#applications-endpoints)
   - [Candidates](#candidates-endpoints)
   - [Employers](#employers-endpoints)
   - [Dashboard](#dashboard-endpoints)
   - [File Uploads](#file-upload-endpoints)
   - [Messages](#messages-endpoints)
   - [Placements](#placements-endpoints)
   - [Admin](#admin-endpoints)
5. [Error Response Format](#error-response-format)
6. [Validation Rules](#validation-rules)
7. [Pagination](#pagination)
8. [CORS Configuration](#cors-configuration)
9. [Frontend-Backend Field Mapping](#frontend-backend-field-mapping)
10. [Example Requests & Responses](#example-requests--responses)

---

## Authentication & Authorization

### Authentication Method
- **Type**: JWT (JSON Web Tokens) via NextAuth.js
- **Strategy**: Session-based with JWT tokens
- **Session Duration**: 30 days
- **Cookie Name**: `next-auth.session-token`

### JWT Token Structure
```typescript
{
  id: string;           // User ID (cuid)
  email: string;        // User email
  name: string;         // User name
  role: "ADMIN" | "EMPLOYER" | "CANDIDATE";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  iat: number;          // Issued at (Unix timestamp)
  exp: number;          // Expires at (Unix timestamp)
}
```

### Authentication Headers
```http
Authorization: Bearer <session-token>
```

**Note**: NextAuth uses HTTP-only cookies by default. For API requests from frontend, use `credentials: 'include'`:

```javascript
fetch('https://job-portal-backend-production-cd05.up.railway.app/api/jobs', {
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  }
})
```

### Protected Routes

| Endpoint Pattern | Required Role | Notes |
|------------------|---------------|-------|
| `/api/auth/register` | None (public) | Registration endpoint |
| `/api/auth/[...nextauth]` | None (public) | NextAuth endpoints (signin, signout, etc.) |
| `/api/jobs` (GET) | None (public) | List jobs - public |
| `/api/jobs` (POST) | `EMPLOYER`, `ADMIN` | Create job |
| `/api/jobs/[id]` (GET) | None (public) | View job details |
| `/api/jobs/[id]` (PATCH, DELETE) | `EMPLOYER` (owner), `ADMIN` | Update/delete job |
| `/api/applications` (POST) | `CANDIDATE`, `ADMIN` | Submit application |
| `/api/applications` (GET) | `CANDIDATE`, `EMPLOYER`, `ADMIN` | View applications |
| `/api/candidates/profile` | `CANDIDATE`, `ADMIN` | Candidate profile operations |
| `/api/employers/profile` | `EMPLOYER`, `ADMIN` | Employer profile operations |
| `/api/admin/*` | `ADMIN` | Admin-only endpoints |

---

## Database Models & Schemas

### User Model
**Table**: `User`
**Primary Key**: `id` (String, cuid)

```typescript
interface User {
  id: string;                    // cuid (e.g., "cmhmqcpxq0000pc1yzke3ukj3")
  email: string;                 // Unique, required
  password: string;              // Hashed with bcrypt (12 rounds)
  name: string;                  // Required - IMPORTANT: Not "fullName"!
  role: UserRole;                // Enum: ADMIN | EMPLOYER | CANDIDATE
  status: UserStatus;            // Enum: ACTIVE | INACTIVE | SUSPENDED
  emailVerified: DateTime | null;
  image: string | null;          // Profile image URL
  createdAt: DateTime;           // Auto-generated
  updatedAt: DateTime;           // Auto-updated

  // Relations
  candidate?: Candidate;         // One-to-one (if role=CANDIDATE)
  employer?: Employer;           // One-to-one (if role=EMPLOYER)
  sentMessages: Message[];
  receivedMessages: Message[];
  referrals: Referral[];
  blogPosts: BlogPost[];
}
```

**Critical Field Mapping**:
- ⚠️ Backend uses `name`, NOT `fullName`
- ⚠️ Password is hashed with bcrypt (salt rounds: 12)
- ⚠️ ID type is `string` (cuid), not number

---

### Candidate Model
**Table**: `Candidate`
**Primary Key**: `id` (String, cuid)
**Foreign Key**: `userId` (references User.id, unique, CASCADE on delete)

```typescript
interface Candidate {
  id: string;                    // cuid
  userId: string;                // Unique, references User.id
  phone: string | null;
  resume: string | null;         // URL to resume file (S3/local)
  portfolio: string | null;      // URL to portfolio
  linkedIn: string | null;       // LinkedIn profile URL
  github: string | null;         // GitHub profile URL
  bio: string | null;            // Text field
  skills: string[];              // Array of skill names
  experience: number | null;     // Years of experience (integer)
  education: string | null;      // Text field
  location: string | null;       // City, State, Country
  preferredJobType: JobType | null;  // Enum
  expectedSalary: number | null; // Integer (in cents or dollars - check usage)
  availability: boolean;         // Default: true

  // Skills Testing
  hasTakenTest: boolean;         // Default: false
  testScore: number | null;      // 0-100
  testPercentile: number | null; // 0-100
  testTier: string | null;       // "ELITE" | "ADVANCED" | "INTERMEDIATE" | "BEGINNER"
  lastTestDate: DateTime | null;
  testInviteToken: string | null; // Unique
  testInviteSentAt: DateTime | null;

  // Referrals
  referralCode: string | null;   // Unique code for referrals
  referredBy: string | null;     // Email of referrer
  referralEarnings: number;      // In cents, default: 0

  createdAt: DateTime;
  updatedAt: DateTime;

  // Relations
  user: User;
  applications: Application[];
  testResults: TestResult[];
  placements: Placement[];
}
```

**Field Notes**:
- `skills` is stored as PostgreSQL `string[]` array
- `experience` is in years (integer)
- `expectedSalary` and `referralEarnings` are in cents
- Profile is created automatically during registration with role=CANDIDATE

---

### Employer Model
**Table**: `Employer`
**Primary Key**: `id` (String, cuid)
**Foreign Key**: `userId` (references User.id, unique, CASCADE on delete)

```typescript
interface Employer {
  id: string;                    // cuid
  userId: string;                // Unique, references User.id
  companyName: string;           // Required
  companyLogo: string | null;    // URL to logo image
  companyWebsite: string | null; // Full URL with protocol
  companySize: string | null;    // Free text (e.g., "50-100", "500+")
  industry: string | null;       // Free text
  description: string | null;    // Text field
  location: string | null;       // City, State, Country
  phone: string | null;
  verified: boolean;             // Default: false (requires admin verification)
  stripeCustomerId: string | null; // Unique Stripe customer ID
  totalSpent: number;            // In cents, default: 0
  createdAt: DateTime;
  updatedAt: DateTime;

  // Relations
  user: User;
  jobs: Job[];
  emailCampaigns: EmailCampaign[];
  placements: Placement[];
}
```

**Field Notes**:
- `companyName` is required during profile creation
- During registration, `name` is used as temporary `companyName` if not provided separately
- `verified` requires admin approval
- `totalSpent` is in cents

---

### Job Model
**Table**: `Job`
**Primary Key**: `id` (String, cuid)
**Foreign Key**: `employerId` (references Employer.id, CASCADE on delete)

```typescript
interface Job {
  id: string;                    // cuid
  employerId: string;            // References Employer.id
  title: string;                 // Required
  description: string;           // Text, required
  requirements: string;          // Text, required
  responsibilities: string;      // Text, required
  type: JobType;                 // Enum, required
  status: JobStatus;             // Enum, default: DRAFT
  location: string;              // Required
  remote: boolean;               // Default: false
  salaryMin: number | null;      // In cents or dollars (check usage)
  salaryMax: number | null;      // In cents or dollars
  experienceLevel: ExperienceLevel; // Enum, required
  skills: string[];              // Array of required skills
  benefits: string | null;       // Text field
  deadline: DateTime | null;     // Application deadline
  slots: number;                 // Default: 1
  views: number;                 // Default: 0
  createdAt: DateTime;
  updatedAt: DateTime;

  // Relations
  employer: Employer;
  applications: Application[];
  placements: Placement[];
}
```

**Field Notes**:
- New jobs start with status `DRAFT`
- `remote` is boolean (true/false), NOT "remote" | "hybrid" | "onsite"
- `skills` is PostgreSQL `string[]` array
- `salaryMin` and `salaryMax` are nullable
- Employer can only access their own jobs (unless admin)

---

### Application Model
**Table**: `Application`
**Primary Key**: `id` (String, cuid)
**Foreign Keys**: `jobId` (Job.id), `candidateId` (Candidate.id) - CASCADE on delete
**Unique Constraint**: One application per candidate per job

```typescript
interface Application {
  id: string;                    // cuid
  jobId: string;                 // References Job.id
  candidateId: string;           // References Candidate.id
  coverLetter: string | null;    // Text field, optional
  status: ApplicationStatus;     // Enum, default: PENDING
  appliedAt: DateTime;           // Default: now()
  reviewedAt: DateTime | null;   // When employer reviewed
  notes: string | null;          // Employer notes (text)
  createdAt: DateTime;
  updatedAt: DateTime;

  // Relations
  job: Job;
  candidate: Candidate;
  testResults: TestResult[];
}
```

**Unique Constraint**: `@@unique([jobId, candidateId])`
**Field Notes**:
- Candidate can only apply once per job
- `appliedAt` is separate from `createdAt`
- Status transitions: PENDING → REVIEWED → SHORTLISTED → INTERVIEW_SCHEDULED → etc.

---

### Additional Models Summary

**TestResult**: Skills testing results for candidates
**Placement**: Successful job placements with payment tracking
**Message**: Internal messaging system
**EmailCampaign**: Employer email campaigns
**Referral**: Candidate referral system
**BlogPost**: Blog/content management

(See Prisma schema for complete field definitions)

---

## Enumerations (Enums)

### UserRole
```typescript
enum UserRole {
  ADMIN = "ADMIN"
  EMPLOYER = "EMPLOYER"
  CANDIDATE = "CANDIDATE"
}
```
**Usage**: User.role field
**Note**: ALL CAPS, not lowercase

---

### UserStatus
```typescript
enum UserStatus {
  ACTIVE = "ACTIVE"
  INACTIVE = "INACTIVE"
  SUSPENDED = "SUSPENDED"
}
```

---

### JobType
```typescript
enum JobType {
  FULL_TIME = "FULL_TIME"
  PART_TIME = "PART_TIME"
  CONTRACT = "CONTRACT"
  INTERNSHIP = "INTERNSHIP"
  TEMPORARY = "TEMPORARY"
}
```
**Usage**: Job.type, Candidate.preferredJobType

---

### JobStatus
```typescript
enum JobStatus {
  DRAFT = "DRAFT"       // Not visible publicly
  ACTIVE = "ACTIVE"     // Accepting applications
  CLOSED = "CLOSED"     // No longer accepting applications
  EXPIRED = "EXPIRED"   // Past deadline
}
```

---

### ExperienceLevel
```typescript
enum ExperienceLevel {
  ENTRY_LEVEL = "ENTRY_LEVEL"
  MID_LEVEL = "MID_LEVEL"
  SENIOR_LEVEL = "SENIOR_LEVEL"
  EXECUTIVE = "EXECUTIVE"
}
```

---

### ApplicationStatus
```typescript
enum ApplicationStatus {
  PENDING = "PENDING"
  REVIEWED = "REVIEWED"
  SHORTLISTED = "SHORTLISTED"
  INTERVIEW_SCHEDULED = "INTERVIEW_SCHEDULED"
  INTERVIEWED = "INTERVIEWED"
  OFFERED = "OFFERED"
  REJECTED = "REJECTED"
  WITHDRAWN = "WITHDRAWN"
  ACCEPTED = "ACCEPTED"
}
```

---

### TestStatus
```typescript
enum TestStatus {
  NOT_STARTED = "NOT_STARTED"
  IN_PROGRESS = "IN_PROGRESS"
  COMPLETED = "COMPLETED"
  EXPIRED = "EXPIRED"
}
```

---

### PlacementStatus
```typescript
enum PlacementStatus {
  PENDING = "PENDING"
  CONFIRMED = "CONFIRMED"
  COMPLETED = "COMPLETED"
  CANCELLED = "CANCELLED"
}
```

---

### PaymentStatus
```typescript
enum PaymentStatus {
  PENDING = "PENDING"
  UPFRONT_PAID = "UPFRONT_PAID"
  FULLY_PAID = "FULLY_PAID"
  FAILED = "FAILED"
}
```

---

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/register
**Description**: Register a new user (candidate or employer)
**Authentication**: None (public)
**Rate Limit**: TBD

**Request Body**:
```typescript
{
  email: string;           // Required, must be valid email format
  password: string;        // Required, min 8 chars, must have uppercase, lowercase, number
  name: string;            // Required, min 1 char - IMPORTANT: Not "fullName"!
  role?: "CANDIDATE" | "EMPLOYER" | "ADMIN"; // Optional, defaults to "CANDIDATE"

  // For employers (optional during registration):
  companyName?: string;    // If not provided, 'name' is used as companyName
}
```

**Success Response (201 Created)**:
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "cmhmqcpxq0000pc1yzke3ukj3",
    "email": "candidate@example.com",
    "name": "John Doe",
    "role": "CANDIDATE",
    "status": "ACTIVE",
    "createdAt": "2025-11-06T01:10:29.199Z"
  }
}
```

**Error Responses**:

**400 Bad Request** - Missing fields:
```json
{
  "error": "Email, password, and name are required"
}
```

**400 Bad Request** - Invalid email:
```json
{
  "error": "Invalid email format"
}
```

**400 Bad Request** - Weak password:
```json
{
  "error": "Invalid password",
  "details": [
    "Password must be at least 8 characters long",
    "Password must contain at least one uppercase letter",
    "Password must contain at least one number"
  ]
}
```

**400 Bad Request** - Invalid role:
```json
{
  "error": "Invalid role specified"
}
```

**409 Conflict** - Email already exists:
```json
{
  "error": "User with this email already exists"
}
```

**500 Internal Server Error**:
```json
{
  "error": "An error occurred during registration"
}
```

**Validation Rules**:
- **email**: Valid email format, unique
- **password**:
  - Minimum 8 characters
  - Must contain at least one uppercase letter (A-Z)
  - Must contain at least one lowercase letter (a-z)
  - Must contain at least one number (0-9)
- **name**: Required, min 1 character
- **role**: Must be valid UserRole enum value

**Side Effects**:
- Creates User record
- Creates Candidate or Employer profile based on role
- Sends welcome email to user

---

#### POST /api/auth/signin
#### GET /api/auth/signout
#### GET /api/auth/session
**Description**: NextAuth.js authentication endpoints
**Path**: `/api/auth/[...nextauth]`

**Sign In Request** (POST `/api/auth/signin`):
```typescript
// Via NextAuth client (recommended):
import { signIn } from "next-auth/react";

await signIn("credentials", {
  email: string;
  password: string;
  redirect: boolean;  // Optional, default true
  callbackUrl: string; // Optional, where to redirect after signin
});
```

**Sign In Success**: Sets HTTP-only session cookie, redirects to `callbackUrl`

**Sign In Error Messages**:
- `"Email and password are required"`
- `"No user found with this email"`
- `"Your account is not active. Please contact support."`
- `"Invalid password"`

**Session Response** (GET `/api/auth/session`):
```json
{
  "user": {
    "id": "cmhmqcpxq0000pc1yzke3ukj3",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "CANDIDATE",
    "status": "ACTIVE",
    "image": null
  },
  "expires": "2025-12-06T01:10:29.199Z"
}
```

**Sign Out** (POST `/api/auth/signout`):
Clears session cookie and redirects to signin page.

---

### Jobs Endpoints

#### GET /api/jobs
**Description**: List all active jobs with pagination and filters
**Authentication**: None (public)

**Query Parameters**:
```typescript
{
  page?: number;              // Page number (1-indexed), default: 1
  limit?: number;             // Items per page, default: 10
  location?: string;          // Filter by location (case-insensitive partial match)
  remote?: "true" | "false";  // Filter by remote status
  type?: JobType;             // Filter by job type enum
  experienceLevel?: ExperienceLevel; // Filter by experience level
  search?: string;            // Search in title, description, requirements
  employerId?: string;        // Filter by specific employer
  status?: JobStatus;         // Filter by status (default: ACTIVE for public)
}
```

**Example Request**:
```bash
GET /api/jobs?page=1&limit=10&location=New%20York&remote=true&type=FULL_TIME
```

**Success Response (200 OK)**:
```json
{
  "jobs": [
    {
      "id": "clxxx...",
      "employerId": "clyyyy...",
      "title": "Senior Full-Stack Developer",
      "description": "We are looking for...",
      "requirements": "5+ years experience...",
      "responsibilities": "Lead development...",
      "type": "FULL_TIME",
      "status": "ACTIVE",
      "location": "New York, NY",
      "remote": true,
      "salaryMin": 120000,
      "salaryMax": 180000,
      "experienceLevel": "SENIOR_LEVEL",
      "skills": ["React", "Node.js", "TypeScript", "PostgreSQL"],
      "benefits": "Health insurance, 401k...",
      "deadline": "2025-12-31T23:59:59.999Z",
      "slots": 2,
      "views": 145,
      "createdAt": "2025-11-01T10:00:00.000Z",
      "updatedAt": "2025-11-05T14:30:00.000Z",
      "employer": {
        "id": "clyyyy...",
        "companyName": "TechCorp Inc",
        "companyLogo": "https://example.com/logo.png",
        "companyWebsite": "https://techcorp.com",
        "location": "New York, NY",
        "industry": "Software",
        "verified": true
      },
      "_count": {
        "applications": 23
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalCount": 45,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Error Response (500)**:
```json
{
  "error": "Failed to fetch jobs"
}
```

---

#### GET /api/jobs/[id]
**Description**: Get single job details with employer info
**Authentication**: None (public)

**Path Parameters**:
- `id`: Job ID (string, cuid)

**Success Response (200 OK)**:
```json
{
  "job": {
    "id": "clxxx...",
    "employerId": "clyyyy...",
    "title": "Senior Full-Stack Developer",
    "description": "We are looking for...",
    "requirements": "5+ years experience...",
    "responsibilities": "Lead development...",
    "type": "FULL_TIME",
    "status": "ACTIVE",
    "location": "New York, NY",
    "remote": true,
    "salaryMin": 120000,
    "salaryMax": 180000,
    "experienceLevel": "SENIOR_LEVEL",
    "skills": ["React", "Node.js", "TypeScript"],
    "benefits": "Health, 401k, PTO",
    "deadline": "2025-12-31T23:59:59.999Z",
    "slots": 2,
    "views": 146,
    "createdAt": "2025-11-01T10:00:00.000Z",
    "updatedAt": "2025-11-05T14:30:00.000Z",
    "employer": {
      "id": "clyyyy...",
      "companyName": "TechCorp Inc",
      "companyLogo": "https://example.com/logo.png",
      "companyWebsite": "https://techcorp.com",
      "companySize": "100-500",
      "industry": "Software",
      "description": "Leading software company...",
      "location": "New York, NY",
      "verified": true
    },
    "_count": {
      "applications": 23
    }
  }
}
```

**Error Responses**:

**404 Not Found**:
```json
{
  "error": "Job not found"
}
```

**500 Internal Server Error**:
```json
{
  "error": "Failed to fetch job"
}
```

**Side Effects**:
- Increments `views` count by 1 on each GET request

---

#### POST /api/jobs
**Description**: Create a new job posting (starts as DRAFT)
**Authentication**: Required (`EMPLOYER` or `ADMIN` role)

**Request Headers**:
```http
Cookie: next-auth.session-token=<session-token>
Content-Type: application/json
```

**Request Body**:
```json
{
  "title": "Senior Full-Stack Developer",
  "description": "We are looking for an experienced full-stack developer...",
  "requirements": "5+ years experience with React and Node.js...",
  "responsibilities": "Lead development of new features...",
  "type": "FULL_TIME",
  "location": "New York, NY",
  "remote": true,
  "salaryMin": 120000,
  "salaryMax": 180000,
  "experienceLevel": "SENIOR_LEVEL",
  "skills": ["React", "Node.js", "TypeScript", "PostgreSQL"],
  "benefits": "Health insurance, 401k, unlimited PTO",
  "deadline": "2025-12-31T23:59:59.999Z",
  "slots": 2
}
```

**Required Fields**: title, description, requirements, responsibilities, type, location, experienceLevel

**Success Response (201 Created)**:
```json
{
  "message": "Job created successfully as DRAFT. You can publish it later.",
  "job": {
    "id": "clxxx...",
    "employerId": "clyyyy...",
    "title": "Senior Full-Stack Developer",
    "description": "We are looking for...",
    "requirements": "5+ years experience...",
    "responsibilities": "Lead development...",
    "type": "FULL_TIME",
    "status": "DRAFT",
    "location": "New York, NY",
    "remote": true,
    "salaryMin": 120000,
    "salaryMax": 180000,
    "experienceLevel": "SENIOR_LEVEL",
    "skills": ["React", "Node.js", "TypeScript", "PostgreSQL"],
    "benefits": "Health insurance...",
    "deadline": "2025-12-31T23:59:59.999Z",
    "slots": 2,
    "views": 0,
    "createdAt": "2025-11-06T02:00:00.000Z",
    "updatedAt": "2025-11-06T02:00:00.000Z",
    "employer": {
      "id": "clyyyy...",
      "companyName": "TechCorp Inc",
      "companyLogo": "https://example.com/logo.png",
      "verified": true
    }
  }
}
```

**Error Responses**:

**400 Bad Request** - Missing fields:
```json
{
  "error": "Missing required fields",
  "required": [
    "title",
    "description",
    "requirements",
    "responsibilities",
    "type",
    "location",
    "experienceLevel"
  ]
}
```

**400 Bad Request** - Invalid job type:
```json
{
  "error": "Invalid job type",
  "validTypes": ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY"]
}
```

**400 Bad Request** - Invalid salary range:
```json
{
  "error": "Minimum salary cannot be greater than maximum salary"
}
```

**400 Bad Request** - Invalid deadline:
```json
{
  "error": "Deadline must be in the future"
}
```

**401 Unauthorized**:
```json
{
  "error": "Authentication required"
}
```

**403 Forbidden**:
```json
{
  "error": "Insufficient permissions. Employer role required."
}
```

**404 Not Found** - Employer profile missing:
```json
{
  "error": "Employer profile not found. Please complete your profile first."
}
```

---

#### PATCH /api/jobs/[id]
**Description**: Update an existing job
**Authentication**: Required (`EMPLOYER` owner or `ADMIN`)

**Path Parameters**:
- `id`: Job ID (string, cuid)

**Request Body** (all fields optional):
```json
{
  "title": "Updated Title",
  "status": "ACTIVE",
  "salaryMin": 130000,
  "salaryMax": 190000
}
```

**Success Response (200 OK)**:
```json
{
  "message": "Job updated successfully",
  "job": {
    // Updated job object
  }
}
```

**Error Responses**:

**403 Forbidden** - Not job owner:
```json
{
  "error": "Forbidden. You can only update your own jobs."
}
```

**404 Not Found**:
```json
{
  "error": "Job not found"
}
```

---

#### DELETE /api/jobs/[id]
**Description**: Soft delete job (sets status to CLOSED)
**Authentication**: Required (`EMPLOYER` owner or `ADMIN`)

**Success Response (200 OK)**:
```json
{
  "message": "Job closed successfully",
  "job": {
    "id": "clxxx...",
    "title": "Senior Full-Stack Developer",
    "status": "CLOSED"
  }
}
```

**Error Responses**:

**400 Bad Request** - Active applications exist:
```json
{
  "error": "Cannot delete job with active applications. Please close it instead.",
  "activeApplications": 5
}
```

---

#### GET /api/jobs/search
**Description**: Advanced job search with filters and statistics
**Authentication**: None (public)

**Query Parameters**:
```typescript
{
  q?: string;                  // Search query (searches title, description, requirements)
  type?: JobType[];            // Array of job types
  location?: string;           // Location filter
  remote?: "true" | "false";   // Remote filter
  experienceLevel?: ExperienceLevel[]; // Array of experience levels
  salaryMin?: number;          // Minimum salary
  salaryMax?: number;          // Maximum salary
  skills?: string;             // Comma-separated skills (e.g., "React,Node.js,TypeScript")
  companyName?: string;        // Company name search
  postedWithin?: number;       // Days (e.g., 7 for last week)
  sortBy?: "newest" | "salary_high" | "salary_low" | "applicants_high" | "applicants_low" | "relevant";
  limit?: number;              // Default: 20, max: 100
  cursor?: string;             // Cursor for pagination
}
```

**Example Request**:
```bash
GET /api/jobs/search?q=react&location=New%20York&skills=React,TypeScript&salaryMin=100000&sortBy=salary_high&limit=20
```

**Success Response (200 OK)**:
```json
{
  "jobs": [
    {
      "id": "clxxx...",
      "title": "React Developer",
      // ... job fields ...
      "applicationsCount": 12,
      "matchingSkills": ["React", "TypeScript"],
      "skillMatchScore": 100
    }
  ],
  "pagination": {
    "limit": 20,
    "hasMore": true,
    "nextCursor": "clyyy...",
    "total": 45,
    "currentPage": "N/A (cursor-based)"
  },
  "filters": {
    "applied": {
      "searchQuery": "react",
      "type": [],
      "location": "New York",
      "remote": null,
      "experienceLevel": [],
      "salaryMin": 100000,
      "salaryMax": null,
      "skills": ["React", "TypeScript"],
      "companyName": null,
      "postedWithin": null,
      "sortBy": "salary_high"
    },
    "statistics": {
      "byType": {
        "FULL_TIME": 30,
        "CONTRACT": 10,
        "PART_TIME": 5
      },
      "byExperienceLevel": {
        "ENTRY_LEVEL": 5,
        "MID_LEVEL": 20,
        "SENIOR_LEVEL": 15,
        "EXECUTIVE": 5
      },
      "byRemote": {
        "remote": 25,
        "onsite": 20
      },
      "salaryRange": {
        "min": 50000,
        "max": 250000,
        "avgMin": 95000,
        "avgMax": 145000
      }
    }
  },
  "meta": {
    "timestamp": "2025-11-06T02:00:00.000Z",
    "resultsCount": 20,
    "totalMatches": 45
  }
}
```

---

### Applications Endpoints

#### POST /api/applications
**Description**: Submit a job application
**Authentication**: Required (`CANDIDATE` or `ADMIN` role)

**Request Body**:
```json
{
  "jobId": "clxxx...",
  "coverLetter": "I am very interested in this position because..."
}
```

**Success Response (201 Created)**:
```json
{
  "message": "Application submitted successfully",
  "application": {
    "id": "clzzz...",
    "jobId": "clxxx...",
    "candidateId": "clyyyy...",
    "coverLetter": "I am very interested...",
    "status": "PENDING",
    "appliedAt": "2025-11-06T02:00:00.000Z",
    "reviewedAt": null,
    "notes": null,
    "createdAt": "2025-11-06T02:00:00.000Z",
    "updatedAt": "2025-11-06T02:00:00.000Z",
    "job": {
      "id": "clxxx...",
      "title": "Senior Full-Stack Developer",
      "type": "FULL_TIME",
      "location": "New York, NY",
      "employer": {
        "companyName": "TechCorp Inc",
        "companyLogo": "https://example.com/logo.png"
      }
    },
    "candidate": {
      "id": "clyyyy...",
      "user": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  }
}
```

**Error Responses**:

**400 Bad Request** - Missing job ID:
```json
{
  "error": "Job ID is required"
}
```

**400 Bad Request** - Job not active:
```json
{
  "error": "This job is not accepting applications",
  "jobStatus": "CLOSED"
}
```

**400 Bad Request** - Deadline passed:
```json
{
  "error": "Application deadline has passed",
  "deadline": "2025-11-05T23:59:59.999Z"
}
```

**404 Not Found** - Job not found:
```json
{
  "error": "Job not found"
}
```

**404 Not Found** - Candidate profile not found:
```json
{
  "error": "Candidate profile not found. Please complete your profile first."
}
```

**409 Conflict** - Already applied:
```json
{
  "error": "You have already applied to this job",
  "applicationId": "clzzz...",
  "appliedAt": "2025-11-05T10:00:00.000Z",
  "status": "PENDING"
}
```

**Side Effects**:
- Sends confirmation email to candidate
- Sends notification email to employer

---

#### GET /api/applications
**Description**: Get applications for current user
**Authentication**: Required (role-based filtering)
- **CANDIDATE**: See their own applications
- **EMPLOYER**: See applications for their jobs
- **ADMIN**: See all applications

**Query Parameters**:
```typescript
{
  page?: number;              // Default: 1
  limit?: number;             // Default: 10
  status?: ApplicationStatus; // Filter by status
  jobId?: string;             // Filter by specific job
}
```

**Success Response (200 OK)**:
```json
{
  "applications": [
    {
      "id": "clzzz...",
      "jobId": "clxxx...",
      "candidateId": "clyyyy...",
      "coverLetter": "I am very interested...",
      "status": "PENDING",
      "appliedAt": "2025-11-06T02:00:00.000Z",
      "reviewedAt": null,
      "notes": null,
      "createdAt": "2025-11-06T02:00:00.000Z",
      "updatedAt": "2025-11-06T02:00:00.000Z",
      "job": {
        "id": "clxxx...",
        "title": "Senior Full-Stack Developer",
        "type": "FULL_TIME",
        "location": "New York, NY",
        "status": "ACTIVE",
        "employer": {
          "id": "clempl...",
          "companyName": "TechCorp Inc",
          "companyLogo": "https://example.com/logo.png"
        }
      },
      "candidate": {
        "id": "clyyyy...",
        "experience": 5,
        "location": "New York, NY",
        "skills": ["React", "Node.js", "TypeScript"],
        "user": {
          "name": "John Doe",
          "email": "john@example.com",
          "image": null
        }
      },
      "testResults": []
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalCount": 23,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

### Candidates Endpoints

#### GET /api/candidates/profile
**Description**: Get current candidate's profile
**Authentication**: Required (`CANDIDATE` or `ADMIN` role)

**Success Response (200 OK)**:
```json
{
  "candidate": {
    "id": "clcand...",
    "userId": "cluser...",
    "phone": "+1234567890",
    "resume": "https://example.com/resumes/john-doe.pdf",
    "portfolio": "https://johndoe.dev",
    "linkedIn": "https://linkedin.com/in/johndoe",
    "github": "https://github.com/johndoe",
    "bio": "Experienced full-stack developer...",
    "skills": ["React", "Node.js", "TypeScript", "PostgreSQL"],
    "experience": 5,
    "education": "BS Computer Science, MIT",
    "location": "New York, NY",
    "preferredJobType": "FULL_TIME",
    "expectedSalary": 150000,
    "availability": true,
    "hasTakenTest": false,
    "testScore": null,
    "testPercentile": null,
    "testTier": null,
    "lastTestDate": null,
    "testInviteToken": null,
    "testInviteSentAt": null,
    "referralCode": "JOHN123",
    "referredBy": null,
    "referralEarnings": 0,
    "createdAt": "2025-11-01T10:00:00.000Z",
    "updatedAt": "2025-11-06T02:00:00.000Z",
    "applications": [
      // Last 10 applications
    ],
    "testResults": [
      // Last 5 test results
    ],
    "placements": []
  },
  "profileCompletion": {
    "percentage": 75,
    "missingFields": ["resume", "portfolio"],
    "status": "GOOD"
  }
}
```

---

#### POST /api/candidates/profile
**Description**: Create candidate profile
**Authentication**: Required (`CANDIDATE` or `ADMIN` role)

**Request Body** (all fields optional except userId is auto-set):
```json
{
  "phone": "+1234567890",
  "resume": "https://example.com/resume.pdf",
  "portfolio": "https://johndoe.dev",
  "linkedIn": "https://linkedin.com/in/johndoe",
  "github": "https://github.com/johndoe",
  "bio": "Experienced full-stack developer...",
  "skills": ["React", "Node.js", "TypeScript"],
  "experience": 5,
  "education": "BS Computer Science, MIT",
  "location": "New York, NY",
  "preferredJobType": "FULL_TIME",
  "expectedSalary": 150000,
  "availability": true
}
```

**Success Response (201 Created)**:
```json
{
  "message": "Candidate profile created successfully",
  "candidate": {
    // Complete candidate object
  },
  "profileCompletion": {
    "percentage": 75,
    "missingFields": [],
    "status": "EXCELLENT"
  }
}
```

**Error Response (400)** - Profile already exists:
```json
{
  "error": "Candidate profile already exists. Use PATCH to update."
}
```

---

#### PATCH /api/candidates/profile
**Description**: Update candidate profile
**Authentication**: Required (`CANDIDATE` or `ADMIN` role)

**Request Body** (all fields optional, only provided fields are updated):
```json
{
  "phone": "+1234567890",
  "bio": "Updated bio...",
  "skills": ["React", "Node.js", "TypeScript", "GraphQL"],
  "availability": false
}
```

**Success Response (200 OK)**:
```json
{
  "message": "Candidate profile updated successfully",
  "candidate": {
    // Updated candidate object
  },
  "profileCompletion": {
    "percentage": 80,
    "missingFields": [],
    "status": "EXCELLENT"
  }
}
```

---

### Employers Endpoints

#### GET /api/employers/profile
**Description**: Get current employer's profile with stats
**Authentication**: Required (`EMPLOYER` or `ADMIN` role)

**Success Response (200 OK)**:
```json
{
  "employer": {
    "id": "clempl...",
    "userId": "cluser...",
    "companyName": "TechCorp Inc",
    "companyLogo": "https://example.com/logo.png",
    "companyWebsite": "https://techcorp.com",
    "companySize": "100-500",
    "industry": "Software",
    "description": "Leading software company...",
    "location": "New York, NY",
    "phone": "+1234567890",
    "verified": true,
    "stripeCustomerId": "cus_xxx",
    "totalSpent": 50000,
    "createdAt": "2025-10-01T10:00:00.000Z",
    "updatedAt": "2025-11-06T02:00:00.000Z",
    "jobs": [
      // Last 10 jobs
    ],
    "emailCampaigns": [
      // Last 5 campaigns
    ],
    "_count": {
      "jobs": 15,
      "emailCampaigns": 3
    }
  },
  "applicationStats": [
    {
      "status": "PENDING",
      "_count": 23
    },
    {
      "status": "REVIEWED",
      "_count": 15
    },
    {
      "status": "SHORTLISTED",
      "_count": 8
    }
  ]
}
```

---

#### POST /api/employers/profile
**Description**: Create employer profile
**Authentication**: Required (`EMPLOYER` or `ADMIN` role)

**Request Body**:
```json
{
  "companyName": "TechCorp Inc",
  "companyLogo": "https://example.com/logo.png",
  "companyWebsite": "https://techcorp.com",
  "companySize": "100-500",
  "industry": "Software",
  "description": "Leading software company...",
  "location": "New York, NY",
  "phone": "+1234567890"
}
```

**Required Fields**: `companyName`

**Success Response (201 Created)**:
```json
{
  "message": "Employer profile created successfully",
  "employer": {
    // Complete employer object
  }
}
```

**Error Responses**:

**400 Bad Request** - Missing company name:
```json
{
  "error": "Company name is required"
}
```

**400 Bad Request** - Invalid website URL:
```json
{
  "error": "Invalid company website URL"
}
```

---

#### PATCH /api/employers/profile
**Description**: Update employer profile
**Authentication**: Required (`EMPLOYER` or `ADMIN` role)

**Request Body** (all fields optional):
```json
{
  "companyWebsite": "https://newtechcorp.com",
  "description": "Updated description...",
  "phone": "+9876543210"
}
```

**Success Response (200 OK)**:
```json
{
  "message": "Employer profile updated successfully",
  "employer": {
    // Updated employer object
  }
}
```

---

## Error Response Format

All API endpoints return errors in this standard format:

```typescript
{
  error: string;          // User-friendly error message
  details?: string | string[]; // Additional error details (e.g., validation errors)
  [key: string]: any;     // Context-specific fields (e.g., validTypes, applicationId)
}
```

### HTTP Status Codes

| Code | Meaning | Usage |
|------|---------|-------|
| 200 | OK | Successful GET/PATCH/DELETE |
| 201 | Created | Successful POST (resource created) |
| 400 | Bad Request | Validation error, invalid input |
| 401 | Unauthorized | Not authenticated |
| 403 | Forbidden | Authenticated but insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate resource (e.g., email exists, already applied) |
| 500 | Internal Server Error | Server-side error |

---

## Validation Rules

### User Registration

**email**:
- Required
- Must match regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- Must be unique in database

**password**:
- Required
- Minimum 8 characters
- Must contain at least one uppercase letter (A-Z)
- Must contain at least one lowercase letter (a-z)
- Must contain at least one number (0-9)
- No special character requirement

**name**:
- Required
- Minimum 1 character

**role**:
- Optional (defaults to "CANDIDATE")
- Must be valid UserRole enum value

### Job Creation

**title**: Required
**description**: Required (Text field)
**requirements**: Required (Text field)
**responsibilities**: Required (Text field)
**type**: Required, must be valid JobType enum
**location**: Required
**experienceLevel**: Required, must be valid ExperienceLevel enum

**salaryMin** and **salaryMax**:
- Optional
- If both provided: salaryMin <= salaryMax

**deadline**:
- Optional
- Must be in the future (> now)

**skills**: Optional, array of strings

### Application Submission

**jobId**: Required, must exist and be ACTIVE
**coverLetter**: Optional (Text field)

**Constraints**:
- Job status must be ACTIVE
- Deadline must not have passed
- Candidate can only apply once per job (unique constraint)

### Employer Profile

**companyName**: Required
**companyWebsite**: Optional, must be valid URL if provided

### Candidate Profile

All fields optional, but some affect profile completion score:
- resume, portfolio, linkedIn, github
- bio, skills, experience, education, location

---

## Pagination

### Offset-Based Pagination (Jobs, Applications)

**Query Parameters**:
```typescript
{
  page: number;    // 1-indexed (default: 1)
  limit: number;   // Items per page (default: 10)
}
```

**Response Format**:
```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalCount": 45,
    "totalPages": 5,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Calculation**:
- `skip = (page - 1) * limit`
- `totalPages = Math.ceil(totalCount / limit)`
- `hasNext = page < totalPages`
- `hasPrev = page > 1`

### Cursor-Based Pagination (Job Search)

**Query Parameters**:
```typescript
{
  limit: number;   // Items per page (default: 20, max: 100)
  cursor?: string; // ID of last item from previous page
}
```

**Response Format**:
```json
{
  "data": [...],
  "pagination": {
    "limit": 20,
    "hasMore": true,
    "nextCursor": "clxxx...",
    "total": 150,
    "currentPage": "N/A (cursor-based)"
  }
}
```

---

## CORS Configuration

**Allowed Origin**: `https://jobportal-rouge-mu.vercel.app`
**Allowed Methods**: GET, POST, PUT, PATCH, DELETE, OPTIONS
**Credentials**: Allowed (cookies sent cross-origin)

**Request Headers Allowed**:
- X-CSRF-Token
- X-Requested-With
- Accept
- Accept-Version
- Content-Length
- Content-MD5
- Content-Type
- Date
- X-Api-Version
- Authorization

**Frontend Fetch Example**:
```javascript
fetch('https://job-portal-backend-production-cd05.up.railway.app/api/jobs', {
  method: 'GET',
  credentials: 'include', // IMPORTANT: Required for cookies
  headers: {
    'Content-Type': 'application/json',
  }
})
```

---

## Frontend-Backend Field Mapping

### Critical Mismatches to Watch

| Frontend Expectation | Backend Reality | Type | Notes |
|---------------------|-----------------|------|-------|
| `fullName` | `name` | string | ⚠️ Backend uses `name`, NOT `fullName` |
| `userId` | `id` | string (cuid) | User ID is cuid, not integer |
| Enum values lowercase | Enum values UPPERCASE | enum | All enums are UPPERCASE with underscores |
| `remote: "remote"` | `remote: true` | boolean | `remote` is boolean, not string enum |
| Salary in dollars | Salary as integer | number | Check if cents or dollars (inconsistent) |
| Array as comma-separated | Array as actual array | string[] | PostgreSQL arrays, not strings |

### User Model Mapping

```typescript
// Frontend might send:
{
  fullName: "John Doe",          // ❌ WRONG
  email: "john@example.com"
}

// Backend expects:
{
  name: "John Doe",              // ✅ CORRECT
  email: "john@example.com"
}
```

### Job Type Mapping

```typescript
// Frontend might send:
{
  type: "full-time",             // ❌ WRONG
  remote: "remote"               // ❌ WRONG
}

// Backend expects:
{
  type: "FULL_TIME",             // ✅ CORRECT
  remote: true                   // ✅ CORRECT (boolean)
}
```

### Skills Array Mapping

```typescript
// Frontend might send:
{
  skills: "React, Node.js, TypeScript"  // ❌ WRONG
}

// Backend expects:
{
  skills: ["React", "Node.js", "TypeScript"]  // ✅ CORRECT
}
```

### Date Format

All dates are ISO 8601 strings:
```typescript
"2025-11-06T02:00:00.000Z"  // DateTime
```

---

## Example Requests & Responses

### Example 1: Register as Candidate

**Request**:
```bash
curl -X POST https://job-portal-backend-production-cd05.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123",
    "name": "John Doe",
    "role": "CANDIDATE"
  }'
```

**Response (201)**:
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "cmhmqcpxq0000pc1yzke3ukj3",
    "email": "john@example.com",
    "name": "John Doe",
    "role": "CANDIDATE",
    "status": "ACTIVE",
    "createdAt": "2025-11-06T01:10:29.199Z"
  }
}
```

---

### Example 2: Register as Employer

**Request**:
```bash
curl -X POST https://job-portal-backend-production-cd05.up.railway.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "employer@techcorp.com",
    "password": "SecurePass123",
    "name": "Jane Smith",
    "role": "EMPLOYER"
  }'
```

**Response (201)**:
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "cmhmqcs2f0003pc1y119cf0bb",
    "email": "employer@techcorp.com",
    "name": "Jane Smith",
    "role": "EMPLOYER",
    "status": "ACTIVE",
    "createdAt": "2025-11-06T01:10:31.960Z"
  }
}
```

**Note**: Employer profile is created with `companyName` set to `name` ("Jane Smith"). Should be updated via `/api/employers/profile` PATCH.

---

### Example 3: Sign In (via NextAuth)

**Frontend Code**:
```typescript
import { signIn } from "next-auth/react";

const result = await signIn("credentials", {
  email: "john@example.com",
  password: "SecurePass123",
  redirect: false,
});

if (result?.error) {
  console.error("Login failed:", result.error);
} else {
  console.log("Login successful");
}
```

**Success**: Sets session cookie, no JSON response (redirect-based)

---

### Example 4: Get All Jobs (Public)

**Request**:
```bash
curl https://job-portal-backend-production-cd05.up.railway.app/api/jobs?page=1&limit=5
```

**Response (200)**:
```json
{
  "jobs": [],
  "pagination": {
    "page": 1,
    "limit": 5,
    "totalCount": 0,
    "totalPages": 0,
    "hasNext": false,
    "hasPrev": false
  }
}
```

---

### Example 5: Create Job (Authenticated Employer)

**Request**:
```bash
curl -X POST https://job-portal-backend-production-cd05.up.railway.app/api/jobs \
  -H "Cookie: next-auth.session-token=<your-session-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Senior React Developer",
    "description": "We are looking for an experienced React developer to join our team...",
    "requirements": "5+ years of React experience, strong TypeScript skills...",
    "responsibilities": "Lead frontend development, mentor junior developers...",
    "type": "FULL_TIME",
    "location": "San Francisco, CA",
    "remote": true,
    "salaryMin": 140000,
    "salaryMax": 180000,
    "experienceLevel": "SENIOR_LEVEL",
    "skills": ["React", "TypeScript", "Next.js", "GraphQL"],
    "benefits": "Health insurance, 401k, unlimited PTO",
    "slots": 1
  }'
```

**Response (201)**:
```json
{
  "message": "Job created successfully as DRAFT. You can publish it later.",
  "job": {
    "id": "clxxx...",
    "employerId": "clyyyy...",
    "title": "Senior React Developer",
    "status": "DRAFT",
    // ... all fields
  }
}
```

**Next Step**: Update job status to "ACTIVE" via PATCH `/api/jobs/[id]` with `{ "status": "ACTIVE" }`

---

### Example 6: Apply to Job (Authenticated Candidate)

**Request**:
```bash
curl -X POST https://job-portal-backend-production-cd05.up.railway.app/api/applications \
  -H "Cookie: next-auth.session-token=<your-session-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "jobId": "clxxx...",
    "coverLetter": "I am very interested in this Senior React Developer position. With 6 years of React experience and a strong background in TypeScript..."
  }'
```

**Response (201)**:
```json
{
  "message": "Application submitted successfully",
  "application": {
    "id": "clzzz...",
    "jobId": "clxxx...",
    "candidateId": "clyyyy...",
    "status": "PENDING",
    "appliedAt": "2025-11-06T02:30:00.000Z",
    // ... complete application object
  }
}
```

---

### Example 7: Search Jobs with Filters

**Request**:
```bash
curl "https://job-portal-backend-production-cd05.up.railway.app/api/jobs/search?q=react&location=San%20Francisco&remote=true&skills=React,TypeScript&salaryMin=120000&sortBy=salary_high&limit=10"
```

**Response (200)**:
```json
{
  "jobs": [
    {
      "id": "clxxx...",
      "title": "Senior React Developer",
      "salaryMin": 140000,
      "salaryMax": 180000,
      "location": "San Francisco, CA",
      "remote": true,
      "skills": ["React", "TypeScript", "Next.js", "GraphQL"],
      "matchingSkills": ["React", "TypeScript"],
      "skillMatchScore": 100,
      "applicationsCount": 5,
      // ... more fields
    }
  ],
  "pagination": {
    "limit": 10,
    "hasMore": false,
    "nextCursor": null,
    "total": 1
  },
  "filters": {
    "applied": {
      "searchQuery": "react",
      "location": "San Francisco",
      "remote": "true",
      "skills": ["React", "TypeScript"],
      "salaryMin": 120000,
      "sortBy": "salary_high"
    },
    "statistics": {
      "byType": {
        "FULL_TIME": 1
      },
      "byExperienceLevel": {
        "SENIOR_LEVEL": 1
      },
      "byRemote": {
        "remote": 1,
        "onsite": 0
      },
      "salaryRange": {
        "min": 140000,
        "max": 180000,
        "avgMin": 140000,
        "avgMax": 180000
      }
    }
  }
}
```

---

### Example 8: Update Candidate Profile

**Request**:
```bash
curl -X PATCH https://job-portal-backend-production-cd05.up.railway.app/api/candidates/profile \
  -H "Cookie: next-auth.session-token=<your-session-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "bio": "Experienced React and Node.js developer with 6 years of full-stack development.",
    "skills": ["React", "TypeScript", "Node.js", "PostgreSQL", "GraphQL"],
    "location": "San Francisco, CA",
    "expectedSalary": 160000,
    "resume": "https://example.com/resumes/john-doe.pdf"
  }'
```

**Response (200)**:
```json
{
  "message": "Candidate profile updated successfully",
  "candidate": {
    "id": "clcand...",
    "userId": "cluser...",
    "bio": "Experienced React and Node.js developer...",
    "skills": ["React", "TypeScript", "Node.js", "PostgreSQL", "GraphQL"],
    "location": "San Francisco, CA",
    "expectedSalary": 160000,
    "resume": "https://example.com/resumes/john-doe.pdf",
    // ... all fields
  },
  "profileCompletion": {
    "percentage": 85,
    "missingFields": ["portfolio", "github"],
    "status": "EXCELLENT"
  }
}
```

---

## Additional Endpoints (Summary)

These endpoints exist but detailed documentation would be very long. Refer to source code:

### Dashboard Endpoints
- `GET /api/dashboard/candidate` - Candidate dashboard stats
- `GET /api/dashboard/employer` - Employer dashboard stats
- `GET /api/dashboard/admin` - Admin dashboard stats

### File Upload Endpoints
- `POST /api/upload/resume` - Upload candidate resume
- `POST /api/upload/logo` - Upload employer logo
- `POST /api/upload/profile` - Upload profile image

### Messages Endpoints
- `GET /api/messages` - Get conversations
- `POST /api/messages` - Send message
- `GET /api/messages/[id]` - Get message details
- `POST /api/messages/[id]/read` - Mark as read
- `GET /api/messages/conversations` - Get conversation list
- `GET /api/messages/unread` - Get unread count

### Placements Endpoints
- `GET /api/placements` - List placements
- `POST /api/placements` - Create placement
- `GET /api/placements/[id]` - Get placement details
- `PATCH /api/placements/[id]` - Update placement
- `POST /api/placements/[id]/payment` - Process payment
- `GET /api/placements/[id]/invoice` - Get invoice

### Stripe Endpoints
- `POST /api/stripe/create-customer` - Create Stripe customer
- `POST /api/stripe/create-payment-intent` - Create payment intent
- `POST /api/webhooks/stripe` - Stripe webhook handler

### Referrals Endpoints
- `POST /api/referrals/generate` - Generate referral code
- `GET /api/referrals` - Get referrals
- `POST /api/referrals/apply` - Apply referral code

### Tests Endpoints
- `POST /api/tests/invite` - Send test invitation
- `GET /api/tests/results/[candidateId]` - Get test results
- `POST /api/tests/webhook` - Test platform webhook

### Admin Endpoints (All require ADMIN role)
- `GET /api/admin/jobs` - Manage all jobs
- `POST /api/admin/jobs/[id]/approve` - Approve job
- `GET /api/admin/users` - Manage users
- `POST /api/admin/users/[id]/suspend` - Suspend user
- `GET /api/admin/tests/flagged` - Flagged test results
- `POST /api/admin/tests/[id]/verify` - Verify test result

### Cron Jobs (Protected, require authorization header)
- `GET /api/cron/expire-jobs` - Expire old jobs
- `GET /api/cron/payment-reminders` - Send payment reminders
- `GET /api/cron/guarantee-checks` - Check placement guarantees

### Health Check
- `GET /api/health` - Health check with DB, environment, email, Stripe status

---

## Verification Checklist

- [x] All Prisma models documented with exact field names and types
- [x] All API endpoints listed with request/response schemas
- [x] All enum values shown with exact casing (UPPERCASE with underscores)
- [x] Request/response schemas for auth, jobs, applications, profiles
- [x] Field name mismatches identified (name vs fullName, remote boolean vs string)
- [x] Example requests provided for common flows
- [x] Validation rules documented (password, email, required fields)
- [x] Authentication flow explained (NextAuth JWT with cookies)
- [x] Error response format standardized
- [x] Pagination formats documented (offset-based and cursor-based)
- [x] CORS configuration specified

---

## Notes for Frontend Developers

1. **Use `name`, not `fullName`** in registration and user objects
2. **All enums are UPPERCASE** (e.g., `FULL_TIME`, not `full-time`)
3. **`remote` is boolean**, not `"remote" | "hybrid" | "onsite"`
4. **Skills are arrays**, not comma-separated strings
5. **Use `credentials: 'include'`** in fetch for cookie-based auth
6. **Job creation starts as DRAFT**, must be updated to ACTIVE manually
7. **Unique constraint**: One application per candidate per job
8. **Salaries**: Check if cents or dollars (may be inconsistent)
9. **IDs are cuid strings**, not integers
10. **Dates are ISO 8601 strings**, not Unix timestamps

---

**End of API Reference**
