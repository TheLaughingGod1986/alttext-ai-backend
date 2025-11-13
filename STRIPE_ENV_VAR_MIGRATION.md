# Stripe Environment Variables Migration Guide

## Overview

Migrated from hardcoded and generic Stripe Price IDs to clean, service-specific environment variables for better organization and maintainability.

## What Changed

### Old Environment Variables (Before)
```bash
STRIPE_PRICE_PRO=price_1SMrxaJl9Rm418cMM4iikjlJ
STRIPE_PRICE_AGENCY=price_1SMrxaJl9Rm418cMnJTShXSY
STRIPE_PRICE_CREDITS=price_1SMrxbJl9Rm418cM0gkzZQZt
```

SEO AI Meta prices were **hardcoded** in the code.

### New Environment Variables (After)

#### AltText AI Plugin (3 products)
```bash
ALTTEXT_AI_STRIPE_PRICE_PRO=price_1SMrxaJl9Rm418cMM4iikjlJ
ALTTEXT_AI_STRIPE_PRICE_AGENCY=price_1SMrxaJl9Rm418cMnJTShXSY
ALTTEXT_AI_STRIPE_PRICE_CREDITS=price_1SMrxbJl9Rm418cM0gkzZQZt
```

#### SEO AI Meta Plugin (2 products)
```bash
SEO_AI_META_STRIPE_PRICE_PRO=price_1SQ72OJl9Rm418cMruYB5Pgb
SEO_AI_META_STRIPE_PRICE_AGENCY=price_1SQ72KJl9Rm418cMB0CYh8xe
```

## Benefits

### 1. **Clarity & Organization**
- ✅ Clear naming convention shows which product belongs to which service
- ✅ Easy to understand at a glance
- ✅ No confusion between plugins

### 2. **No Hardcoded Values**
- ✅ All Stripe Price IDs are now in environment variables
- ✅ Easy to change without code deployment
- ✅ Better for testing (can swap IDs easily)

### 3. **Scalability**
- ✅ Easy to add more services in the future
- ✅ Consistent naming pattern: `{SERVICE}_STRIPE_PRICE_{PLAN}`
- ✅ Self-documenting configuration

## Files Changed

### 1. `routes/billing.js`
- Updated `/checkout` endpoint to use new env vars
- Updated `/plans` endpoint to use new env vars
- Replaced hardcoded SEO AI Meta prices with env vars

### 2. `stripe/checkout.js`
- Updated checkout session creation
- Updated webhook handlers
- Updated plan detection logic to support both services

## Migration Steps for Render

### Step 1: Add New Environment Variables

Go to your Render dashboard → Environment variables, and add these **5 new variables**:

```bash
ALTTEXT_AI_STRIPE_PRICE_PRO=price_1SMrxaJl9Rm418cMM4iikjlJ
ALTTEXT_AI_STRIPE_PRICE_AGENCY=price_1SMrxaJl9Rm418cMnJTShXSY
ALTTEXT_AI_STRIPE_PRICE_CREDITS=price_1SMrxbJl9Rm418cM0gkzZQZt
SEO_AI_META_STRIPE_PRICE_PRO=price_1SQ72OJl9Rm418cMruYB5Pgb
SEO_AI_META_STRIPE_PRICE_AGENCY=price_1SQ72KJl9Rm418cMB0CYh8xe
```

### Step 2: Remove Old Environment Variables (Optional)

After deployment succeeds, you can remove these old variables:

```bash
STRIPE_PRICE_PRO          # ❌ Remove (replaced)
STRIPE_PRICE_AGENCY       # ❌ Remove (replaced)
STRIPE_PRICE_CREDITS      # ❌ Remove (replaced)
```

> **Note**: Keep the old variables until deployment is verified to avoid downtime.

### Step 3: Deploy Backend

The code changes automatically use the new environment variables. Deploy and verify.

## Verification Checklist

After deploying, verify these work:

### AltText AI Plugin
- [ ] Can view pricing plans at `/billing/plans?service=alttext-ai`
- [ ] Can upgrade to Pro plan
- [ ] Can upgrade to Agency plan
- [ ] Can purchase Credit Pack
- [ ] Webhooks update user plan correctly

### SEO AI Meta Plugin
- [ ] Can view pricing plans at `/billing/plans?service=seo-ai-meta`
- [ ] Can upgrade to Pro plan
- [ ] Can upgrade to Agency plan
- [ ] Webhooks update user plan correctly

## Environment Variable Reference

### Complete List

| Variable | Service | Plan | Price ID (Example) |
|----------|---------|------|-------------------|
| `ALTTEXT_AI_STRIPE_PRICE_PRO` | AltText AI | Pro | `price_1SMrxaJl9Rm418cMM4iikjlJ` |
| `ALTTEXT_AI_STRIPE_PRICE_AGENCY` | AltText AI | Agency | `price_1SMrxaJl9Rm418cMnJTShXSY` |
| `ALTTEXT_AI_STRIPE_PRICE_CREDITS` | AltText AI | Credits | `price_1SMrxbJl9Rm418cM0gkzZQZt` |
| `SEO_AI_META_STRIPE_PRICE_PRO` | SEO AI Meta | Pro | `price_1SQ72OJl9Rm418cMruYB5Pgb` |
| `SEO_AI_META_STRIPE_PRICE_AGENCY` | SEO AI Meta | Agency | `price_1SQ72KJl9Rm418cMB0CYh8xe` |

### Naming Convention

```
{SERVICE_NAME}_STRIPE_PRICE_{PLAN_TYPE}
```

Examples:
- `ALTTEXT_AI_STRIPE_PRICE_PRO`
- `SEO_AI_META_STRIPE_PRICE_AGENCY`

## Backward Compatibility

The old environment variables (`STRIPE_PRICE_PRO`, `STRIPE_PRICE_AGENCY`, `STRIPE_PRICE_CREDITS`) are **no longer used** after this migration. The code now exclusively uses the new service-specific variables.

## Troubleshooting

### Issue: "Invalid price ID" error

**Cause**: Environment variables not set correctly.

**Solution**:
1. Check Render dashboard → Environment variables
2. Verify all 5 new variables are present
3. Verify values match your Stripe dashboard
4. Redeploy the service

### Issue: Plans endpoint returns null priceIds

**Cause**: Environment variables not loaded.

**Solution**:
1. Redeploy the service (environment changes require redeploy)
2. Check startup logs for any environment variable warnings
3. Test with: `curl https://your-backend.onrender.com/billing/plans?service=alttext-ai`

### Issue: Old variables still present

**Cause**: Old variables not removed.

**Solution**:
Remove old variables after verifying new deployment works:
- `STRIPE_PRICE_PRO`
- `STRIPE_PRICE_AGENCY`
- `STRIPE_PRICE_CREDITS`

## Testing

### Test Plans Endpoint

```bash
# Test AltText AI plans
curl https://alttext-ai-backend.onrender.com/billing/plans?service=alttext-ai

# Should return plans with priceIds populated

# Test SEO AI Meta plans
curl https://alttext-ai-backend.onrender.com/billing/plans?service=seo-ai-meta

# Should return plans with priceIds populated
```

### Test Checkout

1. Log in to WordPress plugin
2. Go to upgrade page
3. Select a plan
4. Verify Stripe checkout opens
5. Complete purchase (use Stripe test mode)
6. Verify plan updates correctly

## Related Files

- Backend billing routes: `routes/billing.js`
- Stripe checkout: `stripe/checkout.js`
- Environment example: `env.example`
- Migration guide: This file

## Support

If you encounter issues:
1. Check Render deployment logs
2. Verify all 5 environment variables are set
3. Test the `/billing/plans` endpoint
4. Check browser console for API errors
5. Review Stripe webhook logs

## Next Steps

After successful migration:
1. ✅ Remove old environment variables from Render
2. ✅ Update documentation
3. ✅ Test both plugins end-to-end
4. Consider adding environment variable validation on startup
