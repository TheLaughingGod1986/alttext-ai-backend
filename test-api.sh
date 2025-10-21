#!/bin/bash

# API Testing Script for Phase 2

API_URL="http://localhost:3001"

echo "========================================"
echo "Testing AltText AI Phase 2 API"
echo "========================================"
echo ""

# 1. Test Health Endpoint
echo "1. Testing Health Endpoint..."
curl -s "${API_URL}/health" | jq .
echo ""

# 2. Test Registration
echo "2. Testing User Registration..."
REG_RESPONSE=$(curl -s -X POST "${API_URL}/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser'$(date +%s)'@example.com",
    "password": "testpassword123"
  }')
echo "$REG_RESPONSE" | jq .
echo ""

# Extract token
TOKEN=$(echo "$REG_RESPONSE" | jq -r '.token')
EMAIL=$(echo "$REG_RESPONSE" | jq -r '.user.email')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
  echo "✅ Registration successful! Token: ${TOKEN:0:20}..."
  echo ""

  # 3. Test /auth/me
  echo "3. Testing /auth/me endpoint..."
  curl -s "${API_URL}/auth/me" \
    -H "Authorization: Bearer $TOKEN" | jq .
  echo ""

  # 4. Test /usage endpoint
  echo "4. Testing /usage endpoint..."
  curl -s "${API_URL}/usage" \
    -H "Authorization: Bearer $TOKEN" | jq .
  echo ""

  # 5. Test /billing/plans endpoint
  echo "5. Testing /billing/plans endpoint..."
  curl -s "${API_URL}/billing/plans" | jq .
  echo ""

  # 6. Test login with the registered user
  echo "6. Testing Login..."
  LOGIN_RESPONSE=$(curl -s -X POST "${API_URL}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{
      \"email\": \"$EMAIL\",
      \"password\": \"testpassword123\"
    }")
  echo "$LOGIN_RESPONSE" | jq .
  echo ""

  # 7. Test /usage/history
  echo "7. Testing /usage/history endpoint..."
  curl -s "${API_URL}/usage/history" \
    -H "Authorization: Bearer $TOKEN" | jq .
  echo ""

  echo "✅ All tests completed!"
else
  echo "❌ Registration failed!"
fi

echo ""
echo "========================================"
