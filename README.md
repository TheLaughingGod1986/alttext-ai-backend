# AltText AI - Proxy API

Simple Node.js API that securely proxies OpenAI requests for the WordPress plugin.

## Quick Start

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and add your OpenAI API key
npm start
```

## Environment Variables

Create a `.env` file with:

```env
OPENAI_API_KEY=sk-...your-key...
OPENAI_MODEL=gpt-4o-mini
PORT=3000
FREE_MONTHLY_LIMIT=50
PRO_MONTHLY_LIMIT=1000
API_SECRET=your-random-secret
WEBHOOK_SECRET=your-webhook-secret
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
