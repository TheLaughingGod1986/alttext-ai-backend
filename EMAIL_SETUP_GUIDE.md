# Email Setup Guide - Password Reset Emails

## Current Status

**⚠️ Emails are NOT being sent yet.** The email service is currently mocked (logs to console).

## Quick Setup (Recommended: Resend)

### Step 1: Install Resend Package
```bash
cd backend
npm install resend
```

### Step 2: Get Resend API Key
1. Sign up at [resend.com](https://resend.com)
2. Create an API key
3. Verify your domain (or use their test domain)

### Step 3: Set Environment Variable in Render
In your Render dashboard:
- Go to your backend service → Environment
- Add: `RESEND_API_KEY=re_your_api_key_here`
- Add: `RESEND_FROM_EMAIL=noreply@yourdomain.com` (optional, defaults to `noreply@alttextai.com`)
- Deploy

### Step 4: Test
Request a password reset - the email should now be sent!

---

## Alternative: SendGrid Setup

### Step 1: Install SendGrid Package
```bash
cd backend
npm install @sendgrid/mail
```

### Step 2: Get SendGrid API Key
1. Sign up at [sendgrid.com](https://sendgrid.com)
2. Create an API key with "Mail Send" permissions
3. Verify your sender email/domain

### Step 3: Set Environment Variables in Render
- `SENDGRID_API_KEY=SG.your_api_key_here`
- `SENDGRID_FROM_EMAIL=noreply@yourdomain.com` (optional)

---

## How It Works Now

### Without Email Service (Current):
- User requests password reset
- Backend creates token ✅
- Email logged to console only ❌
- User sees reset link in UI if `DEBUG_EMAIL=true` ✅

### With Email Service (After Setup):
- User requests password reset
- Backend creates token ✅
- **Real email sent to user** ✅
- User clicks link in email ✅
- Password reset works ✅

---

## Testing Email Setup

### 1. Check Environment Variables
```bash
# In Render dashboard, verify:
RESEND_API_KEY is set (or SENDGRID_API_KEY)
```

### 2. Test Password Reset
1. Request password reset via WordPress plugin
2. Check backend logs for:
   - `✅ Password reset email sent via Resend to user@example.com` (success)
   - OR error message if misconfigured

### 3. Check User's Email
- User should receive email
- Email contains reset link
- Link works when clicked

---

## Troubleshooting

### Email not sending?
1. Check environment variables in Render are set correctly
2. Check backend logs for error messages
3. Verify API key is valid and has correct permissions
4. For Resend: Verify domain is authenticated
5. For SendGrid: Verify sender email is verified

### Still seeing reset link in UI?
- That's expected if `DEBUG_EMAIL=true` OR `NODE_ENV != production`
- Disable by removing `DEBUG_EMAIL` env var

---

## Production Recommendation

**Use Resend:**
- Modern, simple API
- Good deliverability
- Easy setup
- Free tier: 3,000 emails/month
- Paid: $20/month for 50,000 emails

**Or SendGrid:**
- Established provider
- Free tier: 100 emails/day
- Good for high volume
- More configuration options

Both are supported in the code - just set the appropriate environment variable!

