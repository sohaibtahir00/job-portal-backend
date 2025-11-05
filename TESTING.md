# Testing Guide - Job Portal Backend

Comprehensive guide for testing the Job Portal API locally and in production.

## Table of Contents

1. [Local Setup](#local-setup)
2. [Environment Configuration](#environment-configuration)
3. [Testing Tools](#testing-tools)
4. [Manual Testing](#manual-testing)
5. [Automated Testing](#automated-testing)
6. [Testing Workflows](#testing-workflows)
7. [Troubleshooting](#troubleshooting)

---

## Local Setup

### Prerequisites

- Node.js 18+ installed
- PostgreSQL database (local or Railway)
- Git
- Code editor (VS Code recommended)
- API testing tool (Postman, Thunder Client, or cURL)

### Installation Steps

1. **Clone the repository**:
   ```bash
   cd "c:\Users\sohai\OneDrive\Desktop\Projects\Job Portal Backend\job-portal-backend"
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your configuration (see [Environment Configuration](#environment-configuration))

4. **Set up the database**:
   ```bash
   # Generate Prisma client
   npx prisma generate

   # Run migrations
   npx prisma migrate dev

   # (Optional) Seed database with sample data
   npx prisma db seed
   ```

5. **Start the development server**:
   ```bash
   npm run dev
   ```

   The API should now be running at `http://localhost:3000`

6. **Verify installation**:
   ```bash
   curl http://localhost:3000/api/health
   ```

   Expected response:
   ```json
   {
     "status": "healthy",
     "timestamp": "2024-01-15T12:00:00.000Z",
     ...
   }
   ```

---

## Environment Configuration

### Required Environment Variables

Create a `.env` file in the project root with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/job_portal?schema=public"

# NextAuth
NEXTAUTH_SECRET="generate-a-random-secret-here"
NEXTAUTH_URL="http://localhost:3000"

# Email (Resend)
EMAIL_FROM="noreply@yourdomain.com"
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxx"

# Stripe (Optional)
STRIPE_SECRET_KEY="sk_test_your_test_secret_key"
STRIPE_PUBLISHABLE_KEY="pk_test_your_test_publishable_key"
STRIPE_WEBHOOK_SECRET="whsec_your_webhook_secret"

# Cron Jobs
CRON_SECRET="your-secure-random-token-here"

# Storage (Optional - defaults to local)
STORAGE_TYPE="local" # or "r2"
R2_ACCOUNT_ID="your-account-id"
R2_ACCESS_KEY_ID="your-access-key"
R2_SECRET_ACCESS_KEY="your-secret-key"
R2_BUCKET_NAME="your-bucket-name"
R2_PUBLIC_URL="https://pub-xxxxx.r2.dev"

# App Configuration
NODE_ENV="development"
```

### Generate Secrets

**NEXTAUTH_SECRET**:
```bash
openssl rand -base64 32
```

**CRON_SECRET**:
```bash
openssl rand -hex 32
```

### Database Setup

**Option 1: Local PostgreSQL**

1. Install PostgreSQL locally
2. Create a database:
   ```sql
   CREATE DATABASE job_portal;
   ```
3. Update `DATABASE_URL` in `.env`

**Option 2: Railway PostgreSQL**

1. Go to [Railway](https://railway.app)
2. Create a new project
3. Add PostgreSQL service
4. Copy the connection string
5. Update `DATABASE_URL` in `.env`

### Email Setup (Resend)

1. Sign up at [Resend](https://resend.com)
2. Verify your domain (or use development mode)
3. Create an API key
4. Update `RESEND_API_KEY` in `.env`
5. Set `EMAIL_FROM` to your verified email

### Payment Setup (Optional)

1. Sign up at [Stripe](https://stripe.com)
2. Get your test API keys from the dashboard
3. Update Stripe variables in `.env`

---

## Testing Tools

### 1. cURL (Command Line)

**Pros**: Built-in, scriptable, no installation
**Cons**: Verbose, no GUI

**Example**:
```bash
# Health check
curl http://localhost:3000/api/health

# Sign up
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "TestPass123",
    "role": "CANDIDATE"
  }'
```

### 2. Postman

**Pros**: Full-featured, GUI, collections, environments
**Cons**: Requires installation

**Setup**:
1. Download [Postman](https://www.postman.com/downloads/)
2. Import `postman_collection.json` from the project root
3. Set environment variables:
   - `baseUrl`: `http://localhost:3000/api`
   - `cronSecret`: Your CRON_SECRET value

### 3. Thunder Client (VS Code Extension)

**Pros**: Integrated with VS Code, lightweight
**Cons**: Less features than Postman

**Setup**:
1. Install Thunder Client extension in VS Code
2. Import `postman_collection.json` (Thunder Client supports Postman format)
3. Configure environment variables

### 4. REST Client (VS Code Extension)

**Pros**: File-based, version control friendly, simple
**Cons**: No GUI, less features

**Setup**:
1. Install REST Client extension in VS Code
2. Create `.http` files (examples below)

---

## Manual Testing

### Basic Workflow Test

Follow this workflow to test the complete user journey:

#### 1. Create Test Users

**Create Candidate**:
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -c candidate-cookies.txt \
  -d '{
    "name": "John Candidate",
    "email": "candidate@test.com",
    "password": "TestPass123",
    "role": "CANDIDATE",
    "phone": "+1234567890",
    "location": "New York, NY"
  }'
```

**Create Employer**:
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -c employer-cookies.txt \
  -d '{
    "name": "Jane Employer",
    "email": "employer@test.com",
    "password": "TestPass123",
    "role": "EMPLOYER",
    "companyName": "Tech Corp",
    "companyWebsite": "https://techcorp.com"
  }'
```

**Create Admin**:
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -c admin-cookies.txt \
  -d '{
    "name": "Admin User",
    "email": "admin@test.com",
    "password": "TestPass123",
    "role": "ADMIN"
  }'
```

#### 2. Login as Employer

```bash
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -c employer-cookies.txt \
  -d '{
    "email": "employer@test.com",
    "password": "TestPass123"
  }'
```

#### 3. Create a Job Posting

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -b employer-cookies.txt \
  -d '{
    "title": "Senior Software Engineer",
    "description": "We are looking for an experienced software engineer to join our growing team. You will work on cutting-edge technologies.",
    "requirements": "5+ years experience with React and Node.js, Strong TypeScript skills",
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

**Save the job ID from the response for later use.**

#### 4. Publish the Job

```bash
curl -X POST http://localhost:3000/api/jobs/{JOB_ID}/publish \
  -b employer-cookies.txt
```

#### 5. Login as Candidate

```bash
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -c candidate-cookies.txt \
  -d '{
    "email": "candidate@test.com",
    "password": "TestPass123"
  }'
```

#### 6. Browse Jobs

```bash
curl http://localhost:3000/api/jobs?type=FULL_TIME \
  -b candidate-cookies.txt
```

#### 7. Apply to Job

```bash
curl -X POST http://localhost:3000/api/applications \
  -H "Content-Type: application/json" \
  -b candidate-cookies.txt \
  -d '{
    "jobId": "{JOB_ID}",
    "coverLetter": "I am very interested in this position because of my 7 years of experience in React and Node.js development.",
    "expectedSalary": 150000
  }'
```

**Save the application ID from the response.**

#### 8. Employer Views Applications

```bash
curl http://localhost:3000/api/applications?jobId={JOB_ID} \
  -b employer-cookies.txt
```

#### 9. Employer Updates Application Status

```bash
curl -X PATCH http://localhost:3000/api/applications/{APPLICATION_ID}/status \
  -H "Content-Type: application/json" \
  -b employer-cookies.txt \
  -d '{
    "status": "INTERVIEW_SCHEDULED",
    "interviewDate": "2024-02-01T14:00:00.000Z"
  }'
```

#### 10. Send Message

```bash
curl -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -b employer-cookies.txt \
  -d '{
    "receiverId": "{CANDIDATE_USER_ID}",
    "subject": "Interview Scheduled",
    "content": "Your interview has been scheduled for Feb 1 at 2 PM."
  }'
```

### Testing File Uploads

**Upload Resume (as Candidate)**:
```bash
curl -X POST http://localhost:3000/api/upload/resume \
  -b candidate-cookies.txt \
  -F "file=@/path/to/resume.pdf"
```

**Upload Company Logo (as Employer)**:
```bash
curl -X POST http://localhost:3000/api/upload/logo \
  -b employer-cookies.txt \
  -F "file=@/path/to/logo.png"
```

### Testing Search

**Search Jobs**:
```bash
curl "http://localhost:3000/api/jobs/search?q=react&remote=REMOTE&salaryMin=100000&sortBy=salary_high"
```

**Search Candidates (as Employer)**:
```bash
curl "http://localhost:3000/api/candidates/search?skills=React,Node.js&testScoreMin=80" \
  -b employer-cookies.txt
```

### Testing Admin Functions

**List Pending Jobs**:
```bash
curl "http://localhost:3000/api/admin/jobs?status=PENDING_APPROVAL" \
  -b admin-cookies.txt
```

**Approve Job**:
```bash
curl -X PATCH http://localhost:3000/api/admin/jobs/{JOB_ID}/approve \
  -H "Content-Type: application/json" \
  -b admin-cookies.txt \
  -d '{
    "action": "approve"
  }'
```

**Suspend User**:
```bash
curl -X PATCH http://localhost:3000/api/admin/users/{USER_ID}/suspend \
  -H "Content-Type: application/json" \
  -b admin-cookies.txt \
  -d '{
    "action": "suspend",
    "reason": "Violation of terms of service"
  }'
```

### Testing Rate Limiting

Test rate limits by making multiple requests quickly:

```bash
# This should succeed
for i in {1..5}; do
  curl -X POST http://localhost:3000/api/auth/signin \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  echo ""
done

# 6th request should return 429 Too Many Requests
curl -X POST http://localhost:3000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"wrong"}'
```

### Testing Cron Jobs

```bash
# Test expire jobs
curl -X POST http://localhost:3000/api/cron/expire-jobs \
  -H "Authorization: Bearer YOUR_CRON_SECRET"

# Get cron job info
curl http://localhost:3000/api/cron/expire-jobs \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## Automated Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run E2E tests
npm run test:e2e
```

### Writing Tests

Example test file (`__tests__/api/jobs.test.ts`):

```typescript
import { describe, it, expect } from '@jest/globals';

describe('Jobs API', () => {
  describe('GET /api/jobs', () => {
    it('should return list of jobs', async () => {
      const response = await fetch('http://localhost:3000/api/jobs');
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(Array.isArray(data.jobs)).toBe(true);
    });

    it('should filter jobs by type', async () => {
      const response = await fetch(
        'http://localhost:3000/api/jobs?type=FULL_TIME'
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      data.jobs.forEach((job: any) => {
        expect(job.type).toBe('FULL_TIME');
      });
    });
  });

  describe('POST /api/jobs', () => {
    it('should require authentication', async () => {
      const response = await fetch('http://localhost:3000/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Job',
          // ... other fields
        }),
      });

      expect(response.status).toBe(401);
    });

    it('should validate required fields', async () => {
      const response = await fetch('http://localhost:3000/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: 'session-cookie-here',
        },
        body: JSON.stringify({
          title: 'Short', // Too short
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('Validation');
    });
  });
});
```

---

## Testing Workflows

### Complete User Journey Test

Create a script to test the complete workflow:

```bash
#!/bin/bash

# test-workflow.sh

BASE_URL="http://localhost:3000/api"

echo "Starting complete workflow test..."

# 1. Create candidate
echo "Creating candidate..."
CANDIDATE_RESPONSE=$(curl -s -X POST $BASE_URL/auth/signup \
  -H "Content-Type: application/json" \
  -c candidate.txt \
  -d '{
    "name": "Test Candidate",
    "email": "candidate-'$(date +%s)'@test.com",
    "password": "TestPass123",
    "role": "CANDIDATE"
  }')

echo "Candidate created: $CANDIDATE_RESPONSE"

# 2. Create employer
echo "Creating employer..."
EMPLOYER_RESPONSE=$(curl -s -X POST $BASE_URL/auth/signup \
  -H "Content-Type: application/json" \
  -c employer.txt \
  -d '{
    "name": "Test Employer",
    "email": "employer-'$(date +%s)'@test.com",
    "password": "TestPass123",
    "role": "EMPLOYER",
    "companyName": "Test Corp"
  }')

echo "Employer created: $EMPLOYER_RESPONSE"

# 3. Create job as employer
echo "Creating job..."
JOB_RESPONSE=$(curl -s -X POST $BASE_URL/jobs \
  -H "Content-Type: application/json" \
  -b employer.txt \
  -d '{
    "title": "Test Position",
    "description": "This is a test job description that meets the minimum length requirement for posting.",
    "requirements": "Test requirements for the position",
    "responsibilities": "Test responsibilities",
    "type": "FULL_TIME",
    "location": "Remote",
    "remoteType": "REMOTE",
    "experienceLevel": "MID",
    "skills": ["Testing"]
  }')

JOB_ID=$(echo $JOB_RESPONSE | jq -r '.job.id')
echo "Job created with ID: $JOB_ID"

# 4. List jobs
echo "Listing jobs..."
curl -s $BASE_URL/jobs | jq '.jobs[] | .title'

# 5. Apply to job as candidate
echo "Applying to job..."
APPLICATION_RESPONSE=$(curl -s -X POST $BASE_URL/applications \
  -H "Content-Type: application/json" \
  -b candidate.txt \
  -d '{
    "jobId": "'$JOB_ID'",
    "coverLetter": "This is my cover letter explaining why I am interested in this position."
  }')

APPLICATION_ID=$(echo $APPLICATION_RESPONSE | jq -r '.application.id')
echo "Application submitted with ID: $APPLICATION_ID"

# 6. Update application status as employer
echo "Updating application status..."
curl -s -X PATCH $BASE_URL/applications/$APPLICATION_ID/status \
  -H "Content-Type: application/json" \
  -b employer.txt \
  -d '{
    "status": "REVIEWED"
  }' | jq '.'

echo "Workflow test completed!"

# Cleanup
rm -f candidate.txt employer.txt
```

Make executable and run:
```bash
chmod +x test-workflow.sh
./test-workflow.sh
```

### Load Testing

Use tools like Apache Bench or k6 for load testing:

**Apache Bench**:
```bash
# 1000 requests, 10 concurrent
ab -n 1000 -c 10 http://localhost:3000/api/health
```

**k6** (install from https://k6.io):
```javascript
// load-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  vus: 10, // 10 virtual users
  duration: '30s',
};

export default function () {
  let response = http.get('http://localhost:3000/api/jobs');

  check(response, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

Run:
```bash
k6 run load-test.js
```

---

## Troubleshooting

### Common Issues

#### 1. Database Connection Error

**Error**: `Can't reach database server`

**Solutions**:
- Check DATABASE_URL is correct
- Verify PostgreSQL is running
- Check network connectivity
- Verify credentials

```bash
# Test database connection
npx prisma db push
```

#### 2. Migration Errors

**Error**: `Migration failed to apply`

**Solutions**:
```bash
# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Or force migration
npx prisma migrate deploy --force
```

#### 3. Authentication Not Working

**Error**: `401 Unauthorized` on authenticated endpoints

**Solutions**:
- Check NEXTAUTH_SECRET is set
- Verify cookies are being sent
- Check session configuration
- Clear browser cookies and re-login

#### 4. Rate Limiting Too Strict

**Error**: `429 Too Many Requests` during testing

**Solutions**:
- Wait for rate limit window to reset
- Use different IP/user for testing
- Temporarily disable rate limiting in development:
  ```typescript
  // In lib/rate-limit.ts
  skip: () => process.env.NODE_ENV === 'development'
  ```

#### 5. File Upload Fails

**Error**: `File upload failed` or `Invalid file type`

**Solutions**:
- Check file size (Resume: 5MB, Logo: 2MB)
- Verify file type (PDF/DOC for resume, PNG/JPG for logo)
- Check upload directory permissions
- Verify STORAGE_TYPE configuration

#### 6. Email Not Sending

**Error**: `Failed to send email`

**Solutions**:
- Verify RESEND_API_KEY is valid
- Check EMAIL_FROM is verified in Resend
- Check Resend dashboard for errors
- Verify domain configuration

### Debug Mode

Enable detailed logging:

```env
# .env
DEBUG=true
LOG_LEVEL=debug
```

Check logs:
```bash
# Development
npm run dev

# Production
pm2 logs
```

### Database Inspection

**Prisma Studio** (GUI for database):
```bash
npx prisma studio
```

Opens at `http://localhost:5555`

**Direct SQL queries**:
```bash
npx prisma db execute --stdin < query.sql
```

### Testing Checklist

Before deploying:

- [ ] Health check endpoint returns 200
- [ ] Can create users (candidate, employer, admin)
- [ ] Can login and get session
- [ ] Can create, update, delete jobs
- [ ] Can submit applications
- [ ] Can upload files
- [ ] Search returns relevant results
- [ ] Rate limiting works
- [ ] Cron jobs execute successfully
- [ ] Admin functions work
- [ ] Email notifications send
- [ ] Error responses are consistent
- [ ] All migrations applied
- [ ] Environment variables set

---

## Additional Resources

- [API Documentation](API.md)
- [Error Handling Guide](ERROR_HANDLING.md)
- [Upload System Documentation](UPLOAD_SYSTEM.md)
- [Postman Collection](postman_collection.json)

---

**Need Help?**

If you encounter issues not covered here:
1. Check the API documentation
2. Review error responses for details
3. Check application logs
4. Consult the codebase documentation
5. Contact support@example.com

**Happy Testing!** 🚀
