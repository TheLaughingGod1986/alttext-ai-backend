# Deployment

## Environment Setup

### Required Environment Variables

See `config/env.example` for all required variables. Key variables:

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

### Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp config/env.example .env

# Edit .env and add your API keys
# Start development server
npm start
```

## Deployment Platforms

### Railway

1. Create new project on Railway
2. Add GitHub repo
3. Set environment variables in Railway dashboard
4. Deploy automatically on push

Railway will automatically:
- Detect Node.js project
- Run `npm install`
- Start with `npm start`

### Render

1. Create new Web Service on Render
2. Connect GitHub repo
3. Configure:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add environment variables in Render dashboard
5. Deploy

### Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## Monthly Reset Cron Job

Set up a cron job to reset monthly usage limits:

```bash
curl -X POST https://your-api.com/api/webhook/reset \
  -H "Content-Type: application/json" \
  -d '{"secret": "your-webhook-secret"}'
```

### Using cron-job.org

1. Create account at cron-job.org
2. Add new cron job
3. Set schedule: `0 0 1 * *` (first day of each month at midnight)
4. Set URL: `https://your-api.com/api/webhook/reset`
5. Set method: POST
6. Add headers: `Content-Type: application/json`
7. Add body: `{"secret": "your-webhook-secret"}`

### Using EasyCron

Similar setup to cron-job.org, with monthly schedule.

## Health Checks

The backend includes health check endpoints for monitoring:

- `GET /health` - Basic health check
- `GET /api/health` - API health check

## Monitoring

Recommended monitoring:
- Application logs (check for errors)
- Database connection health
- API response times
- Error rates
- Stripe webhook delivery

## Security Checklist

Before deploying to production:

- [ ] All environment variables set
- [ ] JWT_SECRET is strong and unique
- [ ] Stripe keys are production keys (not test keys)
- [ ] CORS configured for your frontend domain
- [ ] Rate limiting enabled
- [ ] Helmet security headers enabled
- [ ] Database credentials are secure
- [ ] API keys are not exposed in logs

