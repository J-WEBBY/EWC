-- =====================================================
-- JWEBLY SYSTEM - Migration 004: Seed University of Oldbury
-- Test tenant for Education/Charity vertical
-- =====================================================

-- Create the tenant
INSERT INTO tenants (
    id,
    industry_id,
    company_name,
    company_legal_name,
    company_registration_number,
    primary_email,
    primary_phone,
    website_url,
    address_line_1,
    address_line_2,
    city,
    region,
    postal_code,
    country,
    organization_type,
    organization_subtype,
    onboarding_phase,
    subscription_tier
)
SELECT
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    i.id,
    'University of Oldbury Students'' Guild',
    'University of Oldbury Students'' Guild Ltd',
    'RC000842',
    'joe@uoo.co.uk',
    '+44 121 555 0142',
    'https://guild.uoo.ac.uk',
    'Guild House',
    'University Campus, Oldbury Road',
    'Oldbury',
    'West Midlands',
    'B69 4PL',
    'United Kingdom',
    'student_union',
    'university_guild',
    'pending',
    'professional'
FROM industries i
WHERE i.slug = 'education';

-- Create the activation key
INSERT INTO activation_keys (
    key_code,
    tenant_id,
    intended_email,
    intended_industry_slug,
    intended_company_name,
    notes,
    created_by,
    expires_at
) VALUES (
    'JWEBLY-DEMO-2026',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    'joe@uoo.co.uk',
    'education',
    'University of Oldbury Students'' Guild',
    'Demo client for JWEBLY system pilot. First education sector deployment.',
    'JWEBLY Agency - Joe Webster',
    '2026-12-31T23:59:59Z'
);

-- Create the discovery audit
INSERT INTO discovery_audits (
    tenant_id,
    discovery_call_date,
    conducted_by,
    decision_maker_name,
    decision_maker_role,
    decision_maker_email,
    team_size_range,
    annual_budget_range,
    founding_year,
    current_tools,
    pain_points,
    bottlenecks,
    primary_goals,
    success_metrics,
    tech_stack,
    integration_requirements,
    data_migration_needs,
    compliance_requirements,
    security_requirements,
    agency_notes,
    recommended_tier,
    estimated_implementation_complexity,
    status,
    approved_by,
    approved_at
) VALUES (
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    '2026-01-28',
    'Joe Webster',
    'Sarah Thompson',
    'Guild President',
    's.thompson@uoo.ac.uk',
    '11-50',
    '£250,000-£500,000',
    1967,
    '[
        {"name": "Microsoft 365", "category": "productivity", "satisfaction_score": 7, "notes": "Good for email and docs, but poor for workflow automation"},
        {"name": "Trello", "category": "project_management", "satisfaction_score": 5, "notes": "Team rarely updates boards, becomes stale quickly"},
        {"name": "WhatsApp Groups", "category": "communication", "satisfaction_score": 3, "notes": "Chaotic, messages get lost, no accountability"},
        {"name": "Google Forms", "category": "data_collection", "satisfaction_score": 4, "notes": "Basic but limited analysis capabilities"},
        {"name": "Custom WordPress", "category": "website", "satisfaction_score": 6, "notes": "Functional but outdated, hard to maintain"},
        {"name": "QuickBooks", "category": "accounting", "satisfaction_score": 7, "notes": "Works well but not integrated with other systems"}
    ]'::jsonb,
    '[
        {"description": "Student societies submit event proposals via email, leading to lost requests and duplicate submissions", "severity": "high", "category": "process_inefficiency", "impact": "20+ hours/week spent on manual tracking"},
        {"description": "No centralised view of all guild activities - information scattered across email, Trello, and WhatsApp", "severity": "high", "category": "information_silos", "impact": "Decisions made with incomplete information"},
        {"description": "Budget allocation for societies is done manually in spreadsheets with no audit trail", "severity": "medium", "category": "compliance_risk", "impact": "Annual audit takes 3 weeks"},
        {"description": "Sabbatical officer handover is chaotic - institutional knowledge lost every year", "severity": "critical", "category": "knowledge_management", "impact": "2-3 month productivity loss each summer"},
        {"description": "Cannot track student engagement across different guild services", "severity": "medium", "category": "data_gaps", "impact": "Funding applications lack evidence of impact"},
        {"description": "Volunteer coordination relies on memory and informal communication", "severity": "medium", "category": "process_inefficiency", "impact": "Events understaffed, last-minute scrambles common"}
    ]'::jsonb,
    '[
        {"process": "Society Event Approval", "impact": "Events cancelled due to late approvals", "frequency": "Weekly", "current_lead_time": "2-3 weeks", "desired_lead_time": "48 hours"},
        {"process": "Budget Reallocation Requests", "impact": "Societies miss opportunities", "frequency": "Monthly", "current_lead_time": "2-4 weeks", "desired_lead_time": "1 week"},
        {"process": "Room Booking Coordination", "impact": "Double bookings, wasted prep time", "frequency": "Daily", "current_lead_time": "Variable - no system", "desired_lead_time": "Instant confirmation"},
        {"process": "Welfare Referral Processing", "impact": "Students wait too long for support", "frequency": "10-15 per week", "current_lead_time": "3-5 days", "desired_lead_time": "Same day triage"}
    ]'::jsonb,
    '[
        {"goal": "Automate society event approval workflow", "priority": 1, "timeframe": "Q1 2026", "success_criteria": "80% of standard events auto-approved within 24 hours"},
        {"goal": "Create institutional memory system for sabbatical handover", "priority": 2, "timeframe": "Q2 2026", "success_criteria": "New officers productive within 2 weeks"},
        {"goal": "Centralise all guild operations in single dashboard", "priority": 3, "timeframe": "Q1-Q2 2026", "success_criteria": "100% team adoption, eliminate WhatsApp for work"},
        {"goal": "Implement transparent budget tracking with audit trail", "priority": 4, "timeframe": "Q2 2026", "success_criteria": "Real-time budget visibility, audit prep reduced to 1 week"},
        {"goal": "Build student engagement analytics for funding evidence", "priority": 5, "timeframe": "Q3 2026", "success_criteria": "Automated impact reports for grant applications"}
    ]'::jsonb,
    '[
        {"metric": "Event approval turnaround time", "target": "< 24 hours for standard events", "current_baseline": "2-3 weeks average"},
        {"metric": "Team WhatsApp messages for work", "target": "0 (all work comms in system)", "current_baseline": "200+ messages/day"},
        {"metric": "Sabbatical officer ramp-up time", "target": "2 weeks to full productivity", "current_baseline": "2-3 months"},
        {"metric": "Budget audit preparation time", "target": "1 week", "current_baseline": "3 weeks"},
        {"metric": "Student welfare triage time", "target": "Same day", "current_baseline": "3-5 days"}
    ]'::jsonb,
    '{
        "email": "Microsoft 365 / Outlook",
        "calendar": "Outlook Calendar (shared)",
        "documents": "SharePoint + OneDrive",
        "website": "WordPress (self-hosted)",
        "accounting": "QuickBooks Online",
        "payments": "Stripe (for society payments)",
        "membership_database": "Custom Access database (legacy)",
        "room_booking": "Paper diary + shared Excel",
        "social_media": "Native apps (Instagram, TikTok, X)"
    }'::jsonb,
    '[
        {"system": "Microsoft 365", "priority": "critical", "purpose": "Calendar sync, email integration, SSO", "notes": "University provides M365 licenses"},
        {"system": "QuickBooks Online", "priority": "high", "purpose": "Two-way budget sync, invoice automation", "notes": "Need read/write access"},
        {"system": "University Student Records API", "priority": "medium", "purpose": "Verify student status for membership", "notes": "University IT approval required - process started"},
        {"system": "Stripe", "priority": "medium", "purpose": "Society payment tracking", "notes": "Already have Stripe Connect setup"}
    ]'::jsonb,
    '[
        {"source": "Legacy Access Database", "data_type": "Student society memberships (5 years)", "record_count": "~8,500 records", "priority": "high", "notes": "Database is 15 years old, needs cleanup"},
        {"source": "Trello Boards", "data_type": "Historical event records and notes", "record_count": "~2,000 cards", "priority": "medium", "notes": "Extract insights for knowledge base"},
        {"source": "SharePoint", "data_type": "Policy documents, procedures, templates", "record_count": "~500 documents", "priority": "high", "notes": "Need full text search capability"}
    ]'::jsonb,
    '[
        {"requirement": "UK GDPR", "category": "data_protection", "notes": "Student data is personal data under GDPR"},
        {"requirement": "Charity Commission Reporting", "category": "financial_compliance", "notes": "Registered charity - annual returns required"},
        {"requirement": "University Data Sharing Agreement", "category": "institutional_compliance", "notes": "Must comply with university data governance"},
        {"requirement": "Safeguarding Policy", "category": "welfare_compliance", "notes": "Working with vulnerable students - DBS checks for relevant roles"}
    ]'::jsonb,
    '[
        {"requirement": "MFA for all staff accounts", "priority": "critical"},
        {"requirement": "Data residency in UK/EU", "priority": "high"},
        {"requirement": "Annual penetration testing", "priority": "medium"},
        {"requirement": "Encryption at rest and in transit", "priority": "critical"}
    ]'::jsonb,
    'University of Oldbury Students'' Guild is a well-established student union serving approximately 12,000 students. They have 5 elected sabbatical officers (full-time paid positions for students) who change annually, plus 18 permanent staff members. The organisation has significant challenges with knowledge transfer due to the annual turnover of leadership.

The Guild manages approximately 120 student societies and 15 sports clubs, each with their own budgets, events, and leadership. Event coordination is their biggest operational headache.

Sarah Thompson (Guild President) is highly motivated and technically literate. She''s in her final year and wants to leave a ''lasting legacy system'' before her term ends in July 2026. This creates both urgency and risk - we need to ensure handover documentation is excellent.

The permanent staff, particularly David Chen (Operations Manager) and Rachel Williams (Finance Manager), are the institutional memory. They are supportive but have been burned by past ''digital transformation'' attempts that were abandoned.

Recommend starting with society event approval workflow as quick win, then building out knowledge base functionality before the July handover period.

Potential case study opportunity if successful - education sector is underserved by operational intelligence tools.',
    'professional',
    'medium',
    'approved',
    'Joe Webster',
    '2026-01-30T14:30:00Z'
);

-- Create default system roles for the tenant
INSERT INTO roles (tenant_id, name, slug, description, permission_level, is_system_role, is_admin_role) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Owner', 'owner', 'Full system access and configuration', 100, true, true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Administrator', 'admin', 'Administrative access excluding billing', 90, true, true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Manager', 'manager', 'Department management and reporting', 70, true, false),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Coordinator', 'coordinator', 'Day-to-day operational tasks', 50, true, false),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Staff Member', 'staff', 'Standard staff access', 30, true, false),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Elected Officer', 'elected_officer', 'Sabbatical officer access level', 80, true, false);

-- Create departments for the tenant
INSERT INTO departments (id, tenant_id, name, description, display_order, is_active, template_id)
SELECT
    gen_random_uuid(),
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    dt.name,
    dt.description,
    dt.display_order,
    true,
    dt.id
FROM department_templates dt
JOIN industries i ON dt.industry_id = i.id
WHERE i.slug = 'education';

-- Get department IDs for user assignment
DO $$
DECLARE
    dept_sabbatical UUID;
    dept_operations UUID;
    dept_activities UUID;
    dept_welfare UUID;
    dept_finance UUID;
    dept_marketing UUID;
    role_owner UUID;
    role_admin UUID;
    role_manager UUID;
    role_coordinator UUID;
    role_staff UUID;
    role_elected UUID;
BEGIN
    -- Get department IDs
    SELECT id INTO dept_sabbatical FROM departments WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Leadership';
    SELECT id INTO dept_operations FROM departments WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Operations & Facilities';
    SELECT id INTO dept_activities FROM departments WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Student Activities';
    SELECT id INTO dept_welfare FROM departments WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Welfare & Support';
    SELECT id INTO dept_finance FROM departments WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Finance & Administration';
    SELECT id INTO dept_marketing FROM departments WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Marketing & Communications';

    -- Get role IDs
    SELECT id INTO role_owner FROM roles WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND slug = 'owner';
    SELECT id INTO role_admin FROM roles WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND slug = 'admin';
    SELECT id INTO role_manager FROM roles WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND slug = 'manager';
    SELECT id INTO role_coordinator FROM roles WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND slug = 'coordinator';
    SELECT id INTO role_staff FROM roles WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND slug = 'staff';
    SELECT id INTO role_elected FROM roles WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND slug = 'elected_officer';

    -- Create staff members
    -- Sabbatical Officers
    INSERT INTO users (tenant_id, department_id, role_id, email, first_name, last_name, job_title, is_admin, is_owner, status, metadata) VALUES
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_sabbatical, role_elected, 's.thompson@uoo.ac.uk', 'Sarah', 'Thompson', 'Guild President', true, false, 'invited', '{"notes": "Decision maker. Final year Politics & International Relations. Term ends July 2026."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_sabbatical, role_elected, 'j.okonkwo@uoo.ac.uk', 'James', 'Okonkwo', 'VP Education', false, false, 'invited', '{"notes": "Final year Law. Focuses on academic representation and course reps."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_sabbatical, role_elected, 'a.patel@uoo.ac.uk', 'Aisha', 'Patel', 'VP Welfare', false, false, 'invited', '{"notes": "Final year Psychology. Leads welfare campaigns and advice services oversight."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_sabbatical, role_elected, 'm.jones@uoo.ac.uk', 'Marcus', 'Jones', 'VP Activities', false, false, 'invited', '{"notes": "Final year Sports Science. Oversees societies and sports clubs."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_sabbatical, role_elected, 'e.chen@uoo.ac.uk', 'Emily', 'Chen', 'VP Community', false, false, 'invited', '{"notes": "Final year Environmental Science. Focus on sustainability and local community."}'::jsonb),

    -- Operations & Facilities
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_operations, role_admin, 'd.chen@guild.uoo.ac.uk', 'David', 'Chen', 'Operations Manager', true, false, 'invited', '{"notes": "15 years at Guild. Institutional memory. Key stakeholder for system adoption."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_operations, role_coordinator, 'k.williams@guild.uoo.ac.uk', 'Karen', 'Williams', 'Facilities Coordinator', false, false, 'invited', '{"notes": "Manages room bookings, building maintenance, health & safety."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_operations, role_coordinator, 't.ahmed@guild.uoo.ac.uk', 'Tariq', 'Ahmed', 'Events Officer', false, false, 'invited', '{"notes": "Coordinates large-scale guild events, freshers'' week, graduation ball."}'::jsonb),

    -- Student Activities
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_activities, role_manager, 'l.martinez@guild.uoo.ac.uk', 'Laura', 'Martinez', 'Activities Manager', true, false, 'invited', '{"notes": "Oversees all 120 societies and 15 sports clubs. Critical role for event workflow."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_activities, role_coordinator, 'r.singh@guild.uoo.ac.uk', 'Raj', 'Singh', 'Societies Coordinator', false, false, 'invited', '{"notes": "Day-to-day society support, budget queries, event approvals."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_activities, role_coordinator, 'c.brown@guild.uoo.ac.uk', 'Chris', 'Brown', 'Sports Development Officer', false, false, 'invited', '{"notes": "Works with BUCS teams and recreational sports."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_activities, role_coordinator, 'n.taylor@guild.uoo.ac.uk', 'Natalie', 'Taylor', 'Volunteering Coordinator', false, false, 'invited', '{"notes": "Runs Guild volunteer programme, community partnerships."}'::jsonb),

    -- Finance & Administration
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_finance, role_admin, 'r.williams@guild.uoo.ac.uk', 'Rachel', 'Williams', 'Finance Manager', true, false, 'invited', '{"notes": "12 years at Guild. Manages all budgets, society accounts, compliance."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_finance, role_staff, 'p.green@guild.uoo.ac.uk', 'Peter', 'Green', 'Finance Assistant', false, false, 'invited', '{"notes": "Invoice processing, expense claims, budget monitoring."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_finance, role_staff, 'h.jackson@guild.uoo.ac.uk', 'Helen', 'Jackson', 'HR & Admin Officer', false, false, 'invited', '{"notes": "Staff HR, student staff contracts, governance support."}'::jsonb),

    -- Welfare & Support
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_welfare, role_manager, 'm.scott@guild.uoo.ac.uk', 'Michael', 'Scott', 'Welfare Manager', false, false, 'invited', '{"notes": "Manages advice centre and welfare referrals."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_welfare, role_coordinator, 's.lee@guild.uoo.ac.uk', 'Sophie', 'Lee', 'Advice Centre Manager', false, false, 'invited', '{"notes": "Academic appeals, housing advice, financial hardship."}'::jsonb),

    -- Marketing & Communications
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_marketing, role_manager, 'j.davis@guild.uoo.ac.uk', 'Jennifer', 'Davis', 'Marketing Manager', false, false, 'invited', '{"notes": "Brand management, campaign planning, analytics."}'::jsonb),
    ('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, dept_marketing, role_staff, 'a.wilson@guild.uoo.ac.uk', 'Alex', 'Wilson', 'Digital Content Officer', false, false, 'invited', '{"notes": "Social media, website updates, email newsletters."}'::jsonb);

    -- Set department heads
    UPDATE departments SET head_user_id = (SELECT id FROM users WHERE email = 's.thompson@uoo.ac.uk') WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Leadership';
    UPDATE departments SET head_user_id = (SELECT id FROM users WHERE email = 'd.chen@guild.uoo.ac.uk') WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Operations & Facilities';
    UPDATE departments SET head_user_id = (SELECT id FROM users WHERE email = 'l.martinez@guild.uoo.ac.uk') WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Student Activities';
    UPDATE departments SET head_user_id = (SELECT id FROM users WHERE email = 'r.williams@guild.uoo.ac.uk') WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Finance & Administration';
    UPDATE departments SET head_user_id = (SELECT id FROM users WHERE email = 'm.scott@guild.uoo.ac.uk') WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Welfare & Support';
    UPDATE departments SET head_user_id = (SELECT id FROM users WHERE email = 'j.davis@guild.uoo.ac.uk') WHERE tenant_id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid AND name = 'Marketing & Communications';
END $$;

-- Create knowledge base categories for the tenant
INSERT INTO knowledge_categories (tenant_id, name, slug, description, display_order) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Governance', 'governance', 'Constitution, bylaws, trustee documents, AGM records', 1),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Policies & Procedures', 'policies', 'HR policies, safeguarding, health & safety, data protection', 2),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Society Management', 'societies', 'Society handbook, event guidelines, budget allocation rules', 3),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Finance', 'finance', 'Budget templates, expense procedures, audit reports', 4),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Training Materials', 'training', 'Staff induction, officer training, volunteer guides', 5),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Templates', 'templates', 'Letter templates, form templates, contract templates', 6),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Handover Documents', 'handover', 'Role-specific handover notes, project histories, lessons learned', 7),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'External Guidelines', 'external', 'University policies, NUS resources, legal guidance', 8);

-- Create initial onboarding progress records
INSERT INTO onboarding_progress (tenant_id, phase_number, phase_slug, phase_name, status) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 1, 'identity', 'Identity Mirror', 'pending'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 2, 'branding', 'Brand Architecture', 'pending'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 3, 'deep_probe', 'Deep Probe', 'pending'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 4, 'neural_handshake', 'Neural Handshake', 'pending'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 5, 'structure_mapping', 'Structure Mapping', 'pending'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 6, 'credential_layer', 'Credential Layer', 'pending'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 7, 'knowledge_base', 'Knowledge Base', 'pending'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 8, 'vector_redlines', 'Vector Redlines', 'pending'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 9, 'system_integration', 'System Integration', 'pending'),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 10, 'deployment', 'Deployment', 'pending');

-- Log the creation in audit trail
INSERT INTO audit_trail (tenant_id, action_type, resource_type, resource_id, details) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'tenant.seeded', 'tenant', 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
'{"message": "University of Oldbury Students'' Guild tenant created from seed data", "seeded_by": "database migration", "staff_count": 19, "departments_count": 8}'::jsonb);

-- University of Oldbury Students' Guild tenant seeded successfully
-- Activation Key: JWEBLY-DEMO-2026
-- Admin Email: joe@uoo.co.uk
-- Staff Members: 19
-- Departments: 8
