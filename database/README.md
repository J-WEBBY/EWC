# JWEBLY System Database

## Overview

This directory contains the database schema, migrations, and seed data for the JWEBLY multi-tenant SaaS platform.

**Database:** Supabase (PostgreSQL)
**Hosting:** `https://urybzfsillbcpxkdzpuv.supabase.co`

## Directory Structure

```
database/
├── README.md                    # This file
├── SCHEMA_DESIGN.md             # Detailed schema design document
├── migrations/
│   ├── 001_drop_existing.sql    # Drops all existing tables (DESTRUCTIVE)
│   ├── 002_create_schema.sql    # Creates new schema with all tables
│   ├── 003_seed_industries.sql  # Seeds industries, templates, integration types
│   ├── 004_seed_university_oldbury.sql  # Seeds test tenant data
│   └── run_all.sql              # Runs all migrations (for psql CLI)
└── seed-data/
    └── university-of-oldbury.json  # JSON representation of test data
```

## Running Migrations

### Option 1: Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run each migration file **in order**:
   - First: `001_drop_existing.sql`
   - Second: `002_create_schema.sql`
   - Third: `003_seed_industries.sql`
   - Fourth: `004_seed_university_oldbury.sql`

**Important:** Run them one at a time and check for errors before proceeding.

### Option 2: Combined Script

For convenience, here's how to run all migrations at once. Copy-paste the contents of each file in order into a single SQL Editor session.

## Test Tenant Details

After running all migrations, you'll have a test tenant ready:

| Field | Value |
|-------|-------|
| **Company** | University of Oldbury Students' Guild |
| **Activation Key** | `JWEBLY-DEMO-2026` |
| **Admin Email** | `joe@uoo.co.uk` |
| **Industry** | Education & Charity |
| **Staff Members** | 19 |
| **Departments** | 8 |

## Schema Overview

### Core Tables

| Table | Purpose |
|-------|---------|
| `industries` | Predefined industry verticals (6 total) |
| `tenants` | Multi-tenant organizations |
| `discovery_audits` | Pre-onboarding audit data from agency |
| `activation_keys` | One-time activation codes |
| `department_templates` | Industry-specific department templates |
| `departments` | Tenant departments/teams |
| `roles` | Permission roles per tenant |
| `users` | Staff members (linked to Supabase Auth) |
| `onboarding_progress` | Phase-by-phase onboarding tracking |
| `knowledge_categories` | Document categorization |
| `knowledge_documents` | Uploaded documents |
| `knowledge_chunks` | Vector embeddings for RAG |
| `integration_types` | Available integrations |
| `integrations` | Tenant integration connections |
| `audit_trail` | Activity logging |
| `system_settings` | System-wide configuration |
| `agency_users` | Agency admin users |

### Hierarchy

```
Industries (predefined)
    └── Tenants (organizations)
            ├── Discovery Audits (pre-onboarding)
            ├── Departments/Teams
            │       └── Users (staff/admin)
            ├── Roles
            ├── Knowledge Base
            │       ├── Categories
            │       ├── Documents
            │       └── Chunks (vectors)
            ├── Integrations
            └── Onboarding Progress
```

## Key Changes from Previous Schema

### What Changed

1. **Industries table added** - Predefined industries with configuration
2. **Discovery audits table added** - Structured pre-onboarding data
3. **Departments table added** - Proper hierarchy support
4. **Roles table added** - Granular permissions per tenant
5. **Users table restructured** - Direct storage of auth state, not in JSONB
6. **Onboarding progress table added** - Phase-by-phase tracking
7. **Knowledge categories added** - Document organization
8. **Integration types added** - Standardized integrations

### Migration Notes for Application Code

The following files need updates to work with the new schema:

#### 1. `src/lib/actions/auth.ts`

**Old approach:**
- Activation key field was `key_id`
- User credentials stored in `tenants.onboarding_data.credentials`

**New approach:**
- Activation key field is `key_code`
- User credentials stored directly in `users` table
- Password fields: `temp_password_hash`, `password_hash`, `must_change_password`

```typescript
// OLD
const { data } = await sovereign
  .from('activation_keys')
  .select('*')
  .eq('key_id', activationKey)

// NEW
const { data } = await sovereign
  .from('activation_keys')
  .select('*, tenant:tenants(*)')
  .eq('key_code', activationKey)
```

#### 2. `src/lib/actions/onboarding.ts`

**Old approach:**
- All phase data stored in `tenants.onboarding_data` JSONB

**New approach:**
- Phase data stored in `onboarding_progress` table
- Tenant-level data (AI persona, neural contract) in dedicated columns

#### 3. `src/lib/actions/credential-generation.ts`

**Old approach:**
- Generated credentials stored in `tenants.onboarding_data.credentials`

**New approach:**
- Create actual records in `users` table
- Assign department and role IDs

## Industries Supported

| Slug | Name | Key Terminology |
|------|------|-----------------|
| `recruitment` | Recruitment & Staffing | candidate, placement, interview |
| `accounting` | Accounting & Finance | engagement, filing deadline |
| `legal` | Legal Services | matter, consultation, solicitor |
| `property` | Real Estate & Property | tenant, viewing, completion date |
| `supply_chain` | Supply Chain & Logistics | shipment, delivery date |
| `education` | Education & Charity | student, member, initiative |

## Row Level Security (RLS)

All tenant-scoped tables have RLS enabled with:
- **Service role:** Full access (for server-side operations)
- **Authenticated users:** Can only access their own tenant's data

## Adding New Industries

To add a new industry:

```sql
INSERT INTO industries (slug, name, description, terminology, default_ai_tools, compliance_requirements)
VALUES (
  'healthcare',
  'Healthcare',
  'Hospitals, clinics, healthcare providers',
  '{"client": "patient", "project": "case"}'::jsonb,
  '["Appointment scheduling", "Patient records"]'::jsonb,
  '[{"requirement": "HIPAA", "category": "data_protection"}]'::jsonb
);

-- Then add department templates
INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT id, 'Clinical', 'Clinical staff', '["Doctor", "Nurse"]'::jsonb, 1, true
FROM industries WHERE slug = 'healthcare';
```

## Backup Before Migration

Before running these migrations in production, always backup your data:

```sql
-- Create backup schema
CREATE SCHEMA IF NOT EXISTS backup_20260205;

-- Copy critical tables
CREATE TABLE backup_20260205.tenants AS SELECT * FROM tenants;
CREATE TABLE backup_20260205.users AS SELECT * FROM users;
CREATE TABLE backup_20260205.activation_keys AS SELECT * FROM activation_keys;
-- etc.
```

## Support

For questions about the schema, contact the JWEBLY development team.
