#!/bin/bash
# Run migration SQL directly using psql

set -e

echo "🚀 Running Database Migration (Direct SQL)"
echo "==========================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable not set"
    echo ""
    echo "Please set it first:"
    echo "  export DATABASE_URL='your-database-connection-string'"
    echo ""
    exit 1
fi

echo "📝 Executing migration SQL..."
echo ""

# Extract SQL from migration file
SQL_FILE="prisma/migrations/20250101000000_add_service_support/migration.sql"

if [ ! -f "$SQL_FILE" ]; then
    echo "❌ Error: Migration file not found: $SQL_FILE"
    exit 1
fi

# Run SQL using psql
psql "$DATABASE_URL" -f "$SQL_FILE"

echo ""
echo "✅ Migration complete!"
echo ""

