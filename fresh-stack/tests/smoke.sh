#!/usr/bin/env bash
set -e

BASE_URL=${BASE_URL:-http://localhost:4000}
SITE_KEY=${SITE_KEY:-test-site}

echo "Health..."
curl -s -o /dev/null -w "%{http_code}\n" "$BASE_URL/health"

echo "Ready..."
curl -s -o /dev/null -w "%{http_code}\n" "$BASE_URL/ready"

echo "Billing plans..."
curl -s -o /dev/null -w "%{http_code}\n" "$BASE_URL/billing/plans"

echo "Usage..."
curl -s -o /dev/null -w "%{http_code}\n" -H "X-Site-Key: $SITE_KEY" "$BASE_URL/api/usage"

echo "Alt-text..."
TINY_IMG="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/w8AAn8B9p0Y2ZAAAAAASUVORK5CYII="
curl -s -o /dev/null -w "%{http_code}\n" -H "Content-Type: application/json" "$BASE_URL/api/alt-text" -d "{\"image\":{\"base64\":\"$TINY_IMG\",\"width\":1,\"height\":1}}"

echo "Smoke complete"
