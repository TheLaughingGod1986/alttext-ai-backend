#!/bin/bash
# Deployment script for SEO AI Meta backend support

set -e

echo "🚀 Deploying SEO AI Meta backend support..."
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from backend root directory"
    exit 1
fi

# Check if DATABASE_URL is set (for migration)
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  Warning: DATABASE_URL not set. Migration will be skipped."
    echo "   Run migration manually on production database."
else
    echo "📦 Running database migration..."
    npx prisma migrate deploy
    npx prisma generate
    echo "✅ Migration complete"
fi

echo ""
echo "📝 Checking for Stripe Price IDs..."
echo "   Make sure to update routes/billing.js with SEO AI Meta Price IDs"
echo "   after creating products in Stripe Dashboard"
echo ""

echo "📤 Deploying to production..."
git add .
git status

echo ""
read -p "Commit message (or press Enter for default): " commit_msg
if [ -z "$commit_msg" ]; then
    commit_msg="Add SEO AI Meta service support"
fi

git commit -m "$commit_msg"
git push origin main

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Wait for Render to deploy (check Render dashboard)"
echo "   2. Create Stripe products (SEO AI Meta Pro & Agency)"
echo "   3. Update Price IDs in routes/billing.js"
echo "   4. Test WordPress plugin connection"
echo ""

