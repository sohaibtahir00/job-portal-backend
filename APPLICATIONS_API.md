# Applications API Documentation

Complete API documentation for job application management endpoints.

## Overview

The Applications API provides complete application lifecycle management including submission, status tracking, employer notes, and role-based access control.

## Base URL

```
http://localhost:3000/api/applications
```

## Authentication

All routes require authentication.

**Access Control:**
- **CANDIDATE**: Can submit applications and view their own applications
- **EMPLOYER**: Can view and manage applications for their jobs
- **ADMIN**: Full access to all applications

---

## Endpoints

### 1. Submit Application

**POST** `/api/applications`

Submit a job application. Automatically prevents duplicate applications.

**Authentication Required**: Yes (CANDIDATE or ADMIN)

#### Request Body

```json
{
  "jobId": "clx123...",
  "coverLetter": "I am excited to apply for this position..."
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `jobId` | string | Yes | ID of the job to apply for |
| `coverLetter` | string | No | Cover letter text |

#### Example Request

```bash
curl -X POST "http://localhost:3000/api/applications" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "jobId": "clx123...",
    "coverLetter": "I am very interested in this position and believe my 5 years of experience in React and Node.js make me a strong candidate..."
  }'
```

#### Response (201 Created)

```json
{
  "message": "Application submitted successfully",
  "application": {
    "id": "clx...",
    "jobId": "clx123...",
    "candidateId": "clx456...",
    "coverLetter": "I am very interested...",
    "status": "PENDING",
    "appliedAt": "2024-01-16T00:00:00.000Z",
    "reviewedAt": null,
    "notes": null,
    "createdAt": "2024-01-16T00:00:00.000Z",
    "updatedAt": "2024-01-16T00:00:00.000Z",
    "job": {
      "id": "clx123...",
      "title": "Senior Full Stack Developer",
      "type": "FULL_TIME",
      "location": "San Francisco, CA",
      "employer": {
        "companyName": "Tech Corp",
        "companyLogo": "https://..."
      }
    },
    "candidate": {
      "id": "clx456...",
      "user": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  }
}
```

#### Validation Checks

The API performs several validation checks:

1. **Candidate Profile**: Must exist
2. **Job Exists**: Job must exist in database
3. **Job Status**: Job must be ACTIVE
4. **Deadline**: Application deadline must not have passed
5. **Duplicate**: Candidate cannot apply to same job twice

#### Error Responses

**404 Not Found** - Candidate profile not found
```json
{
  "error": "Candidate profile not found. Please complete your profile first."
}
```

**404 Not Found** - Job not found
```json
{
  "error": "Job not found"
}
```

**400 Bad Request** - Job not accepting applications
```json
{
  "error": "This job is not accepting applications",
  "jobStatus": "CLOSED"
}
```

**400 Bad Request** - Deadline passed
```json
{
  "error": "Application deadline has passed",
  "deadline": "2024-01-15T23:59:59.000Z"
}
```

**409 Conflict** - Duplicate application
```json
{
  "error": "You have already applied to this job",
  "applicationId": "clx789...",
  "appliedAt": "2024-01-10T00:00:00.000Z",
  "status": "PENDING"
}
```

---

### 2. List Applications

**GET** `/api/applications`

Get all applications for the current user. Results vary by role.

**Authentication Required**: Yes (CANDIDATE, EMPLOYER, or ADMIN)

#### Query Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 10) |
| `status` | ApplicationStatus | Filter by status |
| `jobId` | string | Filter by job ID |

#### Application Statuses

- `PENDING` - Submitted, awaiting review
- `REVIEWED` - Employer has reviewed
- `SHORTLISTED` - Candidate shortlisted
- `INTERVIEW_SCHEDULED` - Interview scheduled
- `INTERVIEWED` - Interview completed
- `OFFERED` - Job offer extended
- `REJECTED` - Application rejected
- `WITHDRAWN` - Candidate withdrew
- `ACCEPTED` - Offer accepted

#### Role-Based Filtering

- **CANDIDATE**: Returns their own applications
- **EMPLOYER**: Returns applications for their jobs
- **ADMIN**: Returns all applications

#### Example Requests

```bash
# Get all your applications (as candidate)
curl "http://localhost:3000/api/applications" \
  -H "Cookie: next-auth.session-token=..."

# Filter by status
curl "http://localhost:3000/api/applications?status=PENDING" \
  -H "Cookie: next-auth.session-token=..."

# Get applications for specific job (as employer)
curl "http://localhost:3000/api/applications?jobId=clx123..." \
  -H "Cookie: next-auth.session-token=..."

# Pagination
curl "http://localhost:3000/api/applications?page=2&limit=20" \
  -H "Cookie: next-auth.session-token=..."
```

#### Response (200 OK)

```json
{
  "applications": [
    {
      "id": "clx...",
      "jobId": "clx123...",
      "candidateId": "clx456...",
      "coverLetter": "I am interested...",
      "status": "PENDING",
      "appliedAt": "2024-01-16T00:00:00.000Z",
      "reviewedAt": null,
      "notes": null,
      "job": {
        "id": "clx123...",
        "title": "Senior Developer",
        "type": "FULL_TIME",
        "location": "San Francisco, CA",
        "status": "ACTIVE",
        "employer": {
          "id": "clx...",
          "companyName": "Tech Corp",
          "companyLogo": "https://..."
        }
      },
      "candidate": {
        "id": "clx456...",
        "experience": 5,
        "location": "San Francisco, CA",
        "skills": ["JavaScript", "React", "Node.js"],
        "user": {
          "name": "John Doe",
          "email": "john@example.com",
          "image": "https://..."
        }
      },
      "testResults": []
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 10,
    "totalCount": 15,
    "totalPages": 2,
    "hasNext": true,
    "hasPrev": false
  }
}
```

---

### 3. Get Single Application

**GET** `/api/applications/[id]`

Get detailed information about a specific application.

**Authentication Required**: Yes

**Access Control:**
- Candidates can view their own applications
- Employers can view applications for their jobs
- Admins can view all applications

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Application ID |

#### Example Request

```bash
curl "http://localhost:3000/api/applications/clx123..." \
  -H "Cookie: next-auth.session-token=..."
```

#### Response (200 OK)

```json
{
  "application": {
    "id": "clx...",
    "jobId": "clx123...",
    "candidateId": "clx456...",
    "coverLetter": "I am very interested in this position...",
    "status": "REVIEWED",
    "appliedAt": "2024-01-16T00:00:00.000Z",
    "reviewedAt": "2024-01-17T00:00:00.000Z",
    "notes": "Strong technical background. Schedule for interview.",
    "createdAt": "2024-01-16T00:00:00.000Z",
    "updatedAt": "2024-01-17T00:00:00.000Z",
    "job": {
      "id": "clx123...",
      "title": "Senior Full Stack Developer",
      "description": "We are seeking...",
      "type": "FULL_TIME",
      "location": "San Francisco, CA",
      "employer": {
        "id": "clx...",
        "userId": "clx...",
        "companyName": "Tech Corp",
        "companyLogo": "https://...",
        "companyWebsite": "https://techcorp.com",
        "companySize": "100-500",
        "industry": "Technology",
        "location": "San Francisco, CA",
        "verified": true
      }
    },
    "candidate": {
      "id": "clx456...",
      "phone": "+1234567890",
      "resume": "/uploads/resumes/resume.pdf",
      "portfolio": "https://johndoe.com",
      "linkedIn": "https://linkedin.com/in/johndoe",
      "github": "https://github.com/johndoe",
      "bio": "Experienced developer...",
      "skills": ["JavaScript", "React", "Node.js"],
      "experience": 5,
      "education": "BS Computer Science, MIT",
      "location": "San Francisco, CA",
      "user": {
        "id": "clx...",
        "name": "John Doe",
        "email": "john@example.com",
        "image": "https://..."
      }
    },
    "testResults": [
      {
        "id": "clx...",
        "testName": "JavaScript Assessment",
        "score": 85,
        "maxScore": 100,
        "status": "COMPLETED",
        "completedAt": "2024-01-16T12:00:00.000Z"
      }
    ]
  }
}
```

#### Error Responses

**403 Forbidden** - No access to this application
```json
{
  "error": "Forbidden. You can only view your own applications."
}
```

**404 Not Found**
```json
{
  "error": "Application not found"
}
```

---

### 4. Withdraw Application

**DELETE** `/api/applications/[id]`

Withdraw an application (sets status to WITHDRAWN).

**Authentication Required**: Yes (CANDIDATE or ADMIN)

**Note**: Cannot withdraw if already ACCEPTED, REJECTED, or WITHDRAWN.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Application ID |

#### Example Request

```bash
curl -X DELETE "http://localhost:3000/api/applications/clx123..." \
  -H "Cookie: next-auth.session-token=..."
```

#### Response (200 OK)

```json
{
  "message": "Application withdrawn successfully",
  "application": {
    "id": "clx...",
    "status": "WITHDRAWN",
    "updatedAt": "2024-01-17T00:00:00.000Z"
  }
}
```

#### Error Responses

**400 Bad Request** - Cannot withdraw
```json
{
  "error": "Cannot withdraw application with status: ACCEPTED",
  "status": "ACCEPTED"
}
```

**403 Forbidden**
```json
{
  "error": "Forbidden. You can only withdraw your own applications."
}
```

---

### 5. Update Application Status

**PATCH** `/api/applications/[id]/status`

Update the status of an application. Enforces valid status transitions.

**Authentication Required**: Yes (EMPLOYER or ADMIN)

**Access Control:**
- Employers can only update applications for their jobs
- Admins can update any application

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Application ID |

#### Request Body

```json
{
  "status": "SHORTLISTED"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `status` | ApplicationStatus | Yes | New status |

#### Valid Status Transitions

| From | Allowed To |
|------|-----------|
| PENDING | REVIEWED, SHORTLISTED, REJECTED |
| REVIEWED | SHORTLISTED, REJECTED |
| SHORTLISTED | INTERVIEW_SCHEDULED, REJECTED |
| INTERVIEW_SCHEDULED | INTERVIEWED, REJECTED |
| INTERVIEWED | OFFERED, REJECTED |
| OFFERED | ACCEPTED, REJECTED |
| REJECTED | *(none - final state)* |
| WITHDRAWN | *(none - final state)* |
| ACCEPTED | *(none - final state)* |

#### Example Request

```bash
curl -X PATCH "http://localhost:3000/api/applications/clx123.../status" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{"status": "SHORTLISTED"}'
```

#### Response (200 OK)

```json
{
  "message": "Application status updated to SHORTLISTED",
  "application": {
    "id": "clx...",
    "status": "SHORTLISTED",
    "reviewedAt": "2024-01-17T00:00:00.000Z",
    "updatedAt": "2024-01-17T00:00:00.000Z",
    "job": {
      "id": "clx123...",
      "title": "Senior Developer"
    },
    "candidate": {
      "id": "clx456...",
      "user": {
        "name": "John Doe",
        "email": "john@example.com"
      }
    }
  }
}
```

#### Error Responses

**400 Bad Request** - Invalid transition
```json
{
  "error": "Cannot transition from PENDING to OFFERED",
  "currentStatus": "PENDING",
  "allowedTransitions": ["REVIEWED", "SHORTLISTED", "REJECTED"]
}
```

**403 Forbidden**
```json
{
  "error": "Forbidden. You can only update applications for your jobs."
}
```

---

### 6. Add/Update Notes

**POST** `/api/applications/[id]/notes`

Add or update employer notes for an application.

**Authentication Required**: Yes (EMPLOYER or ADMIN)

**Access Control:**
- Employers can only add notes to applications for their jobs
- Admins can add notes to any application

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Application ID |

#### Request Body

```json
{
  "notes": "Strong technical skills. Good cultural fit. Schedule technical interview with senior team."
}
```

| Field | Type | Required | Max Length | Description |
|-------|------|----------|------------|-------------|
| `notes` | string | Yes | 5000 chars | Employer notes |

#### Example Request

```bash
curl -X POST "http://localhost:3000/api/applications/clx123.../notes" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "notes": "Excellent candidate. Strong React and Node.js experience. Schedule interview ASAP."
  }'
```

#### Response (200 OK)

```json
{
  "message": "Notes added successfully",
  "application": {
    "id": "clx...",
    "notes": "Excellent candidate. Strong React and Node.js experience...",
    "updatedAt": "2024-01-17T00:00:00.000Z",
    "job": {
      "id": "clx123...",
      "title": "Senior Developer"
    },
    "candidate": {
      "id": "clx456...",
      "user": {
        "name": "John Doe"
      }
    }
  }
}
```

#### Error Responses

**400 Bad Request** - Invalid notes
```json
{
  "error": "Notes are required and must be a non-empty string"
}
```

**400 Bad Request** - Notes too long
```json
{
  "error": "Notes are too long. Maximum 5000 characters.",
  "length": 6234
}
```

---

### 7. Get Notes

**GET** `/api/applications/[id]/notes`

Get employer notes for an application.

**Authentication Required**: Yes (EMPLOYER or ADMIN)

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Application ID |

#### Example Request

```bash
curl "http://localhost:3000/api/applications/clx123.../notes" \
  -H "Cookie: next-auth.session-token=..."
```

#### Response (200 OK)

```json
{
  "applicationId": "clx...",
  "notes": "Excellent candidate. Strong technical background.",
  "updatedAt": "2024-01-17T00:00:00.000Z"
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
| 409 | Conflict - Duplicate application |
| 500 | Internal Server Error |

---

## Complete Workflow Example

### Candidate Workflow

```bash
# 1. Candidate views available jobs
curl "http://localhost:3000/api/jobs?status=ACTIVE"

# 2. Candidate applies to a job
curl -X POST http://localhost:3000/api/applications \
  -H "Content-Type: application/json" \
  -d '{"jobId":"clx123...","coverLetter":"I am interested..."}'

# 3. Candidate checks their applications
curl "http://localhost:3000/api/applications"

# 4. Candidate views specific application
curl "http://localhost:3000/api/applications/clx456..."

# 5. Candidate withdraws (if needed)
curl -X DELETE "http://localhost:3000/api/applications/clx456..."
```

### Employer Workflow

```bash
# 1. Employer views all applications for their jobs
curl "http://localhost:3000/api/applications"

# 2. Filter by specific job
curl "http://localhost:3000/api/applications?jobId=clx123..."

# 3. View application details
curl "http://localhost:3000/api/applications/clx456..."

# 4. Update status to shortlist
curl -X PATCH "http://localhost:3000/api/applications/clx456.../status" \
  -H "Content-Type: application/json" \
  -d '{"status":"SHORTLISTED"}'

# 5. Add notes
curl -X POST "http://localhost:3000/api/applications/clx456.../notes" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Strong candidate. Schedule interview."}'

# 6. Schedule interview
curl -X PATCH "http://localhost:3000/api/applications/clx456.../status" \
  -H "Content-Type: application/json" \
  -d '{"status":"INTERVIEW_SCHEDULED"}'

# 7. After interview - make offer
curl -X PATCH "http://localhost:3000/api/applications/clx456.../status" \
  -H "Content-Type: application/json" \
  -d '{"status":"OFFERED"}'
```

---

## Security & Best Practices

1. **Duplicate Prevention**: Unique constraint prevents duplicate applications
2. **Role-Based Access**: Strict separation between candidate/employer/admin views
3. **Status Transitions**: Enforced workflow prevents invalid state changes
4. **Ownership Validation**: Users can only access their own data (unless admin)
5. **Job Validation**: Jobs must be active and within deadline

---

## Future Enhancements

- Email notifications on status changes
- Application analytics and metrics
- Bulk status updates for employers
- Application scoring/ranking system
- Interview scheduling integration
- Communication thread between employer and candidate

---

## Testing

See test examples in the main documentation for complete testing instructions.
