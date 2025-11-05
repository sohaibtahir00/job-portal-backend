# Stripe Payment Integration Documentation

Complete guide for the Stripe payment integration in the Job Portal Backend.

## Table of Contents
1. [Overview](#overview)
2. [Setup](#setup)
3. [Payment Flow](#payment-flow)
4. [API Endpoints](#api-endpoints)
5. [Database Schema](#database-schema)
6. [Webhook Configuration](#webhook-configuration)
7. [Testing](#testing)
8. [Error Handling](#error-handling)

---

## Overview

The Job Portal uses Stripe to process placement fees for successful job placements. The payment system implements a **50% upfront + 50% after 30 days** split payment model.

### Key Features
- Split payment structure (50% upfront, 50% remaining)
- Automatic payment tracking
- Webhook-based payment confirmation
- Payment retry functionality
- Revenue analytics and reporting
- Payment reminders for due payments

### Payment Calculation
- **Placement Fee**: 20% of annual salary (configurable)
- **Upfront Amount**: 50% of placement fee
- **Remaining Amount**: 50% of placement fee
- **Remaining Due**: 30 days after upfront payment

**Example:**
```
Annual Salary: $100,000 (10,000,000 cents)
Placement Fee: $20,000 (2,000,000 cents) - 20% of salary
Upfront Payment: $10,000 (1,000,000 cents) - 50% of fee
Remaining Payment: $10,000 (1,000,000 cents) - 50% of fee
Remaining Due Date: 30 days after upfront payment
```

---

## Setup

### 1. Install Stripe Package
```bash
npm install stripe @stripe/stripe-js
```

### 2. Environment Variables
Add the following to your `.env` file:

```env
# Stripe Keys (Get from https://dashboard.stripe.com/apikeys)
STRIPE_SECRET_KEY=sk_test_your_secret_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_publishable_key

# Stripe Webhook Secret (Get from webhook setup)
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

### 3. Stripe Account Setup
1. Create a Stripe account at https://stripe.com
2. Go to **Developers > API keys**
3. Copy your **Secret key** and **Publishable key**
4. For testing, use **Test mode** keys

---

## Payment Flow

### Complete Payment Process

```
1. Employer hires candidate → Application status: ACCEPTED
2. Admin/Employer creates Placement record with salary
3. System calculates placement fee (20% of salary)
4. Split into 50% upfront and 50% remaining

5. UPFRONT PAYMENT:
   a. Employer calls POST /api/stripe/create-customer (if not exists)
   b. Employer calls POST /api/stripe/create-payment-intent { paymentType: "upfront" }
   c. Frontend shows Stripe Elements payment form
   d. User completes payment
   e. Stripe sends webhook → payment_intent.succeeded
   f. System updates: paymentStatus = UPFRONT_PAID, upfrontPaidAt = now()

6. REMAINING PAYMENT (after 30 days):
   a. System sends reminder to employer (via cron job or manual check)
   b. Employer calls POST /api/stripe/create-payment-intent { paymentType: "remaining" }
   c. Frontend shows Stripe Elements payment form
   d. User completes payment
   e. Stripe sends webhook → payment_intent.succeeded
   f. System updates: paymentStatus = FULLY_PAID, remainingPaidAt = now()
```

### Payment Status Lifecycle

```
PENDING → UPFRONT_PAID → FULLY_PAID
   ↓
 FAILED (on payment failure)
```

---

## API Endpoints

### 1. Create Stripe Customer

**Endpoint:** `POST /api/stripe/create-customer`
**Auth:** Required (EMPLOYER or ADMIN)

Creates a Stripe customer for the employer. This should be called once per employer before processing any payments.

**Request:**
```http
POST /api/stripe/create-customer
Authorization: Bearer {token}
```

**Response (201 Created):**
```json
{
  "message": "Stripe customer created successfully",
  "customerId": "cus_ABC123xyz",
  "customer": {
    "id": "cus_ABC123xyz",
    "email": "company@example.com",
    "name": "Acme Corporation"
  }
}
```

**Response (200 OK) - Customer already exists:**
```json
{
  "customerId": "cus_ABC123xyz",
  "message": "Stripe customer already exists",
  "customer": {
    "id": "cus_ABC123xyz",
    "email": "company@example.com",
    "name": "Acme Corporation"
  }
}
```

---

### 2. Get Stripe Customer

**Endpoint:** `GET /api/stripe/create-customer`
**Auth:** Required (EMPLOYER or ADMIN)

Retrieves the current employer's Stripe customer information.

**Request:**
```http
GET /api/stripe/create-customer
Authorization: Bearer {token}
```

**Response (200 OK):**
```json
{
  "hasCustomer": true,
  "customerId": "cus_ABC123xyz",
  "customer": {
    "id": "cus_ABC123xyz",
    "email": "company@example.com",
    "name": "Acme Corporation",
    "created": "2025-01-15T10:30:00.000Z"
  }
}
```

---

### 3. Create Payment Intent

**Endpoint:** `POST /api/stripe/create-payment-intent`
**Auth:** Required (EMPLOYER or ADMIN)

Creates a Stripe Payment Intent for a placement fee payment.

**Request:**
```http
POST /api/stripe/create-payment-intent
Authorization: Bearer {token}
Content-Type: application/json

{
  "placementId": "cljk1234567890",
  "paymentType": "upfront"
}
```

**Request Body:**
- `placementId` (string, required): ID of the placement
- `paymentType` (string, required): Either "upfront" or "remaining"

**Response (201 Created):**
```json
{
  "message": "Payment intent created successfully",
  "clientSecret": "pi_ABC123_secret_xyz",
  "paymentIntentId": "pi_ABC123",
  "amount": 1000000,
  "currency": "usd",
  "paymentType": "upfront",
  "placement": {
    "id": "cljk1234567890",
    "jobTitle": "Senior Developer",
    "companyName": "Acme Corporation",
    "salary": 10000000,
    "placementFee": 2000000,
    "upfrontAmount": 1000000,
    "remainingAmount": 1000000,
    "paymentStatus": "PENDING"
  }
}
```

**Amounts are in cents:**
- `amount: 1000000` = $10,000.00
- `salary: 10000000` = $100,000.00

**Error Responses:**

Missing Stripe customer (400):
```json
{
  "error": "No Stripe customer found. Please create a customer first.",
  "action": "Call POST /api/stripe/create-customer first"
}
```

Already paid (400):
```json
{
  "error": "Upfront payment has already been completed",
  "paidAt": "2025-01-15T10:30:00.000Z"
}
```

Invalid payment type (400):
```json
{
  "error": "paymentType must be 'upfront' or 'remaining'"
}
```

Remaining payment not eligible (400):
```json
{
  "error": "Upfront payment must be completed before paying the remaining amount",
  "paymentStatus": "PENDING"
}
```

---

### 4. Stripe Webhooks

**Endpoint:** `POST /api/webhooks/stripe`
**Auth:** None (validates webhook signature)

Handles Stripe webhook events. This endpoint is called by Stripe when payment events occur.

**⚠️ Important:** This endpoint is excluded from authentication middleware to allow Stripe to call it.

**Events Handled:**
- `payment_intent.succeeded`: Payment completed successfully
- `payment_intent.payment_failed`: Payment failed

**Webhook Payload (from Stripe):**
```json
{
  "id": "evt_ABC123",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_ABC123",
      "amount": 1000000,
      "currency": "usd",
      "status": "succeeded",
      "metadata": {
        "placementId": "cljk1234567890",
        "paymentType": "upfront",
        "candidateId": "...",
        "employerId": "...",
        "jobTitle": "Senior Developer",
        "companyName": "Acme Corporation"
      }
    }
  }
}
```

**Response:**
```json
{
  "received": true
}
```

**What Happens on Success:**
- Updates placement record in database
- Sets `upfrontPaidAt` or `remainingPaidAt` timestamp
- Updates `paymentStatus` to `UPFRONT_PAID` or `FULLY_PAID`
- Logs payment completion

**What Happens on Failure:**
- Sets `paymentStatus` to `FAILED`
- Logs error details
- (Future: Send notification to employer)

---

## Database Schema

### Employer Model Changes

```prisma
model Employer {
  // ... existing fields ...

  stripeCustomerId String? @unique // Stripe customer ID

  // ... relations ...

  @@index([stripeCustomerId])
}
```

### Placement Model Changes

```prisma
enum PaymentStatus {
  PENDING       // No payment made yet
  UPFRONT_PAID  // 50% upfront paid
  FULLY_PAID    // Both payments completed
  FAILED        // Payment failed
}

model Placement {
  // ... existing fields ...

  // Payment fields
  paymentStatus          PaymentStatus @default(PENDING)
  placementFee           Int?          // Total placement fee in cents
  upfrontAmount          Int?          // 50% upfront payment in cents
  remainingAmount        Int?          // 50% remaining payment in cents
  upfrontPaidAt          DateTime?     // When upfront payment completed
  remainingPaidAt        DateTime?     // When remaining payment completed
  stripePaymentIntentId  String?       // Payment Intent ID for upfront
  stripePaymentIntentId2 String?       // Payment Intent ID for remaining

  @@index([paymentStatus])
}
```

### Running Migrations

After schema changes:
```bash
npx prisma generate
npx prisma migrate dev --name add_payment_fields
```

---

## Webhook Configuration

### 1. Set Up Webhook in Stripe Dashboard

1. Go to https://dashboard.stripe.com/webhooks
2. Click **"Add endpoint"**
3. Enter your endpoint URL:
   - **Development:** `https://your-ngrok-url.ngrok.io/api/webhooks/stripe`
   - **Production:** `https://yourdomain.com/api/webhooks/stripe`

4. Select events to listen to:
   - ✅ `payment_intent.succeeded`
   - ✅ `payment_intent.payment_failed`

5. Click **"Add endpoint"**
6. Copy the **Signing secret** (starts with `whsec_`)
7. Add to `.env`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```

### 2. Test Webhooks Locally with Stripe CLI

Install Stripe CLI:
```bash
# macOS
brew install stripe/stripe-cli/stripe

# Windows
scoop install stripe

# Linux
# Download from https://github.com/stripe/stripe-cli/releases
```

Forward webhooks to local server:
```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

This will output a webhook signing secret. Use it in your `.env`:
```env
STRIPE_WEBHOOK_SECRET=whsec_xxx_from_stripe_cli
```

### 3. Test Webhook Events

Trigger test events:
```bash
# Test successful payment
stripe trigger payment_intent.succeeded

# Test failed payment
stripe trigger payment_intent.payment_failed
```

---

## Testing

### Manual Testing Flow

#### 1. Create Employer and Placement

```http
# 1. Register as employer
POST /api/auth/register
{
  "email": "employer@test.com",
  "password": "Test1234",
  "name": "Test Employer",
  "role": "EMPLOYER"
}

# 2. Create employer profile
POST /api/employers/profile
{
  "companyName": "Test Company",
  "industry": "Technology"
}

# 3. Create a placement (as admin or through application flow)
# This would typically happen after a candidate accepts an offer
```

#### 2. Create Stripe Customer

```http
POST /api/stripe/create-customer
Authorization: Bearer {employer_token}
```

Save the `customerId` from response.

#### 3. Create Payment Intent for Upfront Payment

```http
POST /api/stripe/create-payment-intent
Authorization: Bearer {employer_token}
Content-Type: application/json

{
  "placementId": "placement_id_here",
  "paymentType": "upfront"
}
```

Save the `clientSecret` from response.

#### 4. Test Payment in Frontend

Use Stripe Elements to complete payment with test cards:

**Successful Payment:**
- Card: `4242 4242 4242 4242`
- Expiry: Any future date (e.g., 12/34)
- CVC: Any 3 digits (e.g., 123)
- ZIP: Any 5 digits (e.g., 12345)

**Failed Payment:**
- Card: `4000 0000 0000 0002` (card declined)

#### 5. Verify Webhook Received

Check your server logs:
```
Received webhook event: payment_intent.succeeded
Processing successful payment for placement {id}, type: upfront
Upfront payment completed for placement {id}
```

#### 6. Verify Database Update

```http
GET /api/candidates/profile
Authorization: Bearer {candidate_token}
```

Check the placement object:
```json
{
  "paymentStatus": "UPFRONT_PAID",
  "upfrontPaidAt": "2025-01-15T10:30:00.000Z",
  "upfrontAmount": 1000000
}
```

#### 7. Create Payment Intent for Remaining Payment

Wait 30 days (or test immediately by calling the API):

```http
POST /api/stripe/create-payment-intent
Authorization: Bearer {employer_token}
Content-Type: application/json

{
  "placementId": "placement_id_here",
  "paymentType": "remaining"
}
```

#### 8. Complete Remaining Payment

Use Stripe Elements again with the new `clientSecret`.

#### 9. Verify Final Status

```json
{
  "paymentStatus": "FULLY_PAID",
  "upfrontPaidAt": "2025-01-15T10:30:00.000Z",
  "remainingPaidAt": "2025-02-14T15:45:00.000Z"
}
```

---

## Error Handling

### Common Errors and Solutions

#### 1. Missing Stripe Customer

**Error:**
```json
{
  "error": "No Stripe customer found. Please create a customer first.",
  "action": "Call POST /api/stripe/create-customer first"
}
```

**Solution:** Call `POST /api/stripe/create-customer` before creating payment intent.

---

#### 2. Webhook Signature Verification Failed

**Error:**
```json
{
  "error": "Webhook signature verification failed: ..."
}
```

**Causes:**
- Incorrect `STRIPE_WEBHOOK_SECRET` in `.env`
- Webhook secret from wrong Stripe environment (test vs production)
- Request not from Stripe

**Solutions:**
1. Verify webhook secret in Stripe Dashboard
2. Ensure using correct test/live mode secret
3. Use Stripe CLI for local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`

---

#### 3. Payment Already Completed

**Error:**
```json
{
  "error": "Upfront payment has already been completed",
  "paidAt": "2025-01-15T10:30:00.000Z"
}
```

**Solution:** This is expected behavior. Check `paymentStatus` before attempting payment.

---

#### 4. Remaining Payment Before Upfront

**Error:**
```json
{
  "error": "Upfront payment must be completed before paying the remaining amount",
  "paymentStatus": "PENDING"
}
```

**Solution:** Complete upfront payment first, then pay remaining amount.

---

#### 5. Placement Not Found

**Error:**
```json
{
  "error": "Placement not found"
}
```

**Causes:**
- Invalid `placementId`
- Placement deleted
- Placement belongs to different employer

**Solution:** Verify placement exists and belongs to authenticated employer.

---

#### 6. Payment Failed (Stripe webhook)

**Webhook Event:** `payment_intent.payment_failed`

**System Response:**
- Sets `paymentStatus` to `FAILED`
- Logs failure details

**Solution for Employer:**
1. Check payment method (card declined, insufficient funds, etc.)
2. Use payment helper: `retryFailedPayment(placementId, paymentType)`
3. Create new payment intent and retry

---

## Helper Functions

The system includes helper functions in `/src/lib/payments.ts`:

### getPlacementPaymentDetails
```typescript
const details = await getPlacementPaymentDetails(placementId);
console.log(details);
// {
//   placementId: "...",
//   salary: 10000000,
//   placementFee: 2000000,
//   upfrontAmount: 1000000,
//   remainingAmount: 1000000,
//   paymentStatus: "UPFRONT_PAID",
//   upfrontPaidAt: Date,
//   remainingDueDate: Date (30 days after upfront)
// }
```

### isPlacementEligibleForPayment
```typescript
const result = await isPlacementEligibleForPayment(placementId, "upfront");
console.log(result);
// { eligible: true }
// OR
// { eligible: false, reason: "Upfront payment already completed" }
```

### getPendingPaymentsForEmployer
```typescript
const pending = await getPendingPaymentsForEmployer(employerId);
// Returns array of placements with pending payments
```

### getUpcomingPaymentReminders
```typescript
const reminders = await getUpcomingPaymentReminders(7); // next 7 days
// Returns placements with remaining payments due soon
```

### calculatePlacementRevenue
```typescript
const revenue = await calculatePlacementRevenue(employerId);
console.log(revenue);
// {
//   totalRevenue: 5000000,
//   upfrontRevenue: 3000000,
//   remainingRevenue: 2000000,
//   placementCount: 5,
//   fullyPaidCount: 2
// }
```

### retryFailedPayment
```typescript
await retryFailedPayment(placementId, "upfront");
// Resets payment status to allow retry
```

---

## Production Deployment

### 1. Switch to Live Mode

1. In Stripe Dashboard, toggle to **Live mode**
2. Get production API keys from **Developers > API keys**
3. Update production environment variables:
   ```env
   STRIPE_SECRET_KEY=sk_live_your_live_key
   STRIPE_PUBLISHABLE_KEY=pk_live_your_live_key
   ```

### 2. Configure Production Webhook

1. Add webhook endpoint in Live mode
2. URL: `https://yourdomain.com/api/webhooks/stripe`
3. Select same events: `payment_intent.succeeded`, `payment_intent.payment_failed`
4. Get live webhook secret
5. Update:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_your_live_webhook_secret
   ```

### 3. Enable Stripe Features

Consider enabling:
- **Radar** for fraud detection
- **Billing** for subscription management (if adding subscription model)
- **Connect** if adding marketplace features

### 4. Compliance

- Ensure PCI compliance (Stripe Elements handles most of this)
- Add privacy policy link
- Add terms of service
- Include refund policy

---

## Security Best Practices

1. **Never expose secret keys**
   - Keep `STRIPE_SECRET_KEY` server-side only
   - Use `STRIPE_PUBLISHABLE_KEY` on frontend
   - Never commit keys to git

2. **Verify webhook signatures**
   - Always validate `stripe-signature` header
   - Use `constructEvent()` to verify authenticity

3. **Validate amounts server-side**
   - Never trust payment amounts from client
   - Always calculate fees server-side

4. **Use idempotency**
   - Payment intents are idempotent by nature
   - Check for existing payment intents before creating new ones

5. **Handle errors gracefully**
   - Catch and log all Stripe errors
   - Provide clear error messages to users
   - Implement retry logic for network errors

---

## Support and Resources

- **Stripe Documentation:** https://stripe.com/docs
- **Stripe API Reference:** https://stripe.com/docs/api
- **Stripe Testing:** https://stripe.com/docs/testing
- **Stripe Dashboard:** https://dashboard.stripe.com
- **Stripe Support:** https://support.stripe.com

---

## Future Enhancements

Potential improvements to consider:

1. **Automated Payment Reminders**
   - Implement cron job to check upcoming payments
   - Send email reminders 7 days before remaining payment due
   - Send overdue notifications

2. **Payment Plans**
   - Allow custom payment schedules
   - Monthly installments for large placement fees
   - Early payment discounts

3. **Refund Handling**
   - Implement refund API endpoints
   - Handle partial/full refunds
   - Update placement status on refund

4. **Payment Analytics Dashboard**
   - Revenue trends and forecasting
   - Payment success/failure rates
   - Average payment processing time

5. **Subscription Model**
   - Monthly employer subscriptions
   - Tiered pricing plans
   - Unlimited placements for premium tier

6. **Multi-Currency Support**
   - Support payments in different currencies
   - Automatic currency conversion
   - Regional pricing

7. **Invoice Generation**
   - Generate PDF invoices for payments
   - Email invoices to employers
   - Tax calculation integration

---

**Last Updated:** January 2025
**Version:** 1.0.0
**Stripe API Version:** 2025-10-29.clover
