# Database Setup Guide
## Koordi

**Database:** PostgreSQL 15+
**ORM:** Prisma 5+
**Schema Location:** `prisma/schema.prisma`

---

## TABLE OF CONTENTS
1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Database Migrations](#database-migrations)
4. [Seed Data](#seed-data)
5. [Production Setup](#production-setup)
6. [Backup & Restore](#backup--restore)
7. [Performance Optimization](#performance-optimization)
8. [Troubleshooting](#troubleshooting)

---

## PREREQUISITES

### Required Software
- **PostgreSQL 15+** installed and running
- **Node.js 20 LTS** (includes npm)
- **Prisma CLI** (installed via npm)

### Installation Commands

**macOS (Homebrew):**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install postgresql-15 postgresql-contrib
sudo systemctl start postgresql
```

**Windows:**
Download and install from https://www.postgresql.org/download/windows/

---

## LOCAL DEVELOPMENT SETUP

### Step 1: Create Database

**macOS/Linux:**
```bash
# Connect to PostgreSQL as superuser
psql postgres

# Create database and user
CREATE DATABASE koordi_dev;
CREATE USER koordi_user WITH PASSWORD 'dev_password_123';
GRANT ALL PRIVILEGES ON DATABASE koordi_dev TO koordi_user;

# Grant schema privileges (PostgreSQL 15+)
\c koordi_dev
GRANT ALL ON SCHEMA public TO koordi_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO koordi_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO koordi_user;

# Exit psql
\q
```

**Windows (Command Prompt as Admin):**
```cmd
psql -U postgres
# Then run the same SQL commands above
```

### Step 2: Configure Environment Variables

Create `.env` file in project root:

```env
# Database Connection
DATABASE_URL="postgresql://koordi_user:dev_password_123@localhost:5432/koordi_dev?schema=public"

# For production, use connection pooling:
# DATABASE_URL="postgresql://user:password@host:5432/dbname?schema=public&connection_limit=5&pool_timeout=30"
```

### Step 3: Install Prisma Dependencies

```bash
npm install prisma @prisma/client
npm install -D prisma
```

### Step 4: Generate Prisma Client

```bash
npx prisma generate
```

This creates the Prisma Client based on your schema at `node_modules/.prisma/client`.

### Step 5: Run Initial Migration

```bash
npx prisma migrate dev --name init
```

**What This Does:**
1. Creates all tables in the database
2. Applies indexes and constraints
3. Generates migration SQL files in `prisma/migrations/`
4. Regenerates Prisma Client

**Expected Output:**
```
Environment variables loaded from .env
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "koordi_dev" at "localhost:5432"

PostgreSQL database koordi_dev created at localhost:5432

Applying migration `20240101000000_init`

The following migration(s) have been created and applied from new schema changes:

migrations/
  └─ 20240101000000_init/
    └─ migration.sql

Your database is now in sync with your schema.

✔ Generated Prisma Client (5.x.x) to ./node_modules/@prisma/client
```

### Step 6: Verify Database Structure

```bash
# Open Prisma Studio (visual database browser)
npx prisma studio
```

Navigate to http://localhost:5555 to inspect tables.

**Or use psql:**
```bash
psql koordi_dev -U koordi_user

# List all tables
\dt

# Describe table structure
\d users
\d events

# Exit
\q
```

---

## DATABASE MIGRATIONS

### Creating New Migrations

When you modify `prisma/schema.prisma`:

```bash
# Development: Create and apply migration
npx prisma migrate dev --name <descriptive_name>

# Examples:
npx prisma migrate dev --name add_timezone_field
npx prisma migrate dev --name change_color_default
npx prisma migrate dev --name add_email_index
```

**Naming Conventions:**
- `add_<field_name>` - Adding new fields
- `remove_<field_name>` - Removing fields
- `change_<description>` - Modifying existing structure
- `create_<table_name>` - Adding new tables
- `index_<field_name>` - Adding indexes

### Migration Workflow

**Development Environment:**
```bash
# 1. Modify prisma/schema.prisma
# 2. Create migration
npx prisma migrate dev --name your_change

# 3. Review generated SQL in prisma/migrations/<timestamp>_your_change/migration.sql
# 4. Test changes with seed data (see below)
```

**Production Environment:**
```bash
# Deploy pending migrations without prompts
npx prisma migrate deploy
```

### Resetting Database (Development Only)

```bash
# ⚠️ WARNING: Deletes all data and recreates schema
npx prisma migrate reset

# Confirms with prompt, then:
# 1. Drops database
# 2. Creates database
# 3. Applies all migrations
# 4. Runs seed script (if configured)
```

### Checking Migration Status

```bash
# Show applied and pending migrations
npx prisma migrate status

# Example output:
# Database schema is up to date!
#
# 3 migrations found in prisma/migrations
#
# ✔ 20240101000000_init
# ✔ 20240102120000_add_timezone_field
# ✔ 20240103150000_index_email
```

---

## SEED DATA

### Creating Seed Script

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting seed...');

  // Create test users
  const user1 = await prisma.user.upsert({
    where: { email: 'parent1@example.com' },
    update: {},
    create: {
      email: 'parent1@example.com',
      name: 'Jane Parent',
      home_address: '123 Main St, San Francisco, CA 94102',
      home_latitude: 37.7749,
      home_longitude: -122.4194,
      comfort_buffer_minutes: 5,
      keep_supplemental_events: false,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'parent2@example.com' },
    update: {},
    create: {
      email: 'parent2@example.com',
      name: 'John Parent',
      home_address: '456 Oak Ave, San Francisco, CA 94103',
      home_latitude: 37.7699,
      home_longitude: -122.4110,
      comfort_buffer_minutes: 10,
      keep_supplemental_events: true,
    },
  });

  console.log('✅ Created users:', user1.email, user2.email);

  // Create test children
  const child1 = await prisma.child.create({
    data: {
      name: 'Emma',
      date_of_birth: new Date('2015-03-15'),
    },
  });

  const child2 = await prisma.child.create({
    data: {
      name: 'Oliver',
      date_of_birth: new Date('2017-07-22'),
    },
  });

  console.log('✅ Created children:', child1.name, child2.name);

  // Create test event calendar
  const calendar = await prisma.eventCalendar.create({
    data: {
      name: 'Soccer - Spring 2024',
      ics_url: 'https://example.com/soccer-spring-2024.ics',
      child_id: child1.id,
      owner_id: user1.id,
      color: '#FF5733',
      sync_enabled: true,
      last_sync_status: 'success',
      last_sync_at: new Date(),
    },
  });

  console.log('✅ Created event calendar:', calendar.name);

  // Create membership (user1 is owner, automatically has access)
  // Invite user2 to the calendar
  const membership = await prisma.eventCalendarMembership.create({
    data: {
      event_calendar_id: calendar.id,
      user_id: user2.id,
      invited_email: user2.email,
      invitation_token: 'test-token-' + Math.random().toString(36).substring(7),
      status: 'accepted',
      invited_by_user_id: user1.id,
      responded_at: new Date(),
    },
  });

  console.log('✅ Created membership for:', user2.email);

  // Create sample events
  const event1 = await prisma.event.create({
    data: {
      event_calendar_id: calendar.id,
      ics_uid: 'event1-' + Date.now() + '@example.com',
      title: 'Soccer Practice',
      description: 'Weekly practice at Lincoln Field',
      location: 'Lincoln Field, 1234 Sports Dr, San Francisco, CA',
      location_lat: 37.7850,
      location_lng: -122.4200,
      start_time: new Date('2024-03-20T16:00:00Z'),
      end_time: new Date('2024-03-20T17:30:00Z'),
      is_all_day: false,
      assigned_to_user_id: user1.id,
    },
  });

  const event2 = await prisma.event.create({
    data: {
      event_calendar_id: calendar.id,
      ics_uid: 'event2-' + Date.now() + '@example.com',
      title: 'Soccer Game - Championship',
      description: 'Final game of the season',
      location: 'Golden Gate Park Stadium, San Francisco, CA',
      location_lat: 37.7694,
      location_lng: -122.4862,
      start_time: new Date('2024-03-25T10:00:00Z'),
      end_time: new Date('2024-03-25T12:00:00Z'),
      is_all_day: false,
      assigned_to_user_id: user2.id,
    },
  });

  console.log('✅ Created events:', event1.title, event2.title);

  // Create supplemental events (drive times)
  const supplemental1 = await prisma.supplementalEvent.create({
    data: {
      parent_event_id: event1.id,
      type: 'departure',
      title: 'Drive to Soccer Practice',
      start_time: new Date('2024-03-20T15:30:00Z'),
      end_time: new Date('2024-03-20T16:00:00Z'),
      origin_address: user1.home_address!,
      origin_lat: user1.home_latitude!,
      origin_lng: user1.home_longitude!,
      destination_address: event1.location!,
      destination_lat: event1.location_lat!,
      destination_lng: event1.location_lng!,
      drive_time_minutes: 25,
      last_traffic_check: new Date(),
    },
  });

  const supplemental2 = await prisma.supplementalEvent.create({
    data: {
      parent_event_id: event1.id,
      type: 'return',
      title: 'Drive home from Soccer Practice',
      start_time: new Date('2024-03-20T17:30:00Z'),
      end_time: new Date('2024-03-20T18:00:00Z'),
      origin_address: event1.location!,
      origin_lat: event1.location_lat!,
      origin_lng: event1.location_lng!,
      destination_address: user1.home_address!,
      destination_lat: user1.home_latitude!,
      destination_lng: user1.home_longitude!,
      drive_time_minutes: 25,
      last_traffic_check: new Date(),
    },
  });

  console.log('✅ Created supplemental events:', supplemental1.type, supplemental2.type);

  console.log('🌱 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Configure Package.json

Add to `package.json`:

```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  },
  "devDependencies": {
    "ts-node": "^10.9.1",
    "@types/node": "^20.0.0"
  }
}
```

### Running Seed Script

```bash
# Run seed manually
npx prisma db seed

# Seed runs automatically after:
npx prisma migrate reset
npx prisma migrate dev
```

### Seed Data Strategies

**Development:**
- 2-3 test users with different settings
- 1-2 children per user
- 2-3 event calendars with varied sync statuses
- 10-20 events spanning past, present, future
- Mix of assigned and unassigned events
- Supplemental events for assigned events
- Pending, accepted, and declined invitations

**Staging:**
- Larger dataset mimicking production scale
- 50+ users, 100+ children, 200+ events
- Performance testing data

**Production:**
- No seed data
- Manual initial setup by administrators

---

## PRODUCTION SETUP

### Production Database: Neon (Serverless PostgreSQL)

Koordi uses [Neon](https://neon.tech) for the production database. Neon is a serverless PostgreSQL platform that provides:

- **Serverless scaling:** Scales to zero when inactive, scales up automatically
- **Built-in connection pooling:** Via the pooler endpoint
- **Automatic backups:** Point-in-time recovery included
- **Branching:** Database branching for development/testing
- **Region:** us-east-1 (AWS)

### Connection String Format

```env
# Pooler endpoint (recommended for application connections and migrations)
DATABASE_URL="postgresql://neondb_owner:<password>@ep-royal-brook-adx8hxis-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

**Key Parameters:**
- Use the `-pooler` endpoint for application connections
- `sslmode=require` - Required for Neon connections
- No need for `connection_limit` - Neon handles pooling automatically

### Why Neon Instead of Cloud SQL

| Feature | Neon | Cloud SQL |
|---------|------|-----------|
| Pricing | Pay per usage, generous free tier | Fixed monthly cost |
| Scaling | Serverless (scales to zero) | Manual scaling |
| Connection Pooling | Built-in | Requires separate setup |
| Cold Start | Fast (~500ms) | N/A (always running) |
| Backups | Automatic, point-in-time | Requires configuration |

### Alternative: Self-Hosted PostgreSQL

For local development, use a local PostgreSQL instance:

**Minimal Setup (1-10k users):**
- **Instance:** 2 vCPU, 4GB RAM
- **Storage:** 50GB SSD
- **Connections:** 100 max connections

**Medium Setup (10k-100k users):**
- **Instance:** 4 vCPU, 16GB RAM
- **Storage:** 200GB SSD
- **Connections:** 200 max connections

### Migration Deployment (Production - Neon)

**CI/CD Pipeline Example (GitHub Actions):**

```yaml
# .github/workflows/deploy.yml
- name: Run database migrations
  run: |
    npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

**Manual Deployment with Neon:**

```bash
# 1. Set production DATABASE_URL (Neon pooler endpoint)
export DATABASE_URL="postgresql://neondb_owner:<password>@ep-royal-brook-adx8hxis-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"

# 2. Deploy migrations (no prompts)
npx prisma migrate deploy

# 3. Verify migration status
npx prisma migrate status
```

**Note:** With Neon, you can use the same pooler endpoint for both application connections and migrations. No separate proxy or direct endpoint is required.

### Connection Pooling

**Production (Neon - Built-in Pooling):**

Neon provides built-in connection pooling via its pooler endpoint. Use the endpoint with `-pooler` in the hostname:

```env
# Neon pooler endpoint (recommended)
DATABASE_URL="postgresql://neondb_owner:<password>@ep-royal-brook-adx8hxis-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require"
```

No additional pooling setup is required.

**Alternative: Prisma Accelerate**
```env
# Prisma-managed connection pooling + global cache
DATABASE_URL="prisma://accelerate.prisma-data.net/?api_key=your_key"
```

**Alternative: PgBouncer (Self-hosted)**
```bash
# Install PgBouncer
sudo apt install pgbouncer

# Configure /etc/pgbouncer/pgbouncer.ini
[databases]
koordi = host=localhost port=5432 dbname=koordi

[pgbouncer]
listen_port = 6432
pool_mode = transaction
max_client_conn = 200
default_pool_size = 25
```

Then connect via: `postgresql://user:pass@localhost:6432/koordi`

---

## BACKUP & RESTORE

### Automated Backups (Recommended)

**AWS RDS:**
- Enable automated backups (7-35 day retention)
- Enable point-in-time recovery
- Snapshot before major migrations

**Google Cloud SQL:**
- Enable automated backups (daily, 7-365 day retention)
- Enable binary logging for point-in-time recovery

**Azure Database:**
- Geo-redundant backups (7-35 days)
- Point-in-time restore

### Manual Backups

**Full Database Backup:**
```bash
# Backup to file
pg_dump -h localhost -U koordi_user -d koordi_dev > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup with compression
pg_dump -h localhost -U koordi_user -d koordi_dev | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

**Schema-Only Backup:**
```bash
pg_dump -h localhost -U koordi_user -d koordi_dev --schema-only > schema_backup.sql
```

**Data-Only Backup:**
```bash
pg_dump -h localhost -U koordi_user -d koordi_dev --data-only > data_backup.sql
```

### Restore from Backup

**Restore Full Backup:**
```bash
# Decompress if needed
gunzip backup_20240101_120000.sql.gz

# Restore to database
psql -h localhost -U koordi_user -d koordi_dev < backup_20240101_120000.sql
```

**Restore to New Database:**
```bash
# Create new database
createdb koordi_restore -U postgres

# Restore
psql -h localhost -U postgres -d koordi_restore < backup_20240101_120000.sql
```

---

## PERFORMANCE OPTIMIZATION

### Index Monitoring

```sql
-- Check index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan AS index_scans,
    idx_tup_read AS tuples_read,
    idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;

-- Find missing indexes (tables with many sequential scans)
SELECT
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    seq_tup_read / seq_scan AS avg_tuples_per_scan
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_scan DESC
LIMIT 20;
```

### Query Performance Analysis

```sql
-- Enable query timing
\timing on

-- Analyze query plan
EXPLAIN ANALYZE
SELECT e.*, ec.name AS calendar_name, u.name AS assigned_to_name
FROM events e
JOIN event_calendars ec ON e.event_calendar_id = ec.id
LEFT JOIN users u ON e.assigned_to_user_id = u.id
WHERE e.start_time >= NOW()
  AND e.start_time <= NOW() + INTERVAL '7 days'
ORDER BY e.start_time ASC;
```

### Table Statistics Update

```bash
# Update table statistics for query planner
psql koordi_dev -U koordi_user -c "ANALYZE;"

# Update specific table
psql koordi_dev -U koordi_user -c "ANALYZE events;"
```

### Vacuum and Maintenance

```sql
-- Manual vacuum (reclaim storage)
VACUUM ANALYZE;

-- Vacuum specific table
VACUUM ANALYZE events;

-- Full vacuum (requires exclusive lock, use off-peak)
VACUUM FULL;
```

**Automated Maintenance (Production):**
Enable autovacuum in `postgresql.conf`:
```conf
autovacuum = on
autovacuum_naptime = 1min
autovacuum_vacuum_scale_factor = 0.1
autovacuum_analyze_scale_factor = 0.05
```

### Connection Pool Tuning

**Prisma Connection Pool:**
```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

export default prisma;
```

---

## TROUBLESHOOTING

### Common Issues

**Issue 1: "Database does not exist"**
```
Error: P1003: Database `koordi_dev` does not exist at `localhost:5432`
```

**Solution:**
```bash
# Create database manually
psql postgres -c "CREATE DATABASE koordi_dev;"
```

---

**Issue 2: "Permission denied for schema public"**
```
Error: permission denied for schema public
```

**Solution:**
```bash
psql koordi_dev -U postgres
GRANT ALL ON SCHEMA public TO koordi_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO koordi_user;
\q
```

---

**Issue 3: "Migration failed to apply cleanly"**
```
Error: P3005: The database schema is not empty
```

**Solution:**
```bash
# Reset database (development only)
npx prisma migrate reset

# Or force apply
npx prisma db push --force-reset
```

---

**Issue 4: "Connection pool timeout"**
```
Error: Timed out fetching a new connection from the connection pool
```

**Solution:**
Increase connection pool size in DATABASE_URL:
```env
DATABASE_URL="postgresql://...?connection_limit=20&pool_timeout=60"
```

---

**Issue 5: "Too many connections"**
```
Error: remaining connection slots are reserved for non-replication superuser connections
```

**Solution:**
- Reduce `connection_limit` in DATABASE_URL
- Increase PostgreSQL `max_connections` in `postgresql.conf`
- Implement connection pooling (PgBouncer or Prisma Accelerate)

---

**Issue 6: Prisma Client out of sync**
```
Error: The `prisma-client` does not match your Prisma schema
```

**Solution:**
```bash
npx prisma generate
```

---

### Debugging Commands

```bash
# Check Prisma version
npx prisma --version

# Validate schema syntax
npx prisma validate

# Format schema file
npx prisma format

# View current database schema
npx prisma db pull

# Push schema without migrations (development only)
npx prisma db push

# Open database browser
npx prisma studio

# Check PostgreSQL server status
pg_isready -h localhost -p 5432

# View PostgreSQL logs (macOS)
tail -f /usr/local/var/log/postgresql@15.log

# View PostgreSQL logs (Linux)
sudo tail -f /var/log/postgresql/postgresql-15-main.log
```

---

## APPENDIX

### Database Size Estimation

**Per User (Average):**
- User record: ~1 KB
- 2 children: ~1 KB
- 3 event calendars: ~3 KB
- 100 events/year: ~50 KB
- 200 supplemental events/year: ~100 KB
- **Total per user/year:** ~155 KB

**Projected Growth:**
- 1,000 users: ~155 MB/year
- 10,000 users: ~1.5 GB/year
- 100,000 users: ~15 GB/year

**Retention Strategy:**
- Archive events older than 2 years
- Delete declined invitations after 90 days
- Retain supplemental events based on user settings

### Useful PostgreSQL Extensions

```sql
-- UUID generation (usually pre-installed)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Full-text search (future feature)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Geographic queries (if expanding location features)
CREATE EXTENSION IF NOT EXISTS "postgis";
```

### Connection String Format Reference

```
postgresql://[user[:password]@][host][:port][/dbname][?param1=value1&...]
```

**Common Parameters:**
- `schema=public` - Default schema
- `connection_limit=N` - Max connections
- `pool_timeout=N` - Connection timeout (seconds)
- `sslmode=require` - SSL enforcement
- `sslcert=/path/cert.pem` - SSL certificate
- `connect_timeout=N` - Initial connection timeout

---

## SUMMARY CHECKLIST

### Initial Setup
- [ ] PostgreSQL 15+ installed and running
- [ ] Database created
- [ ] User created with proper privileges
- [ ] `.env` file configured with DATABASE_URL
- [ ] Prisma dependencies installed (`npm install prisma @prisma/client`)
- [ ] Prisma client generated (`npx prisma generate`)
- [ ] Initial migration applied (`npx prisma migrate dev --name init`)
- [ ] Seed data loaded (`npx prisma db seed`)
- [ ] Prisma Studio tested (`npx prisma studio`)

### Production Readiness
- [ ] Neon database provisioned (us-east-1 region)
- [ ] SSL/TLS enabled (`sslmode=require` - automatic with Neon)
- [ ] Connection pooling via Neon pooler endpoint
- [ ] Automated backups enabled (included with Neon)
- [ ] Point-in-time recovery enabled (included with Neon)
- [ ] Monitoring and alerting configured
- [ ] Migration deployment pipeline tested
- [ ] Performance baselines established
- [ ] Disaster recovery plan documented

---

**Next Steps:** Proceed to [AUTHENTICATION.md](./AUTHENTICATION.md) for authentication implementation details.
