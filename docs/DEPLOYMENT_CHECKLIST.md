# Deployment Checklist

Use this checklist for all future deployments to production.

## Pre-Deployment

### Code Review
- [ ] All changes reviewed and tested locally
- [ ] No unwanted files in commit (check `git status`)
- [ ] All tests passing (if applicable)
- [ ] No console errors or warnings

### Branch Management
- [ ] Working on feature branch (not main)
- [ ] Branch is up to date with main (`git pull origin main`)
- [ ] All commits have clear messages
- [ ] No merge conflicts

### Component-Specific Checks

#### Backend Deployments
- [ ] No breaking API changes without version bump
- [ ] Database migrations tested (if any)
- [ ] Environment variables documented
- [ ] Health endpoint still works

#### Frontend Deployments
- [ ] Build completes without errors (`npm run build`)
- [ ] No hardcoded URLs or API keys
- [ ] Mobile responsive (test on small screen)
- [ ] All routes accessible

#### Marketing Site Deployments
- [ ] All HTML files valid
- [ ] All links work (internal and external)
- [ ] Images load correctly
- [ ] Legal documents up to date

## Deployment Process

### Step 1: Final Local Test
```bash
# For marketing site
cd marketing-site
python3 -m http.server 8080
# Visit http://localhost:8080 and test all pages

# For frontend
cd frontend
npm run build
npm run preview

# For backend
cd backend
npm run build
npm run start:prod
```

### Step 2: Commit and Push
```bash
git add -A
git status  # Review changes
git commit -m "Descriptive commit message"
git push origin <branch-name>
```

### Step 3: Merge to Main
```bash
# Option A: Via GitHub PR (RECOMMENDED)
# 1. Create PR on GitHub
# 2. Review changes
# 3. Merge PR

# Option B: Via command line
git checkout main
git pull origin main
git merge <branch-name>
git push origin main
```

### Step 4: Monitor Deployment
```bash
# Watch GitHub Actions
# Go to: https://github.com/jamesschaffer/koordi/actions

# Watch for green checkmarks on all workflows
```

## Post-Deployment

### Immediate Verification (Within 5 minutes)
- [ ] GitHub Actions workflow completed successfully
- [ ] Health check passed in workflow logs
- [ ] Service is accessible at production URL

### Functionality Testing
- [ ] Login flow works (if applicable)
- [ ] Main features work (calendar, events, etc.)
- [ ] No errors in browser console
- [ ] No 404 or 500 errors

### Check Logs for Errors
```bash
# Backend logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=koordie-backend AND severity>=ERROR" --limit=10

# Frontend logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=koordie-frontend AND severity>=ERROR" --limit=10

# Marketing logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=koordie-marketing AND severity>=ERROR" --limit=10
```

### User-Facing Checks
- [ ] Backend API responds: https://api.koordie.com/api/health
- [ ] Frontend loads: https://app.koordie.com
- [ ] Marketing site loads: https://www.koordie.com

### Documentation Updates
- [ ] Update CHANGELOG.md (if exists)
- [ ] Update README.md (if major changes)
- [ ] Update API documentation (if API changes)

## Rollback Procedure

If deployment fails or causes issues:

### Quick Rollback
```bash
# Find the previous working version
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/<service-name>

# Deploy previous version
gcloud run deploy <service-name> \
  --image=us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/<service-name>:<previous-sha> \
  --region=us-central1 \
  --project=solar-safeguard-476315-p0
```

### Git Rollback
```bash
# Revert the merge commit
git revert -m 1 <merge-commit-sha>
git push origin main
# This will trigger automatic redeployment of previous version
```

## Common Issues and Solutions

### Issue: GitHub Actions Fails
**Solution**: Check the Actions tab for error messages, fix the issue, push again

### Issue: Health Check Fails
**Solution**:
1. Check Cloud Run logs for errors
2. Verify environment variables are set
3. Check database connectivity (if applicable)

### Issue: Service Won't Start
**Solution**:
1. Check Dockerfile syntax
2. Verify port 8080 is exposed and used
3. Check for missing dependencies

### Issue: Domain Not Working
**Solution**:
1. Verify DNS records are correct
2. Wait for SSL certificate (can take 15-60 min)
3. Check Cloud Run domain mappings

## Deployment Schedule Recommendations

- **Avoid**: Friday afternoons/evenings
- **Avoid**: Right before holidays
- **Best**: Tuesday-Thursday mornings
- **Always**: Have time to monitor after deployment

## Emergency Contacts

If something goes critically wrong:
1. **Rollback immediately** using procedures above
2. Check error logs in Cloud Run
3. Review recent GitHub commits for issues
4. Consider posting in team chat/Discord (if applicable)

## Notes

- Never deploy without testing locally first
- Always review GitHub Actions logs after deployment
- Keep this checklist updated as process evolves
- Document any new deployment gotchas here
