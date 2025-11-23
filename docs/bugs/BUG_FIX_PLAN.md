# Bug Fix Implementation Plan

This document outlines the plan to fix three identified bugs in the Koordi application.

---

## Bug #1: Remove Member Invite Status Counts ✅ EASIEST

### Priority: Low
### Complexity: Simple
### Estimated Time: 5 minutes
### Files to Modify: 1 file (Frontend only)

### Problem
The "Invitation Analytics" section showing invite counts (Total, Accepted, Pending, Declined, Expired) is displaying in the MembersDialog component but should be removed as it's unnecessary.

### Location
`/Users/jamesschaffer/Documents/Dev-Projects/koordi/frontend/src/components/MembersDialog.tsx` (lines 237-271)

### Fix
Remove the entire Invitation Analytics grid section.

**Before:**
```tsx
{/* Invitation Analytics */}
<div className="grid grid-cols-5 gap-2 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
  <div className="text-center">
    <div className="text-2xl font-bold text-gray-900 dark:text-white">
      {members.length}
    </div>
    <div className="text-xs text-gray-600 dark:text-gray-400">Total</div>
  </div>
  {/* ... more analytics ... */}
</div>
```

**After:**
Remove lines 237-271 completely.

### Testing
1. Open any calendar's member management dialog
2. Verify the analytics section no longer appears
3. Verify the member list and invite functionality still works correctly

### Git Workflow
```bash
git checkout -b fix/remove-invite-status-counts
# Make changes
git add frontend/src/components/MembersDialog.tsx
git commit -m "Fix: Remove unnecessary invitation status counts from member dialog

- Remove Invitation Analytics display section from MembersDialog
- Simplify member management UI
- Resolves bug where status counts were showing despite being marked for removal"
git push origin fix/remove-invite-status-counts
# Create PR and merge to main
```

---

## Bug #2: Enable Auto-Sync for New Calendars 🔧 MEDIUM

### Priority: High
### Complexity: Medium
### Estimated Time: 15-20 minutes
### Files to Modify: 1 file (Backend only)

### Problem
When calendars are created, they don't automatically sync their events. Users must manually click the "Sync Events" button. This creates a poor user experience as the calendar appears empty initially.

### Location
`/Users/jamesschaffer/Documents/Dev-Projects/koordi/backend/src/routes/eventCalendar.ts` (line ~81)

### Fix
Trigger an automatic sync immediately after calendar creation.

**Current Code (line 58-86):**
```typescript
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // ... validation and creation ...
    const calendar = await eventCalendarService.createEventCalendar(calendarData);

    res.status(201).json(calendar);
  } catch (error) {
    // ... error handling ...
  }
});
```

**Updated Code:**
```typescript
router.post('/', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    // ... validation and creation ...
    const calendar = await eventCalendarService.createEventCalendar(calendarData);

    // Trigger initial sync asynchronously (don't wait for completion)
    // This allows the user to see their calendar immediately while events load in background
    icsService.syncEventCalendar(calendar.id).catch((error) => {
      console.error(`Failed to auto-sync new calendar ${calendar.id}:`, error);
    });

    res.status(201).json(calendar);
  } catch (error) {
    // ... error handling ...
  }
});
```

### Import Required
At the top of the file, ensure icsService is imported:
```typescript
import { icsService } from '../services/icsService';
```

### Testing
1. Create a new calendar with a valid ICS URL
2. Verify that events start appearing without clicking "Sync Events"
3. Check backend logs to confirm sync was triggered
4. Verify sync doesn't block the calendar creation response

### Git Workflow
```bash
git checkout -b fix/auto-sync-new-calendars
# Make changes
git add backend/src/routes/eventCalendar.ts
git commit -m "Fix: Auto-sync events when creating new calendars

- Trigger automatic sync immediately after calendar creation
- Sync runs asynchronously to avoid blocking response
- Improves UX by populating events without manual sync button
- Handles sync errors gracefully with console logging"
git push origin fix/auto-sync-new-calendars
# Create PR and merge to main
```

---

## Bug #3: Fix Email Invitations 🚨 COMPLEX

### Priority: Critical
### Complexity: High
### Estimated Time: 30-45 minutes
### Files to Modify: 2-3 files (Backend + Environment)

### Problem
1. Email sending is only enabled when SMTP is configured (currently development mode only logs to console)
2. The "resend invitation" function doesn't actually send an email (critical bug!)

### Part A: Fix Resend Invitation Email Bug

#### Location
`/Users/jamesschaffer/Documents/Dev-Projects/koordi/backend/src/services/invitationService.ts` (after line 558)

#### Current Code (lines 505-561)
```typescript
export async function resendInvitation(
  invitationId: string,
  userId: string
): Promise<InvitationWithDetails> {
  // ... validation and update logic ...

  console.log(
    `✅ Resent invitation to ${updatedInvitation.invited_email} for calendar: ${updatedInvitation.event_calendar.name}`
  );

  return updatedInvitation;  // ❌ MISSING: Actually send the email!
}
```

#### Fixed Code
Add email sending before the return statement (after line 558):

```typescript
export async function resendInvitation(
  invitationId: string,
  userId: string
): Promise<InvitationWithDetails> {
  // ... existing validation and update logic ...

  // Send the invitation email
  if (updatedInvitation.invited_by) {
    sendInvitationEmail({
      to: updatedInvitation.invited_email,
      invitedBy: updatedInvitation.invited_by.name,
      calendarName: updatedInvitation.event_calendar.name,
      childName: updatedInvitation.event_calendar.child.name,
      invitationToken: updatedInvitation.invitation_token,
    }).catch((error) => {
      console.error('Failed to resend invitation email:', error);
    });
  }

  console.log(
    `✅ Resent invitation to ${updatedInvitation.invited_email} for calendar: ${updatedInvitation.event_calendar.name}`
  );

  return updatedInvitation;
}
```

### Part B: Configure SMTP for Production

#### Environment Variables Required
Add these to backend Cloud Run service:

```bash
SMTP_HOST=smtp.gmail.com          # Or your SMTP provider
SMTP_PORT=587                      # TLS port
SMTP_SECURE=false                  # true for port 465, false for 587
SMTP_USER=your-email@gmail.com    # Your SMTP username
SMTP_PASS=your-app-password       # App-specific password
EMAIL_FROM=Koordi <noreply@koordie.com>  # From address
```

#### Gmail SMTP Setup (Recommended for Testing)
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and your device
   - Copy the generated 16-character password
3. Use these credentials in environment variables

#### Production SMTP Options
- **Gmail**: Simple for testing, may have sending limits
- **SendGrid**: 100 emails/day free tier
- **Mailgun**: 5,000 emails/month free tier
- **Amazon SES**: Very cheap, $0.10 per 1,000 emails
- **Postmark**: Reliable, good deliverability

### Testing

#### Local Testing (Development Mode)
1. Without SMTP configured, verify emails log to console
2. Test both new invitations and resend functionality

#### Production Testing (After SMTP Setup)
1. Invite a new member to a calendar
2. Check that email is received
3. Test resend invitation functionality
4. Verify invitation links work correctly

### Git Workflow

```bash
git checkout -b fix/enable-email-invitations
# Make code changes to invitationService.ts
git add backend/src/services/invitationService.ts
git commit -m "Fix: Enable email sending for invitation resend functionality

- Add missing email send call in resendInvitation function
- Ensures resent invitations actually send emails
- Maintains same error handling pattern as initial invitations
- Critical bug fix: resend was only updating database, not sending email"
git push origin fix/enable-email-invitations
# Create PR and merge to main
```

**After merging:** Configure SMTP environment variables in Cloud Run (see below)

### SMTP Configuration Deployment

After the code fix is deployed, configure SMTP:

```bash
# Add SMTP environment variables to backend service
gcloud run services update koordie-backend \
  --region=us-central1 \
  --update-env-vars="\
SMTP_HOST=smtp.gmail.com,\
SMTP_PORT=587,\
SMTP_SECURE=false,\
SMTP_USER=your-email@gmail.com,\
SMTP_PASS=your-app-password,\
EMAIL_FROM=Koordi <noreply@koordie.com>"
```

Or create secrets in Google Secret Manager for sensitive data:

```bash
# Store SMTP credentials as secrets
echo -n "smtp.gmail.com" | gcloud secrets create smtp-host --data-file=-
echo -n "your-email@gmail.com" | gcloud secrets create smtp-user --data-file=-
echo -n "your-app-password" | gcloud secrets create smtp-pass --data-file=-

# Update Cloud Run to use secrets
gcloud run services update koordie-backend \
  --region=us-central1 \
  --update-secrets=SMTP_HOST=smtp-host:latest \
  --update-secrets=SMTP_USER=smtp-user:latest \
  --update-secrets=SMTP_PASS=smtp-pass:latest \
  --update-env-vars="SMTP_PORT=587,SMTP_SECURE=false,EMAIL_FROM=Koordi <noreply@koordie.com>"
```

---

## Implementation Order

### Phase 1: Easy Win (Bug #1)
Fix the member invite status counts removal first. This is:
- Simplest change
- Frontend only
- Low risk
- Good for testing CI/CD pipeline

### Phase 2: High Impact (Bug #2)
Enable auto-sync for new calendars:
- High user impact
- Medium complexity
- Backend only
- Improves UX significantly

### Phase 3: Critical Fix (Bug #3)
Fix email invitations:
- Most complex
- Requires environment configuration
- Critical for production functionality
- Two-part fix (code + config)

---

## Deployment Strategy

### Using CI/CD Pipeline

1. **Create feature branch**
2. **Make changes locally**
3. **Test locally** (important!)
4. **Commit and push to GitHub**
5. **Create Pull Request**
6. **Merge to main**
7. **GitHub Actions automatically deploys** (~3-5 minutes)
8. **Verify in production**

### Rollback Plan

If any fix causes issues:

```bash
# List recent revisions
gcloud run revisions list --service=koordie-backend --region=us-central1

# Rollback to previous revision
gcloud run services update-traffic koordie-backend \
  --region=us-central1 \
  --to-revisions=REVISION-NAME=100
```

---

## Testing Checklist

### Bug #1 Testing
- [ ] Member dialog opens without analytics section
- [ ] Member list displays correctly
- [ ] Invite functionality works
- [ ] No console errors

### Bug #2 Testing
- [ ] Create new calendar
- [ ] Events appear automatically (within 30 seconds)
- [ ] Manual sync still works
- [ ] No errors in Cloud Run logs

### Bug #3 Testing
- [ ] Initial invitation sends email
- [ ] Resend invitation sends email
- [ ] Email contains correct invitation link
- [ ] Link works and accepts invitation
- [ ] Error handling works (invalid email, etc.)

---

## Success Criteria

All three bugs will be considered fixed when:

1. ✅ Member invite dialogs show no status counts
2. ✅ New calendars auto-populate events without manual sync
3. ✅ Invitation emails are sent for both new and resent invitations
4. ✅ All fixes are deployed via CI/CD pipeline
5. ✅ No new bugs introduced
6. ✅ Production logs show no related errors

---

## Notes

- Each fix should be in its own branch and PR for clean git history
- Test locally before pushing to avoid deployment issues
- Monitor Cloud Run logs after each deployment
- Keep PRs focused on single issues for easier review and rollback
- Document any unexpected findings or additional fixes needed
