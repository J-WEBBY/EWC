-- =============================================================================
-- Migration 014: Edgbaston Wellness Clinic — Seed Data
-- Run AFTER migration 013
-- =============================================================================

-- =============================================================================
-- CLINIC CONFIGURATION
-- Premium black & white brand identity
-- =============================================================================

INSERT INTO clinic_config (
  clinic_name,
  ai_name,
  brand_color,
  tone,
  tagline,
  manifesto,
  ai_persona,
  neural_contract
) VALUES (
  'Edgbaston Wellness Clinic',
  'Aria',
  '#8A6CFF',
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
    "context": "A premium private wellness clinic in Edgbaston, Birmingham. Specialising in physiotherapy, cosmetic treatments, and holistic wellbeing. High-value clientele expect discretion and excellence."
  }'
);

-- =============================================================================
-- DEPARTMENTS
-- =============================================================================

INSERT INTO departments (name, description, display_order) VALUES
  ('Management',                 'Clinic leadership, strategy and administration',          1),
  ('Clinical',                   'Practitioners, therapists and clinical delivery',         2),
  ('Reception & Patient Care',   'Front desk, appointment coordination and patient flow',   3),
  ('Sales & Business Development','Patient acquisition, packages and revenue growth',       4);

-- =============================================================================
-- ROLES
-- =============================================================================

INSERT INTO roles (name, slug, permission_level, is_admin, permissions) VALUES
  (
    'System Admin',
    'system_admin',
    200,
    TRUE,
    '{
      "can_manage_users": true,
      "can_manage_agents": true,
      "can_view_all_signals": true,
      "can_approve_signals": true,
      "can_manage_knowledge_base": true,
      "can_view_reports": true,
      "can_manage_integrations": true,
      "can_manage_system": true,
      "can_view_audit_trail": true
    }'
  ),
  (
    'Clinic Director',
    'clinic_director',
    100,
    TRUE,
    '{
      "can_manage_users": true,
      "can_manage_agents": true,
      "can_view_all_signals": true,
      "can_approve_signals": true,
      "can_manage_knowledge_base": true,
      "can_view_reports": true,
      "can_manage_integrations": true,
      "can_view_audit_trail": true
    }'
  ),
  (
    'Senior Clinician',
    'senior_clinician',
    50,
    FALSE,
    '{
      "can_view_all_signals": true,
      "can_create_signals": true,
      "can_approve_signals": false,
      "can_view_reports": true,
      "can_manage_knowledge_base": false
    }'
  ),
  (
    'Clinician',
    'clinician',
    30,
    FALSE,
    '{
      "can_view_all_signals": false,
      "can_view_department_signals": true,
      "can_create_signals": true,
      "can_approve_signals": false,
      "can_view_reports": false
    }'
  ),
  (
    'Sales Consultant',
    'sales_consultant',
    30,
    FALSE,
    '{
      "can_view_all_signals": false,
      "can_view_department_signals": true,
      "can_create_signals": true,
      "can_approve_signals": false,
      "can_view_reports": false
    }'
  ),
  (
    'Receptionist',
    'receptionist',
    20,
    FALSE,
    '{
      "can_view_all_signals": false,
      "can_view_department_signals": true,
      "can_create_signals": true,
      "can_approve_signals": false,
      "can_view_reports": false
    }'
  );

-- =============================================================================
-- ADMIN USER
-- Password: Admin13!  (hashed via pgcrypto — bcrypt compatible with Node.js)
-- =============================================================================

INSERT INTO users (
  email,
  first_name,
  last_name,
  display_name,
  job_title,
  password_hash,
  must_change_password,
  status,
  is_admin,
  staff_onboarding_completed,
  staff_onboarding_completed_at,
  role_id
) VALUES (
  'admin@edgbastonwellness.co.uk',
  'Admin',
  'User',
  'System Administrator',
  'System Administrator',
  crypt('Admin13!', gen_salt('bf', 10)),
  FALSE,
  'active',
  TRUE,
  TRUE,
  NOW(),
  (SELECT id FROM roles WHERE slug = 'system_admin')
);

-- =============================================================================
-- AI AGENTS
-- =============================================================================

INSERT INTO agents (
  agent_key,
  name,
  description,
  scope,
  domains,
  keywords,
  critical_keywords,
  is_active,
  is_catch_all,
  system_prompt
) VALUES

-- Primary Agent — supreme orchestrator
(
  'primary_agent',
  'EWC',
  'Supreme orchestrator — the clinic''s operational intelligence brain. Handles general queries, routes to specialists, monitors clinic health, and provides strategic oversight.',
  'general',
  ARRAY['operations', 'management', 'reporting', 'clinic health', 'coordination', 'overview', 'analytics'],
  ARRAY['help', 'what', 'how', 'show', 'report', 'overview', 'status', 'check', 'summary', 'analyse', 'tell me'],
  ARRAY['emergency', 'urgent', 'critical', 'safeguarding', 'serious incident'],
  TRUE,
  TRUE,
  'You are EWC (Edgbaston Wellness Clinic''s operational intelligence assistant) — a premium private wellness clinic in Edgbaston, Birmingham.

You serve the clinic''s management and staff team. Your role is to surface operational insights, monitor clinic health, and help the team make better decisions faster.

The clinic offers aesthetics (Botox, fillers, CoolSculpting), wellness (IV therapy, weight management, hormone therapy), and medical (GP, health screening) services to a discerning, high-value clientele who expect discretion and excellence.

Be precise, calm, and professional. Always prioritise patient welfare and clinic reputation.'
),

-- Sales Agent — revenue intelligence
(
  'sales_agent',
  'Orion',
  'Revenue intelligence — tracks patient leads, treatment package enquiries, booking conversion rates, and upsell opportunities for the clinic.',
  'sales',
  ARRAY['sales', 'revenue', 'bookings', 'leads', 'packages', 'conversions', 'enquiries', 'pricing', 'corporate', 'membership'],
  ARRAY['enquiry', 'lead', 'package', 'consultation', 'price', 'book', 'quote', 'buy', 'purchase', 'membership', 'corporate', 'interested', 'cost'],
  ARRAY['lost lead', 'refused', 'cancelled package', 'complaint about price', 'refund request', 'dispute'],
  TRUE,
  FALSE,
  'You are Orion, the revenue intelligence agent for Edgbaston Wellness Clinic. You monitor and manage the clinic''s revenue pipeline.

Your focus: new patient enquiries, treatment package sales, booking conversion rates, upsell opportunities, and corporate wellness contracts.

Surface signals when leads go cold, conversions drop, or revenue opportunities arise. Always frame insights in terms of patient value and long-term relationship building — not aggressive sales tactics. This is a premium clinic; the approach must match the brand.'
),

-- CRM Agent — patient relations
(
  'crm_agent',
  'Aria',
  'Patient experience intelligence — monitors satisfaction, complaints, retention risk, missed appointments, and communication quality across the clinic.',
  'patient_relations',
  ARRAY['patient experience', 'complaints', 'retention', 'satisfaction', 'communication', 'follow-up', 'feedback', 'no-show', 'cancellation'],
  ARRAY['complaint', 'unhappy', 'cancel', 'no-show', 'satisfaction', 'feedback', 'review', 'follow up', 'missed', 'rebook', 'hasn''t returned', 'response time'],
  ARRAY['legal action', 'solicitor', 'refund demand', 'serious complaint', 'emergency', 'safeguarding', 'negligence'],
  TRUE,
  FALSE,
  'You are Aria, the patient relations agent for Edgbaston Wellness Clinic. You safeguard the patient experience and protect the clinic''s reputation.

Your focus: complaint resolution, satisfaction monitoring, retention risk (patients who haven''t returned), no-show tracking, and communication SLA compliance.

When you surface signals, always suggest a next action. Prioritise patient welfare and clinic reputation above all else. Handle sensitive matters with discretion — this is a private clinic with confidentiality obligations.'
);

-- =============================================================================
-- CLINIKO INTEGRATION PLACEHOLDER
-- =============================================================================

INSERT INTO cliniko_config DEFAULT VALUES;

-- =============================================================================
-- KNOWLEDGE CATEGORIES (starter set)
-- =============================================================================

INSERT INTO knowledge_categories (name, slug, description, display_order) VALUES
  ('Clinical Protocols',   'clinical-protocols',   'Treatment protocols, clinical guidelines and safety procedures',            1),
  ('Patient Policies',     'patient-policies',     'Patient intake, consent, cancellation and confidentiality policies',        2),
  ('Pricing & Packages',   'pricing-packages',     'Treatment pricing, packages, memberships and corporate rates',              3),
  ('Staff Handbook',       'staff-handbook',       'HR policies, clinic procedures, staff guidelines and onboarding materials', 4),
  ('Marketing & Brand',    'marketing-brand',      'Brand guidelines, marketing materials and communications',                  5),
  ('Compliance & Legal',   'compliance-legal',     'Regulatory compliance, CQC requirements and legal documentation',          6);

-- =============================================================================
-- CONFIRM
-- =============================================================================

DO $$
DECLARE
  v_user_email TEXT;
  v_admin_role TEXT;
BEGIN
  SELECT email INTO v_user_email FROM users WHERE email = 'admin@edgbastonwellness.co.uk';
  SELECT slug INTO v_admin_role FROM roles WHERE slug = 'system_admin';

  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'Admin user was not created correctly';
  END IF;

  IF v_admin_role IS NULL THEN
    RAISE EXCEPTION 'System admin role was not created correctly';
  END IF;

  RAISE NOTICE '✓ Migration 014 complete';
  RAISE NOTICE '✓ Admin user: admin@edgbastonwellness.co.uk (password: Admin13!)';
  RAISE NOTICE '✓ Agents: primary_agent (EWC), sales_agent (Orion), crm_agent (Aria)';
  RAISE NOTICE '✓ Cliniko integration table ready (not yet connected)';
  RAISE NOTICE '✓ Brand: Edgbaston Wellness Clinic — Aria — #ffffff on black';
END $$;
