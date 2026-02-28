# JWEBLY System Database Schema Design

## Overview

Multi-tenant SaaS platform for operational intelligence across 6 industries:
- Recruitment
- Accounting
- Law
- Real Estate & Property Management
- Supply Chain & Logistics
- Education & Charity

## Hierarchy

```
Industries (predefined)
    └── Tenants (organizations)
            └── Departments/Teams (hybrid: templates + custom)
                    └── Users (staff/admin)
```

## Schema Design

### 1. INDUSTRY CONFIGURATION

```sql
-- Predefined industry list with configuration
CREATE TABLE industries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL, -- 'education', 'recruitment', etc.
    name VARCHAR(100) NOT NULL,       -- 'Education & Charity'
    description TEXT,

    -- Industry-specific terminology
    terminology JSONB DEFAULT '{}',   -- {"member": "student", "client": "applicant"}

    -- Default department templates for this industry
    default_departments JSONB DEFAULT '[]',

    -- Industry-specific compliance requirements
    compliance_requirements JSONB DEFAULT '[]',

    -- Default AI tools/capabilities for this industry
    default_ai_tools JSONB DEFAULT '[]',

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 2. TENANTS (Organizations)

```sql
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
    region VARCHAR(100),  -- county/state
    postal_code VARCHAR(20),
    country VARCHAR(100) DEFAULT 'United Kingdom',

    -- Organization Type (for Education: university, school, charity, etc.)
    organization_type VARCHAR(100),
    organization_subtype VARCHAR(100), -- student_guild, faculty, etc.

    -- AI System Configuration
    ai_name VARCHAR(100),
    ai_persona JSONB DEFAULT '{}',     -- synthesized identity, traits, manifesto
    brand_color VARCHAR(7),            -- hex color
    logo_url TEXT,
    tone VARCHAR(50),                  -- professional, witty, minimalist, academic

    -- Neural Contract (system prompt)
    neural_contract JSONB DEFAULT '{}',

    -- Onboarding State
    onboarding_phase VARCHAR(50) DEFAULT 'pending',
    onboarding_started_at TIMESTAMPTZ,
    onboarding_completed_at TIMESTAMPTZ,

    -- Subscription/Billing (future)
    subscription_tier VARCHAR(50) DEFAULT 'trial',
    subscription_status VARCHAR(50) DEFAULT 'active',

    -- Metadata
    settings JSONB DEFAULT '{}',       -- tenant-wide settings
    metadata JSONB DEFAULT '{}',       -- flexible additional data

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_industry ON tenants(industry_id);
CREATE INDEX idx_tenants_onboarding_phase ON tenants(onboarding_phase);
```

### 3. PRE-ONBOARDING (Agency Audit Data)

```sql
-- Structured discovery/audit data collected by agency BEFORE onboarding
CREATE TABLE discovery_audits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Discovery Call Info
    discovery_call_date DATE,
    conducted_by VARCHAR(255),          -- agency staff name
    decision_maker_name VARCHAR(255),
    decision_maker_role VARCHAR(100),
    decision_maker_email VARCHAR(255),

    -- Organization Assessment
    team_size_range VARCHAR(50),        -- '1-10', '11-50', '51-200', '200+'
    annual_budget_range VARCHAR(50),    -- optional
    founding_year INTEGER,

    -- Current State Analysis
    current_tools JSONB DEFAULT '[]',   -- [{name, category, satisfaction_score}]
    pain_points JSONB DEFAULT '[]',     -- [{description, severity, category}]
    bottlenecks JSONB DEFAULT '[]',     -- [{process, impact, frequency}]

    -- Goals & Objectives
    primary_goals JSONB DEFAULT '[]',   -- [{goal, priority, timeframe}]
    success_metrics JSONB DEFAULT '[]', -- [{metric, target, current_baseline}]

    -- Technical Assessment
    tech_stack JSONB DEFAULT '{}',      -- {crm, email, accounting, etc.}
    integration_requirements JSONB DEFAULT '[]',
    data_migration_needs JSONB DEFAULT '[]',

    -- Compliance & Security
    compliance_requirements JSONB DEFAULT '[]', -- GDPR, sector-specific
    security_requirements JSONB DEFAULT '[]',

    -- Agency Notes
    agency_notes TEXT,
    recommended_tier VARCHAR(50),
    estimated_implementation_complexity VARCHAR(50), -- low, medium, high

    -- Status
    status VARCHAR(50) DEFAULT 'draft', -- draft, reviewed, approved
    approved_by VARCHAR(255),
    approved_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discovery_audits_tenant ON discovery_audits(tenant_id);
```

### 4. ACTIVATION KEYS

```sql
-- One-time activation keys for tenant provisioning
CREATE TABLE activation_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Key itself (unique code)
    key_code VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'JWEBLY-DEMO-2026'

    -- Pre-linked tenant (optional - can be created before activation)
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

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activation_keys_code ON activation_keys(key_code);
CREATE INDEX idx_activation_keys_tenant ON activation_keys(tenant_id);
```

### 5. DEPARTMENTS/TEAMS

```sql
-- Department templates per industry
CREATE TABLE department_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry_id UUID NOT NULL REFERENCES industries(id),

    name VARCHAR(100) NOT NULL,
    description TEXT,
    suggested_roles JSONB DEFAULT '[]',  -- default roles for this dept
    default_workflows JSONB DEFAULT '[]',

    display_order INTEGER DEFAULT 0,
    is_required BOOLEAN DEFAULT false,   -- must be included

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Actual departments for each tenant (based on templates but customizable)
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Can reference template or be custom
    template_id UUID REFERENCES department_templates(id),

    name VARCHAR(100) NOT NULL,
    description TEXT,

    -- Hierarchy (departments can have sub-teams)
    parent_department_id UUID REFERENCES departments(id),

    -- Department head
    head_user_id UUID,  -- references users table

    -- Custom configuration
    settings JSONB DEFAULT '{}',
    workflows JSONB DEFAULT '[]',

    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_departments_tenant ON departments(tenant_id);
CREATE INDEX idx_departments_parent ON departments(parent_department_id);
```

### 6. ROLES & PERMISSIONS

```sql
-- Role definitions per tenant
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,
    slug VARCHAR(50) NOT NULL,
    description TEXT,

    -- Permission level (higher = more access)
    permission_level INTEGER DEFAULT 0,  -- 0=basic, 50=manager, 100=admin

    -- Granular permissions
    permissions JSONB DEFAULT '{}',      -- {can_invite: true, can_delete: false, ...}

    -- Is this a system role or custom
    is_system_role BOOLEAN DEFAULT false,
    is_admin_role BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, slug)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
```

### 7. USERS

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Links to Supabase Auth
    auth_id UUID UNIQUE,  -- supabase auth.users.id

    -- Tenant association
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Department association (optional - user can be unassigned)
    department_id UUID REFERENCES departments(id),

    -- Role
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
    employee_id VARCHAR(100),  -- internal ID if they have one

    -- Authentication State
    temp_password_hash TEXT,    -- for initial login
    password_hash TEXT,         -- after password change
    password_changed_at TIMESTAMPTZ,
    must_change_password BOOLEAN DEFAULT true,

    -- Onboarding State
    staff_onboarding_completed BOOLEAN DEFAULT false,
    staff_onboarding_completed_at TIMESTAMPTZ,
    onboarding_responses JSONB DEFAULT '{}',

    -- Dashboard
    dashboard_config JSONB DEFAULT '{}',

    -- Status
    status VARCHAR(50) DEFAULT 'invited', -- invited, active, suspended, deactivated
    invited_at TIMESTAMPTZ,
    activated_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,

    -- Metadata
    settings JSONB DEFAULT '{}',  -- user preferences
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, email)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_department ON users(department_id);
CREATE INDEX idx_users_auth ON users(auth_id);
CREATE INDEX idx_users_email ON users(email);
```

### 8. ONBOARDING PHASES

```sql
-- Track detailed onboarding progress
CREATE TABLE onboarding_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    phase_number INTEGER NOT NULL,
    phase_slug VARCHAR(50) NOT NULL,     -- 'identity', 'branding', etc.
    phase_name VARCHAR(100) NOT NULL,

    status VARCHAR(50) DEFAULT 'pending', -- pending, in_progress, completed, skipped

    -- Phase data storage
    data JSONB DEFAULT '{}',

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completed_by_user_id UUID REFERENCES users(id),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, phase_slug)
);

CREATE INDEX idx_onboarding_progress_tenant ON onboarding_progress(tenant_id);
```

### 9. KNOWLEDGE BASE

```sql
-- Document categories
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

-- Documents uploaded to knowledge base
CREATE TABLE knowledge_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES knowledge_categories(id),
    uploaded_by_user_id UUID REFERENCES users(id),

    -- File info
    file_name VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_size_bytes BIGINT,
    storage_path TEXT,  -- S3/Supabase storage path

    -- Document metadata
    title VARCHAR(500),
    description TEXT,
    tags JSONB DEFAULT '[]',

    -- Processing status
    processing_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    processed_at TIMESTAMPTZ,
    chunk_count INTEGER DEFAULT 0,

    -- Access control
    visibility VARCHAR(50) DEFAULT 'internal', -- internal, department, public
    accessible_department_ids JSONB DEFAULT '[]',

    -- Versioning
    version INTEGER DEFAULT 1,
    previous_version_id UUID REFERENCES knowledge_documents(id),

    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_documents_tenant ON knowledge_documents(tenant_id);
CREATE INDEX idx_knowledge_documents_category ON knowledge_documents(category_id);

-- Vector chunks for RAG
CREATE TABLE knowledge_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,

    -- Vector embedding (requires pgvector extension)
    embedding vector(1536),  -- OpenAI ada-002 dimension

    -- Chunk metadata
    page_number INTEGER,
    section_title VARCHAR(500),

    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_knowledge_chunks_document ON knowledge_chunks(document_id);
CREATE INDEX idx_knowledge_chunks_tenant ON knowledge_chunks(tenant_id);
-- Vector similarity index (requires pgvector)
-- CREATE INDEX idx_knowledge_chunks_embedding ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops);
```

### 10. INTEGRATIONS

```sql
-- Available integration types
CREATE TABLE integration_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    slug VARCHAR(50) UNIQUE NOT NULL,    -- 'google_calendar', 'slack', etc.
    name VARCHAR(100) NOT NULL,
    description TEXT,
    category VARCHAR(50),                 -- 'calendar', 'communication', 'crm', etc.

    -- Configuration schema
    config_schema JSONB DEFAULT '{}',    -- JSON schema for required config

    -- OAuth config (if applicable)
    oauth_provider VARCHAR(50),
    oauth_scopes JSONB DEFAULT '[]',

    icon_url TEXT,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tenant-specific integration connections
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    integration_type_id UUID NOT NULL REFERENCES integration_types(id),

    -- Connection status
    status VARCHAR(50) DEFAULT 'pending', -- pending, connected, error, disconnected

    -- Configuration (encrypted at rest)
    config JSONB DEFAULT '{}',

    -- OAuth tokens (should be encrypted)
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
```

### 11. AUDIT TRAIL

```sql
CREATE TABLE audit_trail (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Action details
    action_type VARCHAR(100) NOT NULL,   -- 'user.created', 'document.uploaded', etc.
    resource_type VARCHAR(100),          -- 'user', 'document', 'tenant', etc.
    resource_id UUID,

    -- Change details
    previous_state JSONB,
    new_state JSONB,

    -- Context
    ip_address INET,
    user_agent TEXT,

    details JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_trail_tenant ON audit_trail(tenant_id);
CREATE INDEX idx_audit_trail_user ON audit_trail(user_id);
CREATE INDEX idx_audit_trail_action ON audit_trail(action_type);
CREATE INDEX idx_audit_trail_created ON audit_trail(created_at);
```

### 12. SYSTEM TABLES

```sql
-- System-wide settings
CREATE TABLE system_settings (
    key VARCHAR(100) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Agency/admin users (separate from tenant users)
CREATE TABLE agency_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id UUID UNIQUE,

    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(200),
    role VARCHAR(50) DEFAULT 'agent',  -- agent, admin, superadmin

    permissions JSONB DEFAULT '{}',

    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Row Level Security (RLS) Policies

```sql
-- Enable RLS on all tenant tables
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

-- Example policy: Users can only see their own tenant's data
CREATE POLICY tenant_isolation ON users
    FOR ALL
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));
```

---

## Indexes Summary

All foreign keys and frequently queried columns are indexed. Additional composite indexes should be added based on query patterns.

---

## Data Types Used

- **UUID**: All primary keys for distributed systems compatibility
- **JSONB**: Flexible schema for configurations, metadata, and evolving requirements
- **TIMESTAMPTZ**: All timestamps with timezone
- **vector(1536)**: pgvector for embeddings
- **INET**: IP addresses in audit trail

---

## Migration Notes

1. Enable pgvector extension: `CREATE EXTENSION IF NOT EXISTS vector;`
2. Enable UUID extension: `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`
3. Run tables in order due to foreign key dependencies
4. Seed industries before creating tenants
5. Seed department templates before creating departments
