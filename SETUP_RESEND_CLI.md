# Setting Up Resend Email via Render CLI

## Prerequisites

1. **Resend Account**: Sign up at [resend.com](https://resend.com) if you haven't already
2. **Resend API Key**: Get your API key from Resend dashboard
3. **Resend Domain**: Verify your sending domain in Resend (or use their test domain)

## Step 1: Install Render CLI

```bash
# macOS
brew install render

# Or download from: https://render.com/docs/cli
```

## Step 2: Login to Render

```bash
render login
```

This will open your browser to authenticate with Render.

## Step 3: Find Your Service Name

```bash
# List all your services
render services list

# Or check your render.yaml file for the service name
```

Common service names:
- `alttext-ai-backend`
- `alttext-backend`
- Or check your Render dashboard

## Step 4: Get Resend API Key

1. Go to [resend.com/api-keys](https://resend.com/api-keys)
2. Create a new API key
3. Copy the key (starts with `re_`)

## Step 5: Set Environment Variables

### Set Resend API Key
```bash
render env set RESEND_API_KEY=re_your_actual_api_key_here --service YOUR_SERVICE_NAME
```

### Set From Email Address
```bash
render env set RESEND_FROM_EMAIL=noreply@yourdomain.com --service YOUR_SERVICE_NAME
```

**Note**: 
- Replace `YOUR_SERVICE_NAME` with your actual Render service name
- Replace `noreply@yourdomain.com` with your verified domain in Resend
- Or use Resend's test domain: `onboarding@resend.dev` (for testing only)

### Example (using alttext-ai-backend):
```bash
render env set RESEND_API_KEY=re_1234567890abcdef --service alttext-ai-backend
render env set RESEND_FROM_EMAIL=noreply@alttextai.com --service alttext-ai-backend
```

## Step 6: Verify Environment Variables

```bash
render env list --service YOUR_SERVICE_NAME
```

You should see:
- `RESEND_API_KEY` ✓
- `RESEND_FROM_EMAIL` ✓

## Step 7: Redeploy Backend

After setting environment variables, Render will automatically redeploy. Or trigger manually:

```bash
render deployments create --service YOUR_SERVICE_NAME
```

## Step 8: Test Email Sending

### Test Welcome Email:
1. Create a new account via the WordPress plugin
2. Check the user's email inbox
3. Check backend logs for: `✅ Welcome email sent via Resend to...`

### Test Password Reset:
1. Request password reset via WordPress plugin
2. Check email inbox for reset link
3. Check backend logs for: `✅ Password reset email sent via Resend to...`

## Troubleshooting

### Emails not sending?
1. **Check API Key**: Verify `RESEND_API_KEY` is set correctly
2. **Check Domain**: Make sure your domain is verified in Resend
3. **Check Logs**: Look for error messages in Render logs
4. **Test Domain**: Use `onboarding@resend.dev` for initial testing

### View Render Logs:
```bash
render logs --service YOUR_SERVICE_NAME --follow
```

### Common Errors:

**"Invalid API key"**
- Check that API key starts with `re_`
- Verify key hasn't been revoked in Resend dashboard

**"Domain not verified"**
- Go to Resend dashboard → Domains
- Verify your domain DNS records
- Or use test domain for development

**"Email not in allowed list"**
- Resend test mode only sends to verified email addresses
- Add your test email to Resend dashboard → Settings → Test Mode

## Email Templates Configured

✅ **Welcome Email** - Sent on user registration
- Subject: "Welcome to SEO AI Alt Text Generator! 🎉"
- Includes: Getting started guide, free plan details, next steps

✅ **Password Reset Email** - Sent on password reset request
- Subject: "Reset Your AltText AI Password"
- Includes: Reset link, expiration notice, security note

## Next Steps

Once emails are working:
1. ✅ Remove `DEBUG_EMAIL=true` if set (no longer needed)
2. ✅ Monitor Resend dashboard for delivery stats
3. ✅ Customize email templates in `backend/auth/email.js` if needed
4. ✅ Set up Resend domain for production use

---

**Need Help?**
- Resend Docs: https://resend.com/docs
- Render CLI Docs: https://render.com/docs/cli
- Check backend logs: `render logs --service YOUR_SERVICE_NAME`

