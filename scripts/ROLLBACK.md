# Quick Rollback Guide

## When to Rollback

Rollback immediately if:
- Health check fails in CI/CD pipeline
- Users report broken functionality
- Configuration drift detected
- Database errors in production logs

## Method 1: Rollback to Previous Revision (Fastest)

**Use when:** Latest deployment broke something, previous revision was working

```bash
# 1. List recent revisions
gcloud run revisions list \
  --service=koordie-backend \
  --region=us-central1 \
  --limit=5

# 2. Route 100% traffic to previous revision
# Replace REVISION_NAME with the working revision (e.g., koordie-backend-00025-7bt)
gcloud run services update-traffic koordie-backend \
  --region=us-central1 \
  --to-revisions=REVISION_NAME=100

# 3. Verify health
curl https://api.koordie.com/api/health | jq '.'
```

**Recovery time:** ~30 seconds

## Method 2: Redeploy Previous Git Commit

**Use when:** Need to redeploy from a specific commit, or revision is no longer available

```bash
# 1. Find the working commit
git log --oneline -10

# 2. Checkout that commit
git checkout COMMIT_HASH

# 3. Trigger manual deployment
git push origin HEAD:main --force

# 4. Monitor deployment in GitHub Actions
# https://github.com/YOUR_USERNAME/koordi/actions
```

**Recovery time:** ~3-5 minutes (build + deploy time)

## Method 3: Manual Configuration Fix

**Use when:** Only configuration is wrong, code is fine

```bash
# 1. List current environment variables
gcloud run services describe koordie-backend \
  --region=us-central1 \
  --format=json | jq '.spec.template.spec.containers[0].env'

# 2. Update specific variable via console or CLI
gcloud run services update koordie-backend \
  --region=us-central1 \
  --set-env-vars=VARIABLE_NAME=new_value

# 3. Verify with health check
curl https://api.koordie.com/api/health | jq '.checks'
```

**Recovery time:** ~1 minute

## Verification Checklist

After rollback, verify:

- [ ] Health endpoint returns 200: `curl https://api.koordie.com/api/health`
- [ ] All dependency checks are "ok" (database, env vars, email)
- [ ] Test critical user flow (login, create calendar, send invite)
- [ ] Check logs for errors: `gcloud run services logs read koordie-backend --region=us-central1 --limit=20`

## Configuration Validation

Run this locally to check what's in production:

```bash
./scripts/validate-prod-config.sh
```

This compares live production config against expected values.

## Common Issues and Quick Fixes

### Issue: Email Not Working
**Symptom:** Health check shows `email: { status: 'warning' }`

**Fix:**
```bash
# Verify SMTP secrets are accessible
gcloud secrets versions access latest --secret=SMTP_HOST
gcloud secrets versions access latest --secret=SMTP_USER
gcloud secrets versions access latest --secret=EMAIL_FROM

# Re-deploy with secrets flag (forces refresh)
gcloud run deploy koordie-backend \
  --image=us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/backend:latest \
  --region=us-central1 \
  --update-secrets=SMTP_HOST=SMTP_HOST:latest,SMTP_PORT=SMTP_PORT:latest,SMTP_SECURE=SMTP_SECURE:latest,SMTP_USER=SMTP_USER:latest,SMTP_PASS=SMTP_PASS:latest,EMAIL_FROM=EMAIL_FROM:latest
```

### Issue: Database Connection Failed
**Symptom:** Health check shows `database: { status: 'error' }`

**Fix:**
```bash
# Check if DATABASE_URL secret is accessible
gcloud secrets versions access latest --secret=DATABASE_URL

# Test database connectivity directly
PGPASSWORD="f4d7786c9ab104e5e4a3f7a01819445f" psql -h 104.198.219.130 -U koordie_app -d koordie -c "SELECT 1;"
```

### Issue: Configuration Drift Detected in Pipeline
**Symptom:** CI/CD fails at "Validate Configuration" step

**Fix:**
1. Review the diff output in GitHub Actions logs
2. Either:
   - **Option A:** Update `scripts/validate-prod-config.sh` with new expected vars
   - **Option B:** Update `.github/workflows/backend-deploy.yml` to include missing vars

## Emergency Contacts

- **GitHub Actions:** https://github.com/YOUR_USERNAME/koordi/actions
- **Cloud Run Console:** https://console.cloud.google.com/run?project=solar-safeguard-476315-p0
- **Application Health:** https://api.koordie.com/api/health
- **Production Logs:** `gcloud run services logs read koordie-backend --region=us-central1`

## Prevention

To avoid needing rollbacks:

1. Always test locally before pushing to main: `./scripts/start-dev.sh`
2. Check health endpoint after deployment: Pipeline does this automatically
3. Monitor configuration drift: Pipeline validates automatically
4. Keep commit messages descriptive for easier rollback identification
