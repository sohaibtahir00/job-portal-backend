# Job Portal Backend

A comprehensive job portal backend built with Next.js 14, TypeScript, Prisma ORM, and PostgreSQL.

## Features

- **User Management**: Multi-role authentication (Admin, Employer, Candidate)
- **Job Listings**: Full CRUD operations for job postings
- **Application Tracking**: Complete application lifecycle management
- **Testing System**: Integrated candidate testing and evaluation
- **Placement Management**: Track successful placements
- **Email Notifications**: Automated transactional emails with Resend
- **Payment Processing**: Stripe integration with split payment model
- **Messaging**: Internal messaging system between users
- **Email Campaigns**: Bulk email functionality for employers
- **Referral System**: Built-in referral tracking with rewards
- **Blog Platform**: Content management for job-related articles

## Tech Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Database**: PostgreSQL (Railway)
- **ORM**: Prisma
- **Authentication**: NextAuth.js with JWT + bcrypt
- **Payment**: Stripe
- **Email**: Resend
- **Forms**: React Hook Form + Zod validation
- **Date Utils**: date-fns

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Railway account (for PostgreSQL database)
- Stripe account (for payment processing)
- Resend account (for email functionality)

### Installation

1. **Clone or navigate to the repository**
   ```bash
   cd job-portal-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Copy the `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

   Then update the `.env` file with your actual credentials (see below for Railway setup).

### Railway PostgreSQL Database Setup

Follow these steps to set up your Railway PostgreSQL database:

#### 1. Create a Railway Account
- Go to [Railway.app](https://railway.app)
- Sign up or log in with GitHub

#### 2. Create a New Project
- Click "New Project"
- Select "Provision PostgreSQL"
- Railway will automatically create a PostgreSQL database

#### 3. Get Database Credentials
- Click on your PostgreSQL service
- Go to the "Variables" tab
- You'll see these environment variables:
  - `PGHOST` - Database host
  - `PGPORT` - Database port (usually 5432)
  - `PGUSER` - Database username (usually postgres)
  - `PGPASSWORD` - Database password
  - `PGDATABASE` - Database name (usually railway)
  - `DATABASE_URL` - **Copy this complete connection string**

#### 4. Update Your .env File
Replace the `DATABASE_URL` in your `.env` file with the Railway connection string:

```env
DATABASE_URL="postgresql://postgres:PASSWORD@RAILWAY_HOST:PORT/railway"
```

Or use the complete `DATABASE_URL` from Railway which looks like:
```env
DATABASE_URL="postgresql://postgres:A1B2C3...@viaduct.proxy.rlwy.net:12345/railway"
```

#### 5. Run Database Migrations
Once your DATABASE_URL is set, run the following commands:

```bash
# Generate Prisma Client
npx prisma generate

# Create and run the initial migration
npx prisma migrate dev --name init

# (Optional) Open Prisma Studio to view your database
npx prisma studio
```

#### 6. Verify Connection
Test your database connection:
```bash
npx prisma db push
```

If successful, your database is properly configured!

### Environment Variables Reference

```env
# Database - Railway PostgreSQL
DATABASE_URL="postgresql://postgres:PASSWORD@HOST:PORT/railway"

# Stripe - Get from https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_PUBLISHABLE_KEY="pk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."

# Resend - Get from https://resend.com/api-keys
RESEND_API_KEY="re_..."

# NextAuth - For authentication
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-with: openssl rand -base64 32"

# Application
NODE_ENV="development"
```

### Generate NextAuth Secret

Generate a secure secret for NextAuth:
```bash
# On Linux/Mac
openssl rand -base64 32

# On Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }))
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Database Commands

```bash
# Generate Prisma Client after schema changes
npx prisma generate

# Create a new migration
npx prisma migrate dev --name your_migration_name

# Apply migrations to production
npx prisma migrate deploy

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Open Prisma Studio (Database GUI)
npx prisma studio

# Format schema file
npx prisma format
```

## Project Structure

```
job-portal-backend/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Database migrations
├── src/
│   ├── app/
│   │   ├── api/              # API routes
│   │   ├── layout.tsx        # Root layout
│   │   └── page.tsx          # Home page
│   └── lib/
│       └── prisma.ts         # Prisma client singleton
├── .env                      # Environment variables (gitignored)
├── .env.example              # Environment variables template
└── package.json
```

## Database Schema

The application includes the following models:

- **User**: Base user authentication and profile
- **Candidate**: Job seeker profiles with skills, resume, etc.
- **Employer**: Company profiles and verification
- **Job**: Job postings with requirements and details
- **Application**: Job applications with status tracking
- **TestResult**: Candidate assessment results
- **Placement**: Successful job placements
- **Message**: Internal messaging system
- **EmailCampaign**: Bulk email campaigns
- **Referral**: Referral tracking with rewards
- **BlogPost**: Blog content management

## API Routes

API routes are located in `src/app/api/`:

### Authentication
```
GET/POST /api/auth/[...nextauth]  # NextAuth.js authentication
POST     /api/auth/register       # User registration
```

### User Profile
```
GET   /api/profile                # Get current user profile - Protected
PATCH /api/profile                # Update user profile - Protected
```

### Jobs (✅ Implemented)
```
GET    /api/jobs                  # List all jobs with filters & pagination
POST   /api/jobs                  # Create new job - Protected (EMPLOYER/ADMIN)
GET    /api/jobs/[id]             # Get single job details
PATCH  /api/jobs/[id]             # Update job - Protected (Owner/ADMIN)
DELETE /api/jobs/[id]             # Soft delete job - Protected (Owner/ADMIN)
POST   /api/jobs/[id]/claim       # Claim aggregated job - Protected (EMPLOYER)
```

**📖 [View Complete Jobs API Documentation](JOBS_API.md)**

### Candidates (✅ Implemented)
```
GET    /api/candidates/profile           # Get candidate profile - Protected (CANDIDATE/ADMIN)
POST   /api/candidates/profile           # Create candidate profile - Protected (CANDIDATE/ADMIN)
PATCH  /api/candidates/profile           # Update candidate profile - Protected (CANDIDATE/ADMIN)
POST   /api/candidates/resume            # Upload resume - Protected (CANDIDATE/ADMIN)
DELETE /api/candidates/resume            # Delete resume - Protected (CANDIDATE/ADMIN)
GET    /api/candidates/[id]              # Get public candidate profile
PATCH  /api/candidates/profile/status    # Update availability status - Protected (CANDIDATE/ADMIN)
```

**📖 [View Complete Candidates API Documentation](CANDIDATES_API.md)**

### Applications (✅ Implemented)
```
POST   /api/applications                 # Submit application - Protected (CANDIDATE/ADMIN)
GET    /api/applications                 # List applications - Protected (role-based)
GET    /api/applications/[id]            # Get single application - Protected
DELETE /api/applications/[id]            # Withdraw application - Protected (CANDIDATE/ADMIN)
PATCH  /api/applications/[id]/status     # Update status - Protected (EMPLOYER/ADMIN)
POST   /api/applications/[id]/notes      # Add notes - Protected (EMPLOYER/ADMIN)
GET    /api/applications/[id]/notes      # Get notes - Protected (EMPLOYER/ADMIN)
```

**📖 [View Complete Applications API Documentation](APPLICATIONS_API.md)**

### Employers (✅ Implemented)
```
GET    /api/employers/profile       # Get employer profile - Protected (EMPLOYER/ADMIN)
POST   /api/employers/profile       # Create employer profile - Protected (EMPLOYER/ADMIN)
PATCH  /api/employers/profile       # Update employer profile - Protected (EMPLOYER/ADMIN)
GET    /api/employers/stats         # Get comprehensive statistics - Protected (EMPLOYER/ADMIN)
POST   /api/employers/logo          # Upload company logo - Protected (EMPLOYER/ADMIN)
DELETE /api/employers/logo          # Delete company logo - Protected (EMPLOYER/ADMIN)
GET    /api/employers/[id]          # Get public employer profile
```

### Stripe Payments (✅ Implemented)
```
POST   /api/stripe/create-customer        # Create Stripe customer - Protected (EMPLOYER/ADMIN)
GET    /api/stripe/create-customer        # Get Stripe customer - Protected (EMPLOYER/ADMIN)
POST   /api/stripe/create-payment-intent  # Create payment intent - Protected (EMPLOYER/ADMIN)
POST   /api/webhooks/stripe               # Handle Stripe webhooks (no auth)
```

**📖 [View Complete Stripe Payments Documentation](STRIPE_PAYMENTS.md)**

### Placements & Billing (✅ Implemented)
```
POST   /api/placements                    # Create placement - Protected (EMPLOYER/ADMIN)
GET    /api/placements                    # List placements - Protected (role-based)
GET    /api/placements/[id]               # Get placement details - Protected (owner/ADMIN)
PATCH  /api/placements/[id]               # Update placement - Protected (owner/ADMIN)
DELETE /api/placements/[id]               # Cancel placement - Protected (owner/ADMIN)
PATCH  /api/placements/[id]/payment       # Record manual payment - Protected (ADMIN)
GET    /api/placements/[id]/payment       # Get payment info - Protected (owner/ADMIN)
GET    /api/placements/[id]/invoice       # Generate invoice - Protected (owner/ADMIN)
```

**📖 [View Complete Placements & Billing Documentation](PLACEMENTS_API.md)**

**Features:**
- 18% placement fee (configurable per placement)
- 50/50 payment split (upfront + 30 days)
- 90-day guarantee period
- Automatic application status updates
- Candidate availability management
- Employer total spend tracking
- Invoice generation (HTML/PDF ready)
- Stripe integration for online payments
- Manual payment recording for offline transactions

### Email Notifications (✅ Implemented)

The platform sends automated transactional emails via Resend for:
- Welcome emails (candidates and employers)
- Application confirmations
- New application notifications
- Application status updates
- Test/assessment invitations
- Job claim notifications
- Payment reminders
- Payment confirmations

**📖 [View Complete Email Service Documentation](EMAIL_SERVICE.md)**

### Coming Soon
```
/api/messages/*          # Messaging system - Protected
/api/blog/*              # Blog posts
```

## Authentication

This project uses **NextAuth.js** with JWT sessions and bcrypt password hashing.

### Features
- Email/Password authentication
- Role-based access control (ADMIN, EMPLOYER, CANDIDATE)
- Protected routes via middleware
- Account status checking (ACTIVE, INACTIVE, SUSPENDED)
- Password strength validation

### Quick Start

**Register a new user:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "SecurePass123",
    "name": "John Doe",
    "role": "CANDIDATE"
  }'
```

**For detailed authentication documentation, see [AUTH_GUIDE.md](AUTH_GUIDE.md)**

## Deployment

### 🚀 Deploy to Railway (Recommended)

**Complete step-by-step guide:** [DEPLOYMENT.md](DEPLOYMENT.md)

#### Quick Start

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Prepare for Railway deployment"
   git push origin main
   ```

2. **Create Railway Project**
   - Visit [Railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub"
   - Select your repository

3. **Add PostgreSQL**
   - Click "+ New" → "Database" → "Add PostgreSQL"
   - DATABASE_URL is automatically configured

4. **Set Environment Variables**
   ```env
   NEXTAUTH_SECRET=[generate-with-openssl]
   NEXTAUTH_URL=${{RAILWAY_PUBLIC_DOMAIN}}
   RESEND_API_KEY=[your-key]
   EMAIL_FROM=noreply@yourdomain.com
   CRON_SECRET=[generate-with-openssl]
   NODE_ENV=production
   ```

5. **Deploy & Migrate**
   ```bash
   # Railway auto-deploys on push
   # Then run migrations:
   railway run npx prisma migrate deploy
   ```

6. **Verify Deployment**
   ```bash
   curl https://your-app.up.railway.app/api/health
   ```

#### Deployment Checklist

Pre-Deployment:
- [ ] Code committed and pushed to GitHub
- [ ] Environment variables documented in `.env.example`
- [ ] Database migrations tested locally
- [ ] API endpoints tested with Postman collection

Railway Setup:
- [ ] Project created from GitHub repo
- [ ] PostgreSQL database added
- [ ] All environment variables configured
- [ ] Secrets generated (NEXTAUTH_SECRET, CRON_SECRET)

Post-Deployment:
- [ ] Database migrations applied
- [ ] Health check endpoint returns 200
- [ ] All API endpoints tested in production
- [ ] Cron jobs configured
- [ ] Monitoring and alerts set up
- [ ] Custom domain configured (optional)

**📖 Full deployment guide:** [DEPLOYMENT.md](DEPLOYMENT.md)

### Alternative: Deploy to Vercel

1. Push your code to GitHub
2. Import project in [Vercel](https://vercel.com)
3. Add all environment variables
4. Deploy!

**Note:** Railway is recommended for this project due to PostgreSQL integration and cron job support.

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Railway Documentation](https://docs.railway.app)
- [Stripe Documentation](https://stripe.com/docs)
- [Resend Documentation](https://resend.com/docs)

## License

MIT
