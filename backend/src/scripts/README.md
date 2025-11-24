# Koordi Backend Scripts

This directory contains utility scripts for development, testing, and maintenance.

## Testing & Development Scripts

### `resetUserAccount.ts`
**Purpose**: Completely resets a user's account to simulate first-time setup for testing.

**Usage**:
```bash
npx ts-node src/scripts/resetUserAccount.ts <user_email>
```

**Example**:
```bash
npx ts-node src/scripts/resetUserAccount.ts james@jamesschaffer.com
```

**What it does**:
- Deletes all calendar memberships
- Deletes all Google Calendar sync records
- Deletes all supplemental events
- Deletes all events
- Deletes all event calendars
- Deletes all orphaned children
- Resets user profile (home address, Google tokens, settings)

**What it preserves**:
- User account (email, name, avatar)
- User ID (OAuth sessions remain valid)

**Performance**: < 1 second

---

### `checkUserCredentials.ts`
**Purpose**: Displays user's Google Calendar connection status for debugging.

**Usage**:
```bash
npx ts-node src/scripts/checkUserCredentials.ts
```

**Output**:
- User ID
- Email
- Google Calendar sync enabled status
- Refresh token status
- Calendar ID

**Use when**:
- Debugging OAuth issues
- Verifying Google Calendar connection
- Checking if credentials are stored

---

## Google Calendar Maintenance Scripts

### `cleanupGoogleCalendar.ts`
**Purpose**: Removes all Koordi-synced events from a user's Google Calendar based on database records.

**Usage**:
```bash
npx ts-node src/scripts/cleanupGoogleCalendar.ts <user_email>
```

**Example**:
```bash
npx ts-node src/scripts/cleanupGoogleCalendar.ts james@jamesschaffer.com
```

**What it does**:
- Reads `UserGoogleEventSync` records for the user
- Deletes each event from Google Calendar
- Removes sync records from database

**Requirements**:
- User must have valid `google_refresh_token_enc`
- User must have `google_calendar_sync_enabled: true`

---

### `cleanupAllGoogleCalendarEvents.ts`
**Purpose**: Aggressively removes ALL Koordi-related events from Google Calendar (bypasses database).

**Usage**:
```bash
npx ts-node src/scripts/cleanupAllGoogleCalendarEvents.ts <user_email>
```

**Example**:
```bash
npx ts-node src/scripts/cleanupAllGoogleCalendarEvents.ts james@jamesschaffer.com
```

**What it does**:
- Fetches ALL events from Google Calendar (2020-present)
- Filters for Koordi-related events by keyword:
  - Title contains "2014 Black" or "Richardson"
  - Description contains "Child: Xander" or "Calendar: Towson United"
- Deletes matching events

**Use when**:
- Database is out of sync with Google Calendar
- Orphaned events remain after testing
- Need to clean up test data

**Requirements**:
- User must have valid `google_refresh_token_enc`
- User must have `google_calendar_sync_enabled: true`

---

## Script Troubleshooting

### "AuthenticationError: User has not connected their Google Calendar account"

**Solution**:
1. Generate OAuth URL: `curl http://localhost:3000/api/auth/google`
2. Visit the URL in browser
3. Complete authentication
4. Run script again

### "ConfigurationError: Encryption is not properly configured"

**Solution**:
1. Verify `.env` file exists in `backend/` directory
2. Check `ENCRYPTION_KEY` is set
3. Run `npx ts-node src/scripts/<script>.ts` (not `ts-node` directly)

### "User not found"

**Solution**:
- Verify email address is correct
- Check database connection
- Run `npx prisma studio` to verify user exists

---

## Best Practices

1. **Always run scripts from the `backend/` directory**:
   ```bash
   cd backend
   npx ts-node src/scripts/<script>.ts
   ```

2. **Use `resetUserAccount.ts` for rapid testing iteration**:
   - Much faster than manual cleanup
   - Ensures complete reset
   - Simulates first-time user experience

3. **Check credentials before running Google Calendar scripts**:
   ```bash
   npx ts-node src/scripts/checkUserCredentials.ts
   ```

4. **Use `cleanupAllGoogleCalendarEvents.ts` only when needed**:
   - Fetches all events (slow for large calendars)
   - Use `cleanupGoogleCalendar.ts` first (faster)

---

## Related Documentation

- `../TESTING_PLAN.md` - Systematic end-to-end testing guide
- `../prisma/schema.prisma` - Database schema reference
