#!/bin/bash
# Production Configuration Validation Script
# Prevents configuration drift by validating live production config

set -e

PROJECT_ID="solar-safeguard-476315-p0"
REGION="us-central1"
SERVICE_NAME="koordie-backend"

echo "🔍 Validating production configuration for ${SERVICE_NAME}..."
echo ""

# Get live configuration from Cloud Run
LIVE_CONFIG=$(gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format=json)

# Extract environment variable names (sorted)
LIVE_VARS=$(echo "$LIVE_CONFIG" | \
  jq -r '.spec.template.spec.containers[0].env[].name' | \
  sort)

# Expected variables (update this list when you add new config)
# Note: REDIS_URL was removed when we switched from Bull Queue to on-load sync
EXPECTED_VARS="DATABASE_URL
EMAIL_FROM
ENCRYPTION_KEY
FRONTEND_URL
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_MAPS_API_KEY
GOOGLE_REDIRECT_URI
JWT_SECRET
NODE_ENV
SMTP_HOST
SMTP_PASS
SMTP_PORT
SMTP_SECURE
SMTP_USER"

EXPECTED_SORTED=$(echo "$EXPECTED_VARS" | sort)

# Count variables
LIVE_COUNT=$(echo "$LIVE_VARS" | wc -l | tr -d ' ')
EXPECTED_COUNT=$(echo "$EXPECTED_SORTED" | wc -l | tr -d ' ')

echo "Expected: $EXPECTED_COUNT variables"
echo "Found:    $LIVE_COUNT variables"
echo ""

# Compare
if [ "$LIVE_VARS" = "$EXPECTED_SORTED" ]; then
  echo "✅ Configuration validated - no drift detected"
  echo ""
  echo "All expected environment variables present:"
  echo "$LIVE_VARS" | sed 's/^/  ✓ /'
  exit 0
else
  echo "❌ CONFIGURATION DRIFT DETECTED!"
  echo ""
  echo "Differences found:"
  diff <(echo "$EXPECTED_SORTED") <(echo "$LIVE_VARS") || true
  echo ""
  echo "This usually means:"
  echo "  1. You manually added a variable in Cloud Console (add it to pipeline)"
  echo "  2. You removed a variable from pipeline (add it back or update this script)"
  echo "  3. A previous deployment partially failed"
  echo ""
  echo "ACTION REQUIRED: Update either the pipeline or this validation script"
  exit 1
fi
