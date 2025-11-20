#!/bin/bash

# Script to fetch environment variables from Render and populate .env file
# Requires: Render API key and service ID

echo "🔍 Fetching environment variables from Render..."
echo ""

# Check if RENDER_API_KEY is set
if [ -z "$RENDER_API_KEY" ]; then
    echo "❌ RENDER_API_KEY environment variable is not set"
    echo ""
    echo "To get your API key:"
    echo "1. Go to https://dashboard.render.com/account/api-keys"
    echo "2. Create a new API key"
    echo "3. Export it: export RENDER_API_KEY=your-api-key"
    echo ""
    exit 1
fi

# Prompt for service ID if not provided
if [ -z "$RENDER_SERVICE_ID" ]; then
    echo "📋 Available services:"
    echo ""
    curl -s --request GET \
         --url "https://api.render.com/v1/services" \
         --header "accept: application/json" \
         --header "authorization: Bearer $RENDER_API_KEY" \
         | jq -r '.[] | "  \(.service.id) - \(.service.name) (\(.service.type))"' 2>/dev/null || echo "  (Install jq for better formatting: brew install jq)"
    echo ""
    read -p "Enter your service ID (or service name like 'alttext-ai-backend'): " SERVICE_INPUT
    
    # Try to find service by name if ID not provided
    if [[ ! "$SERVICE_INPUT" =~ ^srv- ]]; then
        SERVICE_ID=$(curl -s --request GET \
             --url "https://api.render.com/v1/services" \
             --header "accept: application/json" \
             --header "authorization: Bearer $RENDER_API_KEY" \
             | jq -r ".[] | select(.service.name == \"$SERVICE_INPUT\") | .service.id" 2>/dev/null)
        
        if [ -z "$SERVICE_ID" ]; then
            echo "❌ Service '$SERVICE_INPUT' not found"
            exit 1
        fi
        echo "✅ Found service ID: $SERVICE_ID"
    else
        SERVICE_ID="$SERVICE_INPUT"
    fi
else
    SERVICE_ID="$RENDER_SERVICE_ID"
fi

echo ""
echo "📥 Fetching environment variables for service $SERVICE_ID..."
echo ""

# Fetch environment variables
ENV_VARS=$(curl -s --request GET \
     --url "https://api.render.com/v1/services/$SERVICE_ID/env-vars" \
     --header "accept: application/json" \
     --header "authorization: Bearer $RENDER_API_KEY")

# Check for errors
if echo "$ENV_VARS" | jq -e '.error' > /dev/null 2>&1; then
    ERROR_MSG=$(echo "$ENV_VARS" | jq -r '.error' 2>/dev/null || echo "Unknown error")
    echo "❌ Error: $ERROR_MSG"
    exit 1
fi

# Format and save to .env
echo "$ENV_VARS" | jq -r '.[] | "\(.key)=\(.value)"' > .env

# Count variables
VAR_COUNT=$(wc -l < .env | tr -d ' ')
echo "✅ Fetched $VAR_COUNT environment variables"
echo "✅ Saved to .env file"
echo ""
echo "📝 Variables fetched:"
echo "$ENV_VARS" | jq -r '.[] | "  - \(.key)"' | head -20
if [ "$VAR_COUNT" -gt 20 ]; then
    echo "  ... and $((VAR_COUNT - 20)) more"
fi
echo ""
echo "⚠️  Note: Sensitive values are now in .env file - keep it secure!"

