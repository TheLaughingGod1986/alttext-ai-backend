# Troubleshooting 500/502 Errors

## Current Status
- ✅ Backend health endpoint working: `{"status":"ok"}`
- ✅ Plans endpoints working for both services
- ❌ Generation endpoints returning 500/502 errors

## Root Cause Analysis

The 500/502 errors are most likely caused by **missing OpenAI API keys** in the Render environment.

### What's Happening

When you try to generate alt text or meta tags, the backend code (server-v2.js lines 62-75) checks for the appropriate API key:

```javascript
const apiKey = service === 'seo-ai-meta'
  ? process.env.SEO_META_OPENAI_API_KEY
  : process.env.ALTTEXT_OPENAI_API_KEY;

if (!apiKey) {
  console.error(`Missing OpenAI API key for service: ${service}`);
  return res.status(500).json({
    error: 'Failed to generate alt text',
    code: 'GENERATION_ERROR',
    message: `Missing OpenAI API key for service: ${service}`
  });
}
```

If either key is missing, it returns a 500 error.

## Solution

### Step 1: Verify Environment Variables in Render

Go to your Render dashboard → Your service → Environment tab and verify these variables exist:

```bash
ALTTEXT_OPENAI_API_KEY=sk-proj-W8o-LG98kweKE71s4KgXcTg13XXlvo4m01og2slXoRV0ohi2P037K3MDYEimGM4UkWUAY17J2LbL5EwwHQTXrJta1YwJsoLbyTa
SEO_META_OPENAI_API_KEY=sk-proj-skizpkSjnQAb1-L-ZjWdsGnoGOZF4BaYojn6jCfaHOTqPSBJOQ__zrCJZmwx
```

### Step 2: Check for Old Variable Names

Make sure you **removed** the old variable:
- ❌ `OPENAI_API_KEY` (old, not used anymore)

And that you **added** the new service-specific variables:
- ✅ `ALTTEXT_OPENAI_API_KEY`
- ✅ `SEO_META_OPENAI_API_KEY`

### Step 3: Manual Redeploy

If the variables are set but errors persist:

1. Go to Render dashboard
2. Click "Manual Deploy" → "Deploy latest commit"
3. Wait for deployment to complete (~2-3 minutes)

### Step 4: Check Render Logs

After deployment, check the logs in Render dashboard for:
- `Missing OpenAI API key for service: alttext-ai`
- `Missing OpenAI API key for service: seo-ai-meta`

If you see these messages, the environment variables aren't being picked up.

## Quick Test

Once you've verified/added the environment variables and redeployed, test with:

### Test Alt Text Generation
1. Go to WordPress → Media Library
2. Select an image
3. Click "Generate Alt Text"
4. Should work without 500 error

### Test SEO Meta Generation
1. Go to WordPress → SEO AI Meta plugin
2. Try generating meta tags for a post
3. Should work without 502 error

## Common Issues

### Issue 1: Variables Not Set
**Symptom**: 500 errors on both plugins
**Solution**: Add both `ALTTEXT_OPENAI_API_KEY` and `SEO_META_OPENAI_API_KEY` to Render

### Issue 2: Only One Variable Set
**Symptom**: One plugin works, the other returns 500 error
**Solution**: Add the missing API key variable

### Issue 3: Variables Set But Not Loaded
**Symptom**: Variables are in Render dashboard but still getting errors
**Solution**: Manual redeploy to pick up new environment variables

### Issue 4: Typo in Variable Name
**Symptom**: 500 errors even after setting variables
**Solution**: Verify exact spelling:
- `ALTTEXT_OPENAI_API_KEY` (not `ALT_TEXT` or `ALTTEXT_AI`)
- `SEO_META_OPENAI_API_KEY` (not `SEO_AI_META`)

## Expected Behavior After Fix

✅ Alt Text AI plugin:
- Generates alt text successfully
- Usage counter updates
- No 500 errors

✅ SEO AI Meta plugin:
- Generates meta tags successfully
- Usage counter updates (showing 3 of 10 used)
- No 502 errors

## Need More Help?

If errors persist after following these steps:

1. **Check Render logs** for the exact error message
2. **Verify API keys are valid** in your OpenAI dashboard
3. **Check the service parameter** is being sent correctly from plugins

### Debugging Commands

```bash
# Test health
curl https://alttext-ai-backend.onrender.com/health

# Test plans endpoints (these should work)
curl "https://alttext-ai-backend.onrender.com/billing/plans?service=alttext-ai"
curl "https://alttext-ai-backend.onrender.com/billing/plans?service=seo-ai-meta"
```

## Environment Variable Checklist

Copy this to verify your Render environment:

```bash
✅ DATABASE_URL=postgresql://...
✅ JWT_SECRET=...
✅ JWT_EXPIRES_IN=7d
✅ ALTTEXT_OPENAI_API_KEY=sk-proj-W8o-...
✅ SEO_META_OPENAI_API_KEY=sk-proj-skizpk...
✅ OPENAI_MODEL=gpt-4o-mini
✅ OPENAI_REVIEW_MODEL=gpt-4o-mini
✅ STRIPE_SECRET_KEY=sk_live_...
✅ STRIPE_PUBLISHABLE_KEY=pk_live_...
✅ STRIPE_WEBHOOK_SECRET=whsec_...
✅ ALTTEXT_AI_STRIPE_PRICE_PRO=price_1SMrxaJl9Rm418cMM4iikjlJ
✅ ALTTEXT_AI_STRIPE_PRICE_AGENCY=price_1SMrxaJl9Rm418cMnJTShXSY
✅ ALTTEXT_AI_STRIPE_PRICE_CREDITS=price_1SMrxbJl9Rm418cM0gkzZQZt
✅ SEO_AI_META_STRIPE_PRICE_PRO=price_1SQ72OJl9Rm418cMruYB5Pgb
✅ SEO_AI_META_STRIPE_PRICE_AGENCY=price_1SQ72KJl9Rm418cMB0CYh8xe
✅ RESEND_API_KEY=re_...
✅ RESEND_FROM_EMAIL=noreply@alttextai.com
✅ WEBHOOK_SECRET=...
✅ NODE_ENV=production
✅ FRONTEND_URL=...
```

## Timeline

1. **Before deployment**: Old code used `OPENAI_API_KEY` (generic)
2. **After code update**: New code uses `ALTTEXT_OPENAI_API_KEY` and `SEO_META_OPENAI_API_KEY` (service-specific)
3. **Current issue**: Environment variables may not be set or deployment didn't pick them up

**Next step**: Verify environment variables in Render dashboard and redeploy if needed.
