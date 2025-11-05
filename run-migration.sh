#!/bin/bash
# Run database migration for SEO AI Meta service support

set -e

echo "🚀 Running Database Migration for SEO AI Meta"
echo "=============================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable not set"
    echo ""
    echo "Please set it first:"
    echo "  export DATABASE_URL='your-database-connection-string'"
    echo ""
    echo "Or use Render's database connection string from:"
    echo "  Render Dashboard → Database → Connect → External Connection"
    echo ""
    exit 1
fi

echo "📦 Running Prisma migration..."
echo ""

# Run migration
npx prisma migrate deploy

echo ""
echo "✅ Migration complete!"
echo ""
echo "📝 Verification:"
echo "   The following columns should now exist:"
echo "   - users.service"
echo "   - usage_logs.service"
echo ""

