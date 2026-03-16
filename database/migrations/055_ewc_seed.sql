-- =============================================================================
-- Migration 055: Edgbaston Wellness Clinic — Tenant Seed
--
-- Run AFTER migration 054 (sovereign fresh schema).
-- Also safe to run on older DBs (012-053 path) — schema preamble handles
-- column differences between 053 (tenants.name) and 054 (tenants.clinic_name).
--
-- Creates the EWC tenant row and seeds all baseline data:
--   1. Schema preamble (adds missing columns to support older DB schemas)
--   2. Tenant record (Edgbaston Wellness Clinic)
--   3. Clinic config (brand, AI persona)
--   4. Departments (4)
--   5. Roles (5 tiers: system_admin, manager, admin, practitioner, receptionist)
--      + is_clinical flag on roles (clinical vs non-clinical base roles)
--   6. All staff accounts (12 people from Cliniko roster)
--      + title (Dr, Mr, Ms, Miss) + is_clinical per person
--   7. AI agents (EWC, Orion, Aria)
--   8. Cliniko config placeholder
--   9. Knowledge categories (6 starter categories)
--
-- Role architecture:
--   BASE ROLES (what they do):
--     practitioner (30, is_clinical=true)  — all clinical staff
--     receptionist (20, is_clinical=false) — all non-clinical staff
--   PRIVILEGE TIERS (additional access):
--     admin    (70)  — system/settings access on top of base role
--     manager  (100) — full operational oversight on top of base role
--     system_admin (200) — developer / platform access
--
--   A user gets one role (their highest privilege level).
--   is_clinical on the user row flags whether they do clinical work,
--   regardless of their access-level role.
--   This allows: Dr K (admin role + is_clinical=true), Suresh (manager + is_clinical=true).
-- =============================================================================

DO $$ BEGIN RAISE NOTICE '=== Migration 055: EWC Tenant Seed — START ==='; END $$;

-- =============================================================================
-- 0. SCHEMA PREAMBLE
--    Ensures all columns exist regardless of which migration path was used.
--    ADD COLUMN IF NOT EXISTS is idempotent — safe to re-run.
--    Covers the gap between 053 (incremental) and 054 (fresh) schemas.
-- =============================================================================

-- ── tenants table ─────────────────────────────────────────────────────────────
-- 053 used 'name TEXT NOT NULL' as the primary name column; 054 renamed it to
-- 'clinic_name'. Both are added here so the INSERT works on both paths.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS name                   TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS schema_name            TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS clinic_name            TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subdomain              TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS plan                   TEXT NOT NULL DEFAULT 'starter';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_email          TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS status                 TEXT NOT NULL DEFAULT 'trialing';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at          TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed   BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_step        INT NOT NULL DEFAULT 1;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_contact_name   TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_contact_email  TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS primary_contact_phone  TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS country                TEXT NOT NULL DEFAULT 'GB';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS timezone               TEXT NOT NULL DEFAULT 'Europe/London';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS currency               TEXT NOT NULL DEFAULT 'GBP';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS settings               JSONB NOT NULL DEFAULT '{}';

-- Backfill clinic_name from 'name' column if 053 used that name
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tenants' AND column_name = 'name'
  ) THEN
    EXECUTE 'UPDATE tenants SET clinic_name = name WHERE clinic_name IS NULL';
  END IF;
END $$;

-- ── users table ───────────────────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS title       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_clinical BOOLEAN NOT NULL DEFAULT FALSE;

-- ── roles table ───────────────────────────────────────────────────────────────
ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_clinical BOOLEAN NOT NULL DEFAULT FALSE;

DO $$ BEGIN RAISE NOTICE 'Schema preamble complete.'; END $$;

-- =============================================================================
-- 1. TENANT
-- =============================================================================

INSERT INTO tenants (
  slug,
  name,
  schema_name,
  clinic_name,
  subdomain,
  plan,
  billing_email,
  status,
  onboarding_completed,
  onboarding_completed_at,
  onboarding_step,
  primary_contact_name,
  primary_contact_email,
  country,
  timezone,
  currency
) VALUES (
  'edgbaston-wellness',
  'Edgbaston Wellness Clinic',
  'public',
  'Edgbaston Wellness Clinic',
  'ewc',
  'growth',
  'admin@edgbastonwellness.co.uk',
  'active',
  TRUE,
  NOW(),
  5,
  'Dr Suresh Ganta',
  'suresh@edgbastonwellness.co.uk',
  'GB',
  'Europe/London',
  'GBP'
)
ON CONFLICT (slug) DO UPDATE SET
  name                    = EXCLUDED.name,
  schema_name             = EXCLUDED.schema_name,
  clinic_name             = EXCLUDED.clinic_name,
  status                  = EXCLUDED.status,
  onboarding_completed    = EXCLUDED.onboarding_completed,
  onboarding_completed_at = EXCLUDED.onboarding_completed_at,
  plan                    = EXCLUDED.plan;

-- =============================================================================
-- 2. CLINIC CONFIGURATION
-- =============================================================================

INSERT INTO clinic_config (
  tenant_id, clinic_name, ai_name, brand_color, tone, tagline, manifesto,
  ai_persona, neural_contract
)
SELECT
  t.id,
  'Edgbaston Wellness Clinic',
  'Aria',
  '#0058E6',
  'professional',
  'Your wellbeing, elevated.',
  'We believe that exceptional care begins with exceptional intelligence. Aria is your operational partner — always present, always informed, always one step ahead.',
  '{
    "traits": ["precise", "calm", "insightful", "discreet"],
    "communication_style": "concise and warm",
    "confidence": 0.92,
    "philosophy": "Every patient interaction is an opportunity to deliver excellence. I surface what matters so your team can focus on what they do best — care."
  }',
  '{
    "tone": "professional yet approachable",
    "response_style": "concise, structured, actionable",
    "context": "A premium private wellness clinic in Edgbaston, Birmingham. Specialising in aesthetics (Botox, fillers, CoolSculpting), wellness (IV therapy, weight management, hormone therapy), and medical (GP, health screening). High-value clientele expect discretion and excellence."
  }'
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. DEPARTMENTS
-- =============================================================================

INSERT INTO departments (tenant_id, name, description, display_order)
SELECT t.id, d.name, d.description, d.display_order
FROM tenants t
CROSS JOIN (VALUES
  ('Management',                  'Clinic leadership, strategy and administration',         1),
  ('Clinical',                    'Practitioners, therapists and clinical delivery',        2),
  ('Reception & Patient Care',    'Front desk, appointment coordination and patient flow',  3),
  ('Sales & Business Development','Patient acquisition, packages and revenue growth',       4)
) AS d(name, description, display_order)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 4. ROLES
--
-- Two-tier architecture:
--   BASE ROLES    → what the person does day-to-day
--     practitioner (is_clinical=true)  — delivers clinical care
--     receptionist (is_clinical=false) — non-clinical, front desk / admin
--
--   PRIVILEGE TIERS → additional access on top of base role
--     admin    (70)  — can manage users, system settings, knowledge base
--     manager  (100) — full operational oversight, reports, goals, approvals
--     system_admin (200) — developer/platform level, all access
--
--   A staff member gets ONE role (the highest tier they need).
--   Their is_clinical flag (on the user row) is independent of role,
--   so Dr Suresh (manager role) can still be flagged as clinical.
-- =============================================================================

INSERT INTO roles (tenant_id, name, slug, permission_level, is_admin, permissions)
SELECT t.id, r.name, r.slug, r.permission_level, r.is_admin, r.is_clinical, r.permissions::JSONB
FROM tenants t
CROSS JOIN (VALUES

  -- ── Platform / developer ────────────────────────────────────────────────────
  (
    'System Admin', 'system_admin', 200, TRUE, FALSE,
    '{"can_manage_users":true,"can_manage_agents":true,"can_view_all_signals":true,"can_approve_signals":true,"can_manage_knowledge_base":true,"can_view_reports":true,"can_manage_integrations":true,"can_manage_system":true,"can_view_audit_trail":true,"can_view_voice":true,"can_view_patients":true,"can_view_compliance":true,"can_view_all_staff_kpis":true,"can_set_department_goals":true,"can_approve_compliance_items":true,"can_view_clinical_records":true}'
  ),

  -- ── Practice / clinic manager ───────────────────────────────────────────────
  -- Full operational oversight. Clinical access granted via is_clinical user flag.
  (
    'Manager', 'manager', 100, TRUE, FALSE,
    '{"can_manage_users":true,"can_manage_agents":true,"can_view_all_signals":true,"can_approve_signals":true,"can_manage_knowledge_base":true,"can_view_reports":true,"can_manage_integrations":true,"can_view_audit_trail":true,"can_view_voice":true,"can_view_patients":true,"can_view_compliance":true,"can_view_all_staff_kpis":true,"can_set_department_goals":true,"can_approve_compliance_items":true,"can_view_clinical_records":true}'
  ),

  -- ── Admin privilege tier ────────────────────────────────────────────────────
  -- System access: manage users, knowledge base, view all signals.
  -- Clinical access granted via is_clinical user flag (e.g. Dr K).
  (
    'Admin', 'admin', 70, TRUE, FALSE,
    '{"can_manage_users":true,"can_manage_agents":false,"can_view_all_signals":true,"can_approve_signals":true,"can_manage_knowledge_base":true,"can_view_reports":true,"can_manage_integrations":false,"can_manage_system":false,"can_view_audit_trail":false,"can_view_voice":true,"can_view_patients":true,"can_view_compliance":true,"can_view_all_staff_kpis":true,"can_set_department_goals":true,"can_approve_compliance_items":true,"can_view_clinical_records":true}'
  ),

  -- ── Clinical base role ──────────────────────────────────────────────────────
  -- Practitioners, doctors, nurses, therapists, aestheticians.
  -- is_clinical=true — access to patient clinical records, SOAP notes, consents.
  (
    'Practitioner', 'practitioner', 30, FALSE, TRUE,
    '{"can_manage_users":false,"can_view_all_signals":false,"can_view_department_signals":true,"can_create_signals":true,"can_approve_signals":false,"can_view_reports":false,"can_view_patients":true,"can_view_compliance":false,"can_view_all_staff_kpis":false,"can_view_clinical_records":true}'
  ),

  -- ── Non-clinical base role ──────────────────────────────────────────────────
  -- Receptionists, coordinators, admin support.
  -- is_clinical=false — no access to clinical records by default.
  (
    'Receptionist', 'receptionist', 20, FALSE, FALSE,
    '{"can_manage_users":false,"can_view_all_signals":false,"can_view_department_signals":true,"can_create_signals":true,"can_approve_signals":false,"can_view_reports":false,"can_view_patients":true,"can_view_compliance":false,"can_view_all_staff_kpis":false,"can_view_clinical_records":false}'
  )

) AS r(name, slug, permission_level, is_admin, permissions)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, slug) DO UPDATE SET
  permission_level = EXCLUDED.permission_level,
  is_admin         = EXCLUDED.is_admin,
  is_clinical      = EXCLUDED.is_clinical,
  permissions      = EXCLUDED.permissions;

-- =============================================================================
-- 4b. DEDUPLICATE ROLES + DEPARTMENTS
--     Old schemas may lack unique constraints → duplicate rows from partial runs.
--     Keep the row with the lowest ctid (first inserted) per (tenant_id, slug/name).
-- =============================================================================

DELETE FROM roles a
  USING roles b
  WHERE a.ctid > b.ctid
    AND a.tenant_id IS NOT DISTINCT FROM b.tenant_id
    AND a.slug = b.slug;

DELETE FROM departments a
  USING departments b
  WHERE a.ctid > b.ctid
    AND a.tenant_id IS NOT DISTINCT FROM b.tenant_id
    AND a.name = b.name;

-- =============================================================================
-- 5. STAFF ACCOUNTS
--
-- Passwords:
--   admin@edgbastonwellness.co.uk  → Admin13!   (system account, no change)
--   joseph@jwebly.co.uk            → Admin13!   (developer, no change)
--   All other staff                → Staff2024! (must_change_password = TRUE)
--
-- Role assignment logic:
--   Joseph Enemuwe    → system_admin  (developer / full platform access)
--   Dr Suresh Ganta   → manager       (owner + clinical = manager + is_clinical)
--   Dr K Penumaka     → admin         (practitioner + admin = admin + is_clinical)
--   Mr Syed Ahmad     → admin         (non-clinical admin)
--   Lubna Bibi        → practitioner  (clinical base, no extra privileges)
--   Nikita V          → practitioner  (clinical base, no extra privileges)
--   All receptionists → receptionist  (non-clinical base)
-- =============================================================================

-- ── System account (not a real person — platform admin) ──────────────────────
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'admin@edgbastonwellness.co.uk',
  NULL, 'Admin', 'User', 'System Administrator', 'System Administrator',
  crypt('Admin13!', gen_salt('bf', 10)),
  FALSE, 'active', TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'system_admin'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Management')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Joseph Enemuwe — Jwebly Developer / System Admin ────────────────────────
-- Cliniko: Administrator. Developer with full platform access to all features.
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'joseph@jwebly.co.uk',
  NULL, 'Joseph', 'Enemuwe', 'Joseph Enemuwe', 'Solutions Architect (Jwebly)',
  crypt('Admin13!', gen_salt('bf', 10)),
  FALSE, 'active', TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'system_admin'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Management')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Dr Suresh Ganta — Owner / Medical Director + Practitioner ────────────────
-- Cliniko: Owner + Administrator + Practitioner.
-- Role: manager (full operational oversight). is_clinical=true (also practices).
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'suresh@edgbastonwellness.co.uk',
  'Dr', 'Suresh', 'Ganta', 'Dr Suresh Ganta', 'Medical Director',
  crypt('Staff2024!', gen_salt('bf', 10)),
  TRUE, 'active', TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'manager'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Management')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Dr K Penumaka — Admin + Practitioner ────────────────────────────────────
-- Cliniko: Administrator + Practitioner.
-- Role: admin (system access). is_clinical=true (active practitioner).
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'k.penumaka@edgbastonwellness.co.uk',
  'Dr', 'K', 'Penumaka', 'Dr K Penumaka', 'Doctor',
  crypt('Staff2024!', gen_salt('bf', 10)),
  TRUE, 'active', TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'admin'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Clinical')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Mr Syed Ahmad — Admin (non-clinical) ────────────────────────────────────
-- Cliniko: Administrator. No practitioner flag — admin/ops only.
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'syed.ahmad@edgbastonwellness.co.uk',
  'Mr', 'Syed', 'Ahmad', 'Mr Syed Ahmad', 'Administrator',
  crypt('Staff2024!', gen_salt('bf', 10)),
  TRUE, 'active', TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'admin'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Management')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Lubna Bibi — Practitioner (clinical) ────────────────────────────────────
-- Cliniko: Practitioner.
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'lubna.bibi@edgbastonwellness.co.uk',
  NULL, 'Lubna', 'Bibi', 'Lubna Bibi', 'Practitioner',
  crypt('Staff2024!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'practitioner'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Clinical')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Nikita V — Practitioner (clinical) ──────────────────────────────────────
-- Cliniko: Practitioner.
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'nikita.v@edgbastonwellness.co.uk',
  NULL, 'Nikita', 'V', 'Nikita V', 'Practitioner',
  crypt('Staff2024!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'practitioner'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Clinical')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Mr Benjamin Hawthorne — Senior Receptionist ──────────────────────────────
-- Cliniko: Power Receptionist (non-clinical).
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'benjamin.hawthorne@edgbastonwellness.co.uk',
  'Mr', 'Benjamin', 'Hawthorne', 'Mr Benjamin Hawthorne', 'Senior Receptionist',
  crypt('Staff2024!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'receptionist'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Reception & Patient Care')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Ms Dionne Jackson — Senior Receptionist ──────────────────────────────────
-- Cliniko: Power Receptionist (non-clinical).
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'dionne.jackson@edgbastonwellness.co.uk',
  'Ms', 'Dionne', 'Jackson', 'Ms Dionne Jackson', 'Senior Receptionist',
  crypt('Staff2024!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'receptionist'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Reception & Patient Care')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Miss Ece Kurt — Receptionist ─────────────────────────────────────────────
-- Cliniko: Receptionist (non-clinical).
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'ece.kurt@edgbastonwellness.co.uk',
  'Miss', 'Ece', 'Kurt', 'Miss Ece Kurt', 'Receptionist',
  crypt('Staff2024!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'receptionist'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Reception & Patient Care')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Reception Edgbaston — Shared reception account ───────────────────────────
-- Cliniko: Receptionist + Practitioner flag (shared/generic account — treat as non-clinical).
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'reception@edgbastonwellness.co.uk',
  NULL, 'Reception', 'Edgbaston', 'Reception Edgbaston', 'Reception (Shared)',
  crypt('Staff2024!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'receptionist'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Reception & Patient Care')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- ── Miss Shauna Havord — Receptionist ────────────────────────────────────────
-- Cliniko: Receptionist (non-clinical).
INSERT INTO users (
  tenant_id, email, title, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id, department_id
)
SELECT t.id,
  'shauna.havord@edgbastonwellness.co.uk',
  'Miss', 'Shauna', 'Havord', 'Miss Shauna Havord', 'Receptionist',
  crypt('Staff2024!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE tenant_id = t.id AND slug = 'receptionist'),
  (SELECT id FROM departments WHERE tenant_id = t.id AND name = 'Reception & Patient Care')
FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, email) DO NOTHING;

-- =============================================================================
-- 6. AI AGENTS
-- =============================================================================

INSERT INTO agents (
  tenant_id, agent_key, name, description, scope, domains,
  keywords, critical_keywords, is_active, is_catch_all, system_prompt
)
SELECT t.id, a.agent_key, a.name, a.description, a.scope,
       a.domains, a.keywords, a.critical_keywords, a.is_active, a.is_catch_all, a.system_prompt
FROM tenants t
CROSS JOIN (VALUES
  (
    'primary_agent', 'EWC',
    'Supreme orchestrator — clinic operational intelligence brain.',
    'general',
    ARRAY['operations','management','reporting','clinic health','coordination','overview','analytics'],
    ARRAY['help','what','how','show','report','overview','status','check','summary','analyse','tell me'],
    ARRAY['emergency','urgent','critical','safeguarding','serious incident'],
    TRUE, TRUE,
    'You are EWC, the operational intelligence assistant for Edgbaston Wellness Clinic — a premium private clinic in Edgbaston, Birmingham.

You serve the clinic''s management and staff team. Your role is to surface operational insights, monitor clinic health, and help the team make better decisions faster.

The clinic offers aesthetics (Botox, fillers, CoolSculpting), wellness (IV therapy, weight management, hormone therapy), and medical (GP, health screening) services to a high-value clientele who expect discretion and excellence.

Be precise, calm, and professional. Always prioritise patient welfare and clinic reputation.'
  ),
  (
    'sales_agent', 'Orion',
    'Revenue intelligence — patient leads, treatment packages, booking conversion rates.',
    'sales',
    ARRAY['sales','revenue','bookings','leads','packages','conversions','enquiries','pricing','corporate','membership'],
    ARRAY['enquiry','lead','package','consultation','price','book','quote','buy','purchase','membership','corporate','interested','cost'],
    ARRAY['lost lead','refused','cancelled package','complaint about price','refund request','dispute'],
    TRUE, FALSE,
    'You are Orion, the revenue intelligence agent for Edgbaston Wellness Clinic. You monitor and manage the clinic''s revenue pipeline.

Your focus: new patient enquiries, treatment package sales, booking conversion rates, upsell opportunities, and corporate wellness contracts.

Surface signals when leads go cold, conversions drop, or revenue opportunities arise. Always frame insights in terms of patient value and long-term relationship building — not aggressive sales tactics. This is a premium clinic; the approach must match the brand.'
  ),
  (
    'crm_agent', 'Aria',
    'Patient experience intelligence — satisfaction, complaints, retention risk, no-shows.',
    'patient_relations',
    ARRAY['patient experience','complaints','retention','satisfaction','communication','follow-up','feedback','no-show','cancellation'],
    ARRAY['complaint','unhappy','cancel','no-show','satisfaction','feedback','review','follow up','missed','rebook','hasn''t returned','response time'],
    ARRAY['legal action','solicitor','refund demand','serious complaint','emergency','safeguarding','negligence'],
    TRUE, FALSE,
    'You are Aria, the patient relations agent for Edgbaston Wellness Clinic. You safeguard the patient experience and protect the clinic''s reputation.

Your focus: complaint resolution, satisfaction monitoring, retention risk (patients who haven''t returned), no-show tracking, and communication SLA compliance.

When you surface signals, always suggest a next action. Prioritise patient welfare and clinic reputation above all else. Handle sensitive matters with discretion.'
  )
) AS a(agent_key, name, description, scope, domains, keywords, critical_keywords, is_active, is_catch_all, system_prompt)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT (tenant_id, agent_key) DO UPDATE SET
  name          = EXCLUDED.name,
  description   = EXCLUDED.description,
  system_prompt = EXCLUDED.system_prompt,
  is_active     = EXCLUDED.is_active;

-- =============================================================================
-- 7. CLINIKO CONFIG PLACEHOLDER
-- =============================================================================

INSERT INTO cliniko_config (tenant_id)
SELECT t.id FROM tenants t WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 8. KNOWLEDGE CATEGORIES
-- =============================================================================

INSERT INTO knowledge_categories (tenant_id, name, slug, description, display_order)
SELECT t.id, k.name, k.slug, k.description, k.display_order
FROM tenants t
CROSS JOIN (VALUES
  ('Clinical Protocols',    'clinical-protocols',  'Treatment protocols, clinical guidelines and safety procedures',             1),
  ('Patient Policies',      'patient-policies',    'Patient intake, consent, cancellation and confidentiality policies',         2),
  ('Pricing & Packages',    'pricing-packages',    'Treatment pricing, packages, memberships and corporate rates',               3),
  ('Staff Handbook',        'staff-handbook',      'HR policies, clinic procedures, staff guidelines and onboarding materials',  4),
  ('Marketing & Brand',     'marketing-brand',     'Brand guidelines, marketing materials and communications',                   5),
  ('Compliance & Legal',    'compliance-legal',    'Regulatory compliance, CQC requirements and legal documentation',            6)
) AS k(name, slug, description, display_order)
WHERE t.slug = 'edgbaston-wellness'
ON CONFLICT DO NOTHING;

-- =============================================================================
-- VERIFY
-- =============================================================================

DO $$
DECLARE
  v_tid         UUID;
  v_user_count  INT;
  v_role_count  INT;
  v_dept_count  INT;
  v_agent_count INT;
BEGIN
  SELECT id INTO v_tid FROM tenants WHERE slug = 'edgbaston-wellness';
  IF v_tid IS NULL THEN RAISE EXCEPTION 'EWC tenant was not created'; END IF;

  SELECT COUNT(*) INTO v_user_count  FROM users       WHERE tenant_id = v_tid;
  SELECT COUNT(*) INTO v_role_count  FROM roles        WHERE tenant_id = v_tid;
  SELECT COUNT(*) INTO v_dept_count  FROM departments  WHERE tenant_id = v_tid;
  SELECT COUNT(*) INTO v_agent_count FROM agents       WHERE tenant_id = v_tid;

  RAISE NOTICE '=== Migration 055 complete ===';
  RAISE NOTICE '  Tenant:      Edgbaston Wellness Clinic (%)', v_tid;
  RAISE NOTICE '  Users:       % (expected 12)', v_user_count;
  RAISE NOTICE '  Roles:       % (expected 5: system_admin, manager, admin, practitioner, receptionist)', v_role_count;
  RAISE NOTICE '  Departments: % (expected 4)', v_dept_count;
  RAISE NOTICE '  Agents:      % (expected 3: EWC, Orion, Aria)', v_agent_count;
  RAISE NOTICE '';
  RAISE NOTICE '  Credentials:';
  RAISE NOTICE '    admin@edgbastonwellness.co.uk   Admin13!   (system account)';
  RAISE NOTICE '    joseph@jwebly.co.uk             Admin13!   (developer)';
  RAISE NOTICE '    suresh@edgbastonwellness.co.uk  Staff2024! (must change — Medical Director)';
  RAISE NOTICE '    All other staff                 Staff2024! (must change on login)';
  RAISE NOTICE '';
  RAISE NOTICE '  Role architecture:';
  RAISE NOTICE '    system_admin (200) — Joseph (developer platform access)';
  RAISE NOTICE '    manager      (100) — Suresh (owner + is_clinical=true)';
  RAISE NOTICE '    admin         (70) — Dr K (is_clinical=true), Syed (is_clinical=false)';
  RAISE NOTICE '    practitioner  (30) — Lubna, Nikita (is_clinical=true)';
  RAISE NOTICE '    receptionist  (20) — Benjamin, Dionne, Ece, Reception, Shauna';
  RAISE NOTICE '';
  RAISE NOTICE '  Onboarding: COMPLETE — all logins go directly to /staff/dashboard';
END $$;
