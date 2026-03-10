-- =============================================================================
-- Platform Seed 002: Edgbaston Wellness Clinic — EWC Tenant
-- Run AFTER 001_platform_schema.sql
-- Replace all %%PLACEHOLDER%% values before running
-- =============================================================================

-- ── 1. Tenant record ─────────────────────────────────────────────────────────
INSERT INTO tenants (id, slug, name, schema_name, status, plan)
VALUES (
  'a1b2c3d4-0001-0001-0001-000000000001',
  'ewc',
  'Edgbaston Wellness Clinic',
  'ewc',
  'onboarding',
  'growth'
)
ON CONFLICT (slug) DO NOTHING;

-- ── 2. Activation key — EWC's private key ────────────────────────────────────
-- Share JWBLY-EWC1-EDGB-2026-0001 with Dr Ganta privately
INSERT INTO activation_keys (tenant_id, key_plain, key_preview, status)
VALUES (
  'a1b2c3d4-0001-0001-0001-000000000001',
  'JWBLY-EWC1-EDGB-2026-0001',
  '0001',
  'active'
)
ON CONFLICT (key_plain) DO NOTHING;

-- ── 3. Pre-populated clinic profile ──────────────────────────────────────────
INSERT INTO clinic_profiles (
  tenant_id,
  clinic_name,
  clinic_type,
  tagline,
  address_line1,
  address_line2,
  city,
  postcode,
  phone,
  email,
  website,
  cqc_number,
  founded_year,
  director_name,
  director_title,
  primary_color,
  agent_name,
  receptionist_name
) VALUES (
  'a1b2c3d4-0001-0001-0001-000000000001',
  'Edgbaston Wellness Clinic',
  ARRAY['aesthetics', 'wellness', 'medical'],
  'Premium aesthetics, wellness & medical care in Birmingham',
  '11 Greenfield Crescent',
  NULL,
  'Birmingham',
  'B15 3AU',
  '0121 454 8633',
  'info@edgbastonwellness.co.uk',
  NULL,    -- website
  NULL,    -- cqc_number
  NULL,    -- founded_year
  'Dr Suresh Ganta',
  'Medical Director',
  '#0058E6',
  'Aria',
  'Komal'
)
ON CONFLICT (tenant_id) DO NOTHING;

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT
  t.slug,
  t.status,
  ak.key_plain AS activation_key,
  cp.clinic_name,
  cp.city,
  cp.director_name
FROM tenants t
JOIN activation_keys ak ON ak.tenant_id = t.id
JOIN clinic_profiles cp ON cp.tenant_id = t.id
WHERE t.slug = 'ewc';
