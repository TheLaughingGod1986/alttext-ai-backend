# Setting Up Your Local .env File

## ✅ .env File Created

I've created a `.env` file from `env.example`. Now you need to fill in your actual credentials.

---

## 🔑 Required Credentials to Update

### 1. Supabase (REQUIRED for backend to work)

**Get these from:** Supabase Dashboard → Settings → API

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

**Steps:**
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to Settings → API
4. Copy "Project URL" → paste as `SUPABASE_URL`
5. Copy "service_role" key (under "Project API keys") → paste as `SUPABASE_SERVICE_ROLE_KEY`

⚠️ **Important:** Use the **service_role** key (not the anon key) - it has full database access.

---

### 2. JWT Authentication (REQUIRED)

```bash
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
```

**Generate a secure JWT_SECRET:**
```bash
# Option 1: Use openssl
openssl rand -base64 32

# Option 2: Use node
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Option 3: Use online generator
# https://generate-secret.vercel.app/32
```

---

### 3. OpenAI API Keys (REQUIRED)

```bash
ALTTEXT_OPENAI_API_KEY=sk-your-alttext-openai-api-key
SEO_META_OPENAI_API_KEY=sk-your-seo-meta-openai-api-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_REVIEW_API_KEY=sk-your-review-api-key
OPENAI_REVIEW_MODEL=gpt-4o-mini
```

**Get these from:** https://platform.openai.com/api-keys

---

### 4. Stripe (REQUIRED for billing)

**For local testing, use Stripe TEST keys:**

```bash
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
```

**Get these from:** https://dashboard.stripe.com/test/apikeys

**Stripe Price IDs** (these are already set in env.example):
```bash
ALTTEXT_AI_STRIPE_PRICE_PRO=price_1SMrxaJl9Rm418cMM4iikjlJ
ALTTEXT_AI_STRIPE_PRICE_AGENCY=price_1SMrxaJl9Rm418cMnJTShXSY
ALTTEXT_AI_STRIPE_PRICE_CREDITS=price_1SMrxbJl9Rm418cM0gkzZQZt
SEO_AI_META_STRIPE_PRICE_PRO=price_1SQ72OJl9Rm418cMruYB5Pgb
SEO_AI_META_STRIPE_PRICE_AGENCY=price_1SQ72KJl9Rm418cMB0CYh8xe
```

---

### 5. Email Service (REQUIRED for password reset)

**Using Resend (recommended):**

```bash
RESEND_API_KEY=re_your_resend_api_key
RESEND_FROM_EMAIL=noreply@alttextai.com
```

**Get Resend API key from:** https://resend.com/api-keys

---

### 6. Application Settings

```bash
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
WEBHOOK_SECRET=your-webhook-secret-for-monthly-reset
```

**Generate WEBHOOK_SECRET:**
```bash
openssl rand -hex 32
```

---

## 🚀 Quick Start (Minimum Required)

To get the server running quickly, you **must** set at minimum:

1. ✅ `SUPABASE_URL`
2. ✅ `SUPABASE_SERVICE_ROLE_KEY`
3. ✅ `JWT_SECRET`

The server will start with just these, but some features won't work without the others.

---

## ✅ After Updating .env

1. **Restart the server:**
   ```bash
   # Stop current server (Ctrl+C or kill process)
   npm start
   ```

2. **Run tests:**
   ```bash
   npm test
   ```

3. **Verify health:**
   ```bash
   curl http://localhost:3000/health
   ```

---

## 🔒 Security Notes

- ✅ `.env` is already in `.gitignore` - it won't be committed
- ✅ Never share your `.env` file
- ✅ Use test/development keys for local testing
- ✅ Production keys should only be in Render environment variables

---

## 📝 Current .env Status

The `.env` file has been created with placeholder values. Edit it with your actual credentials to start the server.

