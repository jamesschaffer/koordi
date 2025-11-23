# Production Deployment Checklist
**Purpose:** Step-by-step checklist for deploying Koordi to production
**Last Updated:** 2025-11-23
**Status:** Pre-deployment preparation

---

## Pre-Deployment Checklist

### Code & Security

- [ ] **Fix Critical Security Issues** (from PRODUCTION_AUDIT.md)
  - [ ] JWT_SECRET validation - throw error if missing or weak
  - [ ] ENCRYPTION_KEY validation - throw error if missing or invalid
  - [ ] Update invitation email template (7 days → 30 days)
  - [ ] Add global error handler middleware
  - [ ] Add environment variable validation on startup

- [ ] **Code Quality**
  - [ ] All tests passing (`npm test` in backend and frontend)
  - [ ] No ESLint errors (`npm run lint`)
  - [ ] TypeScript builds without errors (`npm run build`)
  - [ ] No console.log statements in production code
  - [ ] All TODO comments resolved or documented

- [ ] **Security Review**
  - [ ] All .env files in .gitignore
  - [ ] No hardcoded secrets in code
  - [ ] All API endpoints have authentication where required
  - [ ] Input validation on all endpoints
  - [ ] Rate limiting implemented on sensitive endpoints
  - [ ] CORS configured for production domains only

### Database

- [ ] **Schema & Migrations**
  - [ ] All Prisma migrations applied and tested
  - [ ] Database indexes verified for performance
  - [ ] Cascading deletes tested
  - [ ] Connection pool limits configured in DATABASE_URL

- [ ] **Data Management**
  - [ ] Database backup strategy documented
  - [ ] Backup restoration tested
  - [ ] Data retention policy defined
  - [ ] GDPR compliance reviewed (user data deletion)

### Infrastructure Setup

- [ ] **Environment Provisioning**
  - [ ] Production PostgreSQL database provisioned
  - [ ] Production Redis instance provisioned
  - [ ] Domain name registered and configured
  - [ ] SSL certificates obtained
  - [ ] CDN configured for static assets (optional)

- [ ] **Hosting Platform** (Choose one: AWS, Heroku, Render, Railway, etc.)
  - [ ] Backend hosting account created
  - [ ] Frontend hosting account created (Vercel, Netlify, etc.)
  - [ ] Deployment pipelines configured
  - [ ] Auto-scaling rules configured
  - [ ] Health check endpoints configured

### Environment Variables

- [ ] **Backend Environment Variables** (.env.production)
  ```bash
  # Database
  DATABASE_URL=postgresql://user:pass@host:5432/koordi_production?schema=public&connection_limit=20

  # Server
  PORT=3000
  NODE_ENV=production
  FRONTEND_URL=https://koordi.app,https://www.koordi.app

  # JWT & Encryption (GENERATE NEW SECURE VALUES)
  JWT_SECRET=<64-char-random-string>
  ENCRYPTION_KEY=<64-char-hex-string>

  # Redis
  REDIS_URL=redis://production-redis-host:6379

  # Google OAuth
  GOOGLE_CLIENT_ID=<production-client-id>
  GOOGLE_CLIENT_SECRET=<production-client-secret>
  GOOGLE_REDIRECT_URI=https://api.koordi.app/api/auth/google/callback

  # Google Maps
  GOOGLE_MAPS_API_KEY=<production-api-key-with-restrictions>

  # SMTP (SendGrid/AWS SES)
  SMTP_HOST=smtp.sendgrid.net
  SMTP_PORT=587
  SMTP_SECURE=false
  SMTP_USER=apikey
  SMTP_PASS=<sendgrid-api-key>
  EMAIL_FROM=noreply@koordi.app
  ```

- [ ] **Frontend Environment Variables** (.env.production)
  ```bash
  VITE_API_URL=https://api.koordi.app/api
  VITE_GOOGLE_MAPS_API_KEY=<production-api-key-with-restrictions>
  ```

- [ ] **Environment Variables Set in Hosting Platform**
  - [ ] All backend env vars set in hosting dashboard
  - [ ] All frontend env vars set in hosting dashboard
  - [ ] Secrets stored securely (not in git)

### External Services

- [ ] **Google Cloud Platform**
  - [ ] Production OAuth credentials created
  - [ ] Authorized redirect URIs configured
  - [ ] Calendar API enabled
  - [ ] Maps API enabled
  - [ ] API key restrictions configured (HTTP referrer for frontend, IP for backend)
  - [ ] Billing account configured with budget alerts

- [ ] **Email Service** (SendGrid, AWS SES, etc.)
  - [ ] Account created and verified
  - [ ] Domain verified for sending
  - [ ] SPF/DKIM records configured
  - [ ] Email templates tested
  - [ ] Bounce/complaint handling configured

- [ ] **Monitoring & Logging**
  - [ ] Error tracking service configured (Sentry)
  - [ ] Log aggregation configured (Logtail, Papertrail)
  - [ ] Uptime monitoring configured (UptimeRobot, Pingdom)
  - [ ] Performance monitoring configured (optional - Datadog, New Relic)

- [ ] **Redis Cloud**
  - [ ] Production instance provisioned
  - [ ] Connection string obtained
  - [ ] Persistence enabled
  - [ ] Eviction policy configured

---

## Deployment Process

### Backend Deployment

- [ ] **Pre-Deploy**
  - [ ] Build backend: `npm run build`
  - [ ] Run tests: `npm test`
  - [ ] Generate Prisma client: `npx prisma generate`

- [ ] **Deploy**
  - [ ] Push to production branch (triggers CI/CD)
  - [ ] Verify build succeeds
  - [ ] Run database migrations: `npx prisma migrate deploy`
  - [ ] Verify server starts successfully

- [ ] **Post-Deploy Verification**
  - [ ] Health check endpoint returns 200: `GET /api/health`
  - [ ] Database connection verified
  - [ ] Redis connection verified
  - [ ] WebSocket connection working
  - [ ] Test OAuth flow end-to-end
  - [ ] Test invitation email sending

### Frontend Deployment

- [ ] **Pre-Deploy**
  - [ ] Build frontend: `npm run build`
  - [ ] Run tests: `npm test`
  - [ ] Verify environment variables set

- [ ] **Deploy**
  - [ ] Push to production branch (triggers CI/CD)
  - [ ] Verify build succeeds
  - [ ] Verify assets uploaded to CDN

- [ ] **Post-Deploy Verification**
  - [ ] Navigate to production URL
  - [ ] Test Google OAuth login flow
  - [ ] Test creating a child
  - [ ] Test creating an event calendar
  - [ ] Test sending invitations
  - [ ] Test accepting invitations
  - [ ] Test event assignment
  - [ ] Test Google Calendar sync
  - [ ] Test WebSocket real-time updates
  - [ ] Test on mobile browsers

---

## Post-Deployment Monitoring

### First 24 Hours

- [ ] **Monitor Error Rates**
  - [ ] Check Sentry for new errors
  - [ ] Check server logs for warnings
  - [ ] Monitor API response times
  - [ ] Check database connection pool usage

- [ ] **Monitor User Activity**
  - [ ] Track successful logins
  - [ ] Track invitation sends/accepts
  - [ ] Track event creations
  - [ ] Track Google Calendar syncs

- [ ] **Performance Monitoring**
  - [ ] API response times < 500ms (p95)
  - [ ] Database query times acceptable
  - [ ] Redis cache hit rate > 80%
  - [ ] No memory leaks

- [ ] **External Service Health**
  - [ ] Google OAuth working
  - [ ] Google Calendar API calls succeeding
  - [ ] Google Maps API calls succeeding
  - [ ] Email delivery working
  - [ ] WebSocket connections stable

### First Week

- [ ] **User Feedback**
  - [ ] Monitor support requests
  - [ ] Collect user feedback
  - [ ] Identify pain points
  - [ ] Track feature requests

- [ ] **Performance Optimization**
  - [ ] Analyze slow queries
  - [ ] Add database indexes if needed
  - [ ] Optimize API response payloads
  - [ ] Review caching strategy

- [ ] **Security Monitoring**
  - [ ] Review authentication logs
  - [ ] Check for suspicious activity
  - [ ] Monitor rate limit hits
  - [ ] Review CORS errors

---

## Rollback Plan

### If Critical Issues Arise

1. **Identify Issue**
   - Check Sentry for error reports
   - Review server logs
   - Reproduce issue in staging

2. **Decide: Fix Forward or Rollback**
   - If simple fix: Deploy hotfix immediately
   - If complex issue: Rollback to previous version

3. **Rollback Procedure**
   - [ ] Revert to previous git commit
   - [ ] Redeploy backend
   - [ ] Redeploy frontend
   - [ ] If database migration was applied, rollback migration
   - [ ] Verify previous version working
   - [ ] Communicate rollback to users

4. **Post-Rollback**
   - [ ] Document root cause
   - [ ] Create fix in development
   - [ ] Test fix thoroughly
   - [ ] Schedule re-deployment

---

## Maintenance Checklist

### Daily

- [ ] Check error tracking dashboard (Sentry)
- [ ] Review uptime monitoring alerts
- [ ] Monitor API response times

### Weekly

- [ ] Review server logs for warnings
- [ ] Check database performance
- [ ] Review Redis memory usage
- [ ] Check for dependency updates (security patches)
- [ ] Review user feedback/support tickets

### Monthly

- [ ] Review and optimize database indexes
- [ ] Check for slow queries (> 1 second)
- [ ] Review API usage patterns
- [ ] Update dependencies (minor versions)
- [ ] Test backup restoration
- [ ] Review error rate trends
- [ ] Capacity planning (database size, API traffic)

### Quarterly

- [ ] Security audit
- [ ] Dependency updates (major versions)
- [ ] Performance benchmarking
- [ ] Cost optimization review
- [ ] Documentation updates

---

## Emergency Contacts

**Technical Team:**
- Backend Engineer: [Name] - [Email] - [Phone]
- Frontend Engineer: [Name] - [Email] - [Phone]
- DevOps Engineer: [Name] - [Email] - [Phone]

**External Services:**
- Google Cloud Support: [Link]
- SendGrid Support: [Link]
- Hosting Provider Support: [Link]
- Database Provider Support: [Link]

**Escalation Path:**
1. On-call engineer (Slack/PagerDuty)
2. Tech lead
3. CTO

---

## Production URLs

**Frontend:**
- Production: https://koordi.app
- Staging: https://staging.koordi.app (if applicable)

**Backend:**
- Production API: https://api.koordi.app
- Staging API: https://api-staging.koordi.app (if applicable)
- Health Check: https://api.koordi.app/api/health

**Monitoring:**
- Sentry: [URL]
- Uptime Monitor: [URL]
- Server Logs: [URL]

---

## Notes

- This checklist should be reviewed and updated after each deployment
- Mark items as complete with date and initials
- Document any deviations from the checklist
- Keep a deployment log in a separate document

**Checklist Version:** 1.0
**Last Review:** 2025-11-23
**Next Review:** Before first production deployment
