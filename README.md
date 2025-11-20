# AltText AI - Backend API

Production-ready Node.js backend API for the AltText AI WordPress plugin. Features user authentication, usage tracking, Stripe billing, and organization licensing.

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** Supabase (PostgreSQL)
- **Authentication:** JWT
- **Payment:** Stripe
- **Email:** Resend

## Quick Start

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and add your OpenAI API key
npm start
```

## Environment Variables

See `env.example` for all required variables. Key variables:

```env
# Supabase (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI (Required)
ALTTEXT_OPENAI_API_KEY=sk-...
SEO_META_OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini

# JWT (Required)
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d

# Stripe (Required)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (Required)
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=noreply@yourdomain.com
```

## API Endpoints

### POST /api/generate
Generate alt text for an image.

**Request:**
```json
{
  "domain": "example.com",
  "image_data": {},
  "context": {
    "filename": "sunset.jpg",
    "title": "Beach Sunset",
    "caption": "Beautiful sunset at the beach"
  }
}
```

**Response:**
```json
{
  "success": true,
  "alt_text": "Golden sunset over ocean waves at sandy beach",
  "usage": {
    "used": 5,
    "limit": 50,
    "remaining": 45,
    "plan": "free",
    "resetDate": "2025-02-01"
  }
}
```

### GET /api/usage/:domain
Get current usage for a domain.

### POST /api/webhook/reset
Monthly cron endpoint to reset usage (protected by secret).

### POST /api/admin/upgrade
Temporarily upgrade a domain to pro plan.

**Request:**
```json
{
  "domain": "example.com",
  "plan": "pro",
  "secret": "your-api-secret"
}
```

## Deployment

### Railway
1. Create new project on Railway
2. Add GitHub repo
3. Set environment variables
4. Deploy automatically

### Render
1. Create new Web Service
2. Connect GitHub repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables

## Monthly Reset

Set up a cron job to hit:
```bash
curl -X POST https://your-api.com/api/webhook/reset \
  -H "Content-Type: application/json" \
  -d '{"secret": "your-webhook-secret"}'
```

Or use a service like cron-job.org or EasyCron.

## Security

- OpenAI API key stored server-side only
- Domains are hashed for privacy
- Rate limiting enabled
- CORS configured
- Helmet security headers

# Railway Deploy
# Force redeploy Mon Oct 20 16:16:56 BST 2025

# Trigger Render redeploy
