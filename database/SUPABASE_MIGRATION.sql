-- =====================================================
-- JWEBLY SYSTEM - COMPLETE DATABASE MIGRATION
-- Copy-paste this entire file into Supabase SQL Editor
-- WARNING: This will DELETE ALL existing data
-- =====================================================

-- =====================================================
-- PART 1: DROP EXISTING TABLES
-- =====================================================

ALTER TABLE IF EXISTS tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS activation_keys DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS staff_onboarding DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS dashboard_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS knowledge_chunks DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_trail DISABLE ROW LEVEL SECURITY;

DROP TABLE IF EXISTS knowledge_chunks CASCADE;
DROP TABLE IF EXISTS knowledge_documents CASCADE;
DROP TABLE IF EXISTS dashboard_configs CASCADE;
DROP TABLE IF EXISTS staff_onboarding CASCADE;
DROP TABLE IF EXISTS audit_trail CASCADE;
DROP TABLE IF EXISTS activation_keys CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;
DROP TABLE IF EXISTS integrations CASCADE;
DROP TABLE IF EXISTS integration_types CASCADE;
DROP TABLE IF EXISTS onboarding_progress CASCADE;
DROP TABLE IF EXISTS knowledge_categories CASCADE;
DROP TABLE IF EXISTS roles CASCADE;
DROP TABLE IF EXISTS departments CASCADE;
DROP TABLE IF EXISTS department_templates CASCADE;
DROP TABLE IF EXISTS discovery_audits CASCADE;
DROP TABLE IF EXISTS industries CASCADE;
DROP TABLE IF EXISTS agency_users CASCADE;
DROP TABLE IF EXISTS system_settings CASCADE;

DROP TYPE IF EXISTS onboarding_phase CASCADE;
DROP TYPE IF EXISTS user_status CASCADE;
DROP TYPE IF EXISTS subscription_tier CASCADE;

-- =====================================================
-- PART 2: CREATE SCHEMA
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- INDUSTRIES
CREATE TABLE industries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    terminology JSONB DEFAULT '{}'::jsonb,
    default_departments JSONB DEFAULT '[]'::jsonb,
    compliance_requirements JSONB DEFAULT '[]'::jsonb,
    default_ai_tools JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TENANTS
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry_id UUID NOT NULL REFERENCES industries(id),
    company_name VARCHAR(255) NOT NULL,
    company_legal_name VARCHAR(255),
    company_registration_number VARCHAR(100),
    primary_email VARCHAR(255) NOT NULL,
    primary_phone VARCHAR(50),
    website_url VARCHAR(500),
    address_line_1 VARCHAR(255),
    address_line_2 VARCHAR(255),
    city VARCHAR(100),
    region VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'United Kingdom',
    organization_type VARCHAR(100),
    organization_subtype VARCHAR(100),
    ai_name VARCHAR(100),
    ai_persona JSONB DEFAULT '{}'::jsonb,
    brand_color VARCHAR(7),
    logo_url TEXT,
    tone VARCHAR(50),
    neural_contract JSONB DEFAULT '{}'::jsonb,
    onboarding_phase VARCHAR(50) DEFAULT 'pending',
    onboarding_started_at TIMESTAMPTZ,
    onboarding_completed_at TIMESTAMPTZ,
    onboarding_data JSONB DEFAULT '{}'::jsonb,
    subscription_tier VARCHAR(50) DEFAULT 'trial',
    subscription_status VARCHAR(50) DEFAULT 'active',
    settings JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_industry ON tenants(industry_id);
CREATE INDEX idx_tenants_onboarding_phase ON tenants(onboarding_phase);
CREATE INDEX idx_tenants_email ON tenants(primary_email);

-- DISCOVERY AUDITS
CREATE TABLE discovery_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    discovery_call_date DATE,
    conducted_by VARCHAR(255),
    decision_maker_name VARCHAR(255),
    decision_maker_role VARCHAR(100),
    decision_maker_email VARCHAR(255),
    team_size_range VARCHAR(50),
    annual_budget_range VARCHAR(50),
    founding_year INTEGER,
    current_tools JSONB DEFAULT '[]'::jsonb,
    pain_points JSONB DEFAULT '[]'::jsonb,
    bottlenecks JSONB DEFAULT '[]'::jsonb,
    primary_goals JSONB DEFAULT '[]'::jsonb,
    success_metrics JSONB DEFAULT '[]'::jsonb,
    operational_workflows JSONB DEFAULT '{}'::jsonb,
    handover_requirements JSONB DEFAULT '{}'::jsonb,
    tech_stack JSONB DEFAULT '{}'::jsonb,
    integration_requirements JSONB DEFAULT '[]'::jsonb,
    data_migration_needs JSONB DEFAULT '[]'::jsonb,
    compliance_requirements JSONB DEFAULT '[]'::jsonb,
    security_requirements JSONB DEFAULT '[]'::jsonb,
    stakeholder_map JSONB DEFAULT '[]'::jsonb,
    agency_notes TEXT,
    recommended_tier VARCHAR(50),
    estimated_implementation_complexity VARCHAR(50),
    status VARCHAR(50) DEFAULT 'draft',
    approved_by VARCHAR(255),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discovery_audits_tenant ON discovery_audits(tenant_id);

-- ACTIVATION KEYS
CREATE TABLE activation_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_code VARCHAR(50) UNIQUE NOT NULL,
    tenant_id UUID REFERENCES tenants(id),
    intended_email VARCHAR(255),
    intended_industry_slug VARCHAR(50),
    intended_company_name VARCHAR(255),
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMPTZ,
    used_by_user_id UUID,
    expires_at TIMESTAMPTZ,
    notes TEXT,
    created_by VARCHAR(255),
    discovery_notes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activation_keys_code ON activation_keys(key_code);
CREATE INDEX idx_activation_keys_tenant ON activation_keys(tenant_id);

-- DEPARTMENT TEMPLATES
CREATE TABLE department_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry_id UUID NOT NULL REFERENCES industries(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    suggested_roles JSONB DEFAULT '[]'::jsonb,
    default_workflows JSONB DEFAULT '[]'::jsonb,
    display_order INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_department_templates_industry ON department_templates(industry_id);

-- DEPARTMENTS
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    template_id UUID REFERENCES department_templates(id),
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_department_id UUID REFERENCES departments(id),
    head_user_id UUID,
    settings JSONB DEFAULT '{}'::jsonb,
    workflows JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_departments_tenant ON departments(tenant_id);

-- ROLES
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    description TEXT,
    permission_level INTEGER DEFAULT 0,
    permissions JSONB DEFAULT '{}'::jsonb,
    is_system_role BOOLEAN DEFAULT false,
    is_admin_role BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);

-- USERS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID UNIQUE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id),
    role_id UUID REFERENCES roles(id),
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    display_name VARCHAR(200),
    phone VARCHAR(50),
    avatar_url TEXT,
    job_title VARCHAR(200),
    employee_id VARCHAR(100),
    temp_password_hash TEXT,
    password_hash TEXT,
    password_changed_at TIMESTAMPTZ,
    must_change_password BOOLEAN DEFAULT true,
    staff_onboarding_completed BOOLEAN DEFAULT false,
    staff_onboarding_completed_at TIMESTAMPTZ,
    onboarding_responses JSONB DEFAULT '{}'::jsonb,
    dashboard_config JSONB DEFAULT '{}'::jsonb,
    status VARCHAR(50) DEFAULT 'invited',
    invited_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    is_admin BOOLEAN DEFAULT false,
    is_owner BOOLEAN DEFAULT false,
    settings JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_auth ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);

ALTER TABLE departments ADD CONSTRAINT fk_departments_head_user FOREIGN KEY (head_user_id) REFERENCES users(id);

-- ONBOARDING PROGRESS
CREATE TABLE onboarding_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    phase_number INTEGER NOT NULL,
    phase_slug VARCHAR(50) NOT NULL,
    phase_name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    data JSONB DEFAULT '{}'::jsonb,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completed_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, phase_slug)
);

CREATE INDEX idx_onboarding_progress_tenant ON onboarding_progress(tenant_id);

-- KNOWLEDGE CATEGORIES
CREATE TABLE knowledge_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    description TEXT,
    parent_category_id UUID REFERENCES knowledge_categories(id),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_knowledge_categories_tenant ON knowledge_categories(tenant_id);

-- KNOWLEDGE DOCUMENTS
CREATE TABLE knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES knowledge_categories(id),
    uploaded_by_user_id UUID REFERENCES users(id),
    file_name VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_size_bytes BIGINT,
    storage_path TEXT,
    title VARCHAR(500),
    description TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    processing_status VARCHAR(50) DEFAULT 'pending',
    processed_at TIMESTAMPTZ,
    chunk_count INTEGER DEFAULT 0,
    visibility VARCHAR(50) DEFAULT 'internal',
    accessible_department_ids JSONB DEFAULT '[]'::jsonb,
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES knowledge_documents(id),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_documents_tenant ON knowledge_documents(tenant_id);

-- KNOWLEDGE CHUNKS
CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    page_number INTEGER,
    section_title VARCHAR(500),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_chunks_document ON knowledge_chunks(document_id);
CREATE INDEX idx_knowledge_chunks_tenant ON knowledge_chunks(tenant_id);

-- INTEGRATION TYPES
CREATE TABLE integration_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    config_schema JSONB DEFAULT '{}'::jsonb,
    oauth_provider VARCHAR(50),
    oauth_scopes JSONB DEFAULT '[]'::jsonb,
    icon_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INTEGRATIONS
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    integration_type_id UUID NOT NULL REFERENCES integration_types(id),
    status VARCHAR(50) DEFAULT 'pending',
    config JSONB DEFAULT '{}'::jsonb,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,
    last_sync_status VARCHAR(50),
    sync_error TEXT,
    connected_at TIMESTAMPTZ,
    connected_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, integration_type_id)
);

CREATE INDEX idx_integrations_tenant ON integrations(tenant_id);

-- AUDIT TRAIL
CREATE TABLE audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    previous_state JSONB,
    new_state JSONB,
    ip_address INET,
    user_agent TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_trail_tenant ON audit_trail(tenant_id);
CREATE INDEX idx_audit_trail_created ON audit_trail(created_at DESC);

-- SYSTEM SETTINGS
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- AGENCY USERS
CREATE TABLE agency_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(200),
    role VARCHAR(50) DEFAULT 'agent',
    permissions JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ROW LEVEL SECURITY
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON tenants FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON discovery_audits FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON departments FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON roles FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON users FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON onboarding_progress FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON knowledge_categories FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON knowledge_documents FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON knowledge_chunks FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON integrations FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON audit_trail FOR ALL TO service_role USING (true);

-- UPDATE TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- PART 3: SEED INDUSTRIES
-- =====================================================

INSERT INTO industries (slug, name, description, terminology, default_ai_tools, compliance_requirements) VALUES
('recruitment', 'Recruitment & Staffing', 'Recruitment agencies, staffing firms, talent acquisition teams',
'{"client": "candidate", "customer": "client company", "project": "placement", "meeting": "interview"}'::jsonb,
'["CV parsing", "Interview scheduling", "Candidate matching", "Pipeline analytics"]'::jsonb,
'[{"requirement": "UK GDPR", "category": "data_protection"}]'::jsonb),

('accounting', 'Accounting & Finance', 'Accounting firms, bookkeeping services, financial advisors',
'{"client": "client", "project": "engagement", "meeting": "review meeting", "deadline": "filing deadline"}'::jsonb,
'["Invoice processing", "Tax deadline tracking", "Financial reporting", "Audit trail"]'::jsonb,
'[{"requirement": "UK GDPR", "category": "data_protection"}, {"requirement": "AML", "category": "financial_regulation"}]'::jsonb),

('legal', 'Legal Services', 'Law firms, legal practices, in-house legal teams',
'{"client": "client", "project": "matter", "meeting": "consultation", "deadline": "limitation date"}'::jsonb,
'["Matter management", "Document assembly", "Deadline tracking", "Conflict checking"]'::jsonb,
'[{"requirement": "UK GDPR", "category": "data_protection"}, {"requirement": "SRA Standards", "category": "professional_regulation"}]'::jsonb),

('property', 'Real Estate & Property Management', 'Estate agents, property managers, letting agents',
'{"client": "landlord", "customer": "tenant", "project": "property", "meeting": "viewing"}'::jsonb,
'["Property listing", "Viewing scheduling", "Tenant screening", "Maintenance tracking"]'::jsonb,
'[{"requirement": "UK GDPR", "category": "data_protection"}, {"requirement": "Estate Agents Act", "category": "industry_regulation"}]'::jsonb),

('supply_chain', 'Supply Chain & Logistics', 'Logistics companies, warehousing, freight forwarding',
'{"client": "customer", "project": "shipment", "meeting": "dispatch meeting", "deadline": "delivery date"}'::jsonb,
'["Shipment tracking", "Inventory management", "Route optimization", "Exception handling"]'::jsonb,
'[{"requirement": "UK GDPR", "category": "data_protection"}, {"requirement": "Customs Compliance", "category": "international_trade"}]'::jsonb),

('education', 'Education & Charity', 'Universities, schools, student unions, charities, non-profits',
'{"client": "student", "customer": "member", "project": "initiative", "meeting": "committee meeting"}'::jsonb,
'["Event approval workflow", "Budget allocation", "Membership management", "Volunteer coordination", "Impact reporting"]'::jsonb,
'[{"requirement": "UK GDPR", "category": "data_protection"}, {"requirement": "Charity Commission Reporting", "category": "charity_compliance"}, {"requirement": "Safeguarding Policy", "category": "welfare_compliance"}]'::jsonb);

-- DEPARTMENT TEMPLATES FOR EDUCATION
INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT id, 'Leadership', 'Executive leadership and elected officers', '["President", "Vice President", "Director"]'::jsonb, 1, true FROM industries WHERE slug = 'education';
INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT id, 'Operations & Facilities', 'Building management, events logistics', '["Operations Manager", "Facilities Coordinator", "Events Officer"]'::jsonb, 2, true FROM industries WHERE slug = 'education';
INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT id, 'Student Activities', 'Societies, clubs, volunteering', '["Activities Manager", "Societies Coordinator"]'::jsonb, 3, false FROM industries WHERE slug = 'education';
INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT id, 'Welfare & Support', 'Advice services, wellbeing', '["Welfare Manager", "Advice Centre Manager"]'::jsonb, 4, false FROM industries WHERE slug = 'education';
INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT id, 'Finance & Administration', 'Budgets, HR, compliance', '["Finance Manager", "HR Officer"]'::jsonb, 5, true FROM industries WHERE slug = 'education';
INSERT INTO department_templates (industry_id, name, description, suggested_roles, display_order, is_required)
SELECT id, 'Marketing & Communications', 'Digital, campaigns, design', '["Marketing Manager", "Digital Content Officer"]'::jsonb, 6, false FROM industries WHERE slug = 'education';

-- INTEGRATION TYPES
INSERT INTO integration_types (slug, name, description, category, is_active) VALUES
('microsoft_365', 'Microsoft 365', 'Calendar, email, and document integration', 'productivity', true),
('google_workspace', 'Google Workspace', 'Calendar, email, and document integration', 'productivity', true),
('slack', 'Slack', 'Team messaging and notifications', 'communication', true),
('quickbooks', 'QuickBooks Online', 'Accounting and invoicing', 'finance', true),
('stripe', 'Stripe', 'Payment processing', 'payments', true);

-- =====================================================
-- PART 4: SEED UNIVERSITY OF OLDBURY
-- =====================================================

-- Create tenant
INSERT INTO tenants (
    id, industry_id, company_name, company_legal_name, company_registration_number,
    primary_email, primary_phone, website_url, address_line_1, address_line_2,
    city, region, postal_code, country, organization_type, organization_subtype,
    onboarding_phase, subscription_tier
)
SELECT
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    id,
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
FROM industries WHERE slug = 'education';

-- Create activation key
INSERT INTO activation_keys (
    key_code, tenant_id, intended_email, intended_industry_slug,
    intended_company_name, notes, created_by, expires_at
) VALUES (
    'JWEBLY-DEMO-2026',
    'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid,
    'joe@uoo.co.uk',
    'education',
    'University of Oldbury Students'' Guild',
    'Demo client for JWEBLY system pilot',
    'JWEBLY Agency - Joe Webster',
    '2026-12-31T23:59:59Z'
);

-- Create discovery audit with comprehensive operational data
INSERT INTO discovery_audits (
    tenant_id, discovery_call_date, conducted_by, decision_maker_name,
    decision_maker_role, decision_maker_email, team_size_range,
    annual_budget_range, founding_year, current_tools, pain_points,
    bottlenecks, primary_goals, success_metrics, operational_workflows,
    handover_requirements, integration_requirements, data_migration_needs,
    compliance_requirements, security_requirements, stakeholder_map,
    agency_notes, recommended_tier, status, approved_by, approved_at
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
    -- Current tools (9 tools across all operations)
    '[
        {"name": "Microsoft 365", "category": "productivity", "satisfaction_score": 7, "notes": "Good for email and docs, but poor for workflow automation"},
        {"name": "Trello", "category": "project_management", "satisfaction_score": 5, "notes": "Officers abandon it mid-term"},
        {"name": "WhatsApp Groups", "category": "communication", "satisfaction_score": 3, "notes": "47 different groups, context switches constantly"},
        {"name": "Google Forms", "category": "data_collection", "satisfaction_score": 4, "notes": "Data trapped in spreadsheets"},
        {"name": "QuickBooks", "category": "accounting", "satisfaction_score": 7, "notes": "Not integrated with society budgets"},
        {"name": "Canva", "category": "design", "satisfaction_score": 8, "notes": "Brand assets scattered"},
        {"name": "MailChimp", "category": "email_marketing", "satisfaction_score": 5, "notes": "Segments outdated"},
        {"name": "Paper Diary", "category": "room_booking", "satisfaction_score": 2, "notes": "Double bookings weekly"},
        {"name": "Custom WordPress", "category": "website", "satisfaction_score": 6, "notes": "No one remembers how to update plugins"}
    ]'::jsonb,
    -- Pain points across all 8 operational areas (30 pain points)
    '[
        {"description": "Society event proposals via email - lost requests and duplicates", "severity": "high", "category": "societies_activities", "impact": "20+ hours/week manual tracking", "department": "Student Activities"},
        {"description": "Society budget requests require 4-5 email exchanges", "severity": "high", "category": "societies_activities", "impact": "Societies miss event windows", "department": "Student Activities"},
        {"description": "Equipment loan tracking on paper - items go missing", "severity": "medium", "category": "societies_activities", "impact": "£3,000+ equipment replaced annually", "department": "Student Activities"},
        {"description": "BUCS fixture coordination relies on personal memory", "severity": "medium", "category": "societies_activities", "impact": "Teams forfeit matches", "department": "Student Activities"},
        {"description": "Course rep feedback never systematically analysed", "severity": "high", "category": "education_representation", "impact": "Same issues raised year after year", "department": "Student Voice"},
        {"description": "Academic appeal support - no case tracking or precedent lookup", "severity": "high", "category": "education_representation", "impact": "Inconsistent advice, students fall through gaps", "department": "Student Voice"},
        {"description": "Student feedback not correlated with course changes", "severity": "medium", "category": "education_representation", "impact": "Cannot demonstrate student voice leading to improvements", "department": "Student Voice"},
        {"description": "Advice centre cases tracked in Excel - no workflow automation", "severity": "critical", "category": "welfare_support", "impact": "Students wait 3-5 days, vulnerable cases missed", "department": "Welfare"},
        {"description": "Hardship fund applications paper-based, 2-3 week processing", "severity": "critical", "category": "welfare_support", "impact": "Students in crisis wait too long", "department": "Welfare"},
        {"description": "Safeguarding concerns logged but no pattern recognition", "severity": "critical", "category": "welfare_support", "impact": "Early warning signs missed", "department": "Welfare"},
        {"description": "Mental health first aider deployments in personal calendars", "severity": "high", "category": "welfare_support", "impact": "Burnout risk, coverage gaps", "department": "Welfare"},
        {"description": "Social media content calendar in Trello, assets in Canva, copy in Docs - nothing linked", "severity": "medium", "category": "marketing_comms", "impact": "2-3 hours daily searching", "department": "Marketing"},
        {"description": "Societies request promotional support via DMs, email, WhatsApp - requests lost", "severity": "high", "category": "marketing_comms", "impact": "Events poorly promoted", "department": "Marketing"},
        {"description": "Newsletter audience segments outdated", "severity": "medium", "category": "marketing_comms", "impact": "15% open rate", "department": "Marketing"},
        {"description": "Video archive unorganised", "severity": "low", "category": "marketing_comms", "impact": "Duplicated effort", "department": "Marketing"},
        {"description": "120+ society accounts reconciled manually - one person full-time job", "severity": "high", "category": "finance_governance", "impact": "Delayed reporting, audit risk", "department": "Finance"},
        {"description": "Expense claims via paper forms, receipts lost", "severity": "medium", "category": "finance_governance", "impact": "Staff out-of-pocket for weeks", "department": "Finance"},
        {"description": "Charity Commission reporting requires manual data gathering from 6+ sources", "severity": "high", "category": "finance_governance", "impact": "3-week annual process", "department": "Finance"},
        {"description": "Trustee meeting papers prepared manually, past decisions not searchable", "severity": "medium", "category": "finance_governance", "impact": "Decisions without historical context", "department": "Finance"},
        {"description": "Room bookings in paper diary - double bookings weekly", "severity": "high", "category": "operations_events", "impact": "Events disrupted, staff time wasted", "department": "Operations"},
        {"description": "Risk assessments filed in folders, not linked to bookings", "severity": "high", "category": "operations_events", "impact": "H&S compliance risk", "department": "Operations"},
        {"description": "Supplier contracts in filing cabinet, renewal dates missed", "severity": "medium", "category": "operations_events", "impact": "Unfavourable auto-renewals", "department": "Operations"},
        {"description": "Building maintenance requests via email, no prioritisation", "severity": "medium", "category": "operations_events", "impact": "Issues persist for months", "department": "Operations"},
        {"description": "AGM motions submitted by email, tracking ad hoc", "severity": "medium", "category": "democracy_governance", "impact": "Low engagement, legitimacy questions", "department": "Sabbatical Officers"},
        {"description": "Policy decisions not systematically recorded", "severity": "high", "category": "democracy_governance", "impact": "Re-debating settled issues", "department": "Sabbatical Officers"},
        {"description": "Election candidate management in spreadsheets", "severity": "medium", "category": "democracy_governance", "impact": "Fairness complaints", "department": "Sabbatical Officers"},
        {"description": "Sabbatical officer handover is chaotic - knowledge lost every year", "severity": "critical", "category": "handover_memory", "impact": "2-3 month productivity loss each summer", "department": "Sabbatical Officers"},
        {"description": "Each new officer reinvents processes - no record of what worked", "severity": "critical", "category": "handover_memory", "impact": "Repeated failures, wasted innovation", "department": "Sabbatical Officers"},
        {"description": "Staff knowledge concentrated in 2-3 people - bus factor of 1", "severity": "critical", "category": "handover_memory", "impact": "Organisation paralysed if key staff leave", "department": "All"},
        {"description": "Previous manifesto commitments not tracked - cannot learn from past", "severity": "high", "category": "handover_memory", "impact": "Same promises, same mistakes", "department": "Sabbatical Officers"}
    ]'::jsonb,
    -- Bottlenecks (16 process bottlenecks)
    '[
        {"process": "Society Event Approval", "department": "Student Activities", "frequency": "50+ per week", "current_lead_time": "2-3 weeks", "desired_lead_time": "24-48 hours"},
        {"process": "Society Budget Reallocation", "department": "Student Activities", "frequency": "15-20 per month", "current_lead_time": "2-4 weeks", "desired_lead_time": "1 week"},
        {"process": "Equipment Loan Request", "department": "Student Activities", "frequency": "30+ per week", "current_lead_time": "No system", "desired_lead_time": "Instant booking"},
        {"process": "Course Rep Feedback Aggregation", "department": "Student Voice", "frequency": "Termly batch", "current_lead_time": "4-6 weeks post-collection", "desired_lead_time": "Real-time theme detection"},
        {"process": "Academic Appeal Support", "department": "Student Voice", "frequency": "5-10 per week", "current_lead_time": "3-5 days", "desired_lead_time": "Same day initial assessment"},
        {"process": "Advice Centre Case Triage", "department": "Welfare", "frequency": "30-40 per week", "current_lead_time": "3-5 days", "desired_lead_time": "Same day, urgent immediate"},
        {"process": "Hardship Fund Application", "department": "Welfare", "frequency": "10-15 per week", "current_lead_time": "2-3 weeks", "desired_lead_time": "48 hours urgent, 1 week standard"},
        {"process": "Safeguarding Concern Escalation", "department": "Welfare", "frequency": "5-10 per month", "current_lead_time": "Variable", "desired_lead_time": "Automatic pattern flagging"},
        {"process": "Promotional Content Request", "department": "Marketing", "frequency": "40+ per week", "current_lead_time": "1-2 weeks", "desired_lead_time": "3 days standard"},
        {"process": "Newsletter Content Assembly", "department": "Marketing", "frequency": "Weekly", "current_lead_time": "Full day", "desired_lead_time": "Auto-aggregation"},
        {"process": "Society Account Reconciliation", "department": "Finance", "frequency": "Monthly for 120+ accounts", "current_lead_time": "3-4 days", "desired_lead_time": "Real-time"},
        {"process": "Expense Claim Processing", "department": "Finance", "frequency": "50+ per month", "current_lead_time": "2-3 weeks", "desired_lead_time": "5 working days"},
        {"process": "Room Booking Coordination", "department": "Operations", "frequency": "100+ per week", "current_lead_time": "Variable", "desired_lead_time": "Instant confirmation"},
        {"process": "Risk Assessment Review", "department": "Operations", "frequency": "20-30 per week", "current_lead_time": "3-5 days", "desired_lead_time": "24 hours for standard"},
        {"process": "AGM Motion Processing", "department": "Sabbatical Officers", "frequency": "Annual (50+ motions)", "current_lead_time": "Ad hoc", "desired_lead_time": "Structured workflow"},
        {"process": "Sabbatical Handover", "department": "Sabbatical Officers", "frequency": "Annual", "current_lead_time": "2-3 months ramp-up", "desired_lead_time": "2 weeks"}
    ]'::jsonb,
    -- Primary goals (10 goals with department ownership)
    '[
        {"goal": "Automate society event approval with intelligent routing", "priority": 1, "timeframe": "Q1 2026", "success_criteria": "80% of standard events auto-approved within 24 hours", "department": "Student Activities"},
        {"goal": "Create institutional memory system capturing decision context and outcomes", "priority": 2, "timeframe": "Q1-Q2 2026", "success_criteria": "New officers productive within 2 weeks", "department": "Sabbatical Officers"},
        {"goal": "Implement unified welfare case management with automated triage", "priority": 3, "timeframe": "Q1 2026", "success_criteria": "Same-day triage, urgent cases flagged automatically", "department": "Welfare"},
        {"goal": "Centralise all operations in single dashboard with role-based views", "priority": 4, "timeframe": "Q1-Q2 2026", "success_criteria": "100% team adoption, eliminate WhatsApp for work", "department": "All"},
        {"goal": "Automate society budget tracking with self-service requests", "priority": 5, "timeframe": "Q2 2026", "success_criteria": "Societies track own budgets, requests in 1 week", "department": "Finance"},
        {"goal": "Implement digital room booking with conflict prevention", "priority": 6, "timeframe": "Q1 2026", "success_criteria": "Zero double bookings", "department": "Operations"},
        {"goal": "Build course rep feedback analytics with theme detection", "priority": 7, "timeframe": "Q2 2026", "success_criteria": "Real-time dashboard of student concerns", "department": "Student Voice"},
        {"goal": "Create content request workflow with asset management", "priority": 8, "timeframe": "Q2 2026", "success_criteria": "Requests processed in 3 days", "department": "Marketing"},
        {"goal": "Implement transparent audit trail for all transactions", "priority": 9, "timeframe": "Q2 2026", "success_criteria": "Audit prep reduced to 1 week", "department": "Finance"},
        {"goal": "Build student engagement analytics for funding evidence", "priority": 10, "timeframe": "Q3 2026", "success_criteria": "Automated impact reports", "department": "All"}
    ]'::jsonb,
    -- Success metrics (12 measurable KPIs)
    '[
        {"metric": "Event approval turnaround", "target": "< 24 hours", "current_baseline": "2-3 weeks", "department": "Student Activities"},
        {"metric": "Society budget request resolution", "target": "< 1 week", "current_baseline": "2-4 weeks", "department": "Finance"},
        {"metric": "Welfare case initial response", "target": "Same day", "current_baseline": "3-5 days", "department": "Welfare"},
        {"metric": "Hardship fund processing", "target": "48 hours urgent", "current_baseline": "2-3 weeks", "department": "Welfare"},
        {"metric": "Sabbatical officer ramp-up time", "target": "2 weeks", "current_baseline": "2-3 months", "department": "Sabbatical Officers"},
        {"metric": "Room booking double-bookings", "target": "0%", "current_baseline": "5-10 per week", "department": "Operations"},
        {"metric": "Work WhatsApp messages", "target": "0", "current_baseline": "200+ per day", "department": "All"},
        {"metric": "Budget audit prep time", "target": "1 week", "current_baseline": "3 weeks", "department": "Finance"},
        {"metric": "Society account reconciliation", "target": "Real-time", "current_baseline": "3-4 days/month", "department": "Finance"},
        {"metric": "Promotional content fulfilment", "target": "3 days", "current_baseline": "1-2 weeks", "department": "Marketing"},
        {"metric": "Course rep feedback analysis", "target": "Real-time", "current_baseline": "4-6 weeks", "department": "Student Voice"},
        {"metric": "Institutional knowledge retrieval", "target": "< 30 seconds", "current_baseline": "Not possible", "department": "All"}
    ]'::jsonb,
    -- Operational workflows per department
    '{
        "societies_activities": {
            "description": "Managing 120+ societies and 15 sports clubs",
            "daily_tasks": ["Process event submissions (10-15/day)", "Answer society queries (20-30/day)", "Coordinate equipment loans"],
            "weekly_tasks": ["Committee meetings", "BUCS coordination", "Budget reallocations"],
            "key_decisions": ["Event approval", "Budget allocation", "Society recognition"],
            "handover_critical": true
        },
        "education_representation": {
            "description": "Academic representation and student voice",
            "daily_tasks": ["Monitor feedback channels", "Support appeal cases"],
            "weekly_tasks": ["Course rep meetings", "Feedback aggregation", "Policy response drafting"],
            "key_decisions": ["Appeal prioritisation", "Which themes to escalate"],
            "handover_critical": true
        },
        "welfare_support": {
            "description": "Student welfare and support services",
            "daily_tasks": ["Advice appointments (8-10/day)", "Query triage", "Safeguarding logs"],
            "weekly_tasks": ["Case review", "Welfare campaigns", "Multi-agency meetings"],
            "key_decisions": ["Case triage", "Safeguarding escalation", "Hardship allocation"],
            "handover_critical": true,
            "sensitivity": "high"
        },
        "marketing_comms": {
            "description": "Communications and content creation",
            "daily_tasks": ["Social media posting", "Content triage", "Analytics monitoring"],
            "weekly_tasks": ["Newsletter", "Content calendar", "Video production"],
            "key_decisions": ["Content prioritisation", "Crisis communication"],
            "handover_critical": false
        },
        "finance_governance": {
            "description": "Financial management and compliance",
            "daily_tasks": ["Invoice processing", "Society payment queries", "Budget monitoring"],
            "weekly_tasks": ["Account reconciliation", "Expense claims", "Trustee papers"],
            "key_decisions": ["Payment authorisation", "Budget virement"],
            "handover_critical": false
        },
        "operations_facilities": {
            "description": "Building, events, and logistics",
            "daily_tasks": ["Room bookings (20+/day)", "Maintenance logging", "H&S checks"],
            "weekly_tasks": ["Large event coordination", "Supplier review", "Risk assessments"],
            "key_decisions": ["Room conflicts", "Maintenance priority", "Event feasibility"],
            "handover_critical": false
        },
        "democracy_governance": {
            "description": "Democratic processes and governance",
            "daily_tasks": ["Policy queries", "Governance monitoring"],
            "weekly_tasks": ["Officer meetings", "Committee papers"],
            "annual_critical": ["AGM coordination", "Elections", "Annual report"],
            "key_decisions": ["Constitutional interpretation", "Policy implementation"],
            "handover_critical": true
        }
    }'::jsonb,
    -- Handover requirements (the killer feature context)
    '{
        "description": "Critical institutional memory needs for annual officer transition",
        "current_state": {
            "handover_period": "2 weeks in July (insufficient)",
            "documentation": "Ad hoc Word documents, often not completed",
            "knowledge_transfer": "Verbal briefings, easily forgotten",
            "system_access": "Credentials on sticky notes"
        },
        "desired_state": {
            "handover_period": "Continuous knowledge capture, 2-week structured transition",
            "documentation": "Living documents auto-updated with decision context",
            "knowledge_transfer": "Queryable institutional memory",
            "system_access": "Automated credential rotation"
        },
        "key_knowledge_to_capture": [
            "Why decisions were made, not just what",
            "What was tried and did not work",
            "Key stakeholder relationships",
            "Precedents for similar situations",
            "Ongoing negotiations and history",
            "Unwritten rules and conventions",
            "What manifesto commitments meant in practice"
        ],
        "handover_documents_needed": [
            "Role-specific operational guide",
            "Key contact relationships map",
            "Ongoing project status",
            "Budget and financial position",
            "Pending decisions with context",
            "Known upcoming challenges",
            "What I wish I had known"
        ]
    }'::jsonb,
    -- Integration requirements
    '[
        {"system": "Microsoft 365", "priority": "critical", "purpose": "Calendar sync, email, SSO, document access", "notes": "University provides licenses"},
        {"system": "QuickBooks Online", "priority": "high", "purpose": "Two-way budget sync, invoice automation", "notes": "Must sync society sub-accounts"},
        {"system": "University Student Records API", "priority": "medium", "purpose": "Verify student status for membership", "notes": "University IT approval needed - GDPR considerations"},
        {"system": "Stripe", "priority": "medium", "purpose": "Society payment tracking, ticketing reconciliation", "notes": "Already have Stripe Connect"},
        {"system": "Canva", "priority": "low", "purpose": "Asset management integration", "notes": "Team already proficient"}
    ]'::jsonb,
    -- Data migration needs
    '[
        {"source": "Legacy Access Database", "data_type": "Society memberships (5 years)", "record_count": "~8,500", "priority": "high", "notes": "15 years old, needs cleanup"},
        {"source": "Trello Boards", "data_type": "Historical events and decisions", "record_count": "~2,000 cards", "priority": "medium", "notes": "Many boards abandoned"},
        {"source": "SharePoint", "data_type": "Policy documents and templates", "record_count": "~500 documents", "priority": "high", "notes": "Folder structure chaotic"},
        {"source": "QuickBooks", "data_type": "Financial transactions (3 years)", "record_count": "~15,000", "priority": "medium", "notes": "For pattern recognition"},
        {"source": "Email Archives", "data_type": "Key decision threads", "record_count": "TBD", "priority": "low", "notes": "Selective import for context"}
    ]'::jsonb,
    -- Compliance requirements
    '[
        {"requirement": "UK GDPR", "category": "data_protection", "notes": "Student data is personal data, special category data in welfare"},
        {"requirement": "Charity Commission Reporting", "category": "financial_compliance", "notes": "Annual returns required, public benefit demonstration"},
        {"requirement": "University Data Sharing Agreement", "category": "institutional_compliance", "notes": "Joint controller scenarios"},
        {"requirement": "Safeguarding Policy", "category": "welfare_compliance", "notes": "DBS checks for relevant roles"},
        {"requirement": "NUS Affiliation", "category": "organisational_compliance", "notes": "Democratic standards for affiliation"},
        {"requirement": "Education Act Compliance", "category": "legal", "notes": "Student union charitable status requirements"}
    ]'::jsonb,
    -- Security requirements
    '[
        {"requirement": "MFA for all staff accounts", "priority": "critical"},
        {"requirement": "Data residency in UK/EU", "priority": "high"},
        {"requirement": "Role-based access control", "priority": "critical"},
        {"requirement": "Audit logging for sensitive data access", "priority": "high"},
        {"requirement": "Annual penetration testing", "priority": "medium"},
        {"requirement": "Encryption at rest and in transit", "priority": "critical"},
        {"requirement": "Automated credential rotation on role changes", "priority": "high"}
    ]'::jsonb,
    -- Stakeholder map
    '[
        {"name": "Sarah Thompson", "role": "Guild President", "influence": "high", "interest": "high", "engagement": "Champion", "notes": "Term ends July 2026"},
        {"name": "David Chen", "role": "Operations Manager", "influence": "high", "interest": "medium", "engagement": "Cautious supporter", "notes": "15 years institutional knowledge"},
        {"name": "Rachel Williams", "role": "Finance Manager", "influence": "high", "interest": "high", "engagement": "Strong supporter", "notes": "12 years experience, owns compliance"},
        {"name": "Laura Martinez", "role": "Activities Manager", "influence": "medium", "interest": "high", "engagement": "Enthusiastic", "notes": "Primary daily user for societies"},
        {"name": "University IT", "role": "External stakeholder", "influence": "medium", "interest": "low", "engagement": "Gatekeeping", "notes": "Must work within security requirements"},
        {"name": "Trustee Board", "role": "Governance", "influence": "high", "interest": "medium", "engagement": "Need visibility", "notes": "Must approve significant spend"}
    ]'::jsonb,
    -- Agency notes (comprehensive discovery insight)
    E'University of Oldbury Students'' Guild serves ~12,000 students. 5 elected sabbatical officers (change annually) plus 18 permanent staff. Manages 120 societies and 15 sports clubs.\n\nTHE KILLER INSIGHT: Every July, 5 new officers arrive knowing nothing. They spend 2-3 months learning how things work. By the time they are effective, they are planning their exit. Permanent staff (David, Rachel) carry everything but are stretched thin and becoming single points of failure.\n\nJWEBLY is not just about workflows - it is about building an organisational brain that remembers what people forget. Every decision, every context, every why we do it this way captured and queryable.\n\nSarah Thompson (President) is highly motivated and technically literate. Wants legacy system before July 2026. Permanent staff burned by past digital transformation attempts that were abandoned when championing officers left.\n\nRECOMMENDED APPROACH:\n1. Quick win: Society event approval workflow\n2. Foundation: Room booking system\n3. Strategic: Knowledge base with context capture\n4. Critical path: Handover system ready before July 2026\n\nRISKS:\n- Sarah leaves before system embedded - mitigation: David/Rachel as co-owners\n- Scope creep from officer enthusiasm - mitigation: phased rollout\n- University IT blocking integrations - mitigation: work standalone first\n- Staff resistance to another system - mitigation: show immediate value',
    'professional',
    'approved',
    'Joe Webster',
    '2026-01-30T14:30:00Z'
);

-- Create default roles for tenant
INSERT INTO roles (tenant_id, name, slug, description, permission_level, is_system_role, is_admin_role) VALUES
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Owner', 'owner', 'Full system access', 100, true, true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Administrator', 'admin', 'Administrative access', 90, true, true),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Manager', 'manager', 'Department management', 70, true, false),
('a1b2c3d4-e5f6-7890-abcd-ef1234567890'::uuid, 'Staff Member', 'staff', 'Standard staff access', 30, true, false);

-- =====================================================
-- DONE! Test with:
-- Activation Key: JWEBLY-DEMO-2026
-- Admin Email: joe@uoo.co.uk
-- =====================================================
