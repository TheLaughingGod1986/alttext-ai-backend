# Fix: Resend Domain Verification Issue

## 🎯 The Problem

Resend **requires domain verification** for sending emails. 

**Gmail addresses (like `benoats@gmail.com`) don't work because:**
- ❌ You can't verify `gmail.com` domain (you don't own it)
- ❌ Resend blocks unverified domains  
- ❌ Gmail/Yahoo/AOL have strict DMARC policies that prevent third-party sending

## ✅ Quick Fix: Use Resend Test Domain

### Step 1: Update Environment Variable
1. Go to **Render Dashboard** → `alttext-ai-backend` → **Environment** tab
2. Find `RESEND_FROM_EMAIL`
3. Click **Edit**
4. Change value to: `onboarding@resend.dev`
5. Click **Save** (service will auto-redeploy)

### Step 2: Test
- Wait for deployment to finish (~2 minutes)
- Request password reset
- Check email inbox - should receive email!

## 📋 What is `onboarding@resend.dev`?

- ✅ Provided by Resend (works immediately)
- ✅ No domain verification needed
- ✅ Perfect for testing
- ✅ Free tier supports up to 100 emails/day

## 🚀 For Production: Verify Your Domain

When you're ready for production:

### Option 1: Verify alttextai.com
1. Go to https://resend.com/domains
2. Click **"Add Domain"**
3. Enter: `alttextai.com`
4. Resend provides DNS records (SPF, DKIM, etc.)
5. Add them to your domain's DNS settings
6. Wait for verification (can take a few hours)
7. Once verified, change `RESEND_FROM_EMAIL` to: `noreply@alttextai.com`

### Option 2: Use Subdomain
- Verify a subdomain like `mail.alttextai.com`
- Use: `noreply@mail.alttextai.com`

## 🧪 Testing After Fix

Once you update to `onboarding@resend.dev`:
1. Restart/deploy service (auto-happens when you save)
2. Request password reset
3. Check Render logs for:
   - `✅ RESEND_API_KEY found`
   - `✅ Password reset email sent via Resend`
   - `Email ID: [some-id]`
4. Check email inbox!

## 📝 Current Setup

- ✅ `RESEND_API_KEY` = Set correctly
- ❌ `RESEND_FROM_EMAIL` = `benoats@gmail.com` (won't work)
- 🔧 **Change to:** `onboarding@resend.dev` (will work!)

---

**Quick Fix:** Change `RESEND_FROM_EMAIL` to `onboarding@resend.dev` in Render! 🚀

