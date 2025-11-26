# Secrets Management Guide

This document describes all secrets required for Koordi's development and production environments.

## Secret Storage Locations

Koordi uses three secret storage mechanisms:

| Location | Purpose | Access |
|----------|---------|--------|
| Local `.env` files | Development only | Developers |
| GitHub Repository Secrets | CI/CD pipeline | GitHub Actions |
| GCP Secret Manager | Production runtime | Cloud Run services |

## Required Secrets

### GitHub Repository Secrets

These secrets are required for the CI/CD pipeline to function. Add them at:
`https://github.com/jamesschaffer/koordi/settings/secrets/actions`

| Secret | Required By | Description |
|--------|-------------|-------------|
| `GCP_SA_KEY` | All deployments | Google Cloud service account JSON key with permissions for Cloud Run, Artifact Registry, and Secret Manager |
| `DATABASE_URL` | Backend | PostgreSQL connection string for running migrations |
| `GOOGLE_MAPS_API_KEY` | Frontend | Google Maps API key for address autocomplete |

### GCP Secret Manager

These secrets are accessed at runtime by Cloud Run services. They are configured in the GCP Console:
`https://console.cloud.google.com/security/secret-manager?project=solar-safeguard-476315-p0`

| Secret | Service | Description |
|--------|---------|-------------|
| `DATABASE_URL` | Backend | PostgreSQL connection string |
| `JWT_SECRET` | Backend | Secret for signing JWT tokens |
| `ENCRYPTION_KEY` | Backend | Key for encrypting sensitive data |
| `REDIS_URL` | Backend | Redis connection URL |
| `GOOGLE_CLIENT_ID` | Backend | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Backend | Google OAuth client secret |
| `GOOGLE_MAPS_API_KEY` | Backend | Google Maps API key for server-side geocoding |
| `SMTP_HOST` | Backend | SMTP server hostname |
| `SMTP_PORT` | Backend | SMTP server port |
| `SMTP_SECURE` | Backend | SMTP TLS setting |
| `SMTP_USER` | Backend | SMTP username |
| `SMTP_PASS` | Backend | SMTP password |
| `EMAIL_FROM` | Backend | Sender email address |

### Local Development (.env files)

For local development, copy the example files and fill in values:

```bash
# Backend
cp backend/.env.example backend/.env

# Frontend
cp frontend/.env.example frontend/.env
```

## Secret Synchronization

**IMPORTANT**: Secrets must be kept in sync across all three locations. When adding a new secret:

1. Add to local `.env` file
2. Add to `.env.example` with placeholder value
3. Add to GitHub Secrets (if needed for CI/CD)
4. Add to GCP Secret Manager (if needed at runtime)
5. Update this document
6. Update `scripts/validate-prod-config.sh` if it's a backend env var

## Adding a New Secret

### For Backend Runtime Secrets

1. Add to GCP Secret Manager:
   ```bash
   echo -n "secret_value" | gcloud secrets create SECRET_NAME --data-file=-
   ```

2. Update backend deployment workflow to mount it:
   ```yaml
   --update-secrets=NEW_SECRET=NEW_SECRET:latest
   ```

3. Update `scripts/validate-prod-config.sh` expected variables list

### For Frontend Build-Time Secrets

1. Add to GitHub Secrets

2. Add to `frontend-deploy.yml`:
   ```yaml
   --build-arg VITE_NEW_SECRET=${{ secrets.NEW_SECRET }}
   ```

3. Update `frontend/Dockerfile`:
   ```dockerfile
   ARG VITE_NEW_SECRET
   ```

4. Add validation to workflow if critical

## Security Best Practices

1. **Never commit secrets to git** - Use `.env` files (gitignored) for local dev
2. **Rotate secrets regularly** - Especially after team member changes
3. **Use least privilege** - GCP SA should only have required permissions
4. **Monitor access** - Review GCP audit logs for secret access
5. **Use secret references** - Cloud Run mounts secrets, doesn't store them in env

## Troubleshooting

### "Missing required secrets" during deployment

The deployment workflows validate that required secrets exist. If you see this error:

1. Go to GitHub Settings > Secrets and variables > Actions
2. Verify the missing secret exists
3. If it exists, check it's not empty

### "Google Maps API key is empty in bundle"

This means `GOOGLE_MAPS_API_KEY` wasn't properly injected during build:

1. Verify secret exists in GitHub
2. Check the secret has a valid value (not empty)
3. Verify Google Cloud Console has the key with correct restrictions

### Backend missing environment variables

If backend health check shows missing config:

1. Check GCP Secret Manager has the secret
2. Verify Cloud Run service account has `secretmanager.secretAccessor` role
3. Check the deployment workflow includes the secret in `--update-secrets`

## Audit Log

| Date | Change | Author |
|------|--------|--------|
| 2025-11-26 | Added GOOGLE_MAPS_API_KEY to GitHub Secrets | Claude |
| 2025-11-26 | Created this documentation | Claude |
