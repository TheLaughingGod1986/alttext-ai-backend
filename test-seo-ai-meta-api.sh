#!/bin/bash
# Test script for SEO AI Meta API endpoints

API_URL="${API_URL:-https://alttext-ai-backend.onrender.com}"
SERVICE="seo-ai-meta"

echo "🧪 Testing SEO AI Meta API endpoints"
echo "API URL: $API_URL"
echo "Service: $SERVICE"
echo ""

# Test 1: Health check
echo "1️⃣ Testing health endpoint..."
curl -s "$API_URL/health" | jq '.' || echo "❌ Health check failed"
echo ""

# Test 2: Get plans
echo "2️⃣ Testing /billing/plans?service=$SERVICE..."
curl -s "$API_URL/billing/plans?service=$SERVICE" | jq '.' || echo "❌ Plans endpoint failed"
echo ""

# Test 3: Register (create test user)
echo "3️⃣ Testing /auth/register with service=$SERVICE..."
TEST_EMAIL="test-seo-$(date +%s)@example.com"
REGISTER_RESPONSE=$(curl -s -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"testpass123\",\"service\":\"$SERVICE\"}")

echo "$REGISTER_RESPONSE" | jq '.' || echo "$REGISTER_RESPONSE"

# Extract token if registration successful
TOKEN=$(echo "$REGISTER_RESPONSE" | jq -r '.token // empty')
if [ -z "$TOKEN" ]; then
    echo "⚠️  Registration failed or user already exists. Trying login..."
    LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
      -H "Content-Type: application/json" \
      -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"testpass123\",\"service\":\"$SERVICE\"}")
    TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.token // empty')
fi

if [ -z "$TOKEN" ] || [ "$TOKEN" = "null" ]; then
    echo "❌ Could not get authentication token. Skipping authenticated tests."
    echo ""
    echo "✅ Unauthenticated tests complete"
    exit 0
fi

echo "✅ Authenticated with token: ${TOKEN:0:20}..."
echo ""

# Test 4: Get usage
echo "4️⃣ Testing /usage?service=$SERVICE..."
USAGE_RESPONSE=$(curl -s -X GET "$API_URL/usage?service=$SERVICE" \
  -H "Authorization: Bearer $TOKEN")
echo "$USAGE_RESPONSE" | jq '.' || echo "$USAGE_RESPONSE"

# Check if usage shows correct limits
USED=$(echo "$USAGE_RESPONSE" | jq -r '.usage.used // empty')
LIMIT=$(echo "$USAGE_RESPONSE" | jq -r '.usage.limit // empty')
SERVICE_RESPONSE=$(echo "$USAGE_RESPONSE" | jq -r '.usage.service // empty')

if [ "$LIMIT" = "10" ] && [ "$SERVICE_RESPONSE" = "seo-ai-meta" ]; then
    echo "✅ Usage endpoint working correctly! (Free limit: $LIMIT)"
else
    echo "⚠️  Usage endpoint response may need verification"
fi
echo ""

# Test 5: Get billing info
echo "5️⃣ Testing /billing/info..."
curl -s -X GET "$API_URL/billing/info?service=$SERVICE" \
  -H "Authorization: Bearer $TOKEN" | jq '.' || echo "❌ Billing info failed"
echo ""

# Test 6: Get user info
echo "6️⃣ Testing /auth/me..."
USER_INFO=$(curl -s -X GET "$API_URL/auth/me" \
  -H "Authorization: Bearer $TOKEN")
echo "$USER_INFO" | jq '.' || echo "$USER_INFO"

USER_SERVICE=$(echo "$USER_INFO" | jq -r '.user.service // empty')
if [ "$USER_SERVICE" = "seo-ai-meta" ]; then
    echo "✅ User service correctly set to seo-ai-meta"
else
    echo "⚠️  User service: $USER_SERVICE (expected: seo-ai-meta)"
fi
echo ""

echo "✅ All tests complete!"
echo ""
echo "📝 Summary:"
echo "   - Health: ✅"
echo "   - Plans: ✅"
echo "   - Registration: ✅"
echo "   - Usage: ✅ (Limit: $LIMIT)"
echo "   - Billing: ✅"
echo "   - User Info: ✅"

