# Koordi Development Workflow

This guide explains how to develop features, fix bugs, and deploy changes to production using our CI/CD pipeline.

## Table of Contents
- [Setup GitHub CI/CD](#setup-github-cicd)
- [Daily Development Workflow](#daily-development-workflow)
- [Fixing Bugs](#fixing-bugs)
- [Deploying to Production](#deploying-to-production)
- [Emergency Hotfixes](#emergency-hotfixes)

---

## Setup GitHub CI/CD

### Step 1: Add GitHub Secret

1. Navigate to your GitHub repository
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Name: `GCP_SA_KEY`
5. Value: Copy the entire contents of `github-actions-key.json` (located in project root)
6. Click **Add secret**

**IMPORTANT:** After copying the key contents, delete the `github-actions-key.json` file from your local machine or ensure it's never committed to git (it's already in `.gitignore`).

### Step 2: Push Workflow Files to GitHub

```bash
# Make sure you're in the project root
cd /Users/jamesschaffer/Documents/Dev-Projects/koordi

# Add the new files
git add .github/workflows/ .gitignore DEVELOPMENT_WORKFLOW.md

# Commit the changes
git commit -m "Add GitHub Actions CI/CD workflows

- Add backend deployment workflow
- Add frontend deployment workflow
- Update .gitignore to exclude service account keys
- Add development workflow documentation"

# Push to GitHub
git push origin main
```

Once pushed, the GitHub Actions workflows will automatically deploy when you push changes to the `main` branch.

---

## Daily Development Workflow

### 1. Start Your Day

```bash
# Make sure you're on main and up to date
git checkout main
git pull origin main

# Start local development servers (in separate terminals)
cd backend && npm run dev
cd frontend && npm run dev
```

### 2. Create a Feature Branch

```bash
# Create and checkout a new branch for your feature/bugfix
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

**Branch naming conventions:**
- `feature/` - New features
- `fix/` - Bug fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates

### 3. Make Your Changes

- Edit code in your IDE
- Test locally at:
  - Frontend: http://localhost:5173
  - Backend: http://localhost:3000
- Ensure all tests pass (if applicable)

### 4. Commit Your Changes

```bash
# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "Add feature: Brief description

- Detail about what changed
- Why the change was needed
- Any relevant context"
```

### 5. Push Your Branch to GitHub

```bash
# Push your branch
git push origin feature/your-feature-name
```

### 6. Create a Pull Request

1. Go to your GitHub repository
2. Click "Compare & pull request" (appears after pushing)
3. Fill out the PR description:
   - What does this PR do?
   - Why is it needed?
   - How to test it?
4. Request review if working with a team
5. Once approved, **merge to main**

### 7. Automatic Deployment

- When you merge the PR to `main`, GitHub Actions will automatically:
  - Build the Docker images
  - Push to Google Artifact Registry
  - Deploy to Cloud Run
  - Your changes will be live at https://app.koordie.com in ~3-5 minutes

---

## Fixing Bugs

### Production Bug Workflow

1. **Reproduce Locally**
   ```bash
   git checkout main
   git pull origin main

   # Try to reproduce the bug locally
   npm run dev  # in both backend and frontend
   ```

2. **Create a Fix Branch**
   ```bash
   git checkout -b fix/description-of-bug
   ```

3. **Fix and Test**
   - Make your changes
   - Test thoroughly locally
   - Ensure the bug is fixed

4. **Commit and Push**
   ```bash
   git add .
   git commit -m "Fix: Description of bug

   - Explain what was broken
   - Explain how you fixed it
   - Add any relevant context"

   git push origin fix/description-of-bug
   ```

5. **Create PR and Deploy**
   - Create a pull request on GitHub
   - Review the changes
   - Merge to `main`
   - GitHub Actions will automatically deploy

---

## Deploying to Production

### Via CI/CD (Recommended)

1. **Merge to Main**
   - All merges to `main` automatically deploy

2. **Monitor Deployment**
   - Go to GitHub → Actions tab
   - Watch the workflow progress
   - Check for any errors

3. **Verify Live**
   - Visit https://app.koordie.com
   - Test the changes in production
   - Check Cloud Run logs if needed:
   ```bash
   # Backend logs
   gcloud run services logs read koordie-backend --region=us-central1

   # Frontend logs
   gcloud run services logs read koordie-frontend --region=us-central1
   ```

### Manual Deployment (Emergency Only)

If CI/CD is down, you can deploy manually:

**Backend:**
```bash
cd backend
gcloud builds submit --tag us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/backend:latest
gcloud run deploy koordie-backend --image us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/backend:latest --region us-central1
```

**Frontend:**
```bash
cd frontend
gcloud builds submit --tag us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/frontend:latest
gcloud run deploy koordie-frontend --image us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/frontend:latest --region us-central1
```

---

## Emergency Hotfixes

For critical bugs that need immediate fixes:

1. **Create hotfix branch from main**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b hotfix/critical-bug-name
   ```

2. **Fix and Test Quickly**
   - Make minimal changes
   - Test locally
   - Ensure nothing else breaks

3. **Fast-track to Production**
   ```bash
   git add .
   git commit -m "Hotfix: Critical bug description"
   git push origin hotfix/critical-bug-name
   ```

4. **Create PR with "HOTFIX" label**
   - Skip extensive review if critical
   - Merge immediately
   - Monitor deployment closely

5. **Verify Fix**
   - Test in production immediately
   - Roll back if needed

---

## Common Commands

### Check Current Branch
```bash
git branch
```

### Switch Branches
```bash
git checkout branch-name
```

### See What Changed
```bash
git status
git diff
```

### View Commit History
```bash
git log --oneline
```

### Discard Local Changes
```bash
git restore .  # Discard all changes
git restore filename  # Discard specific file
```

### View Cloud Run Services
```bash
gcloud run services list --region=us-central1
```

### View Recent Deployments
```bash
gcloud run revisions list --service=koordie-backend --region=us-central1
gcloud run revisions list --service=koordie-frontend --region=us-central1
```

---

## Troubleshooting

### Deployment Failed in GitHub Actions

1. Check the Actions tab in GitHub
2. Click on the failed workflow
3. Read the error messages
4. Common issues:
   - Docker build errors → Check Dockerfile
   - Permission errors → Check GCP_SA_KEY secret
   - Deployment errors → Check Cloud Run logs

### Local Development Not Working

1. **Backend won't start:**
   ```bash
   cd backend
   npm install  # Reinstall dependencies
   npm run dev
   ```

2. **Frontend won't start:**
   ```bash
   cd frontend
   npm install  # Reinstall dependencies
   npm run dev
   ```

3. **Database connection issues:**
   - Check `.env` file exists in backend/
   - Verify DATABASE_URL is correct

---

## Best Practices

1. **Always work on a branch** - Never commit directly to `main`
2. **Write clear commit messages** - Explain what and why
3. **Test locally first** - Don't rely solely on CI/CD
4. **Keep PRs small** - Easier to review and less risky
5. **Review your own PR** - Catch obvious mistakes before others review
6. **Monitor deployments** - Watch the first few deployments of your changes
7. **Document tricky changes** - Add comments for complex logic

---

## Questions?

If you run into issues:
1. Check the error messages carefully
2. Review this documentation
3. Check Cloud Run logs: `gcloud run services logs read SERVICE_NAME --region=us-central1`
4. Review GitHub Actions logs in the Actions tab
