# OpptiAI Backend

Production-ready Node.js backend API for OpptiAI services.

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

- **[Architecture](docs/architecture.md)** - System design, tech stack, technical debt
- **[Testing](docs/testing.md)** - Test structure, coverage, running tests
- **[Deployment](docs/deployment.md)** - Deployment instructions, environment setup
- **[Backend Structure](docs/backend-structure.md)** - Directory organization, file structure
- **[Migrations](docs/migrations.md)** - Database migration process and history

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
