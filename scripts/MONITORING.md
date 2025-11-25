# Production Monitoring & Alerting

## Overview

Koordie has a lightweight monitoring setup designed for small-scale production apps. You'll be alerted when things break, without overwhelming noise.

## What Gets Monitored

### 1. Service Availability
- **What:** Cloud Run service responding to requests
- **Alert Trigger:** Service stops responding for 1 minute
- **Why:** Core outage detection

### 2. Error Rate
- **What:** HTTP 5xx responses from backend
- **Alert Trigger:** >10% error rate sustained for 5 minutes
- **Why:** Catch application crashes or critical bugs

### 3. Health Endpoint
- **What:** `/api/health` endpoint accessibility and dependency checks
- **Alert Trigger:** Endpoint unreachable for 5 minutes
- **Why:** Validates database, environment config, and critical dependencies

## Setup (One-Time)

Run the alerting setup script:

```bash
./scripts/setup-alerting.sh
```

This creates:
- Email notification channel (sends to james@jamesschaffer.com)
- 3 alert policies (service down, high errors, health check)
- Uptime check monitoring health endpoint every 5 minutes

**Time required:** ~2 minutes

## What Happens When Alert Fires

1. **Email notification** sent to configured address
2. **Subject line** indicates which alert triggered
3. **Email body** includes:
   - What triggered the alert
   - Link to Cloud Console for details
   - Timestamp of incident

## Responding to Alerts

### Alert: "Koordie Backend Down"
**Meaning:** Service is not responding at all

**Actions:**
1. Check Cloud Run status: https://console.cloud.google.com/run?project=solar-safeguard-476315-p0
2. Check recent deployments: https://github.com/YOUR_USERNAME/koordi/actions
3. View logs: `gcloud run services logs read koordie-backend --region=us-central1 --limit=50`
4. If bad deployment, rollback: See `scripts/ROLLBACK.md`

### Alert: "Koordie Backend High Error Rate"
**Meaning:** Application is throwing many 500 errors

**Actions:**
1. Check logs for stack traces: `gcloud run services logs read koordie-backend --region=us-central1 --limit=50`
2. Check health endpoint: `curl https://api.koordie.com/api/health | jq '.'`
3. Common causes:
   - Database connection issues (check DATABASE_URL secret)
   - Missing environment variables (health endpoint will show which)
   - Code bug in recent deployment (rollback if needed)

### Alert: "Koordie Health Check Failed"
**Meaning:** Health endpoint is unreachable or returning errors

**Actions:**
1. Try accessing manually: `curl https://api.koordie.com/api/health`
2. Check response - look for failed dependency checks:
   ```json
   {
     "status": "degraded",
     "checks": {
       "database": { "status": "error", "message": "Connection failed" },
       "email": { "status": "warning", "message": "SMTP not configured" }
     }
   }
   ```
3. Fix specific dependency issue (database, secrets, etc.)
4. If health endpoint completely unreachable, service is likely down (see "Backend Down" response)

## Viewing Alerts & History

**Active Alerts:**
```bash
gcloud alpha monitoring policies list --project=solar-safeguard-476315-p0
```

**Alert History (Incidents):**
- Cloud Console: https://console.cloud.google.com/monitoring/alerting/incidents?project=solar-safeguard-476315-p0

**Uptime Check Status:**
- Cloud Console: https://console.cloud.google.com/monitoring/uptime?project=solar-safeguard-476315-p0

**Live Metrics Dashboard:**
- Cloud Run Metrics: https://console.cloud.google.com/run/detail/us-central1/koordie-backend/metrics?project=solar-safeguard-476315-p0

## Testing Alerts

Validate alerting works before you need it:

### Test 1: Trigger Service Down Alert
```bash
# Scale service to 0 instances
gcloud run services update koordie-backend \
  --region=us-central1 \
  --max-instances=0

# Wait 2 minutes, should receive alert

# Restore service
gcloud run services update koordie-backend \
  --region=us-central1 \
  --max-instances=10
```

### Test 2: Trigger Health Check Alert
```bash
# Temporarily break health endpoint by removing DATABASE_URL
gcloud run services update koordie-backend \
  --region=us-central1 \
  --remove-env-vars=DATABASE_URL

# Wait 5-7 minutes, should receive alert

# Restore (triggers re-deployment from pipeline)
git commit --allow-empty -m "Restore DATABASE_URL via pipeline"
git push origin main
```

### Test 3: View Simulated Alert
```bash
# Check uptime check status
gcloud monitoring uptime list --project=solar-safeguard-476315-p0

# View current alert policies
gcloud alpha monitoring policies list --project=solar-safeguard-476315-p0 --format=json
```

## Adjusting Alert Sensitivity

Edit `scripts/setup-alerting.sh` and adjust:

- **Alert duration:** Change `--condition-threshold-duration=300s` (lower = more sensitive)
- **Error threshold:** Change `--condition-threshold-value=0.1` (10% error rate)
- **Check interval:** Change uptime check `--check-interval=5m` (more frequent = faster detection)

After changes, delete old alerts and re-run:
```bash
# Delete all existing alert policies
gcloud alpha monitoring policies list --format="value(name)" | xargs -I {} gcloud alpha monitoring policies delete {} --quiet

# Re-create with new settings
./scripts/setup-alerting.sh
```

## Monitoring Costs

**Current setup costs:** ~$0.50-$2/month

- Uptime checks: $0.30/check/month (1 check = $0.30)
- Alert policy evaluations: First 100 rules free, then $0.20/rule/month
- Email notifications: Free (SMS/PagerDuty cost extra)

## What's NOT Monitored (Intentionally)

To keep this simple for a small app, we don't monitor:
- Database query performance (assume Cloud SQL is healthy)
- Memory/CPU usage (Cloud Run auto-scales)
- Custom business metrics (calendar creation rate, etc.)
- Frontend errors (no real-user monitoring)
- Log-based metrics (alert on log patterns)

**When to add more:** If app usage grows significantly or you need deeper observability.

## Quick Reference Commands

```bash
# Check current health
curl https://api.koordie.com/api/health | jq '.'

# View recent logs
gcloud run services logs read koordie-backend --region=us-central1 --limit=20

# List all alerts
gcloud alpha monitoring policies list --project=solar-safeguard-476315-p0

# Check uptime status
gcloud monitoring uptime list --project=solar-safeguard-476315-p0

# View active incidents
gcloud alpha monitoring incidents list --project=solar-safeguard-476315-p0
```

## Integration with CI/CD

The deployment pipeline automatically:
1. ✅ Validates configuration after deploy (prevents drift)
2. ✅ Checks health endpoint (catches immediate failures)
3. ✅ Fails deployment if critical issues detected

Monitoring complements this by catching:
- Issues that develop after deployment
- Gradual degradation
- External dependency failures
- Traffic-dependent bugs

Together they provide baseline production reliability for fast iteration.
