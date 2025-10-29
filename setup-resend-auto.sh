#!/bin/bash

# Non-interactive Resend Setup Script
# Usage: RESEND_API_KEY=re_xxx RESEND_FROM_EMAIL=noreply@domain.com ./setup-resend-auto.sh

set -e

SERVICE_NAME="${RENDER_SERVICE_NAME:-alttext-ai-phase2}"
RESEND_KEY="${RESEND_API_KEY}"
FROM_EMAIL="${RESEND_FROM_EMAIL:-noreply@alttextai.com}"

echo "📧 Resend Email Setup (Non-Interactive)"
echo "========================================="
echo ""

# Check if Render CLI is installed
if ! command -v render &> /dev/null; then
    echo "❌ Render CLI not found!"
    exit 1
fi

# Check credentials
if [ -z "$RESEND_KEY" ]; then
    echo "❌ RESEND_API_KEY environment variable is required"
    echo ""
    echo "Usage:"
    echo "  RESEND_API_KEY=re_your_key RESEND_FROM_EMAIL=noreply@domain.com ./setup-resend-auto.sh"
    exit 1
fi

echo "✅ Service: $SERVICE_NAME"
echo "✅ From Email: $FROM_EMAIL"
echo "✅ API Key: ${RESEND_KEY:0:10}..." # Show first 10 chars only
echo ""

# Set environment variables
echo "🔧 Setting RESEND_API_KEY..."
if render env set RESEND_API_KEY="$RESEND_KEY" --service "$SERVICE_NAME" 2>&1; then
    echo "✅ RESEND_API_KEY set successfully"
else
    echo "❌ Failed to set RESEND_API_KEY"
    exit 1
fi

echo ""
echo "🔧 Setting RESEND_FROM_EMAIL..."
if render env set RESEND_FROM_EMAIL="$FROM_EMAIL" --service "$SERVICE_NAME" 2>&1; then
    echo "✅ RESEND_FROM_EMAIL set successfully"
else
    echo "❌ Failed to set RESEND_FROM_EMAIL"
    exit 1
fi

echo ""
echo "✅ Setup complete! Render will automatically redeploy."
echo ""
echo "🧪 Test by creating a new account or requesting password reset."

