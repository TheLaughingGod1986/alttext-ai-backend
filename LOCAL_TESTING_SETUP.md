# Local Testing Setup

## ⚠️ Required: Set Supabase Environment Variables

To run the server and tests locally, you need to create a `.env` file with your Supabase credentials.

## Quick Setup

1. **Create `.env` file** in the project root:

```bash
cp env.example .env
```

2. **Edit `.env`** and add your Supabase credentials:

```bash
# Supabase Database (REQUIRED)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# OpenAI - Service-specific API keys
ALTTEXT_OPENAI_API_KEY=sk-your-alttext-openai-api-key
SEO_META_OPENAI_API_KEY=sk-your-seo-meta-openai-api-key
OPENAI_MODEL=gpt-4o-mini

# Stripe (use test keys for local testing)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Stripe Product/Price IDs
ALTTEXT_AI_STRIPE_PRICE_PRO=price_1SMrxaJl9Rm418cMM4iikjlJ
ALTTEXT_AI_STRIPE_PRICE_AGENCY=price_1SMrxaJl9Rm418cMnJTShXSY
ALTTEXT_AI_STRIPE_PRICE_CREDITS=price_1SMrxbJl9Rm418cM0gkzZQZt
SEO_AI_META_STRIPE_PRICE_PRO=price_1SQ72OJl9Rm418cMruYB5Pgb
SEO_AI_META_STRIPE_PRICE_AGENCY=price_1SQ72KJl9Rm418cMB0CYh8xe

# Application
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Email Service
RESEND_API_KEY=re_xxx
RESEND_FROM_EMAIL=noreply@alttextai.com

# Webhook
WEBHOOK_SECRET=your-webhook-secret-for-monthly-reset
```

3. **Get Supabase Credentials:**

   - Go to your Supabase project dashboard
   - Settings → API
   - Copy "Project URL" → `SUPABASE_URL`
   - Copy "service_role" key → `SUPABASE_SERVICE_ROLE_KEY`

4. **Start the server:**

```bash
npm start
```

5. **Run tests** (in another terminal):

```bash
npm test
```

## ⚠️ Important Notes

- **Never commit `.env` to git** - it contains secrets
- Use **test/development** Supabase project for local testing
- The `.env` file is already in `.gitignore`

## Testing Without Supabase

If you want to test the code structure without a real Supabase connection, you can:

1. Comment out the validation in `supabase-client.js` temporarily
2. Mock the Supabase client in tests
3. Use a local Supabase instance

However, **full integration testing requires a real Supabase connection**.

