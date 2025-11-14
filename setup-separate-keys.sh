#!/bin/bash

# Setup script for separate OpenAI API keys per plugin
# This script helps you configure separate API keys in Render for each WordPress plugin

set -e

echo "=================================="
echo "Separate API Keys Setup for Render"
echo "=================================="
echo ""

# Check if render CLI is installed
if ! command -v render &> /dev/null; then
    echo "❌ Render CLI is not installed."
    echo ""
    echo "Please install it first:"
    echo "  npm install -g @render-api/cli"
    echo "  or visit: https://docs.render.com/cli"
    echo ""
    exit 1
fi

# Check if logged in
if ! render whoami &> /dev/null; then
    echo "❌ You are not logged in to Render CLI."
    echo ""
    echo "Please login first:"
    echo "  render login"
    echo ""
    exit 1
fi

echo "✅ Render CLI is installed and authenticated"
echo ""

# Get service name
read -p "Enter your Render service name (e.g., alttext-ai-backend): " SERVICE_NAME

if [ -z "$SERVICE_NAME" ]; then
    echo "❌ Service name is required"
    exit 1
fi

# Verify service exists
echo ""
echo "🔍 Verifying service exists..."
if ! render services list | grep -q "$SERVICE_NAME"; then
    echo "❌ Service '$SERVICE_NAME' not found"
    echo ""
    echo "Available services:"
    render services list
    exit 1
fi

echo "✅ Service '$SERVICE_NAME' found"
echo ""

# Ask for AltText AI key
echo "=================================="
echo "AltText AI Plugin API Key"
echo "=================================="
read -p "Enter OpenAI API key for AltText AI (or press Enter to skip): " ALTTEXT_KEY

# Ask for SEO Meta key
echo ""
echo "=================================="
echo "SEO AI Meta Generator API Key"
echo "=================================="
read -p "Enter OpenAI API key for SEO AI Meta (or press Enter to skip): " SEO_META_KEY

# Ask for fallback/default key
echo ""
echo "=================================="
echo "Default/Fallback API Key"
echo "=================================="
read -p "Enter default OpenAI API key (or press Enter to skip): " DEFAULT_KEY

# Confirm before proceeding
echo ""
echo "=================================="
echo "Summary"
echo "=================================="
echo "Service: $SERVICE_NAME"
echo ""
if [ -n "$ALTTEXT_KEY" ]; then
    echo "✅ ALTTEXT_OPENAI_API_KEY will be set (${ALTTEXT_KEY:0:10}...)"
else
    echo "⏭️  ALTTEXT_OPENAI_API_KEY will be skipped"
fi

if [ -n "$SEO_META_KEY" ]; then
    echo "✅ SEO_META_OPENAI_API_KEY will be set (${SEO_META_KEY:0:10}...)"
else
    echo "⏭️  SEO_META_OPENAI_API_KEY will be skipped"
fi

if [ -n "$DEFAULT_KEY" ]; then
    echo "✅ OPENAI_API_KEY will be set (${DEFAULT_KEY:0:10}...)"
else
    echo "⏭️  OPENAI_API_KEY will be skipped"
fi

echo ""
read -p "Proceed with these settings? (y/N): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "❌ Cancelled"
    exit 0
fi

echo ""
echo "=================================="
echo "Setting Environment Variables"
echo "=================================="

# Set AltText AI key
if [ -n "$ALTTEXT_KEY" ]; then
    echo "🔧 Setting ALTTEXT_OPENAI_API_KEY..."
    if render env set ALTTEXT_OPENAI_API_KEY="$ALTTEXT_KEY" --service "$SERVICE_NAME"; then
        echo "✅ ALTTEXT_OPENAI_API_KEY set successfully"
    else
        echo "❌ Failed to set ALTTEXT_OPENAI_API_KEY"
    fi
fi

# Set SEO Meta key
if [ -n "$SEO_META_KEY" ]; then
    echo "🔧 Setting SEO_META_OPENAI_API_KEY..."
    if render env set SEO_META_OPENAI_API_KEY="$SEO_META_KEY" --service "$SERVICE_NAME"; then
        echo "✅ SEO_META_OPENAI_API_KEY set successfully"
    else
        echo "❌ Failed to set SEO_META_OPENAI_API_KEY"
    fi
fi

# Set default key
if [ -n "$DEFAULT_KEY" ]; then
    echo "🔧 Setting OPENAI_API_KEY..."
    if render env set OPENAI_API_KEY="$DEFAULT_KEY" --service "$SERVICE_NAME"; then
        echo "✅ OPENAI_API_KEY set successfully"
    else
        echo "❌ Failed to set OPENAI_API_KEY"
    fi
fi

echo ""
echo "=================================="
echo "Verifying Configuration"
echo "=================================="

echo "Current environment variables:"
render env list --service "$SERVICE_NAME" | grep -E "OPENAI_API_KEY|ALTTEXT_OPENAI_API_KEY|SEO_META_OPENAI_API_KEY" || echo "⚠️  No OpenAI keys found"

echo ""
echo "=================================="
echo "Setup Complete!"
echo "=================================="
echo ""
echo "Next steps:"
echo "1. Wait for Render to redeploy (automatic)"
echo "2. Test AltText AI plugin in WordPress"
echo "3. Test SEO AI Meta Generator plugin in WordPress"
echo "4. Monitor usage in OpenAI dashboard"
echo ""
echo "To view logs:"
echo "  render logs --service $SERVICE_NAME --tail"
echo ""
echo "To verify settings:"
echo "  render env list --service $SERVICE_NAME"
echo ""
echo "For detailed documentation, see:"
echo "  - SEPARATE_API_KEYS_SETUP.md"
echo "  - QUICK_START_SEPARATE_KEYS.md"
echo ""
