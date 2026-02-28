# JWEBLY System - Clean Database Install

## 🎯 Complete Clean Installation

Follow these steps **in order** to set up a fresh database from scratch.

---

## Prerequisites

- Access to Supabase Dashboard
- Navigate to: **SQL Editor** in left sidebar

---

## Step-by-Step Instructions

### Step 1: Drop All Existing Data
⚠️ **Warning:** This deletes everything in your database!

**File:** `database/migrations/001_drop_existing.sql`

1. Open the file in your code editor
2. Copy **all contents**
3. Paste into Supabase SQL Editor
4. Click **"Run"**
5. ✅ Should see: Success message

---

### Step 2: Create Core Schema

**File:** `database/migrations/002_create_schema.sql`

1. Open the file
2. Copy **all contents**
3. Paste into Supabase SQL Editor
4. Click **"Run"**
5. ✅ Should create 14 tables, indexes, RLS policies, triggers

**Expected outcome:**
- `industries` table
- `tenants` table
- `users` table
- `departments` table
- `roles` table
- `activation_keys` table
- `discovery_audits` table
- `onboarding_progress` table
- `knowledge_*` tables (3 tables)
- `integration_*` tables (2 tables)
- `audit_trail` table
- `system_settings` table
- `agency_users` table

---

### Step 3: Seed Industries

**File:** `database/migrations/003_seed_industries.sql`

1. Open the file
2. Copy **all contents**
3. Paste into Supabase SQL Editor
4. Click **"Run"**
5. ✅ Should insert 6 industries with department templates

**Expected outcome:**
- Recruitment & Staffing
- Accounting & Finance
- Legal Services
- Real Estate & Property Management
- Supply Chain & Logistics
- Education & Charity

---

### Step 4: Seed Test Tenant (University of Oldbury)

**File:** `database/migrations/004_seed_university_oldbury.sql`

1. Open the file
2. Copy **all contents**
3. Paste into Supabase SQL Editor
4. Click **"Run"**
5. ✅ Should create 1 tenant, 19 staff members, 8 departments

**Expected outcome:**
- Company: University of Oldbury Students' Guild
- AI Name: Ilyas
- Activation Key: `JWEBLY-DEMO-2026`
- Admin Email: `joe@uoo.co.uk`
- 19 staff members (various roles)
- 8 departments (Operations, Events, Welfare, etc.)

---

### Step 5: Create Deep Probe Schema

**File:** `database/migrations/005_deep_probe_schema.sql`

1. Open the file
2. Copy **all contents**
3. Paste into Supabase SQL Editor
4. Click **"Run"**
5. ✅ Should create 5 Deep Probe tables

**Expected outcome:**
- `deep_probe_conversations`
- `deep_probe_messages`
- `deep_probe_insights`
- `deep_probe_workflows`
- `deep_probe_values`

---

## Verification

After completing all 5 steps, verify everything worked:

```bash
node check-migration-status.mjs
```

**Expected output:**
```
✅ All 14 core tables exist
✅ 6 industries found
✅ Test tenant exists (19 staff, 8 departments)
✅ All 5 Deep Probe tables exist
🎉 ALL MIGRATIONS COMPLETE!
```

---

## Get Test URL

```bash
node get-tenant-id.mjs
```

**Sample output:**
```
✅ Found test tenant(s):

======================================================================
Company:    University of Oldbury Students' Guild
AI Name:    Ilyas
Email:      joe@uoo.co.uk
Tenant ID:  a1b2c3d4-e5f6-7890-abcd-ef1234567890

🚀 Test URL:
http://localhost:3003/onboarding/deep-probe?tenantId=a1b2c3d4-e5f6-7890-abcd-ef1234567890
======================================================================
```

---

## Troubleshooting

### Migration fails with "already exists" error
**Solution:** You didn't run Step 1 (drop existing). Run it first.

### "relation does not exist" error
**Solution:** Run migrations in order. Each depends on the previous one.

### "foreign key violation" error
**Solution:** Start over from Step 1. Some data is in an inconsistent state.

### Verification shows incomplete data
**Solution:** Re-run the specific migration that's incomplete.

---

## Quick Reference - File Order

```
1. database/migrations/001_drop_existing.sql
2. database/migrations/002_create_schema.sql
3. database/migrations/003_seed_industries.sql
4. database/migrations/004_seed_university_oldbury.sql
5. database/migrations/005_deep_probe_schema.sql
```

---

## Time Estimate

- **Total time:** 5-10 minutes
- Each migration takes ~30 seconds to run
- Most time is spent copying/pasting

---

## After Installation

Once verified, you're ready to:

1. ✅ Test login with activation key: `JWEBLY-DEMO-2026`
2. ✅ Test Deep Probe AI training
3. ✅ Explore with 19 test staff members
4. ✅ Build and test your features

---

**Ready to start?** Open Supabase SQL Editor and run Step 1! 🚀
