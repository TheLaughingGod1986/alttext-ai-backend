# 🔒 Branch Protection Setup Guide

## Why This Matters

Currently, **Render auto-deploys on every push to `main`, even when GitHub Actions tests fail**. This means broken code can reach production.

**Branch protection prevents broken code from being pushed to `main` in the first place.**

## Quick Setup (5 minutes)

### Step 1: Navigate to Branch Settings

1. Go to: https://github.com/TheLaughingGod1986/optiap-backend/settings/branches
2. Click **"Add rule"** or **"Add branch protection rule"**

### Step 2: Configure the Rule

**Branch name pattern:** `main`

**Enable these settings:**

✅ **Require status checks to pass before merging**
   - Check: `Backend Tests / test (18.x)`
   - Check: `Backend Tests / test (20.x)`
   - ✅ **Require branches to be up to date before merging**

✅ **Require pull request reviews before merging**
   - Set: `Required approving reviews: 0` (or 1 if you want reviews)
   - ✅ Dismiss stale pull request approvals when new commits are pushed

✅ **Restrict pushes that create files**
   - (Optional, but recommended)

✅ **Do not allow bypassing the above settings**
   - ✅ **Include administrators**

❌ **Allow force pushes** - **UNCHECKED** (important!)
❌ **Allow deletions** - **UNCHECKED** (important!)

### Step 3: Save

Click **"Create"** or **"Save changes"**

## What This Does

✅ **Prevents direct pushes to `main` that fail tests**
   - You'll need to create a pull request
   - Tests must pass before the PR can be merged

✅ **Blocks force pushes and branch deletion**
   - Prevents accidental or malicious changes

✅ **Applies to admins too**
   - Even you can't bypass these rules

## Important Notes

⚠️ **After enabling this:**
- You can still push to `main` directly, but only if tests pass
- If tests fail, you'll need to fix them before pushing
- For major changes, consider using feature branches and pull requests

⚠️ **Render will still auto-deploy**, but now:
- Only code that passes tests can reach `main`
- This provides the protection we need

## Alternative: Disable Auto-Deploy in Render

If you prefer manual control:

1. Go to Render dashboard: https://dashboard.render.com
2. Navigate to service: `alttext-ai-phase2`
3. **Settings** → **Build & Deploy**
4. **Disable "Auto-Deploy"**
5. Manually deploy only after verifying GitHub Actions passes

## Verification

After setting up branch protection:

1. Try pushing code that fails tests → Should be blocked
2. Fix tests and push again → Should succeed
3. Check that Render only deploys when tests pass

## Need Help?

- GitHub Docs: https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches
- Render Docs: https://render.com/docs/deploys

