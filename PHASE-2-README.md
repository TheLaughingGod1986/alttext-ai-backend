# AltText AI Phase 2 Backend

## Overview

This is the Phase 2 monetization backend for the AltText AI WordPress plugin. It provides user authentication, usage tracking, and Stripe billing integration.

## Features

- **User Authentication**: JWT-based authentication with registration and login
- **Usage Tracking**: Track monthly tokens and credits per user
- **Stripe Integration**: Subscription plans and one-time credit purchases
- **Database**: PostgreSQL with Prisma ORM
- **API**: RESTful API for WordPress plugin communication

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WordPress     │    │   Backend API   │    │   PostgreSQL    │
│   Plugin        │◄──►│   (Node.js)     │◄──►│   Database      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │     Stripe      │
                       │   (Billing)     │
                       └─────────────────┘
```

## API Endpoints

### Authentication
- `POST /auth/register` - Create new user account
- `POST /auth/login` - Authenticate user
- `GET /auth/me` - Get current user info
- `POST /auth/refresh` - Refresh JWT token

### Usage
- `GET /usage` - Get user's usage and plan info
- `GET /usage/history` - Get usage history with pagination

### Alt Text Generation
- `POST /api/generate` - Generate alt text (requires JWT)
- `POST /api/review` - Review existing alt text (requires JWT)

### Billing
- `GET /billing/plans` - Get available plans and pricing
- `POST /billing/checkout` - Create Stripe checkout session
- `POST /billing/portal` - Create customer portal session
- `GET /billing/info` - Get user's billing information
- `POST /billing/webhook` - Stripe webhook endpoint

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR UNIQUE NOT NULL,
  password_hash VARCHAR NOT NULL,
  plan VARCHAR DEFAULT 'free',
  tokens_remaining INTEGER DEFAULT 10,
  credits INTEGER DEFAULT 0,
  stripe_customer_id VARCHAR UNIQUE,
  stripe_subscription_id VARCHAR,
  reset_date TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Usage Logs Table
```sql
CREATE TABLE usage_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  used INTEGER DEFAULT 1,
  image_id VARCHAR,
  endpoint VARCHAR,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Migration Logs Table
```sql
CREATE TABLE migration_logs (
  id SERIAL PRIMARY KEY,
  domain_hash VARCHAR UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  migrated_at TIMESTAMP DEFAULT NOW()
);
```

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://username:password@host:port/database

# JWT Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4o-mini

# Stripe
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Stripe Product/Price IDs
STRIPE_PRICE_PRO=price_pro_monthly_id
STRIPE_PRICE_AGENCY=price_agency_monthly_id
STRIPE_PRICE_CREDITS=price_credits_one_time_id

# Application
PORT=3000
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
```

## Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Database
```bash
# Run Prisma migrations
npx prisma migrate deploy

# Generate Prisma client
npx prisma generate
```

### 3. Set Up Stripe Products
```bash
# Create Stripe products and prices
node stripe/setup.js setup
```

### 4. Run Migration (if upgrading from Phase 1)
```bash
# Migrate existing domain-based data
node scripts/migrate-domains-to-users.js
```

### 5. Start Server
```bash
npm start
```

## Development

### Local Development
```bash
# Install dependencies
npm install

# Set up environment
cp env.example .env
# Edit .env with your values

# Run database migrations
npx prisma migrate dev

# Start development server
npm run dev
```

### Database Management
```bash
# View database in Prisma Studio
npx prisma studio

# Reset database
npx prisma migrate reset

# Deploy migrations
npx prisma migrate deploy
```

### Testing
```bash
# Run tests
npm test

# Test webhook locally
node stripe/webhooks.js test
```

## Stripe Integration

### Products and Prices

The system creates three products:

1. **Pro Plan**: £12.99/month for 1000 images
2. **Agency Plan**: £49.99/month for 10000 images  
3. **Credit Pack**: £9.99 one-time for 100 images

### Webhook Events

The system handles these Stripe webhook events:

- `checkout.session.completed` - Activate plan or add credits
- `customer.subscription.created` - Set up subscription
- `customer.subscription.updated` - Handle plan changes
- `customer.subscription.deleted` - Downgrade to free
- `invoice.paid` - Reset monthly tokens
- `invoice.payment_failed` - Handle payment failures

### Customer Portal

Users can manage their subscriptions through Stripe's Customer Portal:

- View current plan
- Update payment method
- Cancel subscription
- View billing history

## Usage Tracking

### Monthly Tokens

Each plan includes monthly tokens that reset on the 1st of each month:

- **Free**: 50 tokens/month
- **Pro**: 1000 tokens/month
- **Agency**: 10000 tokens/month

### Credits

Users can purchase credit packs that never expire:

- **100 Credits**: £9.99
- Credits are used when monthly tokens are exhausted
- Credits can be used alongside any plan

### Usage Logic

1. Check if user has monthly tokens remaining
2. If yes, use monthly token and decrement count
3. If no, check if user has credits
4. If yes, use credit and decrement count
5. If no, return limit reached error

## Security

### JWT Authentication

- Tokens expire after 7 days by default
- Tokens are signed with a secret key
- All API endpoints (except auth) require valid JWT

### Password Security

- Passwords are hashed with bcrypt (12 rounds)
- Minimum 8 character password requirement
- No password storage in plain text

### API Security

- Rate limiting on all endpoints
- CORS protection
- Helmet.js security headers
- Input validation and sanitization

## Monitoring

### Health Check

```bash
GET /health
```

Returns server status and version information.

### Logging

The application logs:

- Authentication events
- API requests
- Stripe webhook events
- Database errors
- Usage tracking

### Metrics to Monitor

- User registrations
- API request volume
- Stripe webhook success rate
- Database performance
- Error rates

## Deployment

### Railway
1. Connect GitHub repository
2. Set environment variables
3. Deploy automatically

### Render
1. Connect GitHub repository
2. Set environment variables
3. Deploy automatically

### Manual Deployment
1. Set up PostgreSQL database
2. Configure environment variables
3. Run database migrations
4. Start the application

## Troubleshooting

### Common Issues

1. **Database Connection**: Check DATABASE_URL format
2. **JWT Errors**: Verify JWT_SECRET is set
3. **Stripe Webhooks**: Check webhook URL and secret
4. **OpenAI Errors**: Verify API key and rate limits

### Debug Mode

Enable debug logging:

```bash
NODE_ENV=development
DEBUG=alttext:*
```

### Log Locations

- Railway: Check Railway dashboard
- Render: Check Render dashboard
- Self-hosted: Check application logs

## API Documentation

### Authentication Flow

1. User registers or logs in
2. Server returns JWT token
3. Client stores token
4. Client includes token in Authorization header
5. Server validates token on each request

### Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

### Rate Limiting

- 100 requests per 15 minutes per IP
- Authenticated users have higher limits
- Stripe webhooks are not rate limited

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the GPL-2.0 License.

## Support

For technical support:

1. Check the logs first
2. Review this documentation
3. Test each component individually
4. Contact support if issues persist
