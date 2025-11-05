# Job Portal Backend API Documentation

Comprehensive API documentation for the Job Portal platform.

**Base URL**: `http://localhost:3000/api` (development)
**Production URL**: `https://your-domain.com/api`

**Version**: 1.0.0
**Last Updated**: 2024

---

## Table of Contents

1. [Authentication](#authentication)
2. [Health Check](#health-check)
3. [Auth Endpoints](#auth-endpoints)
4. [Job Endpoints](#job-endpoints)
5. [Application Endpoints](#application-endpoints)
6. [Candidate Endpoints](#candidate-endpoints)
7. [Employer Endpoints](#employer-endpoints)
8. [Placement Endpoints](#placement-endpoints)
9. [Payment Endpoints](#payment-endpoints)
10. [Message Endpoints](#message-endpoints)
11. [Dashboard Endpoints](#dashboard-endpoints)
12. [Search Endpoints](#search-endpoints)
13. [Upload Endpoints](#upload-endpoints)
14. [Referral Endpoints](#referral-endpoints)
15. [Test Endpoints](#test-endpoints)
16. [Admin Endpoints](#admin-endpoints)
17. [Cron Endpoints](#cron-endpoints)
18. [Error Responses](#error-responses)

---

## Authentication

The API uses session-based authentication with NextAuth.js.

### Authentication Methods

1. **Session Cookie** (Primary)
   - Automatically set after login
   - Sent with every request
   - HttpOnly, Secure, SameSite

2. **Cron Secret** (Cron endpoints only)
   - Header: `Authorization: Bearer YOUR_CRON_SECRET`
   - Header: `x-cron-secret: YOUR_CRON_SECRET`
   - Query: `?secret=YOUR_CRON_SECRET`

### User Roles

- `ADMIN` - Platform administrator
- `EMPLOYER` - Company/recruiter
- `CANDIDATE` - Job seeker

### Protected Endpoints

Most endpoints require authentication. Protected endpoints return `401 Unauthorized` if not authenticated.

---

## Health Check

### Check API Health

```http
GET /api/health
```

**Authentication**: None

**Description**: Check the health status of the API and its dependencies.

**Response 200** (Healthy):
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "uptime": 3600,
  "version": "1.0.0",
  "environment": "production",
  "checks": {
    "database": {
      "status": "ok",
      "latency": 15
    },
    "environment": {
      "status": "ok"
    },
    "email": {
      "status": "ok"
    },
    "stripe": {
      "status": "ok"
    }
  },
  "responseTime": 20
}
```

**Response 503** (Degraded/Unhealthy):
```json
{
  "status": "degraded",
  "timestamp": "2024-01-15T12:00:00.000Z",
  "checks": {
    "database": {
      "status": "error",
      "message": "Connection timeout"
    }
  }
}
```

**cURL Example**:
```bash
curl http://localhost:3000/api/health
```

---

## Auth Endpoints

### Register User

```http
POST /api/auth/signup
```

**Authentication**: None
**Rate Limit**: 5 requests per 15 minutes

**Request Body**:
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePass123",
  "role": "CANDIDATE",
  // Candidate-specific fields
  "phone": "+1234567890",
  "location": "New York, NY",
  "niche": "Software Development",
  // Employer-specific fields
  "companyName": "Tech Corp",
  "companyWebsite": "https://techcorp.com",
  "industry": "Technology",
  "companySize": "50-100",
  // Optional
  "referralCode": "REF12345678"
}
```

**Response 201**:
```json
{
  "success": true,
  "message": "Account created successfully",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "CANDIDATE"
  }
}
```

**Validation Rules**:
- `name`: 2-100 characters
- `email`: Valid email format
- `password`: Min 8 chars, 1 uppercase, 1 lowercase, 1 number
- `role`: CANDIDATE, EMPLOYER, or ADMIN

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePass123",
    "role": "CANDIDATE",
    "phone": "+1234567890",
    "location": "New York, NY"
  }'
```

---

### Login

```http
POST /api/auth/signin
```

**Authentication**: None
**Rate Limit**: 5 requests per 15 minutes

**Request Body**:
```json
{
  "email": "john@example.com",
  "password": "SecurePass123"
}
```

**Response 200**:
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "CANDIDATE"
  }
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "SecurePass123"
  }' \
  -c cookies.txt
```

---

### Get Current User

```http
GET /api/auth/me
```

**Authentication**: Required

**Response 200**:
```json
{
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "CANDIDATE",
    "emailVerified": "2024-01-15T12:00:00.000Z",
    "candidate": {
      "id": "uuid",
      "phone": "+1234567890",
      "location": "New York, NY",
      "testScore": 85,
      "testTier": "ADVANCED"
    }
  }
}
```

**cURL Example**:
```bash
curl http://localhost:3000/api/auth/me \
  -b cookies.txt
```

---

## Job Endpoints

### List Jobs

```http
GET /api/jobs
```

**Authentication**: None
**Rate Limit**: 30 requests per minute

**Query Parameters**:
- `page` (number): Page number (default: 1)
- `limit` (number): Items per page (default: 20, max: 100)
- `status` (JobStatus): Filter by status (DRAFT, ACTIVE, EXPIRED, CLOSED)
- `type` (JobType): Filter by type (FULL_TIME, PART_TIME, CONTRACT, INTERNSHIP)
- `location` (string): Filter by location

**Response 200**:
```json
{
  "success": true,
  "jobs": [
    {
      "id": "uuid",
      "title": "Senior Software Engineer",
      "description": "We are looking for...",
      "type": "FULL_TIME",
      "location": "New York, NY",
      "remoteType": "HYBRID",
      "experienceLevel": "SENIOR",
      "salaryMin": 120000,
      "salaryMax": 180000,
      "skills": ["React", "Node.js", "TypeScript"],
      "status": "ACTIVE",
      "createdAt": "2024-01-15T12:00:00.000Z",
      "deadline": "2024-02-15T12:00:00.000Z",
      "employer": {
        "id": "uuid",
        "companyName": "Tech Corp",
        "companyLogo": "https://...",
        "user": {
          "name": "Jane Smith"
        }
      },
      "_count": {
        "applications": 25
      }
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "totalPages": 5,
    "hasMore": true
  }
}
```

**cURL Example**:
```bash
curl "http://localhost:3000/api/jobs?page=1&limit=20&type=FULL_TIME"
```

---

### Get Job Details

```http
GET /api/jobs/[id]
```

**Authentication**: None

**Response 200**:
```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "title": "Senior Software Engineer",
    "description": "We are looking for...",
    "requirements": "- 5+ years experience\n- Strong TypeScript skills",
    "responsibilities": "- Lead development team\n- Code reviews",
    "type": "FULL_TIME",
    "location": "New York, NY",
    "remoteType": "HYBRID",
    "experienceLevel": "SENIOR",
    "salaryMin": 120000,
    "salaryMax": 180000,
    "skills": ["React", "Node.js", "TypeScript"],
    "benefits": "Health insurance, 401k, etc.",
    "status": "ACTIVE",
    "createdAt": "2024-01-15T12:00:00.000Z",
    "deadline": "2024-02-15T12:00:00.000Z",
    "employer": {
      "id": "uuid",
      "companyName": "Tech Corp",
      "companyDescription": "Leading tech company...",
      "companyWebsite": "https://techcorp.com",
      "companyLogo": "https://...",
      "industry": "Technology",
      "companySize": "50-100"
    }
  }
}
```

**cURL Example**:
```bash
curl http://localhost:3000/api/jobs/550e8400-e29b-41d4-a716-446655440000
```

---

### Create Job

```http
POST /api/jobs
```

**Authentication**: Required (EMPLOYER)
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "title": "Senior Software Engineer",
  "description": "We are looking for an experienced software engineer...",
  "requirements": "- 5+ years experience\n- Strong TypeScript skills",
  "responsibilities": "- Lead development team\n- Code reviews",
  "type": "FULL_TIME",
  "location": "New York, NY",
  "remoteType": "HYBRID",
  "experienceLevel": "SENIOR",
  "salaryMin": 120000,
  "salaryMax": 180000,
  "skills": ["React", "Node.js", "TypeScript"],
  "benefits": "Health insurance, 401k, stock options",
  "deadline": "2024-02-15T12:00:00.000Z"
}
```

**Response 201**:
```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "title": "Senior Software Engineer",
    "status": "DRAFT",
    "createdAt": "2024-01-15T12:00:00.000Z"
  }
}
```

**Validation Rules**:
- `title`: 3-200 characters
- `description`: Min 50 characters
- `requirements`: Min 20 characters
- `responsibilities`: Min 20 characters
- `skills`: 1-20 items
- `salaryMin` < `salaryMax` (if both provided)

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "Senior Software Engineer",
    "description": "We are looking for an experienced software engineer to join our team...",
    "requirements": "5+ years experience, Strong TypeScript and React skills",
    "responsibilities": "Lead development team, Code reviews, Architecture decisions",
    "type": "FULL_TIME",
    "location": "New York, NY",
    "remoteType": "HYBRID",
    "experienceLevel": "SENIOR",
    "salaryMin": 120000,
    "salaryMax": 180000,
    "skills": ["React", "Node.js", "TypeScript"]
  }'
```

---

### Update Job

```http
PATCH /api/jobs/[id]
```

**Authentication**: Required (Job owner or ADMIN)

**Request Body**: Same as Create Job (all fields optional)

**Response 200**:
```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "title": "Senior Software Engineer",
    "updatedAt": "2024-01-15T12:30:00.000Z"
  }
}
```

**cURL Example**:
```bash
curl -X PATCH http://localhost:3000/api/jobs/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "salaryMin": 130000,
    "salaryMax": 190000
  }'
```

---

### Delete Job

```http
DELETE /api/jobs/[id]
```

**Authentication**: Required (Job owner or ADMIN)

**Response 200**:
```json
{
  "success": true,
  "message": "Job deleted successfully"
}
```

**cURL Example**:
```bash
curl -X DELETE http://localhost:3000/api/jobs/550e8400-e29b-41d4-a716-446655440000 \
  -b cookies.txt
```

---

### Publish Job

```http
POST /api/jobs/[id]/publish
```

**Authentication**: Required (Job owner)

**Description**: Change job status from DRAFT to PENDING_APPROVAL (requires admin approval) or ACTIVE.

**Response 200**:
```json
{
  "success": true,
  "job": {
    "id": "uuid",
    "status": "PENDING_APPROVAL",
    "updatedAt": "2024-01-15T12:00:00.000Z"
  },
  "message": "Job submitted for approval"
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/jobs/550e8400-e29b-41d4-a716-446655440000/publish \
  -b cookies.txt
```

---

## Application Endpoints

### Submit Application

```http
POST /api/applications
```

**Authentication**: Required (CANDIDATE)
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "jobId": "uuid",
  "coverLetter": "I am very interested in this position because...",
  "expectedSalary": 150000,
  "availableFrom": "2024-03-01T00:00:00.000Z"
}
```

**Response 201**:
```json
{
  "success": true,
  "application": {
    "id": "uuid",
    "status": "PENDING",
    "createdAt": "2024-01-15T12:00:00.000Z"
  }
}
```

**Validation Rules**:
- `coverLetter`: 50-2000 characters
- Cannot apply to same job twice
- Cannot apply if already hired for this job

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/applications \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "jobId": "550e8400-e29b-41d4-a716-446655440000",
    "coverLetter": "I am very interested in this position because of my 7 years of experience in React and Node.js development...",
    "expectedSalary": 150000
  }'
```

---

### List My Applications

```http
GET /api/applications
```

**Authentication**: Required (CANDIDATE)

**Query Parameters**:
- `status` (ApplicationStatus): Filter by status
- `page`, `limit`: Pagination

**Response 200**:
```json
{
  "success": true,
  "applications": [
    {
      "id": "uuid",
      "status": "PENDING",
      "coverLetter": "I am very interested...",
      "expectedSalary": 150000,
      "createdAt": "2024-01-15T12:00:00.000Z",
      "job": {
        "id": "uuid",
        "title": "Senior Software Engineer",
        "location": "New York, NY",
        "employer": {
          "companyName": "Tech Corp"
        }
      }
    }
  ],
  "pagination": { }
}
```

**cURL Example**:
```bash
curl "http://localhost:3000/api/applications?status=PENDING" \
  -b cookies.txt
```

---

### Update Application Status

```http
PATCH /api/applications/[id]/status
```

**Authentication**: Required (Employer or ADMIN)

**Request Body**:
```json
{
  "status": "INTERVIEW_SCHEDULED",
  "interviewDate": "2024-01-20T14:00:00.000Z",
  "interviewNotes": "Technical interview with engineering team"
}
```

**Response 200**:
```json
{
  "success": true,
  "application": {
    "id": "uuid",
    "status": "INTERVIEW_SCHEDULED",
    "updatedAt": "2024-01-15T12:00:00.000Z"
  }
}
```

**Application Statuses**:
- `PENDING` - Awaiting review
- `REVIEWED` - Reviewed by employer
- `INTERVIEW_SCHEDULED` - Interview scheduled
- `OFFERED` - Job offer made
- `ACCEPTED` - Offer accepted
- `REJECTED` - Application rejected
- `WITHDRAWN` - Withdrawn by candidate

**cURL Example**:
```bash
curl -X PATCH http://localhost:3000/api/applications/550e8400-e29b-41d4-a716-446655440000/status \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "status": "INTERVIEW_SCHEDULED",
    "interviewDate": "2024-01-20T14:00:00.000Z"
  }'
```

---

## Candidate Endpoints

### Get Candidate Profile

```http
GET /api/candidates/[id]
```

**Authentication**: Required (Self, Employer, or ADMIN)

**Response 200**:
```json
{
  "success": true,
  "candidate": {
    "id": "uuid",
    "user": {
      "id": "uuid",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "phone": "+1234567890",
    "location": "New York, NY",
    "bio": "Experienced software engineer...",
    "skills": ["React", "Node.js", "TypeScript"],
    "experience": 7,
    "education": "BS Computer Science",
    "linkedinUrl": "https://linkedin.com/in/johndoe",
    "githubUrl": "https://github.com/johndoe",
    "portfolioUrl": "https://johndoe.dev",
    "resume": "https://...",
    "testScore": 85,
    "testPercentile": 78,
    "testTier": "ADVANCED",
    "availability": "TWO_WEEKS",
    "expectedSalary": 150000
  }
}
```

**cURL Example**:
```bash
curl http://localhost:3000/api/candidates/550e8400-e29b-41d4-a716-446655440000 \
  -b cookies.txt
```

---

### Update Candidate Profile

```http
PATCH /api/candidates/[id]
```

**Authentication**: Required (Self or ADMIN)

**Request Body**:
```json
{
  "phone": "+1234567890",
  "location": "San Francisco, CA",
  "bio": "Experienced software engineer with focus on React and Node.js",
  "skills": ["React", "Node.js", "TypeScript", "PostgreSQL"],
  "experience": 7,
  "education": "BS Computer Science, MIT",
  "linkedinUrl": "https://linkedin.com/in/johndoe",
  "expectedSalary": 160000,
  "availability": "IMMEDIATE"
}
```

**Response 200**:
```json
{
  "success": true,
  "candidate": {
    "id": "uuid",
    "updatedAt": "2024-01-15T12:00:00.000Z"
  }
}
```

**cURL Example**:
```bash
curl -X PATCH http://localhost:3000/api/candidates/550e8400-e29b-41d4-a716-446655440000 \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "skills": ["React", "Node.js", "TypeScript", "PostgreSQL"],
    "expectedSalary": 160000
  }'
```

---

## Search Endpoints

### Advanced Job Search

```http
GET /api/jobs/search
```

**Authentication**: None
**Rate Limit**: 30 requests per minute

**Query Parameters**:
- `q` (string): Search query (title, description)
- `type` (JobType): FULL_TIME, PART_TIME, CONTRACT, INTERNSHIP
- `location` (string): Location filter
- `remote` (RemoteType): REMOTE, HYBRID, ONSITE
- `experienceLevel` (ExperienceLevel): ENTRY, JUNIOR, MID, SENIOR, LEAD
- `salaryMin`, `salaryMax` (number): Salary range
- `skills` (string): Comma-separated skills
- `companyName` (string): Company name filter
- `postedWithin` (number): Days since posted
- `sortBy` (string): newest, oldest, salary_high, salary_low, applicants_high, applicants_low, relevant
- `cursor` (string): Pagination cursor
- `limit` (number): Results per page (max 50)

**Response 200**:
```json
{
  "success": true,
  "jobs": [ ],
  "pagination": {
    "limit": 10,
    "nextCursor": "uuid",
    "hasMore": true
  },
  "filters": {
    "byType": {
      "FULL_TIME": 45,
      "PART_TIME": 12
    },
    "byExperience": {
      "SENIOR": 30,
      "MID": 25
    }
  }
}
```

**cURL Example**:
```bash
curl "http://localhost:3000/api/jobs/search?q=react&remote=REMOTE&salaryMin=100000&sortBy=salary_high&limit=10"
```

---

### Search Candidates

```http
GET /api/candidates/search
```

**Authentication**: Required (EMPLOYER or ADMIN)
**Rate Limit**: 100 requests per minute

**Query Parameters**:
- `q` (string): Search query
- `skills` (string): Comma-separated (ANY match)
- `skillsAll` (string): Comma-separated (ALL must match)
- `location` (string): Location filter
- `experienceMin`, `experienceMax` (number): Years of experience
- `testTier` (string): ELITE, ADVANCED, INTERMEDIATE, BASIC
- `testScoreMin`, `testScoreMax` (number): Test score range
- `testPercentileMin` (number): Minimum percentile
- `sortBy` (string): newest, score_high, experience_high, relevant

**Response 200**:
```json
{
  "success": true,
  "candidates": [
    {
      "id": "uuid",
      "user": {
        "name": "John Doe"
      },
      "skills": ["React", "Node.js", "TypeScript"],
      "experience": 7,
      "testScore": 85,
      "testTier": "ADVANCED",
      "skillMatchScore": 100,
      "matchingSkills": ["React", "Node.js"]
    }
  ],
  "pagination": { },
  "topSkills": [
    { "skill": "React", "count": 45 }
  ]
}
```

**cURL Example**:
```bash
curl "http://localhost:3000/api/candidates/search?skills=React,Node.js&testScoreMin=80&sortBy=score_high" \
  -b cookies.txt
```

---

## Dashboard Endpoints

### Candidate Dashboard

```http
GET /api/dashboard/candidate
```

**Authentication**: Required (CANDIDATE)

**Response 200**:
```json
{
  "success": true,
  "applications": {
    "total": 15,
    "byStatus": {
      "PENDING": 5,
      "REVIEWED": 3,
      "INTERVIEW_SCHEDULED": 2,
      "OFFERED": 1,
      "REJECTED": 4
    }
  },
  "profileCompleteness": {
    "percentage": 85,
    "missingFields": ["certifications"]
  },
  "testInfo": {
    "completed": true,
    "score": 85,
    "percentile": 78,
    "tier": "ADVANCED",
    "nextTier": {
      "name": "ELITE",
      "minScore": 90,
      "pointsNeeded": 5
    }
  },
  "recommendedJobs": [ ],
  "recentActivity": [ ]
}
```

**cURL Example**:
```bash
curl http://localhost:3000/api/dashboard/candidate \
  -b cookies.txt
```

---

### Employer Dashboard

```http
GET /api/dashboard/employer
```

**Authentication**: Required (EMPLOYER)

**Response 200**:
```json
{
  "success": true,
  "jobs": {
    "total": 10,
    "active": 7,
    "draft": 2,
    "expired": 1
  },
  "applications": {
    "total": 125,
    "pending": 45,
    "reviewed": 30
  },
  "placements": {
    "total": 5,
    "confirmed": 3,
    "pending": 2
  },
  "payments": {
    "totalRevenue": 50000,
    "pendingPayments": 15000
  }
}
```

**cURL Example**:
```bash
curl http://localhost:3000/api/dashboard/employer \
  -b cookies.txt
```

---

### Admin Dashboard

```http
GET /api/dashboard/admin
```

**Authentication**: Required (ADMIN)

**Response 200**:
```json
{
  "success": true,
  "users": {
    "total": 1500,
    "candidates": 1000,
    "employers": 500,
    "admins": 5,
    "growth": {
      "last30Days": 150,
      "growthRate": "11.11"
    }
  },
  "jobs": {
    "total": 450,
    "active": 250,
    "pendingApproval": 15
  },
  "revenue": {
    "total": 500000,
    "thisMonth": 50000,
    "lastMonth": 45000
  }
}
```

**cURL Example**:
```bash
curl http://localhost:3000/api/dashboard/admin \
  -b cookies.txt
```

---

## Upload Endpoints

### Upload Resume

```http
POST /api/upload/resume
```

**Authentication**: Required (CANDIDATE)
**Rate Limit**: 20 uploads per hour

**Request**: Multipart form data
- `file`: PDF, DOC, or DOCX (max 5MB)

**Response 200**:
```json
{
  "success": true,
  "url": "https://storage.example.com/resumes/123-abc.pdf",
  "filename": "123-abc.pdf",
  "size": 1024000
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/upload/resume \
  -b cookies.txt \
  -F "file=@/path/to/resume.pdf"
```

---

### Upload Company Logo

```http
POST /api/upload/logo
```

**Authentication**: Required (EMPLOYER)
**Rate Limit**: 20 uploads per hour

**Request**: Multipart form data
- `file`: PNG, JPG, JPEG, or WEBP (max 2MB)

**Response 200**:
```json
{
  "success": true,
  "url": "https://storage.example.com/logos/456-def.png",
  "filename": "456-def.png",
  "size": 512000
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/upload/logo \
  -b cookies.txt \
  -F "file=@/path/to/logo.png"
```

---

## Message Endpoints

### Send Message

```http
POST /api/messages
```

**Authentication**: Required
**Rate Limit**: 100 requests per minute

**Request Body**:
```json
{
  "receiverId": "uuid",
  "subject": "Question about the position",
  "content": "I would like to know more about...",
  "applicationId": "uuid"
}
```

**Response 201**:
```json
{
  "success": true,
  "message": {
    "id": "uuid",
    "subject": "Question about the position",
    "createdAt": "2024-01-15T12:00:00.000Z"
  }
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "receiverId": "550e8400-e29b-41d4-a716-446655440000",
    "subject": "Question about the position",
    "content": "I would like to know more about the remote work policy..."
  }'
```

---

### List Messages

```http
GET /api/messages
```

**Authentication**: Required

**Query Parameters**:
- `type`: inbox, sent
- `status`: UNREAD, READ
- `page`, `limit`: Pagination

**Response 200**:
```json
{
  "success": true,
  "messages": [
    {
      "id": "uuid",
      "subject": "Question about the position",
      "content": "I would like to know...",
      "status": "UNREAD",
      "createdAt": "2024-01-15T12:00:00.000Z",
      "sender": {
        "name": "John Doe"
      },
      "receiver": {
        "name": "Jane Smith"
      }
    }
  ],
  "pagination": { }
}
```

**cURL Example**:
```bash
curl "http://localhost:3000/api/messages?type=inbox&status=UNREAD" \
  -b cookies.txt
```

---

## Referral Endpoints

### Generate Referral Code

```http
POST /api/referrals/generate
```

**Authentication**: Required (CANDIDATE)

**Response 200**:
```json
{
  "success": true,
  "referralCode": "REF12345678",
  "referralUrl": "https://app.example.com/signup?ref=REF12345678",
  "stats": {
    "totalReferrals": 5,
    "successfulReferrals": 3,
    "pendingReferrals": 2
  },
  "earnings": {
    "total": 15000,
    "pending": 10000,
    "paid": 5000
  }
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/referrals/generate \
  -b cookies.txt
```

---

### Apply Referral Code

```http
POST /api/referrals/apply
```

**Authentication**: None (during signup)

**Request Body**:
```json
{
  "referralCode": "REF12345678"
}
```

**Response 200**:
```json
{
  "success": true,
  "message": "Referral code applied successfully",
  "referrer": {
    "name": "Jane Smith"
  }
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/referrals/apply \
  -H "Content-Type: application/json" \
  -d '{
    "referralCode": "REF12345678"
  }'
```

---

## Admin Endpoints

### List All Jobs (Admin)

```http
GET /api/admin/jobs
```

**Authentication**: Required (ADMIN)

**Query Parameters**:
- `status`: JobStatus filter
- `search`: Search query
- `employerId`: Filter by employer
- `sortBy`: newest, oldest, title, status
- `page`, `limit`: Pagination

**Response 200**:
```json
{
  "success": true,
  "jobs": [ ],
  "pagination": { },
  "stats": {
    "byStatus": {
      "ACTIVE": 100,
      "PENDING_APPROVAL": 15,
      "DRAFT": 30
    }
  }
}
```

**cURL Example**:
```bash
curl "http://localhost:3000/api/admin/jobs?status=PENDING_APPROVAL" \
  -b cookies.txt
```

---

### Approve/Reject Job

```http
PATCH /api/admin/jobs/[id]/approve
```

**Authentication**: Required (ADMIN)

**Request Body**:
```json
{
  "action": "approve",
  "reason": "Job description violates guidelines"
}
```

**Response 200**:
```json
{
  "success": true,
  "action": "approve",
  "job": {
    "id": "uuid",
    "status": "ACTIVE"
  },
  "message": "Job approved and is now active"
}
```

**cURL Example**:
```bash
curl -X PATCH http://localhost:3000/api/admin/jobs/550e8400-e29b-41d4-a716-446655440000/approve \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "action": "approve"
  }'
```

---

### Suspend User

```http
PATCH /api/admin/users/[id]/suspend
```

**Authentication**: Required (ADMIN)

**Request Body**:
```json
{
  "action": "suspend",
  "reason": "Multiple reports of inappropriate behavior"
}
```

**Response 200**:
```json
{
  "success": true,
  "action": "suspend",
  "user": {
    "id": "uuid",
    "suspendedAt": "2024-01-15T12:00:00.000Z",
    "isSuspended": true
  },
  "message": "User suspended successfully"
}
```

**cURL Example**:
```bash
curl -X PATCH http://localhost:3000/api/admin/users/550e8400-e29b-41d4-a716-446655440000/suspend \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "action": "suspend",
    "reason": "Violation of terms of service"
  }'
```

---

## Cron Endpoints

### Expire Jobs

```http
POST /api/cron/expire-jobs
```

**Authentication**: CRON_SECRET required
**Schedule**: Daily at 2 AM

**Headers**:
- `Authorization: Bearer CRON_SECRET`
- OR `x-cron-secret: CRON_SECRET`

**Response 200**:
```json
{
  "success": true,
  "job": "expire-jobs",
  "processed": 15,
  "expiredJobs": 15,
  "emailsSent": 15,
  "duration": "1.23s"
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/cron/expire-jobs \
  -H "Authorization: Bearer your-cron-secret"
```

---

### Payment Reminders

```http
POST /api/cron/payment-reminders
```

**Authentication**: CRON_SECRET required
**Schedule**: Daily at 9 AM

**Response 200**:
```json
{
  "success": true,
  "job": "payment-reminders",
  "processed": 10,
  "remindersSent": 10,
  "duration": "0.85s"
}
```

**cURL Example**:
```bash
curl -X POST http://localhost:3000/api/cron/payment-reminders \
  -H "x-cron-secret: your-cron-secret"
```

---

### Guarantee Checks

```http
POST /api/cron/guarantee-checks
```

**Authentication**: CRON_SECRET required
**Schedule**: Daily at 10 AM

**Response 200**:
```json
{
  "success": true,
  "job": "guarantee-checks",
  "processed": 8,
  "warningsSent": 5,
  "placementsCompleted": 3,
  "duration": "0.95s"
}
```

**cURL Example**:
```bash
curl -X POST "http://localhost:3000/api/cron/guarantee-checks?secret=your-cron-secret"
```

---

## Error Responses

All errors follow a consistent format:

### Validation Error (400)

```json
{
  "error": "Validation failed",
  "details": {
    "fields": {
      "email": ["Invalid email address"],
      "password": ["Password must be at least 8 characters"]
    }
  }
}
```

### Authentication Error (401)

```json
{
  "error": "Authentication required",
  "details": {
    "message": "You must be logged in to access this resource"
  }
}
```

### Authorization Error (403)

```json
{
  "error": "Insufficient permissions",
  "details": {
    "required": ["ADMIN"],
    "current": "CANDIDATE"
  }
}
```

### Not Found Error (404)

```json
{
  "error": "Job not found",
  "details": {
    "id": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Conflict Error (409)

```json
{
  "error": "A record with this email already exists",
  "details": {
    "field": "email"
  }
}
```

### Rate Limit Error (429)

```json
{
  "error": "Too many requests. Please try again later.",
  "details": {
    "limit": 30,
    "windowMs": 60000,
    "retryAfter": 45,
    "resetTime": "2024-01-15T12:01:00.000Z"
  }
}
```

### Internal Server Error (500)

```json
{
  "error": "An unexpected error occurred"
}
```

---

## Rate Limits

| Endpoint Type | Limit | Window |
|--------------|-------|--------|
| Auth (login/signup) | 5 requests | 15 minutes |
| Public API | 30 requests | 1 minute |
| Authenticated API | 100 requests | 1 minute |
| File Uploads | 20 uploads | 1 hour |
| Email Sending | 5 emails | 1 hour |

Rate limit information is included in response headers:

```http
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 2024-01-15T12:01:00.000Z
```

---

## Enums Reference

### UserRole
- `ADMIN`
- `EMPLOYER`
- `CANDIDATE`

### JobType
- `FULL_TIME`
- `PART_TIME`
- `CONTRACT`
- `INTERNSHIP`

### RemoteType
- `REMOTE`
- `HYBRID`
- `ONSITE`

### ExperienceLevel
- `ENTRY`
- `JUNIOR`
- `MID`
- `SENIOR`
- `LEAD`

### JobStatus
- `DRAFT`
- `PENDING_APPROVAL`
- `ACTIVE`
- `EXPIRED`
- `CLOSED`

### ApplicationStatus
- `PENDING`
- `REVIEWED`
- `INTERVIEW_SCHEDULED`
- `OFFERED`
- `ACCEPTED`
- `REJECTED`
- `WITHDRAWN`

### PaymentStatus
- `PENDING`
- `UPFRONT_PAID`
- `FULLY_PAID`
- `REFUNDED`

### PlacementStatus
- `PENDING`
- `CONFIRMED`
- `COMPLETED`
- `CANCELLED`

---

## Additional Resources

- [Error Handling Documentation](ERROR_HANDLING.md)
- [Upload System Documentation](UPLOAD_SYSTEM.md)
- [Testing Guide](TESTING.md)
- [Postman Collection](postman_collection.json)

---

**Last Updated**: 2024
**API Version**: 1.0.0
**Support**: support@example.com
