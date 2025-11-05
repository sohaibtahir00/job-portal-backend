#!/bin/bash

# Jobs API Test Script
# This script demonstrates how to use the Jobs API endpoints

BASE_URL="http://localhost:3000"

echo "========================================"
echo "Jobs API Test Script"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: List all jobs
echo -e "${BLUE}Test 1: GET /api/jobs - List all jobs${NC}"
curl -X GET "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n\n"

# Test 2: List jobs with filters
echo -e "${BLUE}Test 2: GET /api/jobs with filters${NC}"
curl -X GET "$BASE_URL/api/jobs?location=New%20York&type=FULL_TIME&page=1&limit=5" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n\n"

# Test 3: Search jobs
echo -e "${BLUE}Test 3: GET /api/jobs with search${NC}"
curl -X GET "$BASE_URL/api/jobs?search=developer" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n\n"

# Test 4: Get remote jobs only
echo -e "${BLUE}Test 4: GET /api/jobs - Remote jobs only${NC}"
curl -X GET "$BASE_URL/api/jobs?remote=true" \
  -H "Content-Type: application/json" \
  -w "\nStatus: %{http_code}\n\n"

# Test 5: Register an employer
echo -e "${BLUE}Test 5: POST /api/auth/register - Register employer${NC}"
EMPLOYER_RESPONSE=$(curl -X POST "$BASE_URL/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-employer@example.com",
    "password": "SecurePass123",
    "name": "Test Company",
    "role": "EMPLOYER"
  }' \
  -w "\nStatus: %{http_code}\n" \
  -c cookies.txt)
echo "$EMPLOYER_RESPONSE"
echo ""

# Test 6: Sign in as employer
echo -e "${BLUE}Test 6: POST /api/auth/signin - Sign in${NC}"
curl -X POST "$BASE_URL/api/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test-employer@example.com",
    "password": "SecurePass123"
  }' \
  -c cookies.txt \
  -b cookies.txt \
  -w "\nStatus: %{http_code}\n\n"

# Test 7: Create a job (protected)
echo -e "${BLUE}Test 7: POST /api/jobs - Create job (requires auth)${NC}"
JOB_RESPONSE=$(curl -X POST "$BASE_URL/api/jobs" \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "title": "Senior Full Stack Developer",
    "description": "We are seeking an experienced full stack developer to join our team.",
    "requirements": "5+ years of experience with React, Node.js, and TypeScript. Strong communication skills.",
    "responsibilities": "Lead development of new features, mentor junior developers, conduct code reviews.",
    "type": "FULL_TIME",
    "location": "San Francisco, CA",
    "remote": true,
    "salaryMin": 120000,
    "salaryMax": 180000,
    "experienceLevel": "SENIOR_LEVEL",
    "skills": ["React", "Node.js", "TypeScript", "PostgreSQL", "AWS"],
    "benefits": "Health insurance, 401k matching, unlimited PTO, remote work, home office stipend",
    "deadline": "2024-12-31T23:59:59.000Z",
    "slots": 2
  }' \
  -w "\nStatus: %{http_code}\n")
echo "$JOB_RESPONSE"
echo ""

# Extract job ID from response (requires jq)
JOB_ID=$(echo "$JOB_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | sed 's/"id":"\(.*\)"/\1/')

if [ -n "$JOB_ID" ]; then
  echo -e "${GREEN}Created job with ID: $JOB_ID${NC}"
  echo ""

  # Test 8: Get single job
  echo -e "${BLUE}Test 8: GET /api/jobs/$JOB_ID - Get single job${NC}"
  curl -X GET "$BASE_URL/api/jobs/$JOB_ID" \
    -H "Content-Type: application/json" \
    -w "\nStatus: %{http_code}\n\n"

  # Test 9: Update job to ACTIVE
  echo -e "${BLUE}Test 9: PATCH /api/jobs/$JOB_ID - Update job to ACTIVE${NC}"
  curl -X PATCH "$BASE_URL/api/jobs/$JOB_ID" \
    -H "Content-Type: application/json" \
    -b cookies.txt \
    -d '{
      "status": "ACTIVE",
      "salaryMax": 190000
    }' \
    -w "\nStatus: %{http_code}\n\n"

  # Test 10: Update job (unauthorized attempt)
  echo -e "${BLUE}Test 10: PATCH /api/jobs/$JOB_ID - Update without auth (should fail)${NC}"
  curl -X PATCH "$BASE_URL/api/jobs/$JOB_ID" \
    -H "Content-Type: application/json" \
    -d '{"title": "Hacked"}' \
    -w "\nStatus: %{http_code}\n\n"

  # Test 11: Get job again (should show updated values)
  echo -e "${BLUE}Test 11: GET /api/jobs/$JOB_ID - Verify updates${NC}"
  curl -X GET "$BASE_URL/api/jobs/$JOB_ID" \
    -H "Content-Type: application/json" \
    -w "\nStatus: %{http_code}\n\n"

  # Test 12: Delete job (soft delete)
  echo -e "${BLUE}Test 12: DELETE /api/jobs/$JOB_ID - Soft delete job${NC}"
  curl -X DELETE "$BASE_URL/api/jobs/$JOB_ID" \
    -b cookies.txt \
    -w "\nStatus: %{http_code}\n\n"
else
  echo -e "${RED}Failed to create job or extract job ID${NC}"
fi

# Clean up
rm -f cookies.txt

echo "========================================"
echo "Tests completed!"
echo "========================================"
