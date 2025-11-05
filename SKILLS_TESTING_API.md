# Skills Testing API Documentation

Complete API documentation for the skills testing and candidate assessment system.

## Table of Contents

1. [Overview](#overview)
2. [Test Tier System](#test-tier-system)
3. [API Endpoints](#api-endpoints)
4. [Integration Guide](#integration-guide)
5. [Webhook Security](#webhook-security)
6. [Email Notifications](#email-notifications)
7. [Best Practices](#best-practices)

---

## Overview

The Skills Testing API provides a complete solution for candidate assessment and tier-based ranking. It integrates with external testing platforms (like iMocha) and provides a tiered system to categorize candidate skill levels.

### Features

- **Test Invitation System**: Send personalized test invitations with unique secure tokens
- **Tier-Based Ranking**: Automatic tier calculation based on score and percentile
- **Webhook Integration**: Receive and process test results from external platforms
- **Test History**: Track all test attempts with detailed statistics
- **Email Notifications**: Automated emails with professional result summaries
- **Access Control**: Role-based access to test results (Admin, Employer, Candidate)

### Architecture

```
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│  Employer   │──────▶│   Invite     │──────▶│  Candidate  │
│   (POST)    │       │   Endpoint   │       │   (Email)   │
└─────────────┘       └──────────────┘       └─────────────┘
                                                      │
                                                      ▼
┌─────────────┐       ┌──────────────┐       ┌─────────────┐
│  External   │◀──────│  Candidate   │──────▶│   Testing   │
│   Webhook   │       │   Takes      │       │  Platform   │
│  Endpoint   │       │     Test     │       │  (iMocha)   │
└─────────────┘       └──────────────┘       └─────────────┘
       │
       ▼
┌─────────────┐       ┌──────────────┐
│  Calculate  │──────▶│   Update     │
│    Tier     │       │  Database    │
└─────────────┘       └──────────────┘
       │
       ▼
┌─────────────┐
│    Send     │
│  Results    │
│   Email     │
└─────────────┘
```

---

## Test Tier System

### Tier Definitions

The system uses four tiers to categorize candidate skill levels:

| Tier | Score Requirement | Percentile Requirement | Description |
|------|-------------------|------------------------|-------------|
| 🏆 **ELITE** | ≥ 90 | ≥ 95 | Top 5% of test takers. Exceptional skills and expertise. |
| ⭐ **ADVANCED** | ≥ 75 | ≥ 80 | Top 20% of test takers. Strong skills and solid experience. |
| 📊 **INTERMEDIATE** | ≥ 60 | ≥ 60 | Top 40% of test takers. Good foundational skills. |
| 🌱 **BEGINNER** | < 60 | < 60 | Entry level skills. Room for growth and development. |

### Tier Calculation Logic

Candidates must meet **BOTH** score **AND** percentile requirements to qualify for a tier.

```typescript
// Example: Score 92, Percentile 96
calculateTier(92, 96) // Returns: ELITE

// Example: Score 78, Percentile 70 (doesn't meet percentile requirement)
calculateTier(78, 70) // Returns: INTERMEDIATE (not ADVANCED)

// Example: Score 65, Percentile 85 (doesn't meet score requirement)
calculateTier(65, 85) // Returns: INTERMEDIATE (not ADVANCED)
```

### Tier Colors (for UI)

- **ELITE**: `#7C3AED` (Purple)
- **ADVANCED**: `#059669` (Green)
- **INTERMEDIATE**: `#F59E0B` (Amber)
- **BEGINNER**: `#6B7280` (Gray)

---

## API Endpoints

### 1. Send Test Invitation

Send a test invitation to a candidate with a unique secure token.

**Endpoint**: `POST /api/tests/invite`

**Authentication**: Required (EMPLOYER or ADMIN role)

**Request Body**:

```json
{
  "candidateId": "clx1234567890",
  "applicationId": "clx0987654321",
  "testName": "Full Stack Developer Assessment",
  "testType": "Technical",
  "testUrl": "https://imocha.io/test/abc123",
  "deadline": "2025-02-01T23:59:59Z",
  "message": "We're excited to see your skills in action!"
}
```

**Fields**:

- `candidateId` (string, optional if applicationId provided): ID of the candidate
- `applicationId` (string, optional if candidateId provided): ID of the application
- `testName` (string, required): Name of the test
- `testType` (string, required): Type of test (Technical, Aptitude, Personality, Coding, other)
- `testUrl` (string, optional): External test URL (iMocha, HackerRank, etc.)
- `deadline` (ISO date string, optional): Test completion deadline
- `message` (string, optional): Custom message for the candidate

**Response** (201 Created):

```json
{
  "message": "Test invitation sent successfully",
  "invitation": {
    "candidateId": "clx1234567890",
    "candidateName": "John Doe",
    "candidateEmail": "john@example.com",
    "testName": "Full Stack Developer Assessment",
    "testType": "Technical",
    "testUrl": "https://yourdomain.com/tests/take?token=a1b2c3d4e5f6...",
    "testInviteToken": "a1b2c3d4e5f6789012345678901234567890abcdef",
    "deadline": "2025-02-01T23:59:59.000Z",
    "sentAt": "2025-01-15T10:30:00.000Z",
    "testResultId": "clx9876543210"
  }
}
```

**Example cURL**:

```bash
curl -X POST https://yourdomain.com/api/tests/invite \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "applicationId": "clx0987654321",
    "testName": "React Developer Assessment",
    "testType": "Technical",
    "deadline": "2025-02-01T23:59:59Z"
  }'
```

---

### 2. Check Test Invitation Status

Check if a candidate has a pending test invitation and their test-taking status.

**Endpoint**: `GET /api/tests/invite?candidateId=xxx`

**Authentication**: Required (EMPLOYER or ADMIN role)

**Query Parameters**:

- `candidateId` (string, required): ID of the candidate

**Response** (200 OK):

```json
{
  "candidateId": "clx1234567890",
  "hasPendingInvite": true,
  "testInviteSentAt": "2025-01-15T10:30:00.000Z",
  "hasTakenTest": false,
  "lastTestDate": null,
  "testResults": null
}
```

**Response with completed test**:

```json
{
  "candidateId": "clx1234567890",
  "hasPendingInvite": false,
  "testInviteSentAt": "2025-01-15T10:30:00.000Z",
  "hasTakenTest": true,
  "lastTestDate": "2025-01-16T14:45:00.000Z",
  "testResults": {
    "score": 88.5,
    "percentile": 92,
    "tier": "ADVANCED"
  }
}
```

---

### 3. Process Test Results (Webhook)

Receive and process test results from external testing platforms.

**Endpoint**: `POST /api/tests/webhook`

**Authentication**: None (webhook endpoint - should be secured via signature verification)

**Request Body**:

```json
{
  "token": "a1b2c3d4e5f6789012345678901234567890abcdef",
  "candidateEmail": "john@example.com",
  "testName": "Full Stack Developer Assessment",
  "testType": "Technical",
  "score": 85,
  "maxScore": 100,
  "percentile": 88,
  "startedAt": "2025-01-16T13:00:00Z",
  "completedAt": "2025-01-16T14:45:00Z",
  "feedback": "Excellent performance in algorithms and data structures. Strong problem-solving skills.",
  "metadata": {
    "duration": 105,
    "questions": 50,
    "correctAnswers": 42
  }
}
```

**Fields**:

- `token` (string, optional): Test invitation token (required if candidateEmail not provided)
- `candidateEmail` (string, optional): Candidate email (required if token not provided)
- `testName` (string, optional): Name of the test
- `testType` (string, optional): Type of test
- `score` (number, required): Test score
- `maxScore` (number, optional): Maximum possible score (default: 100)
- `percentile` (number, required): Percentile rank (0-100)
- `startedAt` (ISO date string, optional): When test was started
- `completedAt` (ISO date string, optional): When test was completed
- `feedback` (string, optional): Feedback for the candidate
- `metadata` (object, optional): Additional test metadata

**Response** (200 OK):

```json
{
  "message": "Test results processed successfully",
  "candidate": {
    "id": "clx1234567890",
    "name": "John Doe",
    "email": "john@example.com",
    "score": 85,
    "percentile": 88,
    "tier": "ADVANCED",
    "lastTestDate": "2025-01-16T14:45:00.000Z"
  },
  "testResult": {
    "id": "clx9876543210",
    "testName": "Full Stack Developer Assessment",
    "testType": "Technical",
    "score": 85,
    "maxScore": 100,
    "status": "COMPLETED",
    "completedAt": "2025-01-16T14:45:00.000Z"
  }
}
```

**Error Responses**:

- `400 Bad Request`: Missing required fields or invalid score/percentile values
- `404 Not Found`: Invalid token or candidate not found
- `500 Internal Server Error`: Server error processing results

**Example cURL**:

```bash
curl -X POST https://yourdomain.com/api/tests/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "token": "a1b2c3d4e5f6789012345678901234567890abcdef",
    "score": 85,
    "maxScore": 100,
    "percentile": 88,
    "completedAt": "2025-01-16T14:45:00Z"
  }'
```

---

### 4. Get Candidate Test Results

Get detailed test results and tier information for a candidate.

**Endpoint**: `GET /api/tests/results/[candidateId]`

**Authentication**: Required

**Access Control**:
- **ADMIN**: Can view any candidate's results
- **EMPLOYER**: Can view results for candidates who applied to their jobs
- **CANDIDATE**: Can only view their own results

**Query Parameters**:

- `includeHistory` (boolean, optional): Include all test attempts (default: false, shows only latest)

**Response (No Test Taken)** (200 OK):

```json
{
  "candidate": {
    "id": "clx1234567890",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "hasTakenTest": false,
  "testInviteSentAt": "2025-01-15T10:30:00.000Z",
  "message": "Test invitation sent. Waiting for candidate to complete the test."
}
```

**Response (Test Completed)** (200 OK):

```json
{
  "candidate": {
    "id": "clx1234567890",
    "name": "John Doe",
    "email": "john@example.com"
  },
  "hasTakenTest": true,
  "currentScore": 85,
  "currentPercentile": 88,
  "lastTestDate": "2025-01-16T14:45:00.000Z",
  "tierInfo": {
    "tier": "ADVANCED",
    "description": "Top 20% of test takers. Strong skills and solid experience.",
    "color": "#059669",
    "emoji": "⭐"
  },
  "nextTierInfo": {
    "nextTier": "ELITE",
    "scoreGap": 5,
    "percentileGap": 7,
    "message": "To reach ELITE tier, you need: +5 points in score and +7 percentile points."
  },
  "testResults": [
    {
      "id": "clx9876543210",
      "testName": "Full Stack Developer Assessment",
      "testType": "Technical",
      "score": 85,
      "maxScore": 100,
      "percentageScore": "85.0",
      "status": "COMPLETED",
      "startedAt": "2025-01-16T13:00:00.000Z",
      "completedAt": "2025-01-16T14:45:00.000Z",
      "feedback": "Excellent performance in algorithms and data structures.",
      "application": {
        "id": "clx0987654321",
        "jobTitle": "Senior Full Stack Developer",
        "companyName": "Tech Corp"
      },
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ],
  "statistics": {
    "totalTests": 1,
    "completedTests": 1,
    "averageScore": "85.0",
    "highestScore": 85,
    "lowestScore": 85
  },
  "includesHistory": false
}
```

**Example cURL**:

```bash
# Get latest test result
curl -X GET https://yourdomain.com/api/tests/results/clx1234567890 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Get all test history
curl -X GET "https://yourdomain.com/api/tests/results/clx1234567890?includeHistory=true" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Integration Guide

### iMocha Integration

#### Step 1: Configure Webhook in iMocha

1. Log in to your iMocha dashboard
2. Navigate to **Settings** → **Webhooks**
3. Add new webhook URL: `https://yourdomain.com/api/tests/webhook`
4. Select events: **Test Completed**
5. Save webhook configuration

#### Step 2: Map iMocha Payload to API

iMocha sends test results in their format. You may need a middleware to transform:

```javascript
// Example iMocha to API transformation
function transformIMochaPayload(imochaData) {
  return {
    token: imochaData.custom_fields.invite_token,
    candidateEmail: imochaData.candidate.email,
    testName: imochaData.test.name,
    testType: "Technical",
    score: imochaData.result.score,
    maxScore: imochaData.result.max_score,
    percentile: imochaData.result.percentile,
    startedAt: imochaData.result.started_at,
    completedAt: imochaData.result.completed_at,
    feedback: imochaData.result.feedback,
    metadata: {
      duration: imochaData.result.duration_minutes,
      questions: imochaData.result.total_questions,
      correctAnswers: imochaData.result.correct_answers,
    },
  };
}
```

#### Step 3: Send Test Invitations

When sending test invitations, include the token in the iMocha test URL:

```javascript
const invitation = await fetch('/api/tests/invite', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    candidateId: 'clx1234567890',
    testName: 'Full Stack Developer Assessment',
    testType: 'Technical',
    testUrl: `https://imocha.io/test/abc123?token=${testInviteToken}`,
  }),
});

const { invitation: { testInviteToken } } = await invitation.json();

// Pass token to iMocha as custom field
// This will be returned in the webhook payload
```

### HackerRank Integration

Similar steps apply for HackerRank:

1. Configure webhook in HackerRank settings
2. Map HackerRank payload format to API format
3. Include test token in custom fields

### Custom Testing Platform

For custom platforms, ensure your webhook sends:

```json
{
  "token": "unique_token_from_invitation",
  "score": 85,
  "maxScore": 100,
  "percentile": 88,
  "completedAt": "2025-01-16T14:45:00Z"
}
```

---

## Webhook Security

### Securing Your Webhook Endpoint

Since the webhook endpoint is publicly accessible, implement security measures:

#### 1. Signature Verification

Add signature verification to the webhook handler:

```typescript
// In webhook route
const signature = request.headers.get('x-webhook-signature');
const timestamp = request.headers.get('x-webhook-timestamp');

if (!verifyWebhookSignature(signature, timestamp, body)) {
  return NextResponse.json(
    { error: 'Invalid signature' },
    { status: 401 }
  );
}
```

#### 2. Token Validation

The token is validated against the database, ensuring only valid test invitations are processed.

#### 3. Rate Limiting

Implement rate limiting to prevent abuse:

```typescript
// Add rate limiting middleware
import { rateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const rateLimitResult = await rateLimit(request);
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429 }
    );
  }

  // ... rest of webhook handler
}
```

#### 4. IP Allowlisting

Restrict webhook access to known testing platform IPs:

```typescript
const allowedIPs = [
  '1.2.3.4', // iMocha IPs
  '5.6.7.8',
];

const clientIP = request.headers.get('x-forwarded-for') ||
                 request.headers.get('x-real-ip');

if (!allowedIPs.includes(clientIP)) {
  return NextResponse.json(
    { error: 'Forbidden' },
    { status: 403 }
  );
}
```

---

## Email Notifications

### Test Invitation Email

Sent when an employer invites a candidate to take a test.

**Recipient**: Candidate

**Subject**: `🎯 You've Been Invited to Take a Skills Test`

**Content**:
- Employer/Company name
- Job title
- Test name and type
- Deadline (if specified)
- Direct link to take the test
- Custom message (if provided)

### Test Results Email

Sent when test results are received and processed.

**Recipient**: Candidate

**Subject**: `🎉 Your Test Results Are In - [TIER] Tier!`

**Content**:
- Tier badge with emoji
- Score and percentile
- Tier description
- Test feedback (if provided)
- Test details (duration, questions, correct answers)
- Encouragement to improve

---

## Best Practices

### For Employers

1. **Set Realistic Deadlines**: Give candidates 3-7 days to complete tests
2. **Provide Context**: Include a custom message explaining the test's purpose
3. **Review Results Promptly**: Check results within 24-48 hours of completion
4. **Consider Tier Ranges**: Don't filter solely by ELITE tier - ADVANCED candidates are also strong

### For Integration

1. **Handle Webhook Failures Gracefully**: Implement retry logic in your testing platform
2. **Validate Data Before Sending**: Ensure score and percentile are within valid ranges
3. **Include Metadata**: Send additional context (duration, questions) for better insights
4. **Test Webhook Flow**: Use test mode to verify webhook integration before going live

### For Candidates

1. **Complete Tests in One Session**: Most platforms time out after inactivity
2. **Review Feedback**: Use feedback to improve skills for future tests
3. **Track Progress**: Monitor tier improvements across multiple tests
4. **Prepare Adequately**: Research test topics before starting

### Database Considerations

1. **Archive Old Test Results**: Keep last 5 test attempts per candidate
2. **Index Tier Field**: Enable fast filtering by tier in job searches
3. **Cache Tier Statistics**: Cache tier distribution for analytics
4. **Monitor Webhook Performance**: Track webhook processing time and failures

---

## Error Handling

### Common Errors

| Error Code | Description | Solution |
|------------|-------------|----------|
| 400 | Missing required fields | Check request payload matches schema |
| 401 | Authentication required | Include valid JWT token in Authorization header |
| 403 | Forbidden access | Verify user has permission to access resource |
| 404 | Candidate/Token not found | Verify candidate exists and token is valid |
| 500 | Server error | Check server logs for details |

### Webhook Error Recovery

If webhook fails:

1. Testing platform should retry with exponential backoff
2. After 3 failed attempts, log error and notify admin
3. Manual results entry available via admin panel
4. Token remains valid for manual submission

---

## API Client Examples

### JavaScript/TypeScript

```typescript
// Send test invitation
async function sendTestInvitation(applicationId: string) {
  const response = await fetch('/api/tests/invite', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      applicationId,
      testName: 'Technical Assessment',
      testType: 'Technical',
      deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  });

  return await response.json();
}

// Get candidate results
async function getCandidateResults(candidateId: string) {
  const response = await fetch(`/api/tests/results/${candidateId}?includeHistory=true`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  return await response.json();
}
```

### Python

```python
import requests

# Send test invitation
def send_test_invitation(application_id, token):
    response = requests.post(
        'https://yourdomain.com/api/tests/invite',
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}',
        },
        json={
            'applicationId': application_id,
            'testName': 'Technical Assessment',
            'testType': 'Technical',
        }
    )
    return response.json()

# Get candidate results
def get_candidate_results(candidate_id, token):
    response = requests.get(
        f'https://yourdomain.com/api/tests/results/{candidate_id}',
        headers={'Authorization': f'Bearer {token}'},
        params={'includeHistory': 'true'}
    )
    return response.json()
```

---

## Database Schema

### Candidate Fields

```prisma
model Candidate {
  // ... other fields

  // Skills testing fields
  hasTakenTest      Boolean   @default(false)
  testScore         Float?    // Overall test score (0-100)
  testPercentile    Float?    // Percentile rank (0-100)
  testTier          String?   // ELITE, ADVANCED, INTERMEDIATE, BEGINNER
  lastTestDate      DateTime? // When last test was taken
  testInviteToken   String?   @unique
  testInviteSentAt  DateTime?

  testResults       TestResult[]

  @@index([testTier])
  @@index([testInviteToken])
}
```

### TestResult Model

```prisma
model TestResult {
  id              String      @id @default(cuid())
  applicationId   String?
  candidateId     String
  testName        String
  testType        String
  score           Int
  maxScore        Int
  status          TestStatus  @default(NOT_STARTED)
  startedAt       DateTime?
  completedAt     DateTime?
  feedback        String?     @db.Text
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  application     Application? @relation(...)
  candidate       Candidate    @relation(...)
}
```

---

## Testing

### Manual Testing

Use the following test data for manual testing:

```json
// Test invitation
{
  "candidateId": "test_candidate_id",
  "testName": "Test Assessment",
  "testType": "Technical"
}

// Webhook payload for ELITE tier
{
  "token": "test_token_from_invitation",
  "score": 95,
  "maxScore": 100,
  "percentile": 98,
  "completedAt": "2025-01-16T14:45:00Z"
}

// Webhook payload for BEGINNER tier
{
  "token": "test_token_from_invitation",
  "score": 45,
  "maxScore": 100,
  "percentile": 40,
  "completedAt": "2025-01-16T14:45:00Z"
}
```

### Automated Tests

```typescript
describe('Skills Testing API', () => {
  test('should send test invitation', async () => {
    const response = await request(app)
      .post('/api/tests/invite')
      .set('Authorization', `Bearer ${employerToken}`)
      .send({
        candidateId: testCandidateId,
        testName: 'Test Assessment',
        testType: 'Technical',
      });

    expect(response.status).toBe(201);
    expect(response.body.invitation.testInviteToken).toBeDefined();
  });

  test('should calculate ELITE tier correctly', async () => {
    const response = await request(app)
      .post('/api/tests/webhook')
      .send({
        token: testToken,
        score: 95,
        maxScore: 100,
        percentile: 98,
      });

    expect(response.status).toBe(200);
    expect(response.body.candidate.tier).toBe('ELITE');
  });
});
```

---

## Support

For issues or questions about the Skills Testing API:

- **Documentation**: Check this file first
- **API Status**: Monitor webhook success rates
- **Contact**: support@yourdomain.com

---

*Last Updated: January 2025*
