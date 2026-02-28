-- =====================================================
-- JWEBLY SYSTEM - Migration 002: Create Schema
-- Multi-tenant SaaS for Operational Intelligence
-- =====================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =====================================================
-- 1. INDUSTRY CONFIGURATION
-- =====================================================

CREATE TABLE industries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Industry-specific terminology mapping
    terminology JSONB DEFAULT '{}'::jsonb,

    -- Default department templates for this industry
    default_departments JSONB DEFAULT '[]'::jsonb,

    -- Industry-specific compliance requirements
    compliance_requirements JSONB DEFAULT '[]'::jsonb,

    -- Default AI tools/capabilities for this industry
    default_ai_tools JSONB DEFAULT '[]'::jsonb,

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE industries IS 'Predefined industry verticals with configuration';

-- =====================================================
-- 2. TENANTS (Organizations)
-- =====================================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry_id UUID NOT NULL REFERENCES industries(id),

    -- Basic Info
    company_name VARCHAR(255) NOT NULL,
    company_legal_name VARCHAR(255),
    company_registration_number VARCHAR(100),

    -- Contact
    primary_email VARCHAR(255) NOT NULL,
    primary_phone VARCHAR(50),
    website_url VARCHAR(500),

    -- Address
    address_line_1 VARCHAR(255),
    address_line_2 VARCHAR(255),
    city VARCHAR(100),
    region VARCHAR(100),
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'United Kingdom',

    -- Organization classification
    organization_type VARCHAR(100),
    organization_subtype VARCHAR(100),

    -- AI System Configuration
    ai_name VARCHAR(100),
    ai_persona JSONB DEFAULT '{}'::jsonb,
    brand_color VARCHAR(7),
    logo_url TEXT,
    tone VARCHAR(50),

    -- Neural Contract (system prompt)
    neural_contract JSONB DEFAULT '{}'::jsonb,

    -- Onboarding State
    onboarding_phase VARCHAR(50) DEFAULT 'pending',
    onboarding_started_at TIMESTAMPTZ,
    onboarding_completed_at TIMESTAMPTZ,

    -- Legacy: keeping for backwards compatibility during migration
    onboarding_data JSONB DEFAULT '{}'::jsonb,

    -- Subscription
    subscription_tier VARCHAR(50) DEFAULT 'trial',
    subscription_status VARCHAR(50) DEFAULT 'active',

    -- Metadata
    settings JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_industry ON tenants(industry_id);
CREATE INDEX idx_tenants_onboarding_phase ON tenants(onboarding_phase);
CREATE INDEX idx_tenants_email ON tenants(primary_email);

COMMENT ON TABLE tenants IS 'Multi-tenant organizations';

-- =====================================================
-- 3. PRE-ONBOARDING (Agency Discovery Audits)
-- =====================================================

CREATE TABLE discovery_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Discovery Call Info
    discovery_call_date DATE,
    conducted_by VARCHAR(255),
    decision_maker_name VARCHAR(255),
    decision_maker_role VARCHAR(100),
    decision_maker_email VARCHAR(255),

    -- Organization Assessment
    team_size_range VARCHAR(50),
    annual_budget_range VARCHAR(50),
    founding_year INTEGER,

    -- Current State Analysis
    current_tools JSONB DEFAULT '[]'::jsonb,
    pain_points JSONB DEFAULT '[]'::jsonb,
    bottlenecks JSONB DEFAULT '[]'::jsonb,

    -- Goals & Objectives
    primary_goals JSONB DEFAULT '[]'::jsonb,
    success_metrics JSONB DEFAULT '[]'::jsonb,

    -- Technical Assessment
    tech_stack JSONB DEFAULT '{}'::jsonb,
    integration_requirements JSONB DEFAULT '[]'::jsonb,
    data_migration_needs JSONB DEFAULT '[]'::jsonb,

    -- Compliance & Security
    compliance_requirements JSONB DEFAULT '[]'::jsonb,
    security_requirements JSONB DEFAULT '[]'::jsonb,

    -- Agency Notes
    agency_notes TEXT,
    recommended_tier VARCHAR(50),
    estimated_implementation_complexity VARCHAR(50),

    -- Status
    status VARCHAR(50) DEFAULT 'draft',
    approved_by VARCHAR(255),
    approved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discovery_audits_tenant ON discovery_audits(tenant_id);
CREATE INDEX idx_discovery_audits_status ON discovery_audits(status);

COMMENT ON TABLE discovery_audits IS 'Structured pre-onboarding audit data collected by agency';

-- =====================================================
-- 4. ACTIVATION KEYS
-- =====================================================

CREATE TABLE activation_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    key_code VARCHAR(50) UNIQUE NOT NULL,

    -- Pre-linked tenant
    tenant_id UUID REFERENCES tenants(id),

    -- Expected recipient
    intended_email VARCHAR(255),
    intended_industry_slug VARCHAR(50),
    intended_company_name VARCHAR(255),

    -- Usage
    is_used BOOLEAN DEFAULT false,
    used_at TIMESTAMPTZ,
    used_by_user_id UUID,

    -- Expiry
    expires_at TIMESTAMPTZ,

    -- Metadata
    notes TEXT,
    created_by VARCHAR(255),

    -- Legacy field for backwards compatibility
    discovery_notes JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activation_keys_code ON activation_keys(key_code);
CREATE INDEX idx_activation_keys_tenant ON activation_keys(tenant_id);
CREATE INDEX idx_activation_keys_used ON activation_keys(is_used);

COMMENT ON TABLE activation_keys IS 'One-time activation codes for tenant provisioning';

-- =====================================================
-- 5. DEPARTMENT TEMPLATES & DEPARTMENTS
-- =====================================================

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

COMMENT ON TABLE department_templates IS 'Industry-specific department templates';

CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    template_id UUID REFERENCES department_templates(id),

    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Hierarchy
    parent_department_id UUID REFERENCES departments(id),

    -- Department head
    head_user_id UUID,

    -- Custom configuration
    settings JSONB DEFAULT '{}'::jsonb,
    workflows JSONB DEFAULT '[]'::jsonb,

    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_departments_tenant ON departments(tenant_id);
CREATE INDEX idx_departments_parent ON departments(parent_department_id);

COMMENT ON TABLE departments IS 'Tenant departments/teams';

-- =====================================================
-- 6. ROLES & PERMISSIONS
-- =====================================================

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

COMMENT ON TABLE roles IS 'Tenant-specific role definitions';

-- =====================================================
-- 7. USERS
-- =====================================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    auth_id UUID UNIQUE,

    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id),
    role_id UUID REFERENCES roles(id),

    -- Profile
    email VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    display_name VARCHAR(200),
    phone VARCHAR(50),
    avatar_url TEXT,

    -- Job Info
    job_title VARCHAR(200),
    employee_id VARCHAR(100),

    -- Authentication State
    temp_password_hash TEXT,
    password_hash TEXT,
    password_changed_at TIMESTAMPTZ,
    must_change_password BOOLEAN DEFAULT true,

    -- Onboarding State
    staff_onboarding_completed BOOLEAN DEFAULT false,
    staff_onboarding_completed_at TIMESTAMPTZ,
    onboarding_responses JSONB DEFAULT '{}'::jsonb,

    -- Dashboard
    dashboard_config JSONB DEFAULT '{}'::jsonb,

    -- Status
    status VARCHAR(50) DEFAULT 'invited',
    invited_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,

    -- Flags
    is_admin BOOLEAN DEFAULT false,
    is_owner BOOLEAN DEFAULT false,

    -- Metadata
    settings JSONB DEFAULT '{}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_auth ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_status ON users(status);

COMMENT ON TABLE users IS 'Tenant users/staff members';

-- Add foreign key for department head after users table exists
ALTER TABLE departments
    ADD CONSTRAINT fk_departments_head_user
    FOREIGN KEY (head_user_id) REFERENCES users(id);

-- =====================================================
-- 8. ONBOARDING PROGRESS
-- =====================================================

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
CREATE INDEX idx_onboarding_progress_status ON onboarding_progress(status);

COMMENT ON TABLE onboarding_progress IS 'Detailed phase-by-phase onboarding tracking';

-- =====================================================
-- 9. KNOWLEDGE BASE
-- =====================================================

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

COMMENT ON TABLE knowledge_categories IS 'Document categorization for knowledge base';

CREATE TABLE knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES knowledge_categories(id),
    uploaded_by_user_id UUID REFERENCES users(id),

    -- File info
    file_name VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_size_bytes BIGINT,
    storage_path TEXT,

    -- Document metadata
    title VARCHAR(500),
    description TEXT,
    tags JSONB DEFAULT '[]'::jsonb,

    -- Processing status
    processing_status VARCHAR(50) DEFAULT 'pending',
    processed_at TIMESTAMPTZ,
    chunk_count INTEGER DEFAULT 0,

    -- Access control
    visibility VARCHAR(50) DEFAULT 'internal',
    accessible_department_ids JSONB DEFAULT '[]'::jsonb,

    -- Versioning
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES knowledge_documents(id),

    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_documents_tenant ON knowledge_documents(tenant_id);
CREATE INDEX idx_knowledge_documents_category ON knowledge_documents(category_id);
CREATE INDEX idx_knowledge_documents_status ON knowledge_documents(processing_status);

COMMENT ON TABLE knowledge_documents IS 'Documents uploaded to tenant knowledge base';

CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,

    -- Vector embedding (OpenAI ada-002 dimension)
    embedding vector(1536),

    -- Chunk metadata
    page_number INTEGER,
    section_title VARCHAR(500),

    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_chunks_document ON knowledge_chunks(document_id);
CREATE INDEX idx_knowledge_chunks_tenant ON knowledge_chunks(tenant_id);

-- Vector similarity index (uncomment after data is loaded)
-- CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks
--     USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

COMMENT ON TABLE knowledge_chunks IS 'Vector embeddings for RAG retrieval';

-- =====================================================
-- 10. INTEGRATIONS
-- =====================================================

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

COMMENT ON TABLE integration_types IS 'Available integration types';

CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    integration_type_id UUID NOT NULL REFERENCES integration_types(id),

    status VARCHAR(50) DEFAULT 'pending',

    config JSONB DEFAULT '{}'::jsonb,

    -- OAuth tokens (should be encrypted in production)
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,

    -- Sync status
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
CREATE INDEX idx_integrations_status ON integrations(status);

COMMENT ON TABLE integrations IS 'Tenant integration connections';

-- =====================================================
-- 11. AUDIT TRAIL
-- =====================================================

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
CREATE INDEX idx_audit_trail_user ON audit_trail(user_id);
CREATE INDEX idx_audit_trail_action ON audit_trail(action_type);
CREATE INDEX idx_audit_trail_created ON audit_trail(created_at DESC);

COMMENT ON TABLE audit_trail IS 'System-wide activity logging';

-- =====================================================
-- 12. SYSTEM TABLES
-- =====================================================

CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE system_settings IS 'System-wide configuration';

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

COMMENT ON TABLE agency_users IS 'Agency admin users (separate from tenant users)';

-- =====================================================
-- 13. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on tenant-scoped tables
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

-- Policy: Service role can do everything
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

-- Policy: Users can only access their own tenant's data
CREATE POLICY tenant_isolation_users ON users
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_departments ON departments
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_documents ON knowledge_documents
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_chunks ON knowledge_chunks
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

-- =====================================================
-- 14. HELPER FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to relevant tables
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_departments_updated_at BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_discovery_audits_updated_at BEFORE UPDATE ON discovery_audits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_onboarding_progress_updated_at BEFORE UPDATE ON onboarding_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_documents_updated_at BEFORE UPDATE ON knowledge_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Schema created successfully
