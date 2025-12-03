# Deployment Guide

## Overview

This document describes the deployment process for the AltText AI backend API.

## Current Deployment Setup

The backend is deployed to **Render.com** and automatically deploys on every push to the `main` branch.

## ⚠️ IMPORTANT: Deployment Protection

**Currently, Render is configured to auto-deploy on every push, regardless of GitHub Actions test status.**

### Problem
If GitHub Actions tests fail, Render will still deploy the broken code to production. This is a **critical security and quality issue**.

### Solution: Require GitHub Actions Status Checks

To prevent deployments when tests fail, you need to configure Render to require GitHub Actions status checks:

#### Option 1: Configure Render Dashboard (Recommended)

1. Go to your Render dashboard: https://dashboard.render.com
2. Navigate to your service: `alttext-ai-phase2`
3. Go to **Settings** → **Build & Deploy**
4. Under **Deploy Hooks** or **Auto-Deploy**, look for **"Required Status Checks"** or **"Branch Protection"**
5. Add the required status check: `Backend Tests / test (18.x)` and `Backend Tests / test (20.x)`
6. Save changes

#### Option 2: Use Render API (Advanced)

If the dashboard doesn't have this option, you can use the Render API to configure deployment protection.

#### Option 3: Manual Deployment Only

As a temporary measure, you can:
1. Disable auto-deploy in Render
2. Manually trigger deployments only after verifying GitHub Actions passes

## GitHub Actions Workflow

The `.github/workflows/tests.yml` workflow runs on every push to `main` and:
- Tests on Node.js 18.x and 20.x
- Runs unit tests
- Runs integration tests
- Uploads coverage reports

**The workflow must pass before deployment should be allowed.**

## Manual Deployment

If auto-deploy is disabled:

1. Verify GitHub Actions workflow passes: https://github.com/TheLaughingGod1986/optiap-backend/actions
2. Go to Render dashboard
3. Click **"Manual Deploy"** → **"Deploy latest commit"**

## Environment Variables

All required environment variables must be set in Render dashboard under **Environment**:

### Required Variables
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ALTTEXT_OPENAI_API_KEY`
- `SEO_META_OPENAI_API_KEY`
- `JWT_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`

### Email Service (Resend)
- `RESEND_API_KEY` - Resend API key (required)
- `EMAIL_FROM` - Default from email address
- `TRANSACTIONAL_FROM_EMAIL` - From email for general emails (defaults to `EMAIL_FROM`)
- `BILLING_FROM_EMAIL` - From email for receipts (defaults to `EMAIL_FROM`)
- `RESEND_AUDIENCE_ID` - Optional: Resend audience ID for subscriber management

### Branding Configuration
- `BRAND_NAME` - Brand name (defaults to "AltText AI")
- `BRAND_DOMAIN` - Brand domain (defaults to "optti.dev")
- `SUPPORT_EMAIL` - Support email (defaults to `support@${BRAND_DOMAIN}`)
- `FRONTEND_DASHBOARD_URL` - Dashboard URL (defaults to `https://app.${BRAND_DOMAIN}`)
- `PUBLIC_API_DOMAIN` - Public API domain (defaults to `api.${BRAND_DOMAIN}`)

See `config/env.example` for the complete list.

## Health Check

The service exposes a health check endpoint at `/health` which Render uses to verify the service is running.

## Rollback

If a deployment fails or causes issues:

1. Go to Render dashboard
2. Navigate to **Deploys** tab
3. Find the previous successful deployment
4. Click **"Rollback to this deploy"**

## Monitoring

- **Render Dashboard**: https://dashboard.render.com
- **GitHub Actions**: https://github.com/TheLaughingGod1986/optiap-backend/actions
- **Application Logs**: Available in Render dashboard under **Logs** tab
