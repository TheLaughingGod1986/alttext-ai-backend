# Render.com Deployment Guide - Phase 2

**Version:** 2.0.0
**Date:** October 21, 2025
**Service:** AltText AI Phase 2 Backend

---

## Prerequisites

Before you begin, ensure you have:

- [x] Render.com account (free tier works)
- [x] PostgreSQL database on Render (already created)
- [x] GitHub repository with backend code
- [x] Stripe account (test mode is fine initially)
- [x] OpenAI API key
- [x] WordPress site URL for CORS

---

## Step-by-Step Deployment

### Step 1: Prepare Repository

**1.1 Verify package.json**

Check that [backend/package.json](package.json) has:
```json
{
  "main": "server-v2.js",
  "scripts": {
    "start": "node server-v2.js"
  }
}
```

✅ Already updated!

**1.2 Verify database connection**

Test locally:
```bash
cd backend
node test-db.js
```

Expected output:
```
✅ Database connected successfully!
   Total users: X
```

---

### Step 2: Create Render Web Service

**2.1 Login to Render Dashboard**

Visit: https://dashboard.render.com

**2.2 Create New Web Service**

1. Click "New +" button in top right
2. Select "Web Service"
3. Choose "Build and deploy from a Git repository"
4. Click "Connect account" if needed (GitHub)

**2.3 Connect Repository**

1. Select your repository: `WP-Alt-text-plugin` (or your repo name)
2. Click "Connect"

**2.4 Configure Service**

Fill in the following:

| Field | Value |
|-------|-------|
| **Name** | `alttext-ai-phase2` (or your choice) |
| **Region** | Oregon (US West) - same as database |
| **Branch** | `main` (or your default branch) |
| **Root Directory** | `backend` |
| **Runtime** | Node |
| **Build Command** | `npm install && npx prisma generate` |
| **Start Command** | `npm start` |
| **Plan** | Starter ($7/month) or Free |

**2.5 Advanced Settings (Optional)**

- **Health Check Path:** `/health`
- **Auto-Deploy:** Yes (deploys on git push)

Click **"Create Web Service"** button

---

### Step 3: Configure Environment Variables

**IMPORTANT:** Add these BEFORE first deployment or service will crash

**3.1 Navigate to Environment**

In your new service:
1. Click "Environment" tab in left sidebar
2. Click "Add Environment Variable"

**3.2 Add Required Variables**

Add each of these one by one:

#### Database
```bash
KEY: DATABASE_URL
VALUE: postgresql://alttext_ai_db_user:eXV1unHzLvuv4NsOfHZBFNtWcwJmzlQM@dpg-d3rnbdndiees73bsa8e0-a.oregon-postgres.render.com/alttext_ai_db
```
✅ Copy from your existing database connection string

#### JWT Authentication
```bash
KEY: JWT_SECRET
VALUE: [Click "Generate" button to create secure random string]

KEY: JWT_EXPIRES_IN
VALUE: 7d
```

#### OpenAI API
```bash
KEY: OPENAI_API_KEY
VALUE: sk-proj-... [Your OpenAI API key]

KEY: OPENAI_MODEL
VALUE: gpt-4o-mini

KEY: OPENAI_REVIEW_API_KEY
VALUE: sk-proj-... [Same or different key]

KEY: OPENAI_REVIEW_MODEL
VALUE: gpt-4o-mini
```

#### Stripe (Test Mode Initially)
```bash
KEY: STRIPE_SECRET_KEY
VALUE: sk_test_placeholder_key_for_testing [Update with real test key]

KEY: STRIPE_WEBHOOK_SECRET
VALUE: ***REMOVED*** [Update later]

KEY: STRIPE_PRICE_PRO
VALUE: price_1SKgtuJl9Rm418cMtcxOZRCR

KEY: STRIPE_PRICE_AGENCY
VALUE: price_1SKgu1Jl9Rm418cM8MedRfqr

KEY: STRIPE_PRICE_CREDITS
VALUE: price_1SKgu2Jl9Rm418cM3b1Z9tUW
```

#### Application Settings
```bash
KEY: NODE_ENV
VALUE: production

KEY: PORT
VALUE: 3001

KEY: FRONTEND_URL
VALUE: https://your-wordpress-site.com [Replace with actual URL]
```

**3.3 Save All Variables**

Click "Save Changes" button at bottom

---

### Step 4: Deploy Service

**4.1 Trigger Deployment**

- If auto-deploy is enabled, deployment starts automatically
- Otherwise, click "Manual Deploy" → "Deploy latest commit"

**4.2 Monitor Deployment**

Watch the "Logs" tab. You should see:

```
==> Cloning from https://github.com/...
==> Checking out commit ...
==> Running build command 'npm install && npx prisma generate'...
    added 150 packages...
    ✔ Generated Prisma Client
==> Build successful!
==> Starting service with 'npm start'...
    🚀 AltText AI Phase 2 API running on port 3001
    📅 Version: 2.0.0 (Monetization)
    🔒 Environment: production
==> Service is live at https://alttext-ai-phase2.onrender.com
```

**4.3 Wait for "Live" Status**

- Initial deploy takes 2-5 minutes
- Status indicator turns green when ready
- Service URL appears at top of dashboard

---

### Step 5: Verify Deployment

**5.1 Copy Service URL**

Your service URL will be something like:
```
https://alttext-ai-phase2.onrender.com
```

Or custom domain if configured.

**5.2 Test Health Endpoint**

Open terminal and run:

```bash
curl https://your-service-url.onrender.com/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-10-21T...",
  "version": "2.0.0",
  "phase": "monetization"
}
```

**5.3 Test Database Connection**

```bash
curl https://your-service-url.onrender.com/billing/plans
```

Should return list of billing plans (means database is connected).

**5.4 Test CORS**

From browser console on your WordPress site:

```javascript
fetch('https://your-service-url.onrender.com/health')
  .then(r => r.json())
  .then(console.log)
```

Should return health status without CORS error.

---

### Step 6: Update WordPress Plugin

**6.1 Login to WordPress Admin**

Navigate to: Media → AI Alt Text Generation → Settings

**6.2 Update API URL**

Replace API URL with your Render service URL:
```
https://your-service-url.onrender.com
```

**6.3 Save Settings**

Click "Save Changes"

**6.4 Test Connection**

- Navigate to AI Alt Text dashboard
- Authentication modal should appear
- If modal doesn't appear, check browser console for errors

---

## Troubleshooting

### Issue: Deployment Failed

**Check build logs for errors:**
1. Go to "Logs" tab
2. Look for red error messages
3. Common issues:
   - Missing dependencies in package.json
   - Build command incorrect
   - Node version mismatch

**Solution:**
- Fix the error in your code
- Push to GitHub
- Render will auto-redeploy

---

### Issue: Service Crashes on Start

**Symptoms:**
- Status shows "Deploy failed"
- Logs show error after "Starting service..."

**Common Causes:**
1. **Missing environment variable**
   - Check all required vars are set
   - Especially DATABASE_URL and JWT_SECRET

2. **Database connection failed**
   - Verify DATABASE_URL is correct
   - Check database is in same region (Oregon)

3. **Port binding issue**
   - Make sure PORT=3001 is set
   - Server should listen on `process.env.PORT`

**How to Fix:**
1. Go to "Environment" tab
2. Verify all variables from Step 3
3. Click "Manual Deploy" to retry

---

### Issue: CORS Errors in WordPress

**Symptoms:**
- Browser console shows: `Access to fetch... has been blocked by CORS policy`
- Authentication modal can't connect

**Solution:**
1. Verify FRONTEND_URL is set correctly
2. Should match your WordPress site URL exactly
3. Update server-v2.js if needed to allow your domain
4. Redeploy service

---

### Issue: Database Migrations Not Applied

**Symptoms:**
- Errors about missing tables or columns

**Solution:**
Run Prisma migrations via Render Shell:

1. Go to "Shell" tab in Render dashboard
2. Run:
   ```bash
   cd backend
   npx prisma db push
   ```

---

### Issue: Webhook Not Receiving Events

**Symptoms:**
- Subscriptions don't update user plan
- No webhook events in Stripe dashboard

**Solution:**
1. In Stripe dashboard, go to Developers → Webhooks
2. Click your webhook endpoint
3. Verify URL is correct: `https://your-service.onrender.com/billing/webhook`
4. Check webhook secret matches `STRIPE_WEBHOOK_SECRET` env var
5. Test webhook manually:
   ```bash
   stripe trigger checkout.session.completed
   ```

---

## Post-Deployment Checklist

After successful deployment:

- [ ] ✅ Service shows "Live" status in Render
- [ ] ✅ Health endpoint returns 200 OK
- [ ] ✅ /billing/plans endpoint works
- [ ] ✅ No errors in deployment logs
- [ ] ✅ WordPress plugin settings updated
- [ ] ✅ CORS working from WordPress site
- [ ] ✅ Can create test user account
- [ ] ✅ Alt text generation works
- [ ] ✅ Usage tracking updates

---

## Monitoring & Maintenance

### View Logs

**Real-time logs:**
1. Go to "Logs" tab in Render
2. See live request/response logs
3. Filter by severity (info, warn, error)

**Download logs:**
- Click "Download" button for offline analysis

### Restart Service

If service becomes unresponsive:
1. Go to "Settings" tab
2. Scroll to "Service Management"
3. Click "Suspend" then "Resume"

Or use manual deploy to force restart.

### Update Environment Variables

To change any variable:
1. Go to "Environment" tab
2. Edit variable value
3. Click "Save Changes"
4. Service auto-restarts

### Monitor Performance

Render provides:
- **Metrics:** CPU, Memory, Network usage
- **Uptime:** Service availability percentage
- **Response times:** P50, P95, P99 latencies

Access via "Metrics" tab.

---

## Upgrading to Paid Plan

Free tier limitations:
- Service spins down after 15 min inactivity
- 750 hours/month (enough for 1 service)

Starter plan ($7/mo) includes:
- Always-on service (no spin down)
- Faster builds
- Better performance

To upgrade:
1. Go to "Settings" tab
2. Under "Plan", click "Change Plan"
3. Select "Starter" or higher
4. Add payment method

---

## Security Best Practices

### 1. Environment Variables

✅ **DO:**
- Use Render's "Add Environment Variable" UI
- Click "Generate" for JWT_SECRET
- Never commit .env to GitHub

❌ **DON'T:**
- Hardcode secrets in code
- Share environment variables publicly
- Use weak JWT secrets

### 2. CORS Configuration

Update server-v2.js to restrict CORS:

```javascript
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
```

### 3. HTTPS Only

- Render provides free SSL certificates
- All traffic is HTTPS by default
- Never use HTTP for sensitive data

### 4. Rate Limiting

Already configured in server-v2.js:
```javascript
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100
});
```

Adjust if needed for your traffic patterns.

---

## Backup & Disaster Recovery

### Database Backups

Render PostgreSQL includes:
- Automatic daily backups (retained 7 days)
- Point-in-time recovery
- Manual snapshots

To create manual backup:
1. Go to your database in Render
2. Click "Backups" tab
3. Click "Create Snapshot"

### Code Backups

- Code is in GitHub (primary backup)
- Render clones from GitHub on each deploy
- Can roll back to any previous commit

---

## Next Steps

After successful deployment:

1. ✅ **Complete Option 1** - You are here!
2. 🔲 **Move to Option 2** - Local Integration Testing
3. 🔲 **Move to Option 3** - Stripe Live Configuration
4. 🔲 **Move to Option 4** - Phase 3 Planning

---

## Support Resources

- **Render Docs:** https://render.com/docs
- **Render Status:** https://status.render.com
- **Render Community:** https://community.render.com
- **Support:** support@render.com

---

## Summary

**Deployment URL:** `https://your-service.onrender.com` (replace with actual)

**Environment:** Production

**Database:** Render PostgreSQL (Oregon)

**Node Version:** 18.x

**Deployment Method:** Auto-deploy from GitHub

**Health Check:** `GET /health`

**Status:** 🟢 Live (once deployed)

---

**Deployment Guide Version:** 1.0
**Last Updated:** October 21, 2025
**Prepared by:** Claude Code
