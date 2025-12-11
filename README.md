# Oppti Backend

Production-ready Node.js backend API for Oppti services.

## Quick Start

```bash
npm install
cp config/env.example .env
# Edit .env and add your API keys
npm start
```

## Tech Stack

- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** Supabase (PostgreSQL)
- **Authentication:** JWT
- **Payment:** Stripe
- **Email:** Resend

## Environment Variables

See `config/env.example` for all required variables. Key variables:

```env
# Supabase (Required)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI (Required)
ALTTEXT_OPENAI_API_KEY=sk-...
SEO_META_OPENAI_API_KEY=sk-...

# JWT (Required)
JWT_SECRET=your-secret-key

# Stripe (Required)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email (Required)
RESEND_API_KEY=re_...
EMAIL_FROM=OpttiAI <hello@optti.dev>
EMAIL_BRAND_NAME=OpttiAI
RESEND_FROM_EMAIL=noreply@yourdomain.com  # Legacy support, use EMAIL_FROM
RESEND_AUDIENCE_ID=aud_xxx  # Optional: For subscriber management
```

## Documentation

For detailed documentation, see the `/docs` directory:

- **[API Specification](docs/API_SPEC.md)** - Complete API endpoint documentation
- **[Database Schema](docs/DATABASE_SCHEMA.md)** - Database tables, relationships, and migrations
- **[Implementation Plan](docs/IMPLEMENTATION_PLAN.md)** - Development roadmap and architecture
- **[Frontend Integration](docs/FRONTEND_INTEGRATION.md)** - Guide for frontend developers
- **[Frontend Quick Fix](docs/FRONTEND_FIX_MESSAGE.md)** - Quick reference for license key issues

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Start development server
npm start
```

## License

Proprietary - Oppti
