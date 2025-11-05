# Jobs API Documentation

Complete API documentation for job management endpoints.

## Overview

The Jobs API provides full CRUD operations for job postings with role-based access control, filtering, pagination, and search capabilities.

## Base URL

```
http://localhost:3000/api/jobs
```

## Authentication

- **Public Routes**: GET /api/jobs, GET /api/jobs/[id]
- **Protected Routes**: POST, PATCH, DELETE (require EMPLOYER or ADMIN role)

Include session token in cookies (automatically handled by NextAuth.js).

---

## Endpoints

### 1. List All Jobs

**GET** `/api/jobs`

Get a paginated list of jobs with optional filters.

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number for pagination |
| `limit` | number | 10 | Number of items per page |
| `location` | string | - | Filter by location (case-insensitive partial match) |
| `remote` | boolean | - | Filter by remote jobs (true/false) |
| `type` | JobType | - | Filter by job type |
| `experienceLevel` | ExperienceLevel | - | Filter by experience level |
| `search` | string | - | Search in title, description, or requirements |
| `employerId` | string | - | Filter by employer ID |
| `status` | JobStatus | ACTIVE | Filter by job status (defaults to ACTIVE for public) |

#### Job Types
- `FULL_TIME`
- `PART_TIME`
- `CONTRACT`
- `INTERNSHIP`
- `TEMPORARY`

#### Experience Levels
- `ENTRY_LEVEL`
- `MID_LEVEL`
- `SENIOR_LEVEL`
- `EXECUTIVE`

#### Job Statuses
- `DRAFT` - Not published yet
- `ACTIVE` - Published and accepting applications
- `CLOSED` - No longer accepting applications
- `EXPIRED` - Past deadline

#### Example Request

```bash
# Get all active jobs
curl "http://localhost:3000/api/jobs"

# Filter by location and type
curl "http://localhost:3000/api/jobs?location=New%20York&type=FULL_TIME"

# Search with pagination
curl "http://localhost:3000/api/jobs?search=developer&page=2&limit=20"

# Get remote jobs only
curl "http://localhost:3000/api/jobs?remote=true"

# Get jobs by employer
curl "http://localhost:3000/api/jobs?employerId=clx123..."
```

#### Response (200 OK)

```json
{
  "jobs": [
    {
      "id": "clx...",
      "employerId": "clx...",
      "title": "Senior Full Stack Developer",
      "description": "We are looking for...",
      "requirements": "5+ years experience...",
      "responsibilities": "Lead development...",
      "type": "FULL_TIME",
      "status": "ACTIVE",
      "location": "New York, NY",
      "remote": true,
      "salaryMin": 100000,
      "salaryMax": 150000,
      "experienceLevel": "SENIOR_LEVEL",
      "skills": ["React", "Node.js", "TypeScript"],
      "benefits": "Health insurance, 401k...",
      "deadline": "2024-12-31T23:59:59.000Z",
      "slots": 2,
      "views": 1250,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-15T00:00:00.000Z",
      "employer": {
        "id": "clx...",
        "companyName": "Tech Corp",
        "companyLogo": "https://...",
        "companyWebsite": "https://techcorp.com",
        "location": "New York, NY",
        "industry": "Technology",
        "verified": true
      },
      "_count": {
        "applications": 45
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalCount": 100,
    "totalPages": 10,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

### 2. Get Single Job

**GET** `/api/jobs/[id]`

Get detailed information about a specific job, including full employer details.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job ID |

#### Example Request

```bash
curl "http://localhost:3000/api/jobs/clx123..."
```

#### Response (200 OK)

```json
{
  "job": {
    "id": "clx...",
    "employerId": "clx...",
    "title": "Senior Full Stack Developer",
    "description": "We are looking for an experienced developer...",
    "requirements": "5+ years of experience with React and Node.js...",
    "responsibilities": "Lead development of new features...",
    "type": "FULL_TIME",
    "status": "ACTIVE",
    "location": "New York, NY",
    "remote": true,
    "salaryMin": 100000,
    "salaryMax": 150000,
    "experienceLevel": "SENIOR_LEVEL",
    "skills": ["React", "Node.js", "TypeScript", "PostgreSQL"],
    "benefits": "Health insurance, 401k, unlimited PTO, remote work",
    "deadline": "2024-12-31T23:59:59.000Z",
    "slots": 2,
    "views": 1251,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z",
    "employer": {
      "id": "clx...",
      "companyName": "Tech Corp",
      "companyLogo": "https://...",
      "companyWebsite": "https://techcorp.com",
      "companySize": "100-500",
      "industry": "Technology",
      "description": "Leading tech company...",
      "location": "New York, NY",
      "verified": true
    },
    "_count": {
      "applications": 45
    }
  }
}
```

#### Error Responses

**404 Not Found**
```json
{
  "error": "Job not found"
}
```

---

### 3. Create Job

**POST** `/api/jobs`

Create a new job posting. Requires EMPLOYER or ADMIN role.

**Authentication Required**: Yes (EMPLOYER or ADMIN)

Jobs are created with status `DRAFT` by default and must be published manually.

#### Request Body

```json
{
  "title": "Senior Full Stack Developer",
  "description": "We are looking for an experienced developer...",
  "requirements": "5+ years of experience...",
  "responsibilities": "Lead development of new features...",
  "type": "FULL_TIME",
  "location": "New York, NY",
  "remote": true,
  "salaryMin": 100000,
  "salaryMax": 150000,
  "experienceLevel": "SENIOR_LEVEL",
  "skills": ["React", "Node.js", "TypeScript"],
  "benefits": "Health insurance, 401k, unlimited PTO",
  "deadline": "2024-12-31T23:59:59.000Z",
  "slots": 2
}
```

#### Required Fields

- `title` (string)
- `description` (string)
- `requirements` (string)
- `responsibilities` (string)
- `type` (JobType enum)
- `location` (string)
- `experienceLevel` (ExperienceLevel enum)

#### Optional Fields

- `remote` (boolean, default: false)
- `salaryMin` (number)
- `salaryMax` (number)
- `skills` (string[], default: [])
- `benefits` (string)
- `deadline` (ISO date string)
- `slots` (number, default: 1)

#### Example Request

```bash
curl -X POST "http://localhost:3000/api/jobs" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "title": "Senior Developer",
    "description": "Great opportunity...",
    "requirements": "5+ years...",
    "responsibilities": "Lead development...",
    "type": "FULL_TIME",
    "location": "San Francisco, CA",
    "experienceLevel": "SENIOR_LEVEL"
  }'
```

#### Response (201 Created)

```json
{
  "message": "Job created successfully as DRAFT. You can publish it later.",
  "job": {
    "id": "clx...",
    "title": "Senior Developer",
    "status": "DRAFT",
    "employer": {
      "id": "clx...",
      "companyName": "Your Company",
      "companyLogo": "https://...",
      "verified": true
    }
  }
}
```

#### Error Responses

**400 Bad Request** - Missing required fields
```json
{
  "error": "Missing required fields",
  "required": ["title", "description", "requirements", "responsibilities", "type", "location", "experienceLevel"]
}
```

**400 Bad Request** - Invalid salary range
```json
{
  "error": "Minimum salary cannot be greater than maximum salary"
}
```

**400 Bad Request** - Invalid deadline
```json
{
  "error": "Deadline must be in the future"
}
```

**401 Unauthorized**
```json
{
  "error": "Authentication required"
}
```

**403 Forbidden**
```json
{
  "error": "Insufficient permissions. Employer role required."
}
```

**404 Not Found** - Employer profile missing
```json
{
  "error": "Employer profile not found. Please complete your profile first."
}
```

---

### 4. Update Job

**PATCH** `/api/jobs/[id]`

Update an existing job. Requires EMPLOYER or ADMIN role.

**Authentication Required**: Yes (EMPLOYER or ADMIN)

**Ownership**: Employers can only update their own jobs (unless ADMIN).

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job ID |

#### Request Body

All fields are optional. Only include fields you want to update.

```json
{
  "title": "Updated Title",
  "status": "ACTIVE",
  "salaryMin": 120000,
  "salaryMax": 180000
}
```

#### Example Request

```bash
curl -X PATCH "http://localhost:3000/api/jobs/clx123..." \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "status": "ACTIVE",
    "salaryMax": 160000
  }'
```

#### Response (200 OK)

```json
{
  "message": "Job updated successfully",
  "job": {
    "id": "clx...",
    "title": "Senior Developer",
    "status": "ACTIVE",
    "salaryMax": 160000
  }
}
```

#### Error Responses

**401 Unauthorized**
```json
{
  "error": "Authentication required"
}
```

**403 Forbidden** - Not owner
```json
{
  "error": "Forbidden. You can only update your own jobs."
}
```

**404 Not Found**
```json
{
  "error": "Job not found"
}
```

---

### 5. Delete Job (Soft Delete)

**DELETE** `/api/jobs/[id]`

Soft delete a job by setting its status to `CLOSED`. Requires EMPLOYER or ADMIN role.

**Authentication Required**: Yes (EMPLOYER or ADMIN)

**Ownership**: Employers can only delete their own jobs (unless ADMIN).

**Note**: Cannot delete jobs with active applications. Close them instead.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job ID |

#### Example Request

```bash
curl -X DELETE "http://localhost:3000/api/jobs/clx123..." \
  -H "Cookie: next-auth.session-token=..."
```

#### Response (200 OK)

```json
{
  "message": "Job closed successfully",
  "job": {
    "id": "clx...",
    "title": "Senior Developer",
    "status": "CLOSED"
  }
}
```

#### Error Responses

**400 Bad Request** - Active applications exist
```json
{
  "error": "Cannot delete job with active applications. Please close it instead.",
  "activeApplications": 15
}
```

**401 Unauthorized**
```json
{
  "error": "Authentication required"
}
```

**403 Forbidden**
```json
{
  "error": "Forbidden. You can only delete your own jobs."
}
```

**404 Not Found**
```json
{
  "error": "Job not found"
}
```

---

### 6. Claim Job

**POST** `/api/jobs/[id]/claim`

Employer claims an aggregated job posting from external sources.

**Authentication Required**: Yes (EMPLOYER only)

This endpoint allows verified employers to claim job postings that were aggregated from external sources (job boards, company websites, etc.) and associate them with their employer profile.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Job ID to claim |

#### Request Body

```json
{
  "verificationCode": "ABC123XYZ"
}
```

#### Required Fields

- `verificationCode` (string) - Verification code for claiming (contact support to obtain)

#### Example Request

```bash
curl -X POST "http://localhost:3000/api/jobs/clx123.../claim" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "verificationCode": "ABC123XYZ"
  }'
```

#### Response (200 OK)

```json
{
  "message": "Job claimed successfully. Please review and publish when ready.",
  "job": {
    "id": "clx...",
    "title": "Senior Developer",
    "status": "DRAFT",
    "employer": {
      "id": "clx...",
      "companyName": "Your Company",
      "companyLogo": "https://...",
      "verified": true
    }
  },
  "notice": "The job status has been set to DRAFT. You can update it and set to ACTIVE when ready."
}
```

#### Error Responses

**400 Bad Request** - Missing verification code
```json
{
  "error": "Verification code required",
  "message": "Please provide a verification code to claim this job. Contact support if you need assistance."
}
```

**400 Bad Request** - Already claimed
```json
{
  "error": "Job is already claimed",
  "claimedBy": "Tech Corp"
}
```

**401 Unauthorized**
```json
{
  "error": "Authentication required"
}
```

**403 Forbidden**
```json
{
  "error": "Insufficient permissions. Employer role required."
}
```

**404 Not Found** - Job not found
```json
{
  "error": "Job not found"
}
```

**404 Not Found** - Employer profile missing
```json
{
  "error": "Employer profile not found. Please complete your profile first."
}
```

---

## Common Response Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Authentication required |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

---

## Data Models

### Job Object

```typescript
{
  id: string;                    // Unique identifier
  employerId: string;            // Employer who posted the job
  title: string;                 // Job title
  description: string;           // Full job description
  requirements: string;          // Job requirements
  responsibilities: string;      // Job responsibilities
  type: JobType;                 // FULL_TIME, PART_TIME, etc.
  status: JobStatus;             // DRAFT, ACTIVE, CLOSED, EXPIRED
  location: string;              // Job location
  remote: boolean;               // Is remote work allowed
  salaryMin?: number;            // Minimum salary
  salaryMax?: number;            // Maximum salary
  experienceLevel: ExperienceLevel; // ENTRY_LEVEL, MID_LEVEL, etc.
  skills: string[];              // Required skills
  benefits?: string;             // Benefits offered
  deadline?: Date;               // Application deadline
  slots: number;                 // Number of positions
  views: number;                 // View count
  createdAt: Date;              // Creation timestamp
  updatedAt: Date;              // Last update timestamp
}
```

---

## Usage Examples

### Complete Workflow

```bash
# 1. Employer registers and logs in
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"employer@company.com","password":"SecurePass123","name":"Company HR","role":"EMPLOYER"}'

# 2. Create a job (starts as DRAFT)
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"title":"Developer","description":"...","requirements":"...","responsibilities":"...","type":"FULL_TIME","location":"NYC","experienceLevel":"MID_LEVEL"}'

# 3. Update job to make it active
curl -X PATCH http://localhost:3000/api/jobs/JOB_ID \
  -H "Content-Type: application/json" \
  -d '{"status":"ACTIVE"}'

# 4. Candidates can now see and apply to the job
curl http://localhost:3000/api/jobs

# 5. Later, close the job
curl -X DELETE http://localhost:3000/api/jobs/JOB_ID
```

---

## Security & Best Practices

1. **Authentication**: Always include session cookies for protected routes
2. **Ownership**: Employers can only modify their own jobs (unless ADMIN)
3. **Validation**: All inputs are validated before processing
4. **Soft Delete**: Jobs are closed, not deleted, to maintain data integrity
5. **Status Flow**: DRAFT → ACTIVE → CLOSED (recommended workflow)

---

## Testing

See the test examples in the [README.md](README.md) for complete testing instructions.
