# Environment Variables Audit & Cleanup Guide

## Current Status (From Render Dashboard)

### ✅ Required Variables (Keep All)

#### **Core Application** (4 variables)
```bash
DATABASE_URL          # PostgreSQL database connection (REQUIRED)
NODE_ENV              # Environment mode: 'production' (REQUIRED)
PORT                  # Auto-set by Render (REQUIRED)
FRONTEND_URL          # Frontend URL for CORS and redirects (REQUIRED)
```

#### **Authentication** (2 variables)
```bash
JWT_SECRET            # JWT token signing secret (REQUIRED)
JWT_EXPIRES_IN        # JWT expiration time, e.g., '7d' (REQUIRED)
```

#### **OpenAI API Keys** (2 variables)
```bash
ALTTEXT_OPENAI_API_KEY       # AltText AI plugin OpenAI key (REQUIRED)
SEO_META_OPENAI_API_KEY      # SEO AI Meta plugin OpenAI key (REQUIRED)
```

#### **OpenAI Configuration** (2 variables - OPTIONAL but recommended)
```bash
OPENAI_MODEL                 # Default model: 'gpt-4o-mini' (OPTIONAL - has default)
OPENAI_REVIEW_MODEL          # Review model: 'gpt-4o-mini' (OPTIONAL - has default)
```

#### **Stripe Payment** (3 variables)
```bash
STRIPE_SECRET_KEY            # Stripe API secret key (REQUIRED for billing)
STRIPE_PUBLISHABLE_KEY       # Stripe publishable key (REQUIRED for frontend)
STRIPE_WEBHOOK_SECRET        # Stripe webhook signing secret (REQUIRED)
```

#### **Stripe Price IDs** (5 variables)
```bash
ALTTEXT_AI_STRIPE_PRICE_PRO        # AltText AI Pro plan (REQUIRED)
ALTTEXT_AI_STRIPE_PRICE_AGENCY     # AltText AI Agency plan (REQUIRED)
ALTTEXT_AI_STRIPE_PRICE_CREDITS    # AltText AI Credit pack (REQUIRED)
SEO_AI_META_STRIPE_PRICE_PRO       # SEO AI Meta Pro plan (REQUIRED)
SEO_AI_META_STRIPE_PRICE_AGENCY    # SEO AI Meta Agency plan (REQUIRED)
```

#### **Email Service** (2 variables)
```bash
RESEND_API_KEY               # Resend email service API key (REQUIRED)
RESEND_FROM_EMAIL            # From email address (REQUIRED)
```

#### **Security** (1 variable)
```bash
WEBHOOK_SECRET               # Monthly reset webhook secret (REQUIRED)
```

---

## 🗑️ Variables to REMOVE

These are **NOT used** in the current codebase and can be safely deleted:

### ❌ Delete These (Not Found in Code)

```bash
❌ OPENAI_REVIEW_API_KEY     # NOT USED - code uses service-specific keys
```

**Why?** The code at [server-v2.js:200-201](../alttext-ai-backend-clone/server-v2.js#L200) shows it checks for `OPENAI_REVIEW_API_KEY` but then falls back to the service-specific keys (`ALTTEXT_OPENAI_API_KEY` or `SEO_META_OPENAI_API_KEY`), so it's redundant.

---

## 📊 Summary

### Current Variables in Render: ~20
### Required Variables: 21
### Optional Variables: 2
### Variables to Remove: 1

---

## ✅ Final Clean Environment Variable List

Here's what you should have in Render after cleanup:

```bash
# Core (4)
DATABASE_URL=postgresql://...
NODE_ENV=production
PORT=(auto-set)
FRONTEND_URL=https://your-frontend.com

# Auth (2)
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d

# OpenAI Keys (2) - REQUIRED
ALTTEXT_OPENAI_API_KEY=sk-proj-W8o-...
SEO_META_OPENAI_API_KEY=sk-proj-skizpk...

# OpenAI Config (2) - OPTIONAL
OPENAI_MODEL=gpt-4o-mini
OPENAI_REVIEW_MODEL=gpt-4o-mini

# Stripe (3)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Prices (5)
ALTTEXT_AI_STRIPE_PRICE_PRO=price_1SMrxaJl9Rm418cMM4iikjlJ
ALTTEXT_AI_STRIPE_PRICE_AGENCY=price_1SMrxaJl9Rm418cMnJTShXSY
ALTTEXT_AI_STRIPE_PRICE_CREDITS=price_1SMrxbJl9Rm418cM0gkzZQZt
SEO_AI_META_STRIPE_PRICE_PRO=price_1SQ72OJl9Rm418cMruYB5Pgb
SEO_AI_META_STRIPE_PRICE_AGENCY=price_1SQ72KJl9Rm418cMB0CYh8xe

# Email (2)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@alttextai.com

# Security (1)
WEBHOOK_SECRET=your-webhook-secret
```

---

## 🔍 Not Used But May Be Useful Later

These environment variables are **referenced in the code** but are optional or have defaults:

### Optional Variables (Don't Need to Add Unless Required)

```bash
# Email Alternatives (only if switching from Resend)
SENDGRID_API_KEY              # Only if using SendGrid instead of Resend
SENDGRID_FROM_EMAIL           # Only if using SendGrid

# Provider Authentication (old system)
PROVIDER_USERNAME             # Legacy provider auth (not used in current flow)
PROVIDER_PASSWORD             # Legacy provider auth (not used in current flow)

# Cost Tracking (optional analytics)
DEFAULT_COST_PER_1K_TOKENS    # OpenAI cost tracking (default: 0.0025)
MODEL_COST_OVERRIDES          # JSON override for model costs
PLAN_FREE_MONTHLY             # Default: 0
PLAN_PRO_MONTHLY              # Default: 12.99
PLAN_AGENCY_MONTHLY           # Default: 49.99

# Debug/Development
DEBUG_EMAIL                   # Show reset links in logs (dev only)
ALT_REVIEW_ENABLED            # Enable/disable review feature (default: true)
API_SECRET                    # Legacy API auth (not used in v2)
FREE_MONTHLY_LIMIT            # Legacy limit (default: 50)
PRO_MONTHLY_LIMIT             # Legacy limit (default: 1000)
RESEND_AUDIENCE_ID            # Email list audience (optional)
```

---

## 🎯 Action Items

### Step 1: Remove Unused Variable
1. In Render dashboard, find and **delete**:
   - ❌ `OPENAI_REVIEW_API_KEY` (redundant)

### Step 2: Verify All Required Variables Are Present
Check that you have all 21 required variables listed above.

### Step 3: Save and Redeploy
After removing the unused variable, click "Save, rebuild, and deploy"

---

## 🚨 Critical Variables (Don't Delete!)

These would **break the application** if removed:

- `DATABASE_URL`
- `JWT_SECRET`
- `ALTTEXT_OPENAI_API_KEY`
- `SEO_META_OPENAI_API_KEY`
- `STRIPE_SECRET_KEY`
- All 5 `*_STRIPE_PRICE_*` variables
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`

---

## 📈 Optimization Benefits

After cleanup:
- ✅ **Cleaner configuration** - Only variables that are actually used
- ✅ **Easier maintenance** - Less clutter in Render dashboard
- ✅ **Clear naming** - Service-specific naming makes purpose obvious
- ✅ **No redundancy** - Each variable has a single clear purpose

---

## 🧪 Testing After Cleanup

After removing the unused variable and redeploying, test:

1. **Health Check:**
   ```bash
   curl https://alttext-ai-backend.onrender.com/health
   # Should return: {"status":"ok",...}
   ```

2. **Alt Text Generation:**
   - Generate alt text in WordPress
   - Verify no 500 errors
   - Check usage counter updates

3. **Plans Endpoint:**
   ```bash
   curl https://alttext-ai-backend.onrender.com/billing/plans?service=alttext-ai
   # Should show all plans with priceIds
   ```

4. **Stripe Checkout:**
   - Try upgrading to a paid plan
   - Verify Stripe checkout loads
   - Test with Stripe test card

---

## 📝 Notes

- The backend uses **fallback values** for many optional variables
- If a variable is missing but has a default, the app will still work
- `OPENAI_REVIEW_API_KEY` is technically checked but never used because service-specific keys are always used instead
- All Stripe price IDs are now required (no hardcoded fallbacks)

---

## ✨ Conclusion

Your environment variables are already **very clean**! The only optimization is to remove `OPENAI_REVIEW_API_KEY` since it's redundant with the service-specific keys.

**Total Variables After Cleanup: 21** (down from 22)
