# Railway Deployment Guide

Complete step-by-step guide for deploying the Job Portal Backend to Railway.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [Database Configuration](#database-configuration)
4. [Environment Variables](#environment-variables)
5. [Deploy Application](#deploy-application)
6. [Run Migrations](#run-migrations)
7. [Custom Domain Setup](#custom-domain-setup)
8. [Monitoring & Logging](#monitoring--logging)
9. [Cron Jobs Setup](#cron-jobs-setup)
10. [Testing Production](#testing-production)
11. [Troubleshooting](#troubleshooting)
12. [Deployment Checklist](#deployment-checklist)

---

## Prerequisites

Before deploying, ensure you have:

- [ ] Railway account ([signup here](https://railway.app))
- [ ] GitHub repository with your code
- [ ] Resend account for emails ([signup here](https://resend.com))
- [ ] Stripe account for payments (optional) ([signup here](https://stripe.com))
- [ ] Domain name (optional, for custom domain)

---

## Initial Setup

### Step 1: Create Railway Project

1. **Login to Railway**
   ```
   Visit: https://railway.app
   Click "Login" and authenticate with GitHub
   ```

2. **Create New Project**
   ```
   Click "New Project"
   Select "Deploy from GitHub repo"
   Authorize Railway to access your GitHub
   Select your job-portal-backend repository
   ```

3. **Wait for Initial Deployment**
   - Railway will automatically detect Next.js
   - Initial build will fail (expected) - we need to configure environment variables

---

## Database Configuration

### Step 2: Add PostgreSQL Database

1. **Add Database Service**
   ```
   In your Railway project dashboard:
   Click "+ New" → "Database" → "Add PostgreSQL"
   ```

2. **Get Database Connection String**
   ```
   Click on the PostgreSQL service
   Go to "Connect" tab
   Copy the "DATABASE_URL" connection string
   ```

3. **Verify Database Connection**
   ```
   Format: postgresql://postgres:password@host:port/database
   Example: postgresql://postgres:abc123@postgres.railway.internal:5432/railway
   ```

---

## Environment Variables

### Step 3: Configure Environment Variables

1. **Open Variables Tab**
   ```
   Click on your main service (not database)
   Go to "Variables" tab
   Click "Raw Editor" for bulk input
   ```

2. **Generate Secrets**

   Open your terminal and generate secrets:

   ```bash
   # Generate NEXTAUTH_SECRET
   openssl rand -base64 32

   # Generate CRON_SECRET
   openssl rand -hex 32
   ```

3. **Add All Variables**

   Copy this template and replace with your actual values:

   ```env
   # Database (automatically provided by Railway)
   DATABASE_URL=${{Postgres.DATABASE_URL}}

   # NextAuth
   NEXTAUTH_SECRET=YOUR_GENERATED_SECRET_HERE
   NEXTAUTH_URL=${{RAILWAY_PUBLIC_DOMAIN}}

   # Email (Resend)
   RESEND_API_KEY=re_YOUR_RESEND_API_KEY
   EMAIL_FROM=noreply@yourdomain.com

   # Stripe (Optional)
   STRIPE_SECRET_KEY=sk_live_YOUR_KEY
   STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_KEY
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET

   # Cron Jobs
   CRON_SECRET=YOUR_GENERATED_CRON_SECRET

   # Storage (Optional - defaults to local)
   STORAGE_TYPE=local

   # Application
   NODE_ENV=production
   ```

4. **Special Railway Variables**

   Railway provides these automatically:
   - `${{Postgres.DATABASE_URL}}` - PostgreSQL connection string
   - `${{RAILWAY_PUBLIC_DOMAIN}}` - Your app's public URL
   - `${{RAILWAY_ENVIRONMENT}}` - Current environment (production)

5. **Save Variables**
   ```
   Click "Deploy" to apply changes
   Railway will rebuild with new environment variables
   ```

---

## Deploy Application

### Step 4: Configure Build Settings

1. **Verify `railway.json`** (already in your repo)
   ```json
   {
     "build": {
       "builder": "NIXPACKS",
       "buildCommand": "npm install && npx prisma generate && npm run build"
     },
     "deploy": {
       "startCommand": "npm run start",
       "healthcheckPath": "/api/health",
       "healthcheckTimeout": 100,
       "restartPolicyType": "ON_FAILURE",
       "restartPolicyMaxRetries": 3
     }
   }
   ```

2. **Push Changes to GitHub**
   ```bash
   git add .
   git commit -m "Configure for Railway deployment"
   git push origin main
   ```

3. **Trigger Deployment**
   ```
   Railway automatically deploys on git push
   Monitor build logs in Railway dashboard
   ```

4. **Build Process**
   ```
   Railway will:
   1. Install dependencies (npm install)
   2. Generate Prisma client (npx prisma generate)
   3. Build Next.js application (npm run build)
   4. Start the server (npm run start)
   ```

---

## Run Migrations

### Step 5: Apply Database Migrations

After successful deployment, apply migrations:

1. **Option A: Using Railway CLI**

   Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

   Login and link project:
   ```bash
   railway login
   railway link
   ```

   Run migrations:
   ```bash
   railway run npx prisma migrate deploy
   ```

2. **Option B: Using Railway Dashboard**

   Go to your service → "Deployments" → Click on latest deployment → "View Logs"

   Then in "Settings" → Add a deployment trigger:
   ```bash
   npm run db:migrate
   ```

3. **Option C: One-Time Command**

   In Railway dashboard:
   ```
   Service → Settings → Deploy Command
   Temporarily change to: npm install && npx prisma migrate deploy && npm run start
   Deploy once, then change back to: npm run start
   ```

4. **Verify Migration**
   ```bash
   # Check health endpoint
   curl https://your-app.up.railway.app/api/health

   # Should return:
   {
     "status": "healthy",
     "checks": {
       "database": { "status": "ok" }
     }
   }
   ```

---

## Custom Domain Setup

### Step 6: Configure Custom Domain (Optional)

1. **Add Domain in Railway**
   ```
   Service → Settings → Networking
   Click "Generate Domain" (gets you-app.up.railway.app)
   Or click "Custom Domain" to add your own
   ```

2. **Configure DNS Records**

   If using custom domain (e.g., api.yourdomain.com):

   **For Root Domain (yourdomain.com):**
   ```
   Type: A
   Name: @
   Value: [Railway IP from dashboard]
   ```

   **For Subdomain (api.yourdomain.com):**
   ```
   Type: CNAME
   Name: api
   Value: your-app.up.railway.app
   ```

3. **Update Environment Variables**
   ```
   Update NEXTAUTH_URL to your custom domain:
   NEXTAUTH_URL=https://api.yourdomain.com
   ```

4. **Configure SSL**
   ```
   Railway automatically provisions SSL certificates
   Your site will be available at https://
   ```

5. **Verify Domain**
   ```bash
   curl https://api.yourdomain.com/api/health
   ```

---

## Monitoring & Logging

### Step 7: Setup Monitoring

1. **Railway Built-in Monitoring**
   ```
   Service → Observability
   View:
   - CPU usage
   - Memory usage
   - Network traffic
   - Request counts
   ```

2. **View Logs**
   ```
   Service → Deployments → Click deployment → View Logs

   Or use Railway CLI:
   railway logs
   ```

3. **Health Check Monitoring**
   ```
   Railway automatically monitors: /api/health
   Configured in railway.json

   Alerts available in Settings → Notifications
   ```

4. **External Monitoring (Optional)**

   **Uptime Monitoring:**
   - [Uptime Robot](https://uptimerobot.com) - Free
   - [Better Uptime](https://betteruptime.com) - Free tier
   - [Pingdom](https://www.pingdom.com) - Paid

   **Monitor endpoint:**
   ```
   https://your-app.up.railway.app/api/health
   Check every 5 minutes
   ```

5. **Error Tracking (Optional)**

   Add Sentry for error tracking:
   ```bash
   npm install @sentry/nextjs
   ```

   Add to environment variables:
   ```env
   SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
   ```

6. **Logging Best Practices**
   ```javascript
   // Use structured logging
   console.log('[API] Request received', { method, path, userId });
   console.error('[ERROR] Database connection failed', { error });
   ```

---

## Cron Jobs Setup

### Step 8: Configure Scheduled Tasks

Railway supports cron jobs using external triggers or Railway Cron.

#### Option A: External Cron Service (Recommended)

1. **Use cron-job.org (Free)**

   Visit: https://cron-job.org

   Create jobs:

   **Expire Jobs (Daily at 2 AM UTC)**
   ```
   URL: https://your-app.up.railway.app/api/cron/expire-jobs
   Method: POST
   Headers: Authorization: Bearer YOUR_CRON_SECRET
   Schedule: 0 2 * * *
   ```

   **Payment Reminders (Daily at 9 AM UTC)**
   ```
   URL: https://your-app.up.railway.app/api/cron/payment-reminders
   Method: POST
   Headers: Authorization: Bearer YOUR_CRON_SECRET
   Schedule: 0 9 * * *
   ```

   **Guarantee Checks (Daily at 10 AM UTC)**
   ```
   URL: https://your-app.up.railway.app/api/cron/guarantee-checks
   Method: POST
   Headers: Authorization: Bearer YOUR_CRON_SECRET
   Schedule: 0 10 * * *
   ```

2. **Use EasyCron (Free tier)**

   Visit: https://www.easycron.com
   Similar setup as cron-job.org

3. **Use GitHub Actions (Free)**

   Create `.github/workflows/cron.yml`:
   ```yaml
   name: Cron Jobs
   on:
     schedule:
       - cron: '0 2 * * *'  # 2 AM UTC

   jobs:
     expire-jobs:
       runs-on: ubuntu-latest
       steps:
         - name: Trigger Expire Jobs
           run: |
             curl -X POST ${{ secrets.APP_URL }}/api/cron/expire-jobs \
               -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}"
   ```

#### Option B: Railway Cron (Paid Feature)

If you have Railway Pro:

1. Create `railway-cron.json`:
   ```json
   {
     "crons": [
       {
         "name": "expire-jobs",
         "schedule": "0 2 * * *",
         "command": "curl -X POST http://localhost:3000/api/cron/expire-jobs -H 'Authorization: Bearer $CRON_SECRET'"
       }
     ]
   }
   ```

---

## Testing Production

### Step 9: Comprehensive Production Testing

1. **Health Check**
   ```bash
   curl https://your-app.up.railway.app/api/health
   ```

   Expected:
   ```json
   {
     "status": "healthy",
     "checks": {
       "database": { "status": "ok", "latency": 15 },
       "environment": { "status": "ok" },
       "email": { "status": "ok" }
     }
   }
   ```

2. **Import Postman Collection**
   ```
   File: postman_collection.json (in repo root)
   Update environment variable: baseUrl
   Set to: https://your-app.up.railway.app/api
   ```

3. **Test Critical Endpoints**

   **Authentication:**
   ```bash
   # Sign up
   curl -X POST https://your-app.up.railway.app/api/auth/signup \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Test User",
       "email": "test@example.com",
       "password": "TestPass123",
       "role": "CANDIDATE"
     }'
   ```

   **Job Listings:**
   ```bash
   curl https://your-app.up.railway.app/api/jobs?limit=5
   ```

   **Dashboard:**
   ```bash
   curl https://your-app.up.railway.app/api/dashboard/admin \
     -H "Cookie: session-cookie"
   ```

4. **Test File Uploads**
   ```bash
   curl -X POST https://your-app.up.railway.app/api/upload/resume \
     -H "Cookie: session-cookie" \
     -F "file=@resume.pdf"
   ```

5. **Test Email Notifications**
   - Create test account
   - Trigger email (password reset, etc.)
   - Verify email received

6. **Test Payment Flow (if using Stripe)**
   - Create test placement
   - Generate payment link
   - Complete test payment

7. **Load Testing**
   ```bash
   # Install k6
   brew install k6  # macOS

   # Run load test
   k6 run load-test.js
   ```

---

## Troubleshooting

### Common Issues

#### 1. Build Fails

**Error**: `Prisma generate failed`

**Solution**:
```bash
# Check DATABASE_URL is set
# Verify railway.json has correct build command
# Check build logs for specific error
```

#### 2. Database Connection Error

**Error**: `Can't reach database server`

**Solution**:
```bash
# Verify DATABASE_URL format
# Check PostgreSQL service is running
# Ensure services are in same project
# Use ${{Postgres.DATABASE_URL}} variable reference
```

#### 3. Health Check Failing

**Error**: `Service unhealthy`

**Solution**:
```bash
# Check /api/health endpoint directly
# Verify all environment variables set
# Check application logs for errors
# Increase healthcheckTimeout in railway.json
```

#### 4. Authentication Not Working

**Error**: `Session expired` or `401 Unauthorized`

**Solution**:
```bash
# Verify NEXTAUTH_SECRET is set
# Check NEXTAUTH_URL matches your domain
# Ensure cookies are enabled
# Check for CORS issues
```

#### 5. Migrations Not Applied

**Error**: `Table does not exist`

**Solution**:
```bash
# Run migrations manually:
railway run npx prisma migrate deploy

# Or check if postinstall script ran:
railway logs | grep prisma
```

#### 6. Environment Variables Not Loading

**Error**: `process.env.VARIABLE is undefined`

**Solution**:
```bash
# Redeploy after adding variables
# Check variable names (case-sensitive)
# Ensure no spaces in variable names
# Use Railway dashboard (not .env file)
```

#### 7. Out of Memory

**Error**: `JavaScript heap out of memory`

**Solution**:
```bash
# Upgrade Railway plan for more memory
# Or optimize build:
# Add to package.json:
"build": "NODE_OPTIONS='--max-old-space-size=4096' next build"
```

---

## Deployment Checklist

### Pre-Deployment

- [ ] All code committed and pushed to GitHub
- [ ] `railway.json` configuration file present
- [ ] `package.json` scripts configured
- [ ] `.env.example` updated with all variables
- [ ] Database schema finalized
- [ ] Migrations created and tested locally

### Railway Setup

- [ ] Railway account created
- [ ] New project created from GitHub repo
- [ ] PostgreSQL database added to project
- [ ] All environment variables configured
- [ ] Secrets generated (NEXTAUTH_SECRET, CRON_SECRET)

### Deployment

- [ ] Initial deployment successful
- [ ] Database migrations applied
- [ ] Health check endpoint returns 200
- [ ] Application accessible via Railway URL

### Configuration

- [ ] Custom domain configured (if applicable)
- [ ] SSL certificate active (HTTPS)
- [ ] Monitoring alerts set up
- [ ] Cron jobs scheduled
- [ ] Email service configured and tested

### Testing

- [ ] Health check passes
- [ ] User registration works
- [ ] User login works
- [ ] Job creation works
- [ ] Application submission works
- [ ] File uploads work
- [ ] Email notifications send
- [ ] Search functionality works
- [ ] Admin functions accessible
- [ ] Payment processing works (if applicable)

### Post-Deployment

- [ ] Load testing completed
- [ ] Error tracking configured (Sentry)
- [ ] Uptime monitoring set up
- [ ] Documentation updated
- [ ] Team notified of production URL
- [ ] Backup strategy implemented

### Security

- [ ] All secrets are unique and strong
- [ ] `.env` file not committed to git
- [ ] CORS configured correctly
- [ ] Rate limiting enabled
- [ ] Input validation working
- [ ] SQL injection prevention verified
- [ ] XSS protection active

---

## Maintenance

### Regular Tasks

**Daily:**
- Check error logs
- Monitor uptime status
- Review cron job execution

**Weekly:**
- Review performance metrics
- Check database size
- Update dependencies if needed

**Monthly:**
- Security audit
- Backup verification
- Load test
- Update documentation

### Updating Application

```bash
# 1. Make changes locally
git add .
git commit -m "Description"

# 2. Test locally
npm run dev

# 3. Push to GitHub
git push origin main

# 4. Railway auto-deploys
# Monitor deployment in dashboard

# 5. Verify deployment
curl https://your-app.up.railway.app/api/health
```

---

## Support & Resources

### Railway Documentation
- [Railway Docs](https://docs.railway.app)
- [Railway CLI](https://docs.railway.app/develop/cli)
- [Railway Templates](https://railway.app/templates)

### API Documentation
- [API.md](API.md) - Complete API reference
- [TESTING.md](TESTING.md) - Testing guide
- [ERROR_HANDLING.md](ERROR_HANDLING.md) - Error handling

### Community
- [Railway Discord](https://discord.gg/railway)
- [Railway Community](https://community.railway.app)

---

## Quick Reference

### Useful Commands

```bash
# Railway CLI
railway login              # Login to Railway
railway link               # Link local project to Railway
railway up                 # Deploy current directory
railway logs               # View logs
railway run [command]      # Run command in Railway environment
railway status             # Check project status
railway variables          # View environment variables

# Database
railway run npx prisma migrate deploy  # Apply migrations
railway run npx prisma studio          # Open Prisma Studio
railway run npx prisma db push         # Push schema changes

# Deployment
git push origin main       # Trigger deployment
```

### Environment Variables Template

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
NEXTAUTH_SECRET=[generate-with-openssl]
NEXTAUTH_URL=${{RAILWAY_PUBLIC_DOMAIN}}
RESEND_API_KEY=[from-resend-dashboard]
EMAIL_FROM=noreply@yourdomain.com
CRON_SECRET=[generate-with-openssl]
NODE_ENV=production
```

---

**Deployment Complete! 🚀**

Your Job Portal Backend is now live on Railway.

Next steps:
1. Share the production URL with your team
2. Set up monitoring and alerts
3. Configure cron jobs
4. Test all functionality
5. Deploy frontend application

For issues or questions, refer to [Troubleshooting](#troubleshooting) section.
