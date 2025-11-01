# Setting Resend Environment Variables in Render

## ✅ Configuration Updated

I've updated `render-phase2.yaml` to include Resend configuration. However, environment variables with `sync: false` need to be set manually in the Render dashboard.

## 🔧 Quick Setup Steps

### 1. Go to Render Dashboard
Visit: https://dashboard.render.com

### 2. Find Your Service
- Navigate to your service: **alttext-ai-phase2**
- Or search for it in the services list

### 3. Open Environment Tab
- Click on your service
- Go to the **"Environment"** tab in the left sidebar

### 4. Add Environment Variables

Add these two environment variables:

#### Variable 1: RESEND_API_KEY
- **Key:** `RESEND_API_KEY`
- **Value:** `re_RvKoP4WQ_GWCmmWA3NPJPyN8f4xQ2FTqU`
- Click **"Save Changes"**

#### Variable 2: RESEND_FROM_EMAIL
- **Key:** `RESEND_FROM_EMAIL`
- **Value:** `benoats@gmail.com`
- Click **"Save Changes"**

### 5. Automatic Redeploy
Render will automatically redeploy your service with the new environment variables.

## ✅ Verification

After deployment, check the logs to verify emails are working:

1. Go to **Logs** tab in Render dashboard
2. Create a new user account via WordPress plugin
3. Look for: `✅ Welcome email sent via Resend to...`
4. Request a password reset
5. Look for: `✅ Password reset email sent via Resend to...`

## 📧 Email Configuration

✅ **Welcome Emails**
- Sent automatically when users register
- HTML template with branding
- Includes getting started guide

✅ **Password Reset Emails**
- Sent on password reset requests
- Includes secure reset link
- Link expires in 1 hour

## 🧪 Testing

Test the setup:
1. Register a new account via WordPress plugin
2. Check email inbox for welcome message
3. Request password reset
4. Check email for reset link
5. Click link and reset password

## ⚠️ Notes

- **From Email:** Using `benoats@gmail.com` - make sure this email is verified in Resend
- **Domain:** For production, consider verifying a custom domain in Resend
- **Rate Limits:** Resend free tier allows 100 emails/day, 3,000/month
- **Logs:** Check Render logs if emails aren't sending

## 🆘 Troubleshooting

**Emails not sending?**
1. Check Render logs for error messages
2. Verify API key is correct in Render dashboard
3. Check Resend dashboard for delivery status
4. Ensure from email is verified in Resend account

**Need to update API key?**
- Just update the `RESEND_API_KEY` environment variable in Render dashboard
- Service will redeploy automatically

---

**Status:** Ready to configure in Render dashboard! 🚀

