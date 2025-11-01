# Render Environment Variables Setup - Step by Step Guide

## 🎯 Goal
Set up Resend email service environment variables in Render dashboard so welcome and password reset emails work.

---

## 📋 Detailed Steps

### Step 1: Open Render Dashboard
1. Go to **https://dashboard.render.com**
2. Sign in with your account

### Step 2: Find Your Backend Service
1. You should see a list of services
2. Look for: **`alttext-ai-backend`**
3. Click on the service name to open it

### Step 3: Navigate to Environment Tab
1. Look at the **left sidebar menu**
2. Click on **"Environment"** (usually below "Settings" or "Logs")
3. You'll see a list of existing environment variables

### Step 4: Add RESEND_API_KEY
1. Click the **"+ Add Environment Variable"** button (usually at the top or bottom of the list)
2. In the **Key** field, type: `RESEND_API_KEY`
3. In the **Value** field, paste: `re_RvKoP4WQ_GWCmmWA3NPJPyN8f4xQ2FTqU`
4. Click **"Save Changes"** or **"Add"** button
5. You should see it appear in the list

### Step 5: Add RESEND_FROM_EMAIL
1. Click **"+ Add Environment Variable"** again
2. In the **Key** field, type: `RESEND_FROM_EMAIL`
3. In the **Value** field, type: `benoats@gmail.com`
4. Click **"Save Changes"** or **"Add"** button
5. You should see it appear in the list

### Step 6: Verify Both Variables
You should now see both variables in the list:
- ✅ `RESEND_API_KEY` = `re_RvKoP4WQ_...`
- ✅ `RESEND_FROM_EMAIL` = `benoats@gmail.com`

### Step 7: Wait for Auto-Redeploy
1. Render will **automatically start a new deployment**
2. You'll see a notification or the deployment will show in the **"Events"** or **"Deploys"** tab
3. Wait **2-3 minutes** for the deployment to complete
4. Status will show **"Live"** when done

---

## ✅ Verification Checklist

After deployment completes:

- [ ] Both environment variables are visible in Environment tab
- [ ] Service status shows "Live"
- [ ] Latest deployment completed successfully

---

## 🧪 Testing Emails

Once deployment is complete, test that emails work:

### Test Welcome Email:
1. Go to your WordPress site
2. Open the plugin (Media → AI Alt Text)
3. Register a new account
4. Check your email inbox for welcome message

### Test Password Reset:
1. Click "Forgot password" in the login modal
2. Enter your email
3. Check your email inbox for reset link

---

## 🆘 Troubleshooting

### Variables not showing?
- Make sure you saved each one
- Refresh the page
- Check you're in the right service (`alttext-ai-backend`)

### Deployment failed?
- Check the "Logs" tab for error messages
- Verify API key is correct (starts with `re_`)
- Make sure there are no extra spaces in the values

### Emails not sending?
- Check Render logs for error messages
- Verify API key is valid in Resend dashboard
- Make sure `benoats@gmail.com` is verified in your Resend account

---

## 📝 What Happens Next?

After these environment variables are set:
- ✅ **Welcome emails** will automatically send when users register
- ✅ **Password reset emails** will automatically send on reset requests
- ✅ Both emails will come from: `benoats@gmail.com`

---

**Ready to get started?** Follow steps 1-7 above! 🚀

