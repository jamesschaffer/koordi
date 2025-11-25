#!/bin/bash
# Setup Basic Alerting for Koordie Production
# Creates uptime check - alerts configured via Cloud Console

set -e

PROJECT_ID="solar-safeguard-476315-p0"
SERVICE_NAME="koordie-backend"
REGION="us-central1"

echo "📊 Setting up basic monitoring for Koordie..."
echo ""

# Check if uptime check already exists
EXISTING_CHECK=$(gcloud monitoring uptime list \
  --project=${PROJECT_ID} \
  --format="value(name)" \
  --filter="displayName:${SERVICE_NAME}-health" 2>/dev/null || echo "")

if [ -n "$EXISTING_CHECK" ]; then
  echo "⚠️  Uptime check already exists: ${SERVICE_NAME}-health"
  echo "Skipping creation..."
else
  # Create uptime check for health endpoint
  echo "Creating uptime check for health endpoint..."
  gcloud monitoring uptime create ${SERVICE_NAME}-health \
    --resource-type=uptime-url \
    --resource-labels=host=api.koordie.com,project_id=${PROJECT_ID} \
    --path=/api/health \
    --period=5 \
    --timeout=10 \
    --project=${PROJECT_ID}

  echo "✅ Uptime check created: ${SERVICE_NAME}-health"
fi

echo ""
echo "=========================================="
echo "✅ Uptime Monitoring Setup Complete!"
echo "=========================================="
echo ""
echo "Health endpoint monitored: https://api.koordie.com/api/health"
echo "Check interval: Every 5 minutes"
echo ""
echo "📋 Next Steps - Configure Email Alerts (via Cloud Console):"
echo ""
echo "1. Open Cloud Console Monitoring:"
echo "   https://console.cloud.google.com/monitoring/alerting?project=${PROJECT_ID}"
echo ""
echo "2. Click 'Create Policy' button"
echo ""
echo "3. Add 3 alert conditions:"
echo ""
echo "   Alert 1: Health Check Failures"
echo "   --------------------------------"
echo "   - Click 'Select a metric'"
echo "   - Search for: 'Uptime check - Check passed'"
echo "   - Resource type: Uptime URL"
echo "   - Filter: display_name = '${SERVICE_NAME}-health'"
echo "   - Threshold: < 1 for 5 minutes"
echo "   - This alerts when health endpoint fails"
echo ""
echo "   Alert 2: High Error Rate"
echo "   -------------------------"
echo "   - Click 'Add Condition'"
echo "   - Search for: 'Request count'"
echo "   - Resource type: Cloud Run Revision"
echo "   - Filter: service_name = '${SERVICE_NAME}' AND response_code_class = '5xx'"
echo "   - Threshold: > 10 requests/minute for 5 minutes"
echo "   - This alerts on application crashes"
echo ""
echo "   Alert 3: Service Unavailable"
echo "   -----------------------------"
echo "   - Click 'Add Condition'"
echo "   - Search for: 'Request count'"
echo "   - Resource type: Cloud Run Revision"
echo "   - Filter: service_name = '${SERVICE_NAME}'"
echo "   - Threshold: < 1 request/minute for 3 minutes"
echo "   - This alerts when service is completely down"
echo ""
echo "4. Configure Notifications:"
echo "   - Click 'Notifications and name'"
echo "   - Add notification channel (Email)"
echo "   - Email: james@jamesschaffer.com"
echo "   - Name the policy: 'Koordie Production Alerts'"
echo ""
echo "5. Save the alert policy"
echo ""
echo "=========================================="
echo ""
echo "View uptime check status:"
echo "https://console.cloud.google.com/monitoring/uptime?project=${PROJECT_ID}"
echo ""
echo "Current health endpoint status:"
curl -s https://api.koordie.com/api/health | jq '.' || echo "❌ Health endpoint not accessible"
echo ""
