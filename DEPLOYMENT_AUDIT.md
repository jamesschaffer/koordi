# Deployment Audit - Marketing Site

**Date**: November 25, 2025
**Branch**: `documentation-update-11252025`
**Target**: Production (main branch)

## Current Infrastructure

### Existing Services (DO NOT MODIFY)
1. **koordie-backend** (Cloud Run)
   - Service: `koordie-backend`
   - Deploys when: `backend/**` or backend workflow changes
   - Domain: api.koordie.com
   - Status: ✅ PRODUCTION - DO NOT TOUCH

2. **koordie-frontend** (Cloud Run)
   - Service: `koordie-frontend`
   - Deploys when: `frontend/**` or frontend workflow changes
   - Domain: app.koordie.com
   - Status: ✅ PRODUCTION - DO NOT TOUCH

### New Service (TO BE CREATED)
3. **koordie-marketing** (Cloud Run)
   - Service: `koordie-marketing`
   - Deploys when: `marketing-site/**` or marketing workflow changes
   - Domain: www.koordie.com (to be configured)
   - Status: 🆕 NEW - WILL BE CREATED ON FIRST DEPLOY

## Deployment Isolation Analysis

### ✅ Path-Based Triggers - NO CONFLICTS
Each workflow has isolated path triggers:
- Backend: `backend/**` only
- Frontend: `frontend/**` only
- Marketing: `marketing-site/**` only

**Risk**: ❌ NONE - Workflows won't trigger each other

### ✅ Service Names - NO CONFLICTS
Each service has unique Cloud Run service name:
- Backend: `koordie-backend`
- Frontend: `koordie-frontend`
- Marketing: `koordie-marketing`

**Risk**: ❌ NONE - Services are completely separate

### ✅ Docker Images - NO CONFLICTS
Each service uses unique image names in Artifact Registry:
- Backend: `backend:$SHA` and `backend:latest`
- Frontend: `frontend:$SHA` and `frontend:latest`
- Marketing: `marketing:$SHA` and `marketing:latest`

**Risk**: ❌ NONE - Images have distinct names

### ✅ Repository Structure - NO CONFLICTS
```
koordi/
├── backend/           # Existing - NOT TOUCHED
├── frontend/          # Existing - NOT TOUCHED
├── marketing-site/    # NEW - Isolated
└── .github/workflows/
    ├── backend-deploy.yml      # Existing - NOT MODIFIED
    ├── frontend-deploy.yml     # Existing - NOT MODIFIED
    └── marketing-site-deploy.yml  # NEW
```

**Risk**: ❌ NONE - Marketing site is completely separate directory

## Changes Summary

### Files Added (NEW)
```
marketing-site/
├── index.html
├── privacy-policy.html
├── terms-of-service.html
├── css/main.css
├── images/koordie.svg
├── Dockerfile
├── nginx.conf
└── README.md

.github/workflows/marketing-site-deploy.yml
```

### Files Modified (EXISTING)
```
docs/terms-of-service.md                    # Documentation only - not deployed
marketing-site/index.html                    # New file, refined after creation
marketing-site/privacy-policy.html           # New file
marketing-site/terms-of-service.html         # New file
marketing-site/css/main.css                  # New file
docs/API_SPECIFICATION.md                    # Documentation only - not deployed
```

### Files NOT Touched (CRITICAL)
```
✅ backend/**                 # NO CHANGES
✅ frontend/**                # NO CHANGES
✅ .github/workflows/backend-deploy.yml      # NO CHANGES
✅ .github/workflows/frontend-deploy.yml     # NO CHANGES
```

## Risk Assessment

### 🟢 LOW RISK - Isolated New Service
- Marketing site is completely separate Cloud Run service
- Uses separate Docker container with nginx
- No shared dependencies with backend/frontend
- No database connections
- No API calls
- Pure static HTML/CSS site

### 🟢 LOW RISK - Path-Based Deployment Triggers
- Marketing site changes will ONLY trigger marketing deployment
- Backend/Frontend will NOT be affected by marketing site changes
- Each workflow has explicit path filters

### 🟢 LOW RISK - First Deployment
- Service `koordie-marketing` doesn't exist yet
- First deploy will create new service
- Cannot conflict with existing services

### ⚠️ MEDIUM RISK - Domain Configuration Required
- After deployment, need to map www.koordie.com domain
- This is a manual step in GCP Console
- Does not affect existing services

## Pre-Deployment Checklist

- [x] Verify all workflows have isolated path triggers
- [x] Confirm service names are unique
- [x] Verify Docker image names don't conflict
- [x] Check that no backend files were modified
- [x] Check that no frontend files were modified
- [x] Confirm marketing site has all required files
- [x] Verify nginx.conf is properly configured
- [x] Confirm Dockerfile is valid
- [x] Review GitHub Actions workflow syntax
- [x] Verify GCP project ID is correct
- [x] Confirm Artifact Registry repository exists

## Deployment Steps

### Step 1: Merge to Main (Triggers Deployment)
```bash
git checkout main
git pull origin main
git merge documentation-update-11252025
git push origin main
```

**What Happens**:
- GitHub Actions detects changes in `marketing-site/**`
- Workflow `.github/workflows/marketing-site-deploy.yml` triggers
- Docker image builds from `marketing-site/`
- Image pushes to Artifact Registry
- Cloud Run service `koordie-marketing` deploys
- Health check runs against deployed service

**What Does NOT Happen**:
- ❌ Backend workflow does NOT trigger (no `backend/**` changes)
- ❌ Frontend workflow does NOT trigger (no `frontend/**` changes)
- ❌ Existing services are NOT redeployed
- ❌ No changes to existing infrastructure

### Step 2: Verify Deployment (Manual)
```bash
# Check marketing site deployed successfully
gcloud run services describe koordie-marketing \
  --region=us-central1 \
  --project=solar-safeguard-476315-p0

# Get the service URL
gcloud run services describe koordie-marketing \
  --region=us-central1 \
  --project=solar-safeguard-476315-p0 \
  --format='value(status.url)'
```

### Step 3: Test Marketing Site (Manual)
```bash
# Get URL from Step 2, then test
MARKETING_URL="<url-from-step-2>"
curl -s $MARKETING_URL | grep -i "koordie"
curl -s $MARKETING_URL/privacy-policy.html | grep -i "privacy"
curl -s $MARKETING_URL/terms-of-service.html | grep -i "terms"
```

### Step 4: Configure Domain (Manual - GCP Console)
1. Go to Cloud Run → koordie-marketing → Manage Custom Domains
2. Add domain: www.koordie.com
3. Update DNS records with provided values
4. Wait for SSL certificate provisioning (can take 15-60 minutes)

### Step 5: Verify Existing Services Still Work (Critical)
```bash
# Test backend is still working
curl https://api.koordie.com/api/health

# Test frontend is still accessible
curl -I https://app.koordie.com
```

## Rollback Plan

If anything goes wrong with marketing site:

### Option 1: Delete Marketing Service (Safest)
```bash
gcloud run services delete koordie-marketing \
  --region=us-central1 \
  --project=solar-safeguard-476315-p0 \
  --quiet
```
**Impact**: Only removes marketing site, backend/frontend unaffected

### Option 2: Deploy Previous Version
```bash
# Find previous working image SHA from Artifact Registry
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/marketing

# Deploy previous version
gcloud run deploy koordie-marketing \
  --image=us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/marketing:<previous-sha> \
  --region=us-central1
```

### Option 3: Revert Git Merge (Nuclear Option)
```bash
# Only if deployment breaks something unexpectedly
git revert -m 1 <merge-commit-sha>
git push origin main
```
**Note**: This should never be needed since services are isolated

## Monitoring After Deployment

### Check Deployment Logs
```bash
# View GitHub Actions logs
# Go to: https://github.com/jamesschaffer/koordi/actions

# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=koordie-marketing" \
  --limit=50 \
  --project=solar-safeguard-476315-p0
```

### Verify No Impact on Existing Services
```bash
# Check backend logs for any errors after marketing deploy
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=koordie-backend AND severity>=ERROR" \
  --limit=10 \
  --project=solar-safeguard-476315-p0

# Check frontend logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=koordie-frontend AND severity>=ERROR" \
  --limit=10 \
  --project=solar-safeguard-476315-p0
```

## Post-Deployment Verification

- [ ] Marketing site accessible at Cloud Run URL
- [ ] index.html loads correctly
- [ ] privacy-policy.html loads correctly
- [ ] terms-of-service.html loads correctly
- [ ] CSS styles applied correctly
- [ ] Koordie logo displays
- [ ] All navigation links work
- [ ] Backend still accessible at api.koordie.com
- [ ] Frontend still accessible at app.koordie.com
- [ ] No errors in Cloud Run logs
- [ ] Health checks passing

## Future Deployment Process

For any future marketing site changes:

1. **Make changes** in `marketing-site/` directory
2. **Test locally** with `python3 -m http.server 8080`
3. **Commit and push** to feature branch
4. **Create PR** to main branch
5. **Review changes** before merging
6. **Merge to main** - deployment happens automatically
7. **Monitor logs** to ensure successful deployment
8. **Test the site** at www.koordie.com

## Conclusion

✅ **SAFE TO DEPLOY**: Marketing site is completely isolated from existing infrastructure
- No risk to backend service
- No risk to frontend service
- Uses separate Cloud Run service
- Has independent deployment workflow
- Only static HTML/CSS files (no code execution)
- Clear rollback options available

🎯 **RECOMMENDED ACTION**: Proceed with merge to main branch
