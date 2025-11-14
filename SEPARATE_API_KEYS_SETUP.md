# Separate API Keys Setup Guide

This guide explains how to use separate OpenAI API keys for each WordPress plugin (AltText AI and SEO AI Meta Generator) using Render environment variables.

## Overview

Instead of storing API keys in the WordPress CMS/database, you can now:
- Store all API keys as Render environment variables
- Use a **separate OpenAI API key for each plugin**
- Maintain better security and cost tracking
- Avoid exposing API keys in the WordPress admin

## How It Works

The backend service now supports service-specific API keys:
- When a plugin sends a request, it includes a `service` identifier
- The backend selects the appropriate API key based on the service
- If no service-specific key is set, it falls back to the default key

### Service Identifiers
- **AltText AI**: Uses `service: 'alttext-ai'`
- **SEO AI Meta Generator**: Uses `service: 'seo-ai-meta'`

## Render Environment Variables Setup

### Step 1: Access Render Dashboard

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Select your backend service (e.g., `alttext-ai-backend`)
3. Click on **Environment** in the left sidebar

### Step 2: Add Service-Specific API Keys

Add these environment variables:

#### For AltText AI Plugin

**Variable 1: ALTTEXT_OPENAI_API_KEY**
- **Key:** `ALTTEXT_OPENAI_API_KEY`
- **Value:** `sk-proj-...` (your AltText AI OpenAI key)
- Click **Add**

#### For SEO AI Meta Generator Plugin

**Variable 2: SEO_META_OPENAI_API_KEY**
- **Key:** `SEO_META_OPENAI_API_KEY`
- **Value:** `sk-proj-...` (your SEO Meta Generator OpenAI key)
- Click **Add**

#### Fallback/Default Key (Optional)

**Variable 3: OPENAI_API_KEY** (fallback)
- **Key:** `OPENAI_API_KEY`
- **Value:** `sk-proj-...` (your default OpenAI key)
- This is used when service-specific keys aren't set

### Step 3: Save Changes

After adding all variables, Render will automatically redeploy your service.

### Step 4: Verify Configuration

Use the Render CLI or dashboard to verify:

```bash
# List all environment variables
render env list --service alttext-ai-backend

# You should see:
# ALTTEXT_OPENAI_API_KEY = sk-proj-***...
# SEO_META_OPENAI_API_KEY = sk-proj-***...
# OPENAI_API_KEY = sk-proj-***...
```

## Configuration Options

### Option 1: Separate Keys for Each Plugin (Recommended)

```env
# AltText AI uses this key
ALTTEXT_OPENAI_API_KEY=sk-proj-xxx-alttext

# SEO AI Meta Generator uses this key
SEO_META_OPENAI_API_KEY=sk-proj-xxx-seo-meta

# Optional fallback key
OPENAI_API_KEY=sk-proj-xxx-default
```

**Benefits:**
- Separate billing/usage tracking per plugin
- Different rate limits per plugin
- Better security isolation
- Can use different OpenAI organizations

### Option 2: Shared Key for All Plugins

```env
# All plugins use this key
OPENAI_API_KEY=sk-proj-xxx-shared
```

**Benefits:**
- Simpler setup
- Single billing account

### Option 3: Mixed Configuration

```env
# AltText AI uses dedicated key
ALTTEXT_OPENAI_API_KEY=sk-proj-xxx-alttext

# SEO AI Meta uses fallback key
OPENAI_API_KEY=sk-proj-xxx-shared
```

## Priority/Fallback Logic

The backend selects API keys in this order:

### For AltText AI Requests (`service: 'alttext-ai'`)
1. `ALTTEXT_OPENAI_API_KEY` (if set)
2. `OPENAI_API_KEY` (fallback)

### For SEO AI Meta Requests (`service: 'seo-ai-meta'`)
1. `SEO_META_OPENAI_API_KEY` (if set)
2. `OPENAI_API_KEY` (fallback)

### For Review/Analysis Requests
1. `OPENAI_REVIEW_API_KEY` (if set)
2. Service-specific key (if available)
3. `OPENAI_API_KEY` (fallback)

## Removing API Keys from WordPress CMS

After setting up Render environment variables, you can safely remove API keys from WordPress:

### For AltText AI
1. Go to **WordPress Admin → AltText AI → Settings**
2. Clear the "OpenAI API Key" field
3. Save changes
4. The plugin will still work using the Render environment variable

### For SEO AI Meta Generator
1. Go to **WordPress Admin → SEO AI Meta → Settings**
2. Clear the "OpenAI API Key" field
3. Save changes
4. The plugin will still work using the Render environment variable

## Security Benefits

1. **No API keys in database:** Keys are never stored in WordPress
2. **No exposure in admin:** Keys won't appear in WordPress admin panel
3. **Server-side only:** Keys remain on the backend service
4. **Better access control:** Only Render admins can view/modify keys
5. **Audit trail:** Render logs all environment variable changes

## Cost Tracking & Usage Monitoring

With separate keys, you can:

1. **Track costs per plugin** in OpenAI dashboard
2. **Set different rate limits** per plugin
3. **Use different OpenAI organizations** if needed
4. **Monitor usage separately** for each service

### Setting Up OpenAI Usage Tracking

1. Create separate OpenAI API keys for each plugin
2. Give them descriptive names:
   - "AltText AI - Production"
   - "SEO Meta Generator - Production"
3. Set up usage alerts in OpenAI dashboard for each key
4. Configure different spending limits if needed

## Testing the Configuration

### Test AltText AI

1. In WordPress, upload an image
2. Click "Generate Alt Text"
3. Check Render logs to verify the correct key is being used:

```bash
render logs --service alttext-ai-backend --tail

# Look for:
# "Using API key for service: alttext-ai"
```

### Test SEO AI Meta Generator

1. Edit a post in WordPress
2. Click "Generate SEO Meta"
3. Check Render logs to verify:

```bash
render logs --service alttext-ai-backend --tail

# Look for:
# "Using API key for service: seo-ai-meta"
```

## Troubleshooting

### Issue: "Missing OpenAI API key" Error

**Solution:** Ensure at least one of these is set in Render:
- Service-specific key (`ALTTEXT_OPENAI_API_KEY` or `SEO_META_OPENAI_API_KEY`)
- Default fallback key (`OPENAI_API_KEY`)

### Issue: Wrong API Key Being Used

**Check:**
1. Verify the `service` parameter is being sent from the plugin
2. Check Render logs to see which key is selected
3. Ensure environment variable names are spelled correctly

### Issue: Plugin Still Using Old CMS Key

**Solution:**
1. Clear the API key field in WordPress settings
2. Clear any WordPress transients/cache
3. Test again

## Migration Checklist

- [ ] Add `ALTTEXT_OPENAI_API_KEY` to Render environment
- [ ] Add `SEO_META_OPENAI_API_KEY` to Render environment
- [ ] Wait for Render to redeploy
- [ ] Test AltText AI in WordPress
- [ ] Test SEO AI Meta Generator in WordPress
- [ ] Clear API keys from WordPress settings (optional)
- [ ] Set up usage alerts in OpenAI dashboard
- [ ] Document which keys are used for which plugin

## Additional Environment Variables

You can also set separate keys for other features:

```env
# Review/Quality Analysis (optional)
OPENAI_REVIEW_API_KEY=sk-proj-xxx-review
OPENAI_REVIEW_MODEL=gpt-4o-mini

# Model Selection (optional)
OPENAI_MODEL=gpt-4o-mini
```

## Support

If you encounter issues:
1. Check Render logs: `render logs --service alttext-ai-backend --tail`
2. Verify environment variables: `render env list --service alttext-ai-backend`
3. Test API keys directly using OpenAI Playground
4. Contact support with log excerpts

## Next Steps

1. Set up the environment variables in Render (see Step 2 above)
2. Test both plugins to ensure they work correctly
3. Monitor usage in OpenAI dashboard to verify separation
4. Set up billing alerts for each API key
