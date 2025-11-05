# Railway Deployment Summary

Quick reference guide for deploying the Job Portal Backend to Railway.

## 📋 Pre-Deployment Checklist

- [x] `railway.json` - Build and deployment configuration
- [x] `package.json` - Updated with deployment scripts
- [x] `.env.example` - Complete environment variable template
- [x] `DEPLOYMENT.md` - Comprehensive deployment guide
- [x] `railway-deploy.sh` - Helper script for deployment tasks
- [x] Health check endpoint - `/api/health`
- [x] Database migrations - Ready to deploy
- [x] API documentation - Complete

## 🚀 Quick Deploy Steps

### 1. Prepare Repository

```bash
# Ensure all changes are committed
git add .
git commit -m "Prepare for Railway deployment"
git push origin main
```

### 2. Create Railway Project

1. Go to https://railway.app
2. Click "New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repository

### 3. Add PostgreSQL

1. Click "+ New" → "Database" → "Add PostgreSQL"
2. Railway automatically provides `DATABASE_URL`

### 4. Configure Environment Variables

Go to your service → Variables → Raw Editor

```env
# Copy from .env.example and update with real values
DATABASE_URL=${{Postgres.DATABASE_URL}}
NEXTAUTH_SECRET=[run: openssl rand -base64 32]
NEXTAUTH_URL=${{RAILWAY_PUBLIC_DOMAIN}}
RESEND_API_KEY=re_your_key_here
EMAIL_FROM=noreply@yourdomain.com
CRON_SECRET=[run: openssl rand -hex 32]
NODE_ENV=production
```

### 5. Deploy & Migrate

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link project
railway login
railway link

# Run migrations
railway run npx prisma migrate deploy
```

### 6. Verify Deployment

```bash
curl https://your-app.up.railway.app/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok" }
  }
}
```

## 🛠️ Helper Script

Use the provided helper script for common tasks:

```bash
# Check if ready to deploy
./railway-deploy.sh check

# Generate secrets
./railway-deploy.sh secrets

# Run migrations
./railway-deploy.sh migrate

# Test production endpoints
./railway-deploy.sh test

# View logs
./railway-deploy.sh logs
```

## 📊 Monitor Deployment

### Railway Dashboard
- **Observability**: View CPU, memory, network usage
- **Deployments**: Track build status and logs
- **Logs**: Real-time application logs

### Health Monitoring
```bash
# Manual check
curl https://your-app.up.railway.app/api/health

# Set up external monitor (optional)
# - Uptime Robot: https://uptimerobot.com
# - Better Uptime: https://betteruptime.com
```

## ⏰ Setup Cron Jobs

Use external cron service (recommended):

**cron-job.org** (Free):

1. Visit https://cron-job.org
2. Create 3 jobs:

**Expire Jobs** (Daily at 2 AM UTC)
```
URL: https://your-app.up.railway.app/api/cron/expire-jobs
Method: POST
Header: Authorization: Bearer YOUR_CRON_SECRET
Schedule: 0 2 * * *
```

**Payment Reminders** (Daily at 9 AM UTC)
```
URL: https://your-app.up.railway.app/api/cron/payment-reminders
Method: POST
Header: Authorization: Bearer YOUR_CRON_SECRET
Schedule: 0 9 * * *
```

**Guarantee Checks** (Daily at 10 AM UTC)
```
URL: https://your-app.up.railway.app/api/cron/guarantee-checks
Method: POST
Header: Authorization: Bearer YOUR_CRON_SECRET
Schedule: 0 10 * * *
```

## 🔒 Security Checklist

- [ ] Strong unique NEXTAUTH_SECRET generated
- [ ] Strong unique CRON_SECRET generated
- [ ] Production Stripe keys (not test keys)
- [ ] Verified email domain in Resend
- [ ] `.env` file not committed to git
- [ ] Rate limiting enabled (configured in code)
- [ ] CORS configured correctly
- [ ] All secrets stored in Railway (not in code)

## 🧪 Test Production API

### Using Postman Collection

1. Import `postman_collection.json`
2. Update base URL to production:
   ```
   https://your-app.up.railway.app/api
   ```
3. Test all endpoints

### Using cURL

```bash
# Health check
curl https://your-app.up.railway.app/api/health

# Create test user
curl -X POST https://your-app.up.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "TestPass123",
    "role": "CANDIDATE"
  }'

# List jobs
curl https://your-app.up.railway.app/api/jobs
```

## 🔄 Update Deployment

```bash
# 1. Make changes locally
git add .
git commit -m "Update feature"

# 2. Push to GitHub
git push origin main

# 3. Railway auto-deploys
# Monitor in Railway dashboard

# 4. Verify deployment
curl https://your-app.up.railway.app/api/health
```

## 🐛 Troubleshooting

### Build Fails
```bash
# Check build logs in Railway dashboard
# Common issues:
# - Missing environment variables
# - Prisma generation failed
# - TypeScript errors
```

### Database Connection Error
```bash
# Verify DATABASE_URL is set
# Check PostgreSQL service is running
# Use Railway provided connection string
```

### Health Check Failing
```bash
# Check application logs
# Verify all environment variables
# Test database connection:
railway run npx prisma db push
```

### Can't Run Migrations
```bash
# Ensure DATABASE_URL is correct
# Run manually:
railway run npx prisma migrate deploy

# Check logs for errors:
railway logs
```

## 📚 Documentation

- **Complete Guide**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **API Reference**: [API.md](API.md)
- **Testing Guide**: [TESTING.md](TESTING.md)
- **Error Handling**: [ERROR_HANDLING.md](ERROR_HANDLING.md)

## 🆘 Get Help

### Railway Support
- [Railway Docs](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)
- [Railway Community](https://community.railway.app)

### Project Documentation
- Check [DEPLOYMENT.md](DEPLOYMENT.md) for detailed steps
- Review [TESTING.md](TESTING.md) for testing procedures
- See [API.md](API.md) for endpoint documentation

## ✅ Post-Deployment

After successful deployment:

1. **Test all endpoints** using Postman collection
2. **Configure cron jobs** for scheduled tasks
3. **Set up monitoring** (Uptime Robot, Sentry)
4. **Configure custom domain** (optional)
5. **Update frontend** with production API URL
6. **Document production URL** for team
7. **Set up backups** (Railway handles this)
8. **Configure alerts** in Railway settings

---

**🎉 Deployment Complete!**

Your Job Portal Backend is now live on Railway.

Production URL: `https://your-app.up.railway.app`

For detailed instructions, see [DEPLOYMENT.md](DEPLOYMENT.md)
