# Koordie Production Deployment Plan
## Google Cloud Run + Cloud SQL + Redis

**Last Updated:** November 23, 2024
**Target Platform:** Google Cloud Platform
**Application:** Koordie - Family Scheduling Assistant

---

## 🎯 Overview: What We're Deploying

```
┌─────────────────────────────────────────────────────────────────┐
│                       GOOGLE CLOUD                              │
│                                                                 │
│   ┌──────────┐      ┌──────────┐      ┌─────────┐  ┌────────┐ │
│   │  Cloud   │      │  Cloud   │      │ Cloud   │  │ Memory │ │
│   │   Run    │ ───▶ │   Run    │ ───▶ │  SQL    │  │ Store  │ │
│   │(Frontend)│      │(Backend) │      │(Postgres)  │(Redis) │ │
│   └──────────┘      └──────────┘      └─────────┘  └────────┘ │
│        ▲                                                        │
│        │                                                        │
└────────│────────────────────────────────────────────────────────┘
         │
    Users visit
   koordie.com
```

**Tech Stack:**
- **Frontend:** React + Vite + TypeScript
- **Backend:** Node.js + Express + TypeScript + Prisma
- **Database:** PostgreSQL (Cloud SQL)
- **Cache:** Redis (Memory Store)
- **Auth:** Google OAuth
- **APIs:** Google Maps, Google Calendar

**Estimated Monthly Cost:** $15-40 for <1000 daily active users

---

## ✅ Pre-Flight Checklist

Before starting deployment, verify you have:

- [ ] Domain name secured (koordie.com)
- [ ] Google Cloud account with billing enabled
- [ ] GitHub repository with latest code pushed
- [ ] Google OAuth credentials (will need to update redirect URIs)
- [ ] Google Maps API key
- [ ] All local environment variables documented
- [ ] Database migration scripts tested locally
- [ ] Docker Desktop installed and running

---

## Phase 1: Prepare Local Project Files

### 1.1 Current Project Structure

```
koordi/
├── frontend/              # React + Vite frontend
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile        # ← CREATE THIS
├── backend/               # Node.js + Express backend
│   ├── src/
│   ├── prisma/
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile        # ← CREATE THIS
├── .github/
│   └── workflows/
│       └── deploy.yml    # ← CREATE THIS
├── docs/
└── .gitignore
```

### 1.2 Create Backend Dockerfile

Create `backend/Dockerfile`:

```dockerfile
# Stage 1: Build TypeScript
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install ALL dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Generate Prisma Client
RUN npx prisma generate

# Stage 2: Production runtime
FROM node:20-slim

WORKDIR /app

# Install OpenSSL (required by Prisma)
RUN apt-get update -y && apt-get install -y openssl

# Copy package files and install production dependencies only
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci --only=production

# Copy built application from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Cloud Run sets PORT automatically
ENV PORT=8080

EXPOSE 8080

# Start the server
CMD ["node", "dist/index.js"]
```

### 1.3 Create Frontend Dockerfile

Create `frontend/Dockerfile`:

```dockerfile
# Stage 1: Build the Vite app
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build for production
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built files to nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Cloud Run requires port 8080
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
```

### 1.4 Create Frontend nginx.conf

Create `frontend/nginx.conf`:

```nginx
server {
    listen 8080;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    # Enable gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript;
    gzip_min_length 1000;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # SPA routing - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 1.5 Update Frontend Environment Configuration

Create `frontend/.env.production`:

```bash
# This will be replaced with actual values during deployment
VITE_API_URL=__BACKEND_URL__
VITE_GOOGLE_MAPS_API_KEY=__GOOGLE_MAPS_KEY__
```

### 1.6 Document Backend Environment Variables

Your `backend/.env.example` is good! For production, we'll need all these in Secret Manager:

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost/koordie?host=/cloudsql/CONNECTION_NAME

# Server
PORT=8080
NODE_ENV=production
FRONTEND_URL=https://koordie.com

# JWT & Encryption
JWT_SECRET=<generate-strong-secret>
ENCRYPTION_KEY=<generate-strong-key>

# Redis
REDIS_URL=redis://REDIS_IP:6379

# Google OAuth
GOOGLE_CLIENT_ID=<your-client-id>
GOOGLE_CLIENT_SECRET=<your-client-secret>
GOOGLE_REDIRECT_URI=https://api.koordie.com/api/auth/google/callback

# Google Maps API
GOOGLE_MAPS_API_KEY=<your-maps-key>
```

---

## Phase 2: Google Cloud Setup

### 2.1 Install Google Cloud CLI

**Mac (with Homebrew):**
```bash
brew install google-cloud-sdk
```

After installing, restart your terminal and verify:
```bash
gcloud --version
```

### 2.2 Authenticate and Create/Set Project

```bash
# Login to Google Cloud (opens browser)
gcloud auth login

# Create a new project for Koordie
gcloud projects create koordie-prod --name="Koordie Production"

# Set as active project
gcloud config set project koordie-prod

# Link billing account (required)
# First, list your billing accounts
gcloud billing accounts list

# Link billing to project (replace BILLING_ACCOUNT_ID)
gcloud billing projects link koordie-prod --billing-account=BILLING_ACCOUNT_ID
```

### 2.3 Enable Required Google Cloud APIs

```bash
# Run these commands one at a time
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable redis.googleapis.com
gcloud services enable vpcaccess.googleapis.com
```

### 2.4 Set Your Region

```bash
# Set default region (choose closest to your users)
gcloud config set run/region us-central1
gcloud config set compute/region us-central1
gcloud config set compute/zone us-central1-a
```

**Region choices:**
- `us-central1` — Iowa (good for US)
- `us-east1` — South Carolina
- `us-west1` — Oregon

---

## Phase 3: Database Setup (Cloud SQL)

### 3.1 Create PostgreSQL Instance

```bash
gcloud sql instances create koordie-db \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --root-password=REPLACE_WITH_STRONG_PASSWORD \
    --backup-start-time=03:00 \
    --storage-size=10GB \
    --storage-auto-increase
```

**⏱️ This takes 10-15 minutes.** Save the root password securely.

### 3.2 Create Database

```bash
gcloud sql databases create koordie --instance=koordie-db
```

### 3.3 Create Application Database User

```bash
gcloud sql users create koordie_app \
    --instance=koordie-db \
    --password=REPLACE_WITH_STRONG_APP_PASSWORD
```

**Save this password!** You'll need it for DATABASE_URL.

### 3.4 Get Connection Name

```bash
# Get the Cloud SQL connection name
gcloud sql instances describe koordie-db --format="value(connectionName)"
```

**Save this output!** It looks like: `koordie-prod:us-central1:koordie-db`

### 3.5 Enable Cloud SQL Admin API

```bash
gcloud services enable sqladmin.googleapis.com
```

---

## Phase 4: Redis Setup (Memory Store)

### 4.1 Create VPC Connector

Cloud Run needs a VPC connector to access Redis:

```bash
gcloud compute networks vpc-access connectors create koordie-connector \
    --network=default \
    --region=us-central1 \
    --range=10.8.0.0/28
```

### 4.2 Create Redis Instance

```bash
gcloud redis instances create koordie-redis \
    --size=1 \
    --region=us-central1 \
    --redis-version=redis_7_0 \
    --tier=basic
```

**⏱️ This takes 5-10 minutes.**

### 4.3 Get Redis IP Address

```bash
gcloud redis instances describe koordie-redis --region=us-central1 --format="value(host)"
```

**Save this IP!** You'll use it in REDIS_URL.

---

## Phase 5: Artifact Registry

Create a repository to store Docker images:

```bash
gcloud artifacts repositories create koordie-repo \
    --repository-format=docker \
    --location=us-central1 \
    --description="Docker repository for Koordie"
```

---

## Phase 6: Secret Manager Setup

Store all sensitive environment variables in Secret Manager.

### 6.1 Generate Strong Secrets

```bash
# Generate JWT secret
openssl rand -base64 32

# Generate encryption key
openssl rand -base64 32
```

**Save both outputs!**

### 6.2 Create DATABASE_URL Secret

Replace the placeholders with your actual values:

```bash
echo -n "postgresql://koordie_app:YOUR_APP_PASSWORD@localhost/koordie?host=/cloudsql/YOUR_CONNECTION_NAME" | \
    gcloud secrets create DATABASE_URL --data-file=-
```

### 6.3 Create All Other Secrets

```bash
# JWT Secret
echo -n "YOUR_GENERATED_JWT_SECRET" | gcloud secrets create JWT_SECRET --data-file=-

# Encryption Key
echo -n "YOUR_GENERATED_ENCRYPTION_KEY" | gcloud secrets create ENCRYPTION_KEY --data-file=-

# Redis URL (replace REDIS_IP with actual IP from Phase 4.3)
echo -n "redis://REDIS_IP:6379" | gcloud secrets create REDIS_URL --data-file=-

# Google OAuth Client ID
echo -n "YOUR_GOOGLE_CLIENT_ID" | gcloud secrets create GOOGLE_CLIENT_ID --data-file=-

# Google OAuth Client Secret
echo -n "YOUR_GOOGLE_CLIENT_SECRET" | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=-

# Google Maps API Key
echo -n "YOUR_GOOGLE_MAPS_API_KEY" | gcloud secrets create GOOGLE_MAPS_API_KEY --data-file=-
```

---

## Phase 7: Manual Backend Deployment (First Time)

### 7.1 Build and Push Backend Docker Image

```bash
# Navigate to project root
cd /Users/jamesschaffer/Documents/Dev-Projects/koordi

# Configure Docker authentication for Google Cloud
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build the backend image
docker build -t us-central1-docker.pkg.dev/koordie-prod/koordie-repo/backend:v1 ./backend

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/koordie-prod/koordie-repo/backend:v1
```

### 7.2 Deploy Backend to Cloud Run

Replace `YOUR_CONNECTION_NAME` with the connection name from Phase 3.4:

```bash
gcloud run deploy koordie-backend \
    --image=us-central1-docker.pkg.dev/koordie-prod/koordie-repo/backend:v1 \
    --platform=managed \
    --region=us-central1 \
    --allow-unauthenticated \
    --add-cloudsql-instances=YOUR_CONNECTION_NAME \
    --vpc-connector=koordie-connector \
    --set-secrets=DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,REDIS_URL=REDIS_URL:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_API_KEY:latest \
    --set-env-vars=NODE_ENV=production,PORT=8080,FRONTEND_URL=https://koordie.com,GOOGLE_REDIRECT_URI=https://api.koordie.com/api/auth/google/callback \
    --min-instances=1 \
    --max-instances=10 \
    --memory=512Mi \
    --cpu=1
```

**Save the backend URL!** It will look like: `https://koordie-backend-xxxxx-uc.a.run.app`

### 7.3 Run Database Migrations

You need to run Prisma migrations on the production database. Connect via Cloud SQL Proxy:

```bash
# Download Cloud SQL Proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.amd64

# Make it executable
chmod +x cloud-sql-proxy

# Start proxy (replace with your connection name)
./cloud-sql-proxy YOUR_CONNECTION_NAME

# In a new terminal, navigate to backend and run migrations
cd backend
DATABASE_URL="postgresql://koordie_app:YOUR_APP_PASSWORD@localhost:5432/koordie" npx prisma migrate deploy
```

### 7.4 Test Backend

```bash
# Test health endpoint
curl https://koordie-backend-xxxxx-uc.a.run.app/health

# Check logs if there are issues
gcloud run services logs read koordie-backend --region=us-central1 --limit=50
```

---

## Phase 8: Manual Frontend Deployment (First Time)

### 8.1 Update Frontend Environment for Production

Create `frontend/.env.production` with your actual backend URL:

```bash
VITE_API_URL=https://koordie-backend-xxxxx-uc.a.run.app
VITE_GOOGLE_MAPS_API_KEY=YOUR_GOOGLE_MAPS_API_KEY
```

### 8.2 Build and Push Frontend

```bash
# Build frontend image (from project root)
docker build -t us-central1-docker.pkg.dev/koordie-prod/koordie-repo/frontend:v1 ./frontend

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/koordie-prod/koordie-repo/frontend:v1
```

### 8.3 Deploy Frontend to Cloud Run

```bash
gcloud run deploy koordie-frontend \
    --image=us-central1-docker.pkg.dev/koordie-prod/koordie-repo/frontend:v1 \
    --platform=managed \
    --region=us-central1 \
    --allow-unauthenticated \
    --min-instances=1 \
    --max-instances=5 \
    --memory=256Mi \
    --cpu=1
```

**Save the frontend URL!** Example: `https://koordie-frontend-xxxxx-uc.a.run.app`

### 8.4 Test Frontend

Visit the frontend URL in your browser and verify:
- [ ] Page loads correctly
- [ ] Can reach login page
- [ ] API calls work (check browser console)

---

## Phase 9: Custom Domain Setup

### 9.1 Map Backend Domain (api.koordie.com)

```bash
gcloud run domain-mappings create \
    --service=koordie-backend \
    --domain=api.koordie.com \
    --region=us-central1
```

### 9.2 Map Frontend Domain (koordie.com and www.koordie.com)

```bash
gcloud run domain-mappings create \
    --service=koordie-frontend \
    --domain=koordie.com \
    --region=us-central1

gcloud run domain-mappings create \
    --service=koordie-frontend \
    --domain=www.koordie.com \
    --region=us-central1
```

### 9.3 Update DNS Records

After running the domain mapping commands, you'll get DNS records to add. Go to your domain registrar and add:

**For api.koordie.com:**
- Type: `CNAME`
- Name: `api`
- Value: `ghs.googlehosted.com`

**For koordie.com:**
- Type: `A`
- Name: `@`
- Value: (IP addresses provided by Cloud Run)

**For www.koordie.com:**
- Type: `CNAME`
- Name: `www`
- Value: `ghs.googlehosted.com`

**⏱️ DNS propagation takes 5-60 minutes.**

### 9.4 Update Google OAuth Redirect URIs

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Find your OAuth 2.0 Client ID
3. Add authorized redirect URIs:
   - `https://api.koordie.com/api/auth/google/callback`
   - `http://localhost:3000/api/auth/google/callback` (keep for local dev)

### 9.5 Update Backend Environment Variables

```bash
gcloud run services update koordie-backend \
    --set-env-vars=FRONTEND_URL=https://koordie.com,GOOGLE_REDIRECT_URI=https://api.koordie.com/api/auth/google/callback \
    --region=us-central1
```

---

## Phase 10: GitHub Actions CI/CD

Automate deployments so pushing to `main` automatically deploys.

### 10.1 Create Service Account for GitHub

```bash
# Create service account
gcloud iam service-accounts create github-deployer \
    --display-name="GitHub Actions Deployer"

# Grant necessary permissions
PROJECT_ID="koordie-prod"
SA_EMAIL="github-deployer@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/run.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/storage.admin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/iam.serviceAccountUser"

# Create key file
gcloud iam service-accounts keys create key.json \
    --iam-account=$SA_EMAIL
```

### 10.2 Add Secrets to GitHub Repository

1. Go to: https://github.com/jamesschaffer/koordi/settings/secrets/actions
2. Click "New repository secret"
3. Add these secrets:

| Secret Name | Value |
|------------|-------|
| `GCP_PROJECT_ID` | `koordie-prod` |
| `GCP_SA_KEY` | Contents of `key.json` (entire file) |
| `BACKEND_URL` | `https://api.koordie.com` |
| `GOOGLE_MAPS_API_KEY` | Your Google Maps API key |

**⚠️ IMPORTANT:** Delete `key.json` from your computer after adding to GitHub!

```bash
rm key.json
```

### 10.3 Create GitHub Actions Workflow

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Google Cloud Run

on:
  push:
    branches:
      - main

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  REGION: us-central1
  BACKEND_SERVICE: koordie-backend
  FRONTEND_SERVICE: koordie-frontend
  REPOSITORY: koordie-repo
  CLOUD_SQL_CONNECTION: koordie-prod:us-central1:koordie-db

jobs:
  deploy-backend:
    name: Deploy Backend
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev

      - name: Build Backend Image
        run: |
          docker build -t ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.BACKEND_SERVICE }}:${{ github.sha }} ./backend
          docker tag ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.BACKEND_SERVICE }}:${{ github.sha }} \
                     ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.BACKEND_SERVICE }}:latest

      - name: Push Backend Image
        run: |
          docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.BACKEND_SERVICE }}:${{ github.sha }}
          docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.BACKEND_SERVICE }}:latest

      - name: Deploy Backend to Cloud Run
        run: |
          gcloud run deploy ${{ env.BACKEND_SERVICE }} \
            --image=${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.BACKEND_SERVICE }}:${{ github.sha }} \
            --platform=managed \
            --region=${{ env.REGION }} \
            --allow-unauthenticated \
            --add-cloudsql-instances=${{ env.CLOUD_SQL_CONNECTION }} \
            --vpc-connector=koordie-connector \
            --set-secrets=DATABASE_URL=DATABASE_URL:latest,JWT_SECRET=JWT_SECRET:latest,ENCRYPTION_KEY=ENCRYPTION_KEY:latest,REDIS_URL=REDIS_URL:latest,GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID:latest,GOOGLE_CLIENT_SECRET=GOOGLE_CLIENT_SECRET:latest,GOOGLE_MAPS_API_KEY=GOOGLE_MAPS_API_KEY:latest \
            --set-env-vars=NODE_ENV=production,PORT=8080,FRONTEND_URL=https://koordie.com,GOOGLE_REDIRECT_URI=https://api.koordie.com/api/auth/google/callback \
            --min-instances=1 \
            --max-instances=10 \
            --memory=512Mi \
            --cpu=1

  deploy-frontend:
    name: Deploy Frontend
    runs-on: ubuntu-latest
    needs: deploy-backend

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      - name: Configure Docker
        run: gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev

      - name: Create Production Environment File
        run: |
          echo "VITE_API_URL=${{ secrets.BACKEND_URL }}" > frontend/.env.production
          echo "VITE_GOOGLE_MAPS_API_KEY=${{ secrets.GOOGLE_MAPS_API_KEY }}" >> frontend/.env.production

      - name: Build Frontend Image
        run: |
          docker build -t ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.FRONTEND_SERVICE }}:${{ github.sha }} ./frontend
          docker tag ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.FRONTEND_SERVICE }}:${{ github.sha }} \
                     ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.FRONTEND_SERVICE }}:latest

      - name: Push Frontend Image
        run: |
          docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.FRONTEND_SERVICE }}:${{ github.sha }}
          docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.FRONTEND_SERVICE }}:latest

      - name: Deploy Frontend to Cloud Run
        run: |
          gcloud run deploy ${{ env.FRONTEND_SERVICE }} \
            --image=${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPOSITORY }}/${{ env.FRONTEND_SERVICE }}:${{ github.sha }} \
            --platform=managed \
            --region=${{ env.REGION }} \
            --allow-unauthenticated \
            --min-instances=1 \
            --max-instances=5 \
            --memory=256Mi \
            --cpu=1
```

### 10.4 Commit and Push Workflow

```bash
git add .github/workflows/deploy.yml backend/Dockerfile frontend/Dockerfile frontend/nginx.conf
git commit -m "Add production deployment configuration"
git push origin main
```

This will trigger the first automated deployment!

---

## Phase 11: Post-Deployment Verification

### 11.1 Verify Services Are Running

```bash
# List Cloud Run services
gcloud run services list --region=us-central1

# Check backend logs
gcloud run services logs read koordie-backend --region=us-central1 --limit=50

# Check frontend logs
gcloud run services logs read koordie-frontend --region=us-central1 --limit=50
```

### 11.2 Test Application

Visit https://koordie.com and verify:

- [ ] Homepage loads
- [ ] Login with Google works
- [ ] Can navigate to dashboard
- [ ] Can create/view calendars
- [ ] Can add family members
- [ ] Events sync with Google Calendar
- [ ] Address autocomplete works
- [ ] Drive time calculations work

### 11.3 Monitor Performance

Visit [Cloud Console Monitoring](https://console.cloud.google.com/monitoring):

- Set up uptime checks for frontend and backend
- Create alerts for error rates > 5%
- Monitor response times

---

## Phase 12: Cost Optimization

### 12.1 Set Up Billing Alerts

```bash
# Go to Cloud Console > Billing > Budgets & alerts
# Set budget: $50/month
# Alerts at: 50%, 90%, 100%
```

### 12.2 Review Instance Sizing

After 1 week of usage, check if you can reduce:
- Database tier (if usage is low)
- Cloud Run min/max instances
- Memory allocations

---

## 🔧 Troubleshooting Guide

### Backend Won't Start

```bash
# Check logs
gcloud run services logs read koordie-backend --region=us-central1 --limit=100

# Common issues:
# - Database connection: Verify Cloud SQL connection name
# - Secrets: Ensure all secrets are created in Secret Manager
# - Prisma: Make sure migrations ran successfully
```

### Frontend Can't Reach Backend

```bash
# Verify CORS settings in backend
# Check that FRONTEND_URL environment variable is set correctly
# Ensure API URL in frontend .env.production matches backend URL
```

### Database Connection Issues

```bash
# Verify Cloud SQL connection name
gcloud sql instances describe koordie-db --format="value(connectionName)"

# Check that backend has --add-cloudsql-instances flag
# Verify DATABASE_URL secret has correct format
```

### Redis Connection Issues

```bash
# Verify Redis IP
gcloud redis instances describe koordie-redis --region=us-central1

# Ensure VPC connector is attached to Cloud Run service
# Check REDIS_URL secret
```

---

## 📋 Quick Reference Commands

```bash
# View deployed services
gcloud run services list --region=us-central1

# View service details
gcloud run services describe koordie-backend --region=us-central1

# View logs
gcloud run services logs read koordie-backend --region=us-central1

# Update environment variable
gcloud run services update koordie-backend \
    --set-env-vars=KEY=VALUE \
    --region=us-central1

# Redeploy with new image
gcloud run services update koordie-backend \
    --image=us-central1-docker.pkg.dev/koordie-prod/koordie-repo/backend:latest \
    --region=us-central1

# View database instances
gcloud sql instances list

# Connect to database
gcloud sql connect koordie-db --user=koordie_app --database=koordie

# View secrets
gcloud secrets list

# Update a secret
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

---

## 🚀 Deployment Execution Checklist

Use this when you're ready to deploy:

### Pre-Deployment
- [ ] All code committed and pushed to main
- [ ] Backend builds successfully (`npm run build`)
- [ ] Frontend builds successfully (`npm run build`)
- [ ] All tests passing
- [ ] Database migrations tested locally
- [ ] Environment variables documented

### Phase 1: Infrastructure
- [ ] Google Cloud project created
- [ ] Billing account linked
- [ ] APIs enabled
- [ ] Cloud SQL instance created
- [ ] Redis instance created
- [ ] VPC connector created
- [ ] Artifact Registry created

### Phase 2: Secrets
- [ ] All secrets created in Secret Manager
- [ ] Database URL configured
- [ ] OAuth credentials updated
- [ ] API keys added

### Phase 3: Backend Deployment
- [ ] Backend Dockerfile created
- [ ] Docker image built and pushed
- [ ] Cloud Run service deployed
- [ ] Database migrations run
- [ ] Backend health check passing

### Phase 4: Frontend Deployment
- [ ] Frontend Dockerfile and nginx.conf created
- [ ] Production environment variables set
- [ ] Docker image built and pushed
- [ ] Cloud Run service deployed
- [ ] Frontend loads in browser

### Phase 5: Domain Setup
- [ ] Custom domains mapped
- [ ] DNS records configured
- [ ] SSL certificates provisioned
- [ ] OAuth redirect URIs updated

### Phase 6: CI/CD
- [ ] Service account created
- [ ] GitHub secrets configured
- [ ] GitHub Actions workflow created
- [ ] Automated deployment tested

### Phase 7: Verification
- [ ] Application fully functional
- [ ] All features tested
- [ ] Error monitoring set up
- [ ] Billing alerts configured

---

## 💰 Estimated Monthly Costs

Based on <1000 daily active users:

| Service | Tier | Estimated Cost |
|---------|------|----------------|
| Cloud Run (Backend) | 1 min instance, 512Mi | $8-15 |
| Cloud Run (Frontend) | 1 min instance, 256Mi | $4-8 |
| Cloud SQL (PostgreSQL) | db-f1-micro | $7 |
| Redis (Memory Store) | Basic, 1GB | $10 |
| Artifact Registry | Storage | $1 |
| **Total** | | **$30-41/month** |

**Free tier benefits:**
- Cloud Run: First 2 million requests/month free
- Cloud Storage: 5GB free
- Networking: 1GB egress free per month

---

## 📚 Additional Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud SQL Documentation](https://cloud.google.com/sql/docs)
- [Prisma Deployment Guide](https://www.prisma.io/docs/guides/deployment)
- [GitHub Actions for GCP](https://github.com/google-github-actions)

---

**Document Version:** 1.0
**Last Reviewed:** November 23, 2024
**Next Review:** After first successful deployment
