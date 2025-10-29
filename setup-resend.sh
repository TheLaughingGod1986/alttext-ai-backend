#!/bin/bash

# Setup Resend Email Service for AltText AI Backend
# This script helps you set up Resend API keys via Render CLI

set -e

echo "📧 Resend Email Setup for AltText AI Backend"
echo "=============================================="
echo ""

# Check if Render CLI is installed
if ! command -v render &> /dev/null; then
    echo "❌ Render CLI not found!"
    echo ""
    echo "Install it with:"
    echo "  brew install render"
    echo ""
    echo "Or download from: https://render.com/docs/cli"
    exit 1
fi

# Check if logged in
if ! render whoami &> /dev/null; then
    echo "❌ Not logged in to Render!"
    echo ""
    echo "Please login first:"
    echo "  render login"
    exit 1
fi

echo "✅ Render CLI found and authenticated"
echo ""

# List services to help user identify
echo "📋 Your Render Services:"
echo "-------------------------"
render services list
echo ""

# Ask for service name
read -p "Enter your Render service name (from list above): " SERVICE_NAME

if [ -z "$SERVICE_NAME" ]; then
    echo "❌ Service name is required"
    exit 1
fi

# Ask for Resend API key
echo ""
read -p "Enter your Resend API key (starts with 're_'): " RESEND_KEY

if [ -z "$RESEND_KEY" ]; then
    echo "❌ Resend API key is required"
    exit 1
fi

if [[ ! "$RESEND_KEY" =~ ^re_ ]]; then
    echo "⚠️  Warning: Resend API keys usually start with 're_'"
    read -p "Continue anyway? (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        exit 1
    fi
fi

# Ask for from email
echo ""
read -p "Enter your 'From' email address (e.g., noreply@yourdomain.com): " FROM_EMAIL

if [ -z "$FROM_EMAIL" ]; then
    echo "⚠️  Warning: No from email provided, will use default"
    FROM_EMAIL="noreply@alttextai.com"
fi

# Set environment variables
echo ""
echo "🔧 Setting environment variables..."
echo ""

echo "Setting RESEND_API_KEY..."
if render env set RESEND_API_KEY="$RESEND_KEY" --service "$SERVICE_NAME"; then
    echo "✅ RESEND_API_KEY set successfully"
else
    echo "❌ Failed to set RESEND_API_KEY"
    exit 1
fi

echo ""
echo "Setting RESEND_FROM_EMAIL..."
if render env set RESEND_FROM_EMAIL="$FROM_EMAIL" --service "$SERVICE_NAME"; then
    echo "✅ RESEND_FROM_EMAIL set successfully"
else
    echo "❌ Failed to set RESEND_FROM_EMAIL"
    exit 1
fi

# Verify
echo ""
echo "🔍 Verifying environment variables..."
echo "-----------------------------------"
render env list --service "$SERVICE_NAME" | grep -E "RESEND_API_KEY|RESEND_FROM_EMAIL" || echo "⚠️  Variables not found in list"

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Render will automatically redeploy with new environment variables"
echo "   2. Check Render logs: render logs --service $SERVICE_NAME --follow"
echo "   3. Test by registering a new user or requesting password reset"
echo ""
echo "🧪 To test:"
echo "   • Create a new account via WordPress plugin"
echo "   • Check email for welcome message"
echo "   • Request password reset"
echo "   • Check email for reset link"
echo ""

