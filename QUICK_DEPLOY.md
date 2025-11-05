# Quick Deploy to Railway 🚀

**5-minute deployment guide for Job Portal Backend**

## Prerequisites

- GitHub account
- Railway account (free tier works)
- 5 minutes of your time

---

## Step 1: Push to GitHub (1 minute)

```bash
git add .
git commit -m "Ready for Railway deployment"
git push origin main
```

---

## Step 2: Create Railway Project (1 minute)

1. Go to https://railway.app
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose **this repository**
5. Click **"+ New"** → **"Database"** → **"Add PostgreSQL"**

---

## Step 3: Generate Secrets (30 seconds)

Run these commands in your terminal:

```bash
# Generate NEXTAUTH_SECRET
openssl rand -base64 32

# Generate CRON_SECRET
openssl rand -hex 32
```

**Save these values!** You'll need them in the next step.

---

## Step 4: Set Environment Variables (2 minutes)

In Railway dashboard:
1. Click on your **service** (not database)
2. Go to **"Variables"** tab
3. Click **"Raw Editor"**
4. Paste this (replace with YOUR values):

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
NEXTAUTH_SECRET=YOUR_GENERATED_SECRET_FROM_STEP_3
NEXTAUTH_URL=${{RAILWAY_PUBLIC_DOMAIN}}
RESEND_API_KEY=re_YOUR_KEY_FROM_RESEND_DASHBOARD
EMAIL_FROM=noreply@yourdomain.com
CRON_SECRET=YOUR_GENERATED_SECRET_FROM_STEP_3
NODE_ENV=production
```

5. Click **"Deploy"**

---

## Step 5: Run Migrations (1 minute)

### Option A: Using Railway CLI

```bash
npm install -g @railway/cli
railway login
railway link
railway run npx prisma migrate deploy
```

### Option B: Manual (if CLI doesn't work)

1. In Railway dashboard → Your service
2. Go to **"Settings"** → **"Deploy"**
3. Temporarily change **"Start Command"** to:
   ```
   npx prisma migrate deploy && npm run start
   ```
4. Wait for deployment to complete
5. Change **"Start Command"** back to: `npm run start`

---

## Step 6: Verify (30 seconds)

```bash
curl https://your-app-name.up.railway.app/api/health
```

Should return:
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok" }
  }
}
```

✅ **Deployment complete!**

---

## Next Steps

### Setup Cron Jobs

1. Go to https://cron-job.org (free)
2. Create 3 cron jobs:

**Expire Jobs** - `0 2 * * *` (2 AM daily)
```
URL: https://your-app.up.railway.app/api/cron/expire-jobs
Method: POST
Header: Authorization: Bearer YOUR_CRON_SECRET
```

**Payment Reminders** - `0 9 * * *` (9 AM daily)
```
URL: https://your-app.up.railway.app/api/cron/payment-reminders
Method: POST
Header: Authorization: Bearer YOUR_CRON_SECRET
```

**Guarantee Checks** - `0 10 * * *` (10 AM daily)
```
URL: https://your-app.up.railway.app/api/cron/guarantee-checks
Method: POST
Header: Authorization: Bearer YOUR_CRON_SECRET
```

### Test Your API

```bash
# Import Postman collection
# File: postman_collection.json
# Update baseUrl to: https://your-app.up.railway.app/api

# Test signup
curl -X POST https://your-app.up.railway.app/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@example.com",
    "password": "TestPass123",
    "role": "CANDIDATE"
  }'
```

---

## Troubleshooting

**Build fails?**
- Check Railway logs in dashboard
- Verify all environment variables are set
- Make sure DATABASE_URL uses `${{Postgres.DATABASE_URL}}`

**Health check returns 503?**
- Migrations probably didn't run
- Follow Step 5 again

**Database connection error?**
- Verify PostgreSQL service is running
- Check DATABASE_URL is correct

---

## Get More Help

- **Detailed Guide**: [DEPLOYMENT.md](DEPLOYMENT.md)
- **Testing Guide**: [TESTING.md](TESTING.md)
- **API Docs**: [API.md](API.md)
- **Railway Docs**: https://docs.railway.app

---

## Important URLs

After deployment, save these:

- **App URL**: `https://your-app-name.up.railway.app`
- **Health Check**: `https://your-app-name.up.railway.app/api/health`
- **Railway Dashboard**: https://railway.app/project/your-project-id

---

**That's it! Your backend is live on Railway! 🎉**

Share the API URL with your frontend team and start building!
