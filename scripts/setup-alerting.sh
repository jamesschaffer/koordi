#!/bin/bash
# Setup Basic Alerting for Koordie Production
# Monitors health endpoint and Cloud Run service availability

set -e

PROJECT_ID="solar-safeguard-476315-p0"
SERVICE_NAME="koordie-backend"
REGION="us-central1"

# Email to receive alerts (update this with your email)
NOTIFICATION_EMAIL="james@jamesschaffer.com"

echo "📊 Setting up basic monitoring and alerting..."
echo ""

# Create notification channel for email
echo "Creating email notification channel..."
CHANNEL_ID=$(gcloud alpha monitoring channels create \
  --display-name="Koordie Admin Email" \
  --type=email \
  --channel-labels=email_address=${NOTIFICATION_EMAIL} \
  --project=${PROJECT_ID} \
  --format="value(name)")

echo "✅ Notification channel created: ${CHANNEL_ID}"
echo ""

# Alert 1: Cloud Run Service Down
echo "Creating alert: Cloud Run service down..."
gcloud alpha monitoring policies create \
  --notification-channels=${CHANNEL_ID} \
  --display-name="Koordie Backend Down" \
  --condition-display-name="Service not responding" \
  --condition-threshold-value=1 \
  --condition-threshold-duration=60s \
  --condition-expression='
    resource.type = "cloud_run_revision"
    AND resource.labels.service_name = "koordie-backend"
    AND metric.type = "run.googleapis.com/request_count"
  ' \
  --aggregation-alignment-period=60s \
  --aggregation-per-series-aligner=ALIGN_RATE \
  --aggregation-cross-series-reducer=REDUCE_COUNT \
  --project=${PROJECT_ID}

echo "✅ Alert created: Cloud Run service down"
echo ""

# Alert 2: High Error Rate (5xx responses)
echo "Creating alert: High error rate..."
gcloud alpha monitoring policies create \
  --notification-channels=${CHANNEL_ID} \
  --display-name="Koordie Backend High Error Rate" \
  --condition-display-name="5xx error rate > 10%" \
  --condition-threshold-value=0.1 \
  --condition-threshold-duration=300s \
  --condition-expression='
    resource.type = "cloud_run_revision"
    AND resource.labels.service_name = "koordie-backend"
    AND metric.type = "run.googleapis.com/request_count"
    AND metric.labels.response_code_class = "5xx"
  ' \
  --aggregation-alignment-period=60s \
  --aggregation-per-series-aligner=ALIGN_RATE \
  --aggregation-cross-series-reducer=REDUCE_SUM \
  --project=${PROJECT_ID}

echo "✅ Alert created: High error rate"
echo ""

# Alert 3: Health Check Failures (via Uptime Check)
echo "Creating uptime check for health endpoint..."
gcloud monitoring uptime create ${SERVICE_NAME}-health \
  --resource-type=uptime-url \
  --host=api.koordie.com \
  --path=/api/health \
  --check-interval=5m \
  --timeout=10s \
  --project=${PROJECT_ID}

echo "✅ Uptime check created: Health endpoint monitoring"
echo ""

# Create alert for uptime check failures
echo "Creating alert: Health check failures..."
gcloud alpha monitoring policies create \
  --notification-channels=${CHANNEL_ID} \
  --display-name="Koordie Health Check Failed" \
  --condition-display-name="Health endpoint unreachable" \
  --condition-threshold-value=1 \
  --condition-threshold-duration=300s \
  --condition-expression='
    metric.type = "monitoring.googleapis.com/uptime_check/check_passed"
    AND resource.type = "uptime_url"
  ' \
  --aggregation-alignment-period=60s \
  --aggregation-per-series-aligner=ALIGN_NEXT_OLDER \
  --aggregation-cross-series-reducer=REDUCE_COUNT_FALSE \
  --project=${PROJECT_ID}

echo "✅ Alert created: Health check failures"
echo ""

echo "=========================================="
echo "✅ Basic Alerting Setup Complete!"
echo "=========================================="
echo ""
echo "You will now receive email alerts for:"
echo "  1. Cloud Run service down or unresponsive"
echo "  2. High error rate (>10% 5xx responses for 5 minutes)"
echo "  3. Health endpoint unreachable (fails for 5 minutes)"
echo ""
echo "Alerts sent to: ${NOTIFICATION_EMAIL}"
echo ""
echo "View alerts in Cloud Console:"
echo "https://console.cloud.google.com/monitoring/alerting?project=${PROJECT_ID}"
echo ""
echo "View uptime checks:"
echo "https://console.cloud.google.com/monitoring/uptime?project=${PROJECT_ID}"
echo ""
echo "To test alerts, you can:"
echo "  - Stop the backend service temporarily"
echo "  - Trigger a 500 error in your application"
echo "  - Block the health endpoint path"
