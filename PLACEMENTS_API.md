# Placements & Billing API Documentation

Complete guide for the placement and billing management system in the Job Portal Backend.

## Table of Contents
1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [API Endpoints](#api-endpoints)
4. [Payment Processing](#payment-processing)
5. [Invoice Generation](#invoice-generation)
6. [Integration Examples](#integration-examples)
7. [Business Logic](#business-logic)

---

## Overview

The Placements API manages the complete lifecycle of candidate placements, from hire to payment completion. It includes:

- **Placement creation** when a candidate is hired
- **Payment tracking** with split payment model (50% upfront, 50% after 30 days)
- **Guarantee period** management (default 90 days)
- **Invoice generation** for billing
- **Automated fee calculation** (default 18% of annual salary)
- **Integration with Stripe** for online payments
- **Manual payment recording** for offline transactions

### Key Features

✅ **18% Placement Fee** (configurable per placement)
✅ **50/50 Payment Split** (upfront + 30 days)
✅ **90-Day Guarantee Period** (configurable)
✅ **Automatic Application Updates** (marks application as ACCEPTED)
✅ **Candidate Status Management** (sets availability to false)
✅ **Employer Total Spend Tracking**
✅ **Role-Based Access Control**
✅ **Invoice Generation** (HTML/PDF ready)

---

## Database Schema

### Placement Model

```prisma
model Placement {
  id              String          @id @default(cuid())
  candidateId     String
  employerId      String?
  jobId           String?
  jobTitle        String
  companyName     String
  startDate       DateTime
  endDate         DateTime?
  salary          Int?            // Annual salary in cents
  status          PlacementStatus @default(PENDING)
  notes           String?         @db.Text

  // Payment fields
  paymentStatus   PaymentStatus   @default(PENDING)
  placementFee    Int?            // Total fee in cents (18% of salary)
  feePercentage   Float           @default(18)
  upfrontAmount   Int?            // 50% upfront
  remainingAmount Int?            // 50% remaining
  upfrontPaidAt   DateTime?
  remainingPaidAt DateTime?
  stripePaymentIntentId String?
  stripePaymentIntentId2 String?

  // Guarantee period
  guaranteePeriodDays Int         @default(90)
  guaranteeEndDate    DateTime?

  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  // Relations
  candidate       Candidate       @relation(...)
  employer        Employer?       @relation(...)
  job             Job?            @relation(...)
}
```

### Enums

```typescript
enum PlacementStatus {
  PENDING     // Placement created, awaiting confirmation
  CONFIRMED   // Placement confirmed, candidate started
  COMPLETED   // Placement completed successfully
  CANCELLED   // Placement cancelled
}

enum PaymentStatus {
  PENDING       // No payment made
  UPFRONT_PAID  // 50% upfront paid
  FULLY_PAID    // Both payments completed
  FAILED        // Payment failed
}
```

### Employer Total Spend

```prisma
model Employer {
  // ... other fields
  totalSpent Int @default(0) // Total spent on placements in cents
}
```

---

## API Endpoints

### 1. Create Placement

**Endpoint:** `POST /api/placements`
**Auth:** Required (EMPLOYER or ADMIN)

Creates a new placement record when a candidate is hired.

**Request Body:**
```json
{
  "candidateId": "clj123...",
  "jobId": "clk456..." (optional),
  "jobTitle": "Senior Software Engineer",
  "companyName": "Acme Corp" (optional, defaults to employer's company),
  "startDate": "2025-02-01T00:00:00.000Z",
  "salary": 12000000 (in cents = $120,000),
  "feePercentage": 18 (optional, default 18),
  "guaranteePeriodDays": 90 (optional, default 90),
  "notes": "Remote position" (optional)
}
```

**Response (201 Created):**
```json
{
  "message": "Placement created successfully",
  "placement": {
    "id": "clm789...",
    "candidateId": "clj123...",
    "employerId": "cle456...",
    "jobId": "clk456...",
    "jobTitle": "Senior Software Engineer",
    "companyName": "Acme Corp",
    "startDate": "2025-02-01T00:00:00.000Z",
    "salary": 12000000,
    "feePercentage": 18,
    "placementFee": 2160000 (18% of 12M = $21,600),
    "upfrontAmount": 1080000 ($10,800),
    "remainingAmount": 1080000 ($10,800),
    "status": "PENDING",
    "paymentStatus": "PENDING",
    "guaranteePeriodDays": 90,
    "guaranteeEndDate": "2025-05-02T00:00:00.000Z",
    "createdAt": "2025-01-15T10:00:00.000Z",
    "candidate": { ... },
    "employer": { ... },
    "job": { ... }
  },
  "paymentSchedule": {
    "upfrontPayment": {
      "amount": 1080000,
      "dueDate": "2025-02-01T00:00:00.000Z",
      "status": "pending"
    },
    "remainingPayment": {
      "amount": 1080000,
      "dueDate": "2025-03-03T00:00:00.000Z" (30 days later),
      "status": "pending"
    }
  },
  "guaranteePeriod": {
    "days": 90,
    "endDate": "2025-05-02T00:00:00.000Z"
  }
}
```

**What Happens:**
1. ✅ Placement record created
2. ✅ Placement fee calculated (18% of salary)
3. ✅ Fee split into 50/50 (upfront + remaining)
4. ✅ Guarantee end date calculated (start + 90 days)
5. ✅ If jobId provided, application status updated to ACCEPTED
6. ✅ Candidate availability set to false

---

### 2. List Placements

**Endpoint:** `GET /api/placements`
**Auth:** Required (any role)

Lists placements with role-based filtering and pagination.

**Query Parameters:**
- `status` - Filter by placement status (PENDING, CONFIRMED, COMPLETED, CANCELLED)
- `paymentStatus` - Filter by payment status (PENDING, UPFRONT_PAID, FULLY_PAID, FAILED)
- `candidateId` - Filter by candidate (ADMIN only)
- `employerId` - Filter by employer (ADMIN only)
- `page` - Page number (default 1)
- `limit` - Items per page (default 20, max 100)

**Request:**
```http
GET /api/placements?status=CONFIRMED&paymentStatus=UPFRONT_PAID&page=1&limit=20
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "placements": [
    {
      "id": "clm789...",
      "jobTitle": "Senior Software Engineer",
      "companyName": "Acme Corp",
      "startDate": "2025-02-01T00:00:00.000Z",
      "salary": 12000000,
      "placementFee": 2160000,
      "status": "CONFIRMED",
      "paymentStatus": "UPFRONT_PAID",
      "upfrontPaidAt": "2025-02-01T10:00:00.000Z",
      "candidate": {
        "id": "clj123...",
        "user": {
          "name": "John Doe",
          "email": "john@example.com"
        }
      },
      "employer": {
        "id": "cle456...",
        "companyName": "Acme Corp",
        "user": {
          "name": "Jane Smith",
          "email": "jane@acme.com"
        }
      },
      "job": {
        "id": "clk456...",
        "title": "Senior Software Engineer",
        "type": "FULL_TIME"
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3,
    "hasNext": true,
    "hasPrev": false
  }
}
```

**Access Control:**
- **CANDIDATE**: See only their own placements
- **EMPLOYER**: See only their company's placements
- **ADMIN**: See all placements

---

### 3. Get Placement Details

**Endpoint:** `GET /api/placements/[id]`
**Auth:** Required (owner or ADMIN)

Gets detailed placement information including payment schedule and guarantee period.

**Request:**
```http
GET /api/placements/clm789...
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "placement": {
    "id": "clm789...",
    "candidateId": "clj123...",
    "employerId": "cle456...",
    "jobId": "clk456...",
    "jobTitle": "Senior Software Engineer",
    "companyName": "Acme Corp",
    "startDate": "2025-02-01T00:00:00.000Z",
    "endDate": null,
    "salary": 12000000,
    "status": "CONFIRMED",
    "paymentStatus": "UPFRONT_PAID",
    "feePercentage": 18,
    "placementFee": 2160000,
    "guaranteePeriodDays": 90,
    "guaranteeEndDate": "2025-05-02T00:00:00.000Z",

    "paymentSchedule": {
      "upfrontPayment": {
        "amount": 1080000,
        "amountFormatted": "$10,800.00",
        "dueDate": "2025-02-01T00:00:00.000Z",
        "paidAt": "2025-02-01T10:00:00.000Z",
        "status": "paid",
        "paymentIntentId": "pi_ABC123"
      },
      "remainingPayment": {
        "amount": 1080000,
        "amountFormatted": "$10,800.00",
        "dueDate": "2025-03-03T00:00:00.000Z",
        "paidAt": null,
        "status": "pending",
        "paymentIntentId": null
      },
      "total": {
        "amount": 2160000,
        "amountFormatted": "$21,600.00",
        "paid": 1080000,
        "paidFormatted": "$10,800.00",
        "remaining": 1080000,
        "remainingFormatted": "$10,800.00"
      }
    },

    "guaranteeInfo": {
      "days": 90,
      "startDate": "2025-02-01T00:00:00.000Z",
      "endDate": "2025-05-02T00:00:00.000Z",
      "daysRemaining": 77,
      "isActive": true,
      "hasExpired": false
    },

    "placementDuration": {
      "startDate": "2025-02-01T00:00:00.000Z",
      "endDate": null,
      "daysActive": 13,
      "isActive": true
    },

    "salaryInfo": {
      "annual": 12000000,
      "annualFormatted": "$120,000.00",
      "monthly": 1000000,
      "monthlyFormatted": "$10,000.00",
      "feePercentage": 18,
      "placementFee": 2160000,
      "placementFeeFormatted": "$21,600.00"
    },

    "candidate": { ... },
    "employer": { ... },
    "job": { ... }
  }
}
```

---

### 4. Update Placement

**Endpoint:** `PATCH /api/placements/[id]`
**Auth:** Required (EMPLOYER or ADMIN)

Updates placement details.

**Request Body:**
```json
{
  "status": "COMPLETED" (optional),
  "endDate": "2025-12-31T00:00:00.000Z" (optional),
  "notes": "Candidate performed excellently" (optional)
}
```

**Response (200 OK):**
```json
{
  "message": "Placement updated successfully",
  "placement": { ... }
}
```

**Notes:**
- Setting `status` to COMPLETED automatically sets `endDate` if not provided
- Setting `endDate` updates candidate availability to true

---

### 5. Cancel Placement

**Endpoint:** `DELETE /api/placements/[id]`
**Auth:** Required (EMPLOYER or ADMIN)

Cancels a placement (soft delete).

**Request:**
```http
DELETE /api/placements/clm789...
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "message": "Placement cancelled successfully",
  "placement": {
    "id": "clm789...",
    "status": "CANCELLED",
    "endDate": "2025-01-15T10:00:00.000Z"
  }
}
```

**What Happens:**
1. ✅ Status set to CANCELLED
2. ✅ endDate set to now
3. ✅ Candidate availability set back to true

---

### 6. Record Manual Payment

**Endpoint:** `PATCH /api/placements/[id]/payment`
**Auth:** Required (ADMIN only)

Records a manual payment (cash, check, bank transfer, etc.) for a placement.

**Request Body:**
```json
{
  "paymentType": "upfront" | "remaining" | "full",
  "amount": 1080000 (optional, defaults to expected amount),
  "paymentMethod": "cash" | "check" | "bank_transfer" | "other",
  "transactionId": "CHK-12345" (optional),
  "notes": "Received check payment" (optional)
}
```

**Response (200 OK):**
```json
{
  "message": "Upfront payment (50%) recorded successfully",
  "placement": { ... },
  "payment": {
    "type": "upfront",
    "amount": 1080000,
    "amountFormatted": "$10,800.00",
    "method": "check",
    "transactionId": "CHK-12345",
    "recordedBy": "Admin User",
    "recordedAt": "2025-01-15T10:00:00.000Z"
  }
}
```

**Payment Types:**
- `upfront`: Record 50% upfront payment
- `remaining`: Record 50% remaining payment (requires upfront to be paid first)
- `full`: Record full 100% payment at once

**What Happens:**
1. ✅ Payment status updated
2. ✅ Payment timestamp recorded
3. ✅ Notes added to placement with payment details
4. ✅ If full payment, employer's totalSpent incremented

---

### 7. Get Payment Information

**Endpoint:** `GET /api/placements/[id]/payment`
**Auth:** Required (EMPLOYER or ADMIN)

Gets payment history and status for a placement.

**Request:**
```http
GET /api/placements/clm789.../payment
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "placementId": "clm789...",
  "paymentStatus": "UPFRONT_PAID",
  "summary": {
    "totalDue": 2160000,
    "totalDueFormatted": "$21,600.00",
    "totalPaid": 1080000,
    "totalPaidFormatted": "$10,800.00",
    "remaining": 1080000,
    "remainingFormatted": "$10,800.00",
    "percentagePaid": 50
  },
  "schedule": {
    "upfront": {
      "amount": 1080000,
      "amountFormatted": "$10,800.00",
      "dueDate": "2025-02-01T00:00:00.000Z",
      "paidAt": "2025-02-01T10:00:00.000Z",
      "status": "paid"
    },
    "remaining": {
      "amount": 1080000,
      "amountFormatted": "$10,800.00",
      "dueDate": "2025-03-03T00:00:00.000Z",
      "paidAt": null,
      "status": "pending"
    }
  },
  "history": [
    {
      "type": "upfront",
      "amount": 1080000,
      "amountFormatted": "$10,800.00",
      "paidAt": "2025-02-01T10:00:00.000Z",
      "paymentIntentId": "pi_ABC123",
      "method": "stripe"
    }
  ]
}
```

---

### 8. Generate Invoice

**Endpoint:** `GET /api/placements/[id]/invoice`
**Auth:** Required (EMPLOYER or ADMIN)

Generates an invoice for a placement.

**Query Parameters:**
- `format` - "html" (default) | "json"

**Request:**
```http
GET /api/placements/clm789.../invoice?format=html
Authorization: Bearer {token}
```

**Response (200 OK - HTML):**
Returns a beautifully formatted HTML invoice that can be:
- Viewed in browser
- Printed to PDF (Ctrl+P / Cmd+P)
- Saved as HTML file
- Emailed to client

**Invoice includes:**
- Invoice number (INV-XXXXXXXX)
- Issue date
- Company information (from/to)
- Placement details (candidate, position, salary)
- Payment schedule with status badges
- Totals, paid amount, balance due
- Guarantee period information
- Payment terms

**Response (200 OK - JSON):**
```json
{
  "invoice": {
    "number": "INV-CLM789AB",
    "date": "2025-02-01T10:00:00.000Z",
    "dueDate": "2025-02-01T00:00:00.000Z",
    "status": "UPFRONT_PAID",
    "from": {
      "name": "Job Portal",
      "email": "noreply@jobportal.com",
      "address": "123 Business St, Suite 100\nCity, State 12345"
    },
    "to": {
      "name": "Acme Corp",
      "email": "jane@acme.com",
      "address": "San Francisco, CA"
    },
    "placement": {
      "id": "clm789...",
      "candidate": "John Doe",
      "jobTitle": "Senior Software Engineer",
      "startDate": "2025-02-01T00:00:00.000Z",
      "salary": "$120,000.00",
      "feePercentage": 18
    },
    "lineItems": [
      {
        "description": "Upfront Placement Fee (50%) - Senior Software Engineer",
        "quantity": 1,
        "unitPrice": 1080000,
        "amount": 1080000,
        "status": "Paid",
        "paidDate": "2025-02-01T10:00:00.000Z"
      },
      {
        "description": "Remaining Placement Fee (50%) - Senior Software Engineer",
        "quantity": 1,
        "unitPrice": 1080000,
        "amount": 1080000,
        "status": "Pending",
        "paidDate": null
      }
    ],
    "subtotal": "$21,600.00",
    "tax": "$0.00",
    "total": "$21,600.00",
    "totalPaid": "$10,800.00",
    "balance": "$10,800.00"
  }
}
```

---

## Payment Processing

### Stripe Integration

For online payments via Stripe, use the [Stripe Payments API](STRIPE_PAYMENTS.md):

1. **Create Stripe Customer** (one-time):
   ```http
   POST /api/stripe/create-customer
   ```

2. **Create Payment Intent for Upfront**:
   ```http
   POST /api/stripe/create-payment-intent
   {
     "placementId": "clm789...",
     "paymentType": "upfront"
   }
   ```

3. **Process Payment** (frontend with Stripe Elements)

4. **Webhook confirms payment** → Placement updated automatically

5. **30 days later, create Payment Intent for Remaining**:
   ```http
   POST /api/stripe/create-payment-intent
   {
     "placementId": "clm789...",
     "paymentType": "remaining"
   }
   ```

### Manual Payment Recording

For offline payments (cash, check, wire transfer), use:

```http
PATCH /api/placements/[id]/payment
{
  "paymentType": "upfront",
  "paymentMethod": "check",
  "transactionId": "CHK-12345",
  "notes": "Received check payment on 2025-02-01"
}
```

**Admin only** - ensures proper audit trail.

---

## Invoice Generation

### Printing to PDF

1. Open invoice in browser:
   ```
   GET /api/placements/[id]/invoice
   ```

2. Press Ctrl+P (Windows) or Cmd+P (Mac)

3. Select "Save as PDF" as printer

4. Save PDF file

### Email Invoice

Fetch HTML and send via email service:

```typescript
const response = await fetch(`/api/placements/${id}/invoice`);
const html = await response.text();

await sendEmail({
  to: employer.email,
  subject: `Invoice ${invoiceNumber}`,
  html: html,
});
```

---

## Integration Examples

### Example 1: Hire a Candidate

```typescript
// 1. Candidate accepts offer
await updateApplicationStatus(applicationId, "ACCEPTED");

// 2. Create placement
const placement = await fetch("/api/placements", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    candidateId: "clj123...",
    jobId: "clk456...",
    jobTitle: "Senior Software Engineer",
    startDate: "2025-02-01T00:00:00.000Z",
    salary: 12000000, // $120,000
    feePercentage: 18,
  }),
});

// 3. Request upfront payment
const paymentIntent = await fetch("/api/stripe/create-payment-intent", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    placementId: placement.id,
    paymentType: "upfront",
  }),
});

// 4. Show Stripe payment form with clientSecret
```

### Example 2: Check Payment Status

```typescript
const paymentInfo = await fetch(`/api/placements/${placementId}/payment`, {
  headers: { "Authorization": `Bearer ${token}` },
});

const data = await paymentInfo.json();

if (data.paymentStatus === "UPFRONT_PAID") {
  console.log(`Remaining payment of ${data.summary.remainingFormatted} due on ${data.schedule.remaining.dueDate}`);
}
```

### Example 3: Generate and Download Invoice

```typescript
// Download as HTML
const invoiceUrl = `/api/placements/${placementId}/invoice`;
window.open(invoiceUrl, "_blank"); // Opens in new tab, user can print to PDF

// Or fetch JSON for custom processing
const invoice = await fetch(`${invoiceUrl}?format=json`, {
  headers: { "Authorization": `Bearer ${token}` },
});

const data = await invoice.json();
console.log(`Invoice ${data.invoice.number} - Balance: ${data.invoice.balance}`);
```

---

## Business Logic

### Fee Calculation

```typescript
// Default: 18% of annual salary
const salary = 12000000; // $120,000
const feePercentage = 18;
const placementFee = Math.round(salary * (feePercentage / 100));
// = 2,160,000 cents = $21,600

const upfrontAmount = Math.round(placementFee * 0.5);
// = 1,080,000 cents = $10,800

const remainingAmount = placementFee - upfrontAmount;
// = 1,080,000 cents = $10,800
```

### Payment Schedule

```
Start Date: Feb 1, 2025
  ↓
Upfront Payment Due: Feb 1, 2025 ($10,800)
  ↓
[30 days]
  ↓
Remaining Payment Due: Mar 3, 2025 ($10,800)
  ↓
Guarantee Period: 90 days from start = May 2, 2025
```

### Guarantee Period

- **90 days** from placement start date (default)
- If candidate leaves within guarantee period, employer may be entitled to:
  - Free replacement candidate
  - Partial refund
  - Extended support

### Employer Total Spend

Updated when placement is fully paid:

```typescript
await prisma.employer.update({
  where: { id: employerId },
  data: {
    totalSpent: {
      increment: placementFee, // Add to running total
    },
  },
});
```

Use for:
- Billing reports
- Discount eligibility (e.g., 10+ placements = 5% discount)
- Customer loyalty programs

---

## Error Handling

### Common Errors

**400 Bad Request**
- Missing required fields
- Invalid salary (must be > 0)
- Invalid fee percentage (must be 0-100)
- Payment already recorded

**403 Forbidden**
- Trying to access another employer's placement
- Trying to update placement as non-owner

**404 Not Found**
- Placement not found
- Candidate not found
- Job not found

**409 Conflict**
- Duplicate placement (same candidate + job)

---

## Best Practices

1. **Always validate salary** - ensure it's in cents and > 0
2. **Set realistic guarantee periods** - 90 days is industry standard
3. **Record payments promptly** - keeps records accurate
4. **Generate invoices immediately** - send after each payment
5. **Monitor guarantee period** - track if candidates stay through guarantee
6. **Update candidate availability** - keep candidate pool accurate
7. **Track employer spend** - use for loyalty/discount programs

---

**Last Updated:** January 2025
**Version:** 1.0.0
