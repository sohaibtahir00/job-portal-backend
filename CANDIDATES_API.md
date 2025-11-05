# Candidates API Documentation

Complete API documentation for candidate profile management endpoints.

## Overview

The Candidates API provides complete profile management for job seekers including profile creation, updates, resume uploads, and profile completion tracking.

## Base URL

```
http://localhost:3000/api/candidates
```

## Authentication

- **Public Routes**: GET /api/candidates/[id]
- **Protected Routes**: All other routes (require CANDIDATE or ADMIN role)

Include session token in cookies (automatically handled by NextAuth.js).

---

## Endpoints

### 1. Get Current Candidate Profile

**GET** `/api/candidates/profile`

Get the authenticated candidate's complete profile with applications, test results, and placements.

**Authentication Required**: Yes (CANDIDATE or ADMIN)

#### Example Request

```bash
curl "http://localhost:3000/api/candidates/profile" \
  -H "Cookie: next-auth.session-token=..."
```

#### Response (200 OK)

```json
{
  "candidate": {
    "id": "clx...",
    "userId": "clx...",
    "phone": "+1234567890",
    "resume": "/uploads/resumes/resume_clx123_1234567890.pdf",
    "portfolio": "https://myportfolio.com",
    "linkedIn": "https://linkedin.com/in/johndoe",
    "github": "https://github.com/johndoe",
    "bio": "Experienced full-stack developer with 5+ years...",
    "skills": ["JavaScript", "React", "Node.js", "PostgreSQL", "AWS"],
    "experience": 5,
    "education": "Bachelor of Computer Science, MIT, 2018",
    "location": "San Francisco, CA",
    "preferredJobType": "FULL_TIME",
    "expectedSalary": 150000,
    "availability": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z",
    "applications": [
      {
        "id": "clx...",
        "jobId": "clx...",
        "status": "PENDING",
        "appliedAt": "2024-01-10T00:00:00.000Z",
        "job": {
          "id": "clx...",
          "title": "Senior Developer",
          "type": "FULL_TIME",
          "location": "San Francisco, CA",
          "status": "ACTIVE",
          "employer": {
            "companyName": "Tech Corp",
            "companyLogo": "https://..."
          }
        }
      }
    ],
    "testResults": [
      {
        "id": "clx...",
        "testName": "JavaScript Assessment",
        "testType": "Technical",
        "score": 85,
        "maxScore": 100,
        "status": "COMPLETED",
        "completedAt": "2024-01-08T00:00:00.000Z"
      }
    ],
    "placements": [
      {
        "id": "clx...",
        "jobTitle": "Frontend Developer",
        "companyName": "Previous Company",
        "startDate": "2023-01-01T00:00:00.000Z",
        "endDate": "2023-12-31T00:00:00.000Z",
        "status": "COMPLETED"
      }
    ]
  },
  "profileCompletion": {
    "percentage": 85,
    "status": "good",
    "missingFields": ["github"]
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

**403 Forbidden**
```json
{
  "error": "Insufficient permissions. Candidate role required."
}
```

**404 Not Found**
```json
{
  "error": "Candidate profile not found. Please create your profile first."
}
```

---

### 2. Create Candidate Profile

**POST** `/api/candidates/profile`

Create a candidate profile after user registration.

**Authentication Required**: Yes (CANDIDATE or ADMIN)

**Note**: This should be called after user registration to set up the candidate profile.

#### Request Body

```json
{
  "phone": "+1234567890",
  "bio": "Experienced full-stack developer...",
  "skills": ["JavaScript", "React", "Node.js"],
  "experience": 5,
  "education": "Bachelor of Computer Science, MIT, 2018",
  "location": "San Francisco, CA",
  "preferredJobType": "FULL_TIME",
  "expectedSalary": 150000,
  "availability": true,
  "portfolio": "https://myportfolio.com",
  "linkedIn": "https://linkedin.com/in/johndoe",
  "github": "https://github.com/johndoe"
}
```

#### Optional Fields

All fields are optional except those required for basic profile setup.

| Field | Type | Description |
|-------|------|-------------|
| `phone` | string | Contact phone number |
| `resume` | string | URL to resume file |
| `portfolio` | string | Portfolio website URL |
| `linkedIn` | string | LinkedIn profile URL |
| `github` | string | GitHub profile URL |
| `bio` | string | Professional bio/summary |
| `skills` | string[] | Array of skills |
| `experience` | number | Years of experience |
| `education` | string | Education details |
| `location` | string | Current location |
| `preferredJobType` | JobType | Preferred job type |
| `expectedSalary` | number | Expected salary |
| `availability` | boolean | Available for work (default: true) |

#### Example Request

```bash
curl -X POST "http://localhost:3000/api/candidates/profile" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "bio": "Passionate developer with 5 years experience",
    "skills": ["JavaScript", "React", "Node.js", "PostgreSQL"],
    "experience": 5,
    "location": "San Francisco, CA",
    "preferredJobType": "FULL_TIME"
  }'
```

#### Response (201 Created)

```json
{
  "message": "Candidate profile created successfully",
  "candidate": {
    "id": "clx...",
    "userId": "clx...",
    "bio": "Passionate developer...",
    "skills": ["JavaScript", "React", "Node.js", "PostgreSQL"],
    "experience": 5,
    "location": "San Francisco, CA",
    "availability": true,
    "createdAt": "2024-01-15T00:00:00.000Z"
  },
  "profileCompletion": {
    "percentage": 45,
    "status": "basic",
    "missingFields": ["resume", "education"]
  }
}
```

#### Error Responses

**400 Bad Request** - Profile already exists
```json
{
  "error": "Candidate profile already exists. Use PATCH to update."
}
```

**400 Bad Request** - Invalid job type
```json
{
  "error": "Invalid job type",
  "validTypes": ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERNSHIP", "TEMPORARY"]
}
```

---

### 3. Update Candidate Profile

**PATCH** `/api/candidates/profile`

Update the candidate profile. Only provided fields will be updated.

**Authentication Required**: Yes (CANDIDATE or ADMIN)

#### Request Body

All fields are optional. Only include fields you want to update.

```json
{
  "bio": "Updated bio",
  "skills": ["JavaScript", "TypeScript", "React", "Node.js"],
  "expectedSalary": 160000,
  "availability": false
}
```

#### Example Request

```bash
curl -X PATCH "http://localhost:3000/api/candidates/profile" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{
    "skills": ["JavaScript", "TypeScript", "React"],
    "expectedSalary": 160000
  }'
```

#### Response (200 OK)

```json
{
  "message": "Candidate profile updated successfully",
  "candidate": {
    "id": "clx...",
    "skills": ["JavaScript", "TypeScript", "React"],
    "expectedSalary": 160000,
    "updatedAt": "2024-01-16T00:00:00.000Z"
  },
  "profileCompletion": {
    "percentage": 75,
    "status": "good",
    "missingFields": ["github", "portfolio"]
  }
}
```

#### Error Responses

**404 Not Found**
```json
{
  "error": "Candidate profile not found. Please create your profile first."
}
```

---

### 4. Upload Resume

**POST** `/api/candidates/resume`

Upload a resume file (PDF, DOC, or DOCX).

**Authentication Required**: Yes (CANDIDATE or ADMIN)

**Content-Type**: `multipart/form-data`

#### Request Body (Form Data)

| Field | Type | Description |
|-------|------|-------------|
| `resume` | File | Resume file (PDF, DOC, DOCX) |

#### File Requirements

- **Allowed Types**: PDF, DOC, DOCX
- **Max Size**: 5MB
- **Field Name**: `resume`

#### Example Request

```bash
curl -X POST "http://localhost:3000/api/candidates/resume" \
  -H "Cookie: next-auth.session-token=..." \
  -F "resume=@/path/to/resume.pdf"
```

#### Response (200 OK)

```json
{
  "message": "Resume uploaded successfully",
  "resumeUrl": "/uploads/resumes/resume_clx123_1234567890.pdf",
  "candidate": {
    "id": "clx...",
    "resume": "/uploads/resumes/resume_clx123_1234567890.pdf",
    "updatedAt": "2024-01-16T00:00:00.000Z"
  }
}
```

#### Error Responses

**400 Bad Request** - No file provided
```json
{
  "error": "No file provided"
}
```

**400 Bad Request** - Invalid file type
```json
{
  "error": "Invalid file type. Only PDF, DOC, and DOCX files are allowed.",
  "allowedTypes": ["PDF", "DOC", "DOCX"]
}
```

**400 Bad Request** - File too large
```json
{
  "error": "File too large. Maximum file size is 5MB.",
  "maxSize": "5MB",
  "fileSize": "7.23MB"
}
```

**404 Not Found**
```json
{
  "error": "Candidate profile not found. Please create your profile first."
}
```

---

### 5. Delete Resume

**DELETE** `/api/candidates/resume`

Remove the uploaded resume from the candidate profile.

**Authentication Required**: Yes (CANDIDATE or ADMIN)

#### Example Request

```bash
curl -X DELETE "http://localhost:3000/api/candidates/resume" \
  -H "Cookie: next-auth.session-token=..."
```

#### Response (200 OK)

```json
{
  "message": "Resume removed successfully",
  "candidate": {
    "id": "clx...",
    "resume": null,
    "updatedAt": "2024-01-16T00:00:00.000Z"
  }
}
```

---

### 6. Get Public Candidate Profile

**GET** `/api/candidates/[id]`

Get public candidate profile information (limited fields for privacy).

**Authentication Required**: No (Public route)

This endpoint is used by employers to view candidate profiles. Only public information is returned.

#### Path Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Candidate ID |

#### Example Request

```bash
curl "http://localhost:3000/api/candidates/clx123..."
```

#### Response (200 OK)

```json
{
  "candidate": {
    "id": "clx...",
    "bio": "Experienced developer...",
    "skills": ["JavaScript", "React", "Node.js"],
    "experience": 5,
    "education": "Bachelor of CS, MIT, 2018",
    "location": "San Francisco, CA",
    "portfolio": "https://myportfolio.com",
    "linkedIn": "https://linkedin.com/in/johndoe",
    "github": "https://github.com/johndoe",
    "availability": true,
    "preferredJobType": "FULL_TIME",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-15T00:00:00.000Z",
    "user": {
      "name": "John Doe",
      "image": "https://..."
    },
    "placements": [
      {
        "id": "clx...",
        "jobTitle": "Frontend Developer",
        "companyName": "Previous Company",
        "startDate": "2023-01-01T00:00:00.000Z",
        "endDate": "2023-12-31T00:00:00.000Z"
      }
    ],
    "_count": {
      "applications": 12,
      "placements": 2
    }
  },
  "profileCompletion": {
    "percentage": 85,
    "status": "good",
    "missingFields": []
  }
}
```

**Note**: Sensitive information like phone number, email, expected salary, and resume are NOT included in public profiles.

#### Error Responses

**404 Not Found**
```json
{
  "error": "Candidate not found"
}
```

---

### 7. Update Availability Status

**PATCH** `/api/candidates/profile/status`

Update candidate availability status (actively looking / not available).

**Authentication Required**: Yes (CANDIDATE or ADMIN)

#### Request Body

```json
{
  "availability": true
}
```

| Field | Type | Description |
|-------|------|-------------|
| `availability` | boolean | true = available, false = not available |

#### Example Request

```bash
curl -X PATCH "http://localhost:3000/api/candidates/profile/status" \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{"availability": true}'
```

#### Response (200 OK)

```json
{
  "message": "Availability status updated to available",
  "candidate": {
    "id": "clx...",
    "availability": true,
    "updatedAt": "2024-01-16T00:00:00.000Z",
    "user": {
      "name": "John Doe",
      "email": "john@example.com"
    }
  }
}
```

#### Error Responses

**400 Bad Request** - Invalid value
```json
{
  "error": "Invalid availability value. Must be true or false.",
  "provided": "string"
}
```

---

## Profile Completion System

The API automatically calculates profile completion percentage based on filled fields.

### Weighted Fields

| Field | Weight | Description |
|-------|--------|-------------|
| Phone | 5% | Contact number |
| Resume | 15% | Resume file (highest priority) |
| Portfolio | 10% | Portfolio website |
| LinkedIn | 10% | LinkedIn profile |
| GitHub | 10% | GitHub profile |
| Bio | 15% | Professional bio |
| Skills | 15% | Skills array |
| Experience | 5% | Years of experience |
| Education | 10% | Education details |
| Location | 5% | Current location |

### Completion Status

| Percentage | Status | Description |
|------------|--------|-------------|
| 0-29% | incomplete | Profile needs significant work |
| 30-59% | basic | Basic profile, needs improvement |
| 60-89% | good | Good profile, almost complete |
| 90-100% | excellent | Excellent, complete profile |

### Example Response

```json
{
  "profileCompletion": {
    "percentage": 75,
    "status": "good",
    "missingFields": ["github", "portfolio"]
  }
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

## Complete Workflow Example

### 1. User Registration
```bash
# Register as candidate
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "candidate@example.com",
    "password": "SecurePass123",
    "name": "Jane Doe",
    "role": "CANDIDATE"
  }'
```

### 2. Create Profile
```bash
# Create candidate profile
curl -X POST http://localhost:3000/api/candidates/profile \
  -H "Content-Type: application/json" \
  -H "Cookie: session-token..." \
  -d '{
    "bio": "Passionate developer",
    "skills": ["JavaScript", "React"],
    "experience": 3,
    "location": "NYC"
  }'
```

### 3. Upload Resume
```bash
# Upload resume
curl -X POST http://localhost:3000/api/candidates/resume \
  -H "Cookie: session-token..." \
  -F "resume=@resume.pdf"
```

### 4. Update Profile
```bash
# Add more details
curl -X PATCH http://localhost:3000/api/candidates/profile \
  -H "Content-Type: application/json" \
  -H "Cookie: session-token..." \
  -d '{
    "github": "https://github.com/janedoe",
    "linkedIn": "https://linkedin.com/in/janedoe"
  }'
```

### 5. Check Profile Completion
```bash
# Get profile with completion status
curl http://localhost:3000/api/candidates/profile \
  -H "Cookie: session-token..."
```

---

## Production Notes

### File Storage

The current implementation stores files locally in `/public/uploads/resumes/`.

**For production, use cloud storage:**

- **AWS S3**: Industry standard, highly scalable
- **Cloudinary**: Easy to use, includes transformations
- **Vercel Blob**: Optimized for Vercel deployments
- **Google Cloud Storage**: Good for GCP infrastructure

### Security Considerations

1. **Resume Access**: Implement signed URLs for resume downloads
2. **File Scanning**: Add virus/malware scanning for uploaded files
3. **Rate Limiting**: Add rate limits for uploads to prevent abuse
4. **Input Validation**: Validate all URLs (portfolio, LinkedIn, GitHub)
5. **Privacy**: Ensure sensitive data is not exposed in public profiles

### Performance Tips

1. **Caching**: Cache public profiles with Redis or similar
2. **CDN**: Serve resumes through CDN for faster access
3. **Pagination**: Add pagination for applications and test results
4. **Indexing**: Create database indexes on frequently queried fields

---

## Testing

See test examples and complete testing instructions in the main documentation.
