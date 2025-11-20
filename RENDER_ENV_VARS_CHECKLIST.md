# Render Environment Variables - Quick Checklist

## ✅ Required Environment Variables for Render

Copy these to your Render dashboard → Environment tab:

### OpenAI API Keys (2 variables)
```bash
ALTTEXT_OPENAI_API_KEY=sk-proj-W8o-...
SEO_META_OPENAI_API_KEY=sk-proj-skizpk...
```

### Stripe Price IDs (5 variables)
```bash
# AltText AI Plugin (3 products)
ALTTEXT_AI_STRIPE_PRICE_PRO=price_1SMrxaJl9Rm418cMM4iikjlJ
ALTTEXT_AI_STRIPE_PRICE_AGENCY=price_1SMrxaJl9Rm418cMnJTShXSY
ALTTEXT_AI_STRIPE_PRICE_CREDITS=price_1SMrxbJl9Rm418cM0gkzZQZt

# SEO AI Meta Plugin (2 products)
SEO_AI_META_STRIPE_PRICE_PRO=price_1SQ72OJl9Rm418cMruYB5Pgb
SEO_AI_META_STRIPE_PRICE_AGENCY=price_1SQ72KJl9Rm418cMB0CYh8xe
```

### Supabase Database (NEW - REQUIRED)
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### Other Required Variables
```bash
JWT_SECRET=your-jwt-secret
JWT_EXPIRES_IN=7d
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
WEBHOOK_SECRET=your-webhook-secret
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@alttextai.com
NODE_ENV=production
FRONTEND_URL=https://your-frontend-url.com
```

## 🗑️ Variables to Remove (After Supabase Migration)

**IMPORTANT:** Remove these old variables from Render:

```bash
❌ DATABASE_URL          # Replaced by SUPABASE_URL
❌ SHADOW_DATABASE_URL   # No longer needed
❌ STRIPE_PRICE_PRO      # Replaced by service-specific prices
❌ STRIPE_PRICE_AGENCY   # Replaced by service-specific prices
❌ STRIPE_PRICE_CREDITS  # Replaced by service-specific prices
❌ OPENAI_API_KEY        # Replaced by service-specific keys (if present)
```

## 📝 Copy-Paste for Render

### Format: KEY=VALUE

```
ALTTEXT_OPENAI_API_KEY=sk-proj-W8o-LG98kweKE71s4KgXcTg13XXlvo4m01og2slXoRV0ohi2P037K3MDYEimGM4UkWUAY17J2LbL5EwwHQTXrJta1YwJsoLbyTa
SEO_META_OPENAI_API_KEY=sk-proj-skizpkSjnQAb1-L-ZjWdsGnoGOZF4BaYojn6jCfaHOTqPSBJOQ__zrCJZmwx
ALTTEXT_AI_STRIPE_PRICE_PRO=price_1SMrxaJl9Rm418cMM4iikjlJ
ALTTEXT_AI_STRIPE_PRICE_AGENCY=price_1SMrxaJl9Rm418cMnJTShXSY
ALTTEXT_AI_STRIPE_PRICE_CREDITS=price_1SMrxbJl9Rm418cM0gkzZQZt
SEO_AI_META_STRIPE_PRICE_PRO=price_1SQ72OJl9Rm418cMruYB5Pgb
SEO_AI_META_STRIPE_PRICE_AGENCY=price_1SQ72KJl9Rm418cMB0CYh8xe
```

## ✅ Verification Steps

After adding variables and deploying:

1. **Check health endpoint:**
   ```bash
   curl https://alttext-ai-backend.onrender.com/health
   # Should return: {"status":"ok", ...}
   ```

2. **Check AltText AI plans:**
   ```bash
   curl https://alttext-ai-backend.onrender.com/billing/plans?service=alttext-ai
   # Should show priceIds populated
   ```

3. **Check SEO AI Meta plans:**
   ```bash
   curl https://alttext-ai-backend.onrender.com/billing/plans?service=seo-ai-meta
   # Should show priceIds populated
   ```

4. **Test alt text generation in WordPress**
   - Generate alt text for an image
   - Verify no 500 errors
   - Verify usage counter updates

## 🎯 Summary

**Total New Variables:** 7
- 2 OpenAI API keys
- 5 Stripe Price IDs

**Variables to Remove:** 3-4 old ones after verification
