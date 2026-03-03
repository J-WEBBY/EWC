-- =============================================================================
-- Migration 028: Reseed Roles and Users
-- Wipes all existing users and roles.
-- Installs 5 clean roles + 11 real staff accounts.
--
-- Roles:  admin | manager | practitioner | receptionist | viewer
-- Admin is both a standalone role AND an extra privilege flag on users.
-- A practitioner can have is_admin=TRUE — they get admin access on top of
-- their base practitioner permissions.
--
-- Temp password for all users: Welcome2026!
-- All staff (except Reception shared account) must change on first login.
-- =============================================================================

-- 1. Wipe existing users (preserve audit_trail references with SET NULL)
DELETE FROM users;

-- 2. Wipe existing roles
DELETE FROM roles;

-- =============================================================================
-- 3. NEW ROLES
-- =============================================================================

INSERT INTO roles (name, slug, permission_level, is_admin, permissions) VALUES

  -- ADMIN — full system control
  (
    'Admin',
    'admin',
    200,
    TRUE,
    '{
      "can_manage_users":       true,
      "can_manage_agents":      true,
      "can_view_all_signals":   true,
      "can_approve_signals":    true,
      "can_manage_knowledge_base": true,
      "can_view_reports":       true,
      "can_view_analytics":     true,
      "can_manage_integrations": true,
      "can_manage_system":      true,
      "can_view_audit_trail":   true,
      "can_view_voice":         true,
      "can_view_patients":      true,
      "can_view_compliance":    true
    }'
  ),

  -- MANAGER — senior operational access, no system settings
  (
    'Manager',
    'manager',
    100,
    FALSE,
    '{
      "can_manage_users":       false,
      "can_manage_agents":      true,
      "can_view_all_signals":   true,
      "can_approve_signals":    true,
      "can_manage_knowledge_base": true,
      "can_view_reports":       true,
      "can_view_analytics":     true,
      "can_manage_integrations": false,
      "can_manage_system":      false,
      "can_view_audit_trail":   true,
      "can_view_voice":         true,
      "can_view_patients":      true,
      "can_view_compliance":    true
    }'
  ),

  -- PRACTITIONER — clinical access, patient-focused
  (
    'Practitioner',
    'practitioner',
    50,
    FALSE,
    '{
      "can_manage_users":          false,
      "can_view_all_signals":      false,
      "can_view_department_signals": true,
      "can_create_signals":        true,
      "can_approve_signals":       false,
      "can_view_reports":          false,
      "can_view_analytics":        false,
      "can_manage_integrations":   false,
      "can_manage_system":         false,
      "can_view_voice":            false,
      "can_view_patients":         true,
      "can_view_compliance":       true
    }'
  ),

  -- RECEPTIONIST — front desk, voice, signals, patients
  (
    'Receptionist',
    'receptionist',
    20,
    FALSE,
    '{
      "can_manage_users":          false,
      "can_view_all_signals":      false,
      "can_view_department_signals": true,
      "can_create_signals":        true,
      "can_approve_signals":       false,
      "can_view_reports":          false,
      "can_view_analytics":        false,
      "can_manage_integrations":   false,
      "can_manage_system":         false,
      "can_view_voice":            true,
      "can_view_patients":         true,
      "can_view_compliance":       false
    }'
  ),

  -- VIEWER — read-only, dashboard and signals only
  (
    'Viewer',
    'viewer',
    10,
    FALSE,
    '{
      "can_manage_users":          false,
      "can_view_all_signals":      false,
      "can_view_department_signals": true,
      "can_create_signals":        false,
      "can_approve_signals":       false,
      "can_view_reports":          false,
      "can_view_analytics":        false,
      "can_manage_integrations":   false,
      "can_manage_system":         false,
      "can_view_voice":            false,
      "can_view_patients":         false,
      "can_view_compliance":       false
    }'
  );

-- =============================================================================
-- 4. USERS
-- Temp password: Welcome2026! for all accounts
-- must_change_password = TRUE for all staff (they set their own on first login)
-- Reception Edgbaston is a shared view-only account — admin manages password
-- =============================================================================

-- JOSEPH ENEMUWE — Developer / Solutions Architect (Jwebly) — full admin
INSERT INTO users (email, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id)
VALUES (
  'joseph@edgbastonwellness.co.uk', 'Joseph', 'Enemuwe', 'Joseph Enemuwe',
  'Solutions Architect',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE, 'active', TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'admin')
);

-- SURESH GANTA — Owner / Medical Director — practitioner + admin privilege
INSERT INTO users (email, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id)
VALUES (
  'suresh@edgbastonwellness.co.uk', 'Suresh', 'Ganta', 'Dr Suresh Ganta',
  'Medical Director',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE, 'active', TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'practitioner')
);

-- DR K PENUMAKA — Practitioner + admin privilege
-- NOTE: First name is initial only — update to full name when confirmed
INSERT INTO users (email, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id)
VALUES (
  'k@edgbastonwellness.co.uk', 'K', 'Penumaka', 'Dr K Penumaka',
  'Practitioner',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE, 'active', TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'practitioner')
);

-- SYED AHMAD — Administrator
INSERT INTO users (email, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id)
VALUES (
  'syed@edgbastonwellness.co.uk', 'Syed', 'Ahmad', 'Mr Syed Ahmad',
  'Administrator',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE, 'active', TRUE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'admin')
);

-- BENJAMIN HAWTHORNE — Receptionist
INSERT INTO users (email, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id)
VALUES (
  'benjamin@edgbastonwellness.co.uk', 'Benjamin', 'Hawthorne', 'Mr Benjamin Hawthorne',
  'Receptionist',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'receptionist')
);

-- DIONNE JACKSON — Receptionist
INSERT INTO users (email, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id)
VALUES (
  'dionne@edgbastonwellness.co.uk', 'Dionne', 'Jackson', 'Ms Dionne Jackson',
  'Receptionist',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'receptionist')
);

-- ECE KURT — Receptionist
INSERT INTO users (email, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id)
VALUES (
  'ece@edgbastonwellness.co.uk', 'Ece', 'Kurt', 'Miss Ece Kurt',
  'Receptionist',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'receptionist')
);

-- SHAUNA HAVORD — Receptionist
INSERT INTO users (email, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id)
VALUES (
  'shauna@edgbastonwellness.co.uk', 'Shauna', 'Havord', 'Miss Shauna Havord',
  'Receptionist',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'receptionist')
);

-- LUBNA BIBI — Practitioner
INSERT INTO users (email, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id)
VALUES (
  'lubna@edgbastonwellness.co.uk', 'Lubna', 'Bibi', 'Lubna Bibi',
  'Practitioner',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'practitioner')
);

-- NIKITA V — Practitioner
-- NOTE: Last name is initial only — update to full surname when confirmed
INSERT INTO users (email, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id)
VALUES (
  'nikita@edgbastonwellness.co.uk', 'Nikita', 'V', 'Nikita V',
  'Practitioner',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  TRUE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'practitioner')
);

-- RECEPTION EDGBASTON — shared view-only account
-- must_change_password = FALSE — admin manages this shared credential
INSERT INTO users (email, first_name, last_name, display_name, job_title,
  password_hash, must_change_password, status, is_admin,
  staff_onboarding_completed, staff_onboarding_completed_at, role_id)
VALUES (
  'reception@edgbastonwellness.co.uk', 'Reception', 'Edgbaston', 'Reception Edgbaston',
  'Shared Reception Account',
  crypt('Welcome2026!', gen_salt('bf', 10)),
  FALSE, 'active', FALSE, TRUE, NOW(),
  (SELECT id FROM roles WHERE slug = 'viewer')
);

-- =============================================================================
-- CONFIRM
-- =============================================================================

DO $$
DECLARE
  v_roles INT;
  v_users INT;
BEGIN
  SELECT COUNT(*) INTO v_roles FROM roles;
  SELECT COUNT(*) INTO v_users FROM users;

  RAISE NOTICE '✓ Migration 028 complete';
  RAISE NOTICE '  Roles: %',  v_roles;
  RAISE NOTICE '  Users: %',  v_users;
  RAISE NOTICE '  Temp password for all staff: Welcome2026!';
  RAISE NOTICE '  NOTE: Dr K Penumaka — first name is initial only (k@edgbastonwellness.co.uk)';
  RAISE NOTICE '  NOTE: Nikita V — last name is initial only — update when surname confirmed';
END $$;
