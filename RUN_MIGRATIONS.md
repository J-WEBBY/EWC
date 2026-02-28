# Database Migration Guide

## Running All Migrations on Supabase

### Option 1: Via Supabase SQL Editor (Recommended)

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Run each migration file **in order**:

```sql
-- Step 1: Drop existing tables (if any)
-- Copy and paste contents of: database/migrations/001_drop_existing.sql
-- Click "Run"

-- Step 2: Create core schema
-- Copy and paste contents of: database/migrations/002_create_schema.sql
-- Click "Run"

-- Step 3: Seed industries
-- Copy and paste contents of: database/migrations/003_seed_industries.sql
-- Click "Run"

-- Step 4: Seed test tenant (University of Oldbury)
-- Copy and paste contents of: database/migrations/004_seed_university_oldbury.sql
-- Click "Run"

-- Step 5: Deep Probe schema
-- Copy and paste contents of: database/migrations/005_deep_probe_schema.sql
-- Click "Run"
```

### Option 2: Via psql Command Line

```bash
# Get your connection string from Supabase Dashboard > Settings > Database
# Format: postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

cd database/migrations

psql "postgresql://postgres:YOUR_PASSWORD@HOST:5432/postgres" -f 001_drop_existing.sql
psql "postgresql://postgres:YOUR_PASSWORD@HOST:5432/postgres" -f 002_create_schema.sql
psql "postgresql://postgres:YOUR_PASSWORD@HOST:5432/postgres" -f 003_seed_industries.sql
psql "postgresql://postgres:YOUR_PASSWORD@HOST:5432/postgres" -f 004_seed_university_oldbury.sql
psql "postgresql://postgres:YOUR_PASSWORD@HOST:5432/postgres" -f 005_deep_probe_schema.sql
```

### Verify Migrations Were Successful

Run this to check all tables exist:

```bash
node check-db.mjs
```

Or in Supabase SQL Editor:

```sql
-- Check core tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- Verify test tenant exists
SELECT id, company_name, ai_name, primary_email
FROM tenants
WHERE company_name ILIKE '%oldbury%';
```

---

## Migration Order is Critical

**IMPORTANT:** Migrations must be run in numerical order (001 → 002 → 003 → 004 → 005) because:

1. **001** - Drops old tables (clean slate)
2. **002** - Creates core schema (tables, indexes, RLS, triggers)
3. **003** - Seeds industries and department templates
4. **004** - Seeds test tenant (University of Oldbury Students' Guild)
5. **005** - Adds Deep Probe tables for AI training

If you run them out of order, you'll get foreign key errors.

---

## After Running Migrations

You should have:

✅ 6 industries (Recruitment, Accounting, Legal, Property, Supply Chain, Education/Charity)
✅ 1 test tenant (University of Oldbury Students' Guild)
✅ 19 test staff members
✅ 8 departments
✅ 5 Deep Probe tables
✅ All RLS policies active
✅ All indexes created

Test with:
```bash
node get-tenant-id.mjs
```

This will give you the Deep Probe test URL.
