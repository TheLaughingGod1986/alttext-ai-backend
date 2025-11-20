# Render Environment Variables - Supabase Migration

## ⚠️ IMPORTANT: Update Render Environment Variables

After migrating to Supabase, you **MUST** update your Render environment variables.

---

## ✅ ADD These Variables to Render

Go to your Render dashboard → Your Backend Service → Environment tab → Add these:

### Supabase (NEW - REQUIRED)
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**How to get these:**
1. Go to your Supabase project dashboard
2. Settings → API
3. Copy "Project URL" → This is `SUPABASE_URL`
4. Copy "service_role" key → This is `SUPABASE_SERVICE_ROLE_KEY` (keep it secret!)

---

## ❌ REMOVE These Variables from Render

These are no longer needed after Supabase migration:

```bash
DATABASE_URL          # ❌ Remove - replaced by Supabase
SHADOW_DATABASE_URL   # ❌ Remove - no longer needed
```

**Action:** Delete these from Render's Environment tab.

---

## ✅ KEEP These Variables in Render

All other variables should remain:

```bash
# JWT Authentication
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d

# OpenAI API Keys
ALTTEXT_OPENAI_API_KEY=sk-...
SEO_META_OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_REVIEW_API_KEY=sk-...
OPENAI_REVIEW_MODEL=gpt-4o-mini

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
ALTTEXT_AI_STRIPE_PRICE_PRO=price_...
ALTTEXT_AI_STRIPE_PRICE_AGENCY=price_...
ALTTEXT_AI_STRIPE_PRICE_CREDITS=price_...
SEO_AI_META_STRIPE_PRICE_PRO=price_...
SEO_AI_META_STRIPE_PRICE_AGENCY=price_...

# Application
NODE_ENV=production
PORT=3000  # Usually auto-set by Render
FRONTEND_URL=https://your-frontend-url.com

# Email Service
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@alttextai.com

# Webhook
WEBHOOK_SECRET=your-webhook-secret
```

---

## 📋 Step-by-Step Instructions

### 1. Go to Render Dashboard
- Navigate to https://dashboard.render.com
- Click on your backend service

### 2. Open Environment Tab
- Click "Environment" in the left sidebar
- You'll see all current environment variables

### 3. Add Supabase Variables
- Click "Add Environment Variable"
- Add `SUPABASE_URL` with your Supabase project URL
- Click "Add Environment Variable" again
- Add `SUPABASE_SERVICE_ROLE_KEY` with your service role key

### 4. Remove Old Database Variables
- Find `DATABASE_URL` in the list
- Click the trash icon to delete it
- If `SHADOW_DATABASE_URL` exists, delete it too

### 5. Save Changes
- Click "Save Changes" at the bottom
- Render will automatically redeploy your service

---

## ✅ Verification Checklist

After updating variables:

- [ ] `SUPABASE_URL` is set in Render
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is set in Render
- [ ] `DATABASE_URL` is removed from Render
- [ ] All other variables are still present
- [ ] Service redeploys successfully
- [ ] Health endpoint works: `GET /health`
- [ ] Authentication endpoints work

---

## 🧪 Test After Migration

Once deployed, test these endpoints:

```bash
# Health check
curl https://your-backend.onrender.com/health

# Should return:
# {"status":"ok","timestamp":"...","version":"2.0.0","phase":"monetization"}
```

If you get errors, check:
1. Supabase variables are set correctly
2. Supabase project is active
3. Service role key has correct permissions

---

## ⚠️ Common Issues

### Error: "SUPABASE_URL environment variable is required"
- **Fix:** Add `SUPABASE_URL` to Render environment variables

### Error: "SUPABASE_SERVICE_ROLE_KEY environment variable is required"
- **Fix:** Add `SUPABASE_SERVICE_ROLE_KEY` to Render environment variables

### Error: "relation does not exist"
- **Fix:** Verify your Supabase database schema matches the Prisma schema
- Check table names are correct (camelCase columns, snake_case tables)

### Error: "permission denied"
- **Fix:** Verify you're using the **service_role** key (not anon key)
- Service role key bypasses Row Level Security (RLS)

---

## 📝 Summary

**What Changed:**
- ❌ Removed: `DATABASE_URL` (PostgreSQL connection)
- ✅ Added: `SUPABASE_URL` (Supabase project URL)
- ✅ Added: `SUPABASE_SERVICE_ROLE_KEY` (Supabase service role key)

**What Stayed the Same:**
- ✅ All other environment variables remain unchanged
- ✅ All API endpoints work the same
- ✅ WordPress plugins work without changes

---

**Next Step:** Update Render environment variables, then redeploy!

