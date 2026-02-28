-- =====================================================
-- JWEBLY SYSTEM - Migration 005: Deep Probe Schema
-- AI Training Conversations & Insights
-- =====================================================

-- =====================================================
-- 1. DEEP PROBE CONVERSATIONS
-- =====================================================

CREATE TABLE deep_probe_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Session info
    session_status VARCHAR(50) DEFAULT 'active', -- active, completed, abandoned
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    -- Progress tracking
    current_topic VARCHAR(100), -- values, workflows, pain_points, approaches, tools, outcomes
    topics_covered JSONB DEFAULT '[]'::jsonb,
    completion_percentage INTEGER DEFAULT 0,

    -- Conversation summary
    total_messages INTEGER DEFAULT 0,
    ai_questions_asked INTEGER DEFAULT 0,
    user_responses_given INTEGER DEFAULT 0,

    -- Metadata
    conversation_metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deep_probe_conversations_tenant ON deep_probe_conversations(tenant_id);
CREATE INDEX idx_deep_probe_conversations_status ON deep_probe_conversations(session_status);

COMMENT ON TABLE deep_probe_conversations IS 'Deep Probe AI training sessions';

-- =====================================================
-- 2. CONVERSATION MESSAGES
-- =====================================================

CREATE TABLE deep_probe_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES deep_probe_conversations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Message details
    role VARCHAR(20) NOT NULL, -- 'assistant' or 'user'
    content TEXT NOT NULL,

    -- Context
    topic VARCHAR(100), -- Which topic this message relates to
    message_index INTEGER NOT NULL, -- Order in conversation

    -- Metadata
    tokens_used INTEGER,
    model_used VARCHAR(100),
    processing_time_ms INTEGER,

    -- Extracted insights (for assistant messages that include analysis)
    extracted_data JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deep_probe_messages_conversation ON deep_probe_messages(conversation_id);
CREATE INDEX idx_deep_probe_messages_tenant ON deep_probe_messages(tenant_id);
CREATE INDEX idx_deep_probe_messages_role ON deep_probe_messages(role);
CREATE INDEX idx_deep_probe_messages_index ON deep_probe_messages(conversation_id, message_index);

COMMENT ON TABLE deep_probe_messages IS 'Individual messages in Deep Probe conversations';

-- =====================================================
-- 3. EXTRACTED INSIGHTS
-- =====================================================

CREATE TABLE deep_probe_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES deep_probe_conversations(id) ON DELETE CASCADE,

    -- Insight category
    category VARCHAR(100) NOT NULL, -- values, workflow, pain_point, approach, tool, outcome, etc.

    -- Insight data
    title VARCHAR(500),
    description TEXT,
    importance_score INTEGER DEFAULT 5, -- 1-10 scale
    confidence_score DECIMAL(3,2) DEFAULT 0.85, -- 0.00-1.00

    -- Structured data
    data JSONB DEFAULT '{}'::jsonb,

    -- Context
    source_message_id UUID REFERENCES deep_probe_messages(id),
    related_insights UUID[], -- Array of related insight IDs

    -- Status
    status VARCHAR(50) DEFAULT 'active', -- active, archived, merged
    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,

    -- Metadata
    tags JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deep_probe_insights_tenant ON deep_probe_insights(tenant_id);
CREATE INDEX idx_deep_probe_insights_conversation ON deep_probe_insights(conversation_id);
CREATE INDEX idx_deep_probe_insights_category ON deep_probe_insights(category);
CREATE INDEX idx_deep_probe_insights_importance ON deep_probe_insights(importance_score DESC);

COMMENT ON TABLE deep_probe_insights IS 'Structured insights extracted from Deep Probe conversations';

-- =====================================================
-- 4. WORKFLOW PATTERNS
-- =====================================================

CREATE TABLE deep_probe_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Workflow identification
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- core_process, support_process, exception_handling

    -- Workflow details
    trigger VARCHAR(500), -- What starts this workflow
    steps JSONB DEFAULT '[]'::jsonb, -- Array of workflow steps
    roles_involved JSONB DEFAULT '[]'::jsonb, -- Roles that participate
    tools_used JSONB DEFAULT '[]'::jsonb, -- Tools/systems used

    -- Metrics
    frequency VARCHAR(50), -- daily, weekly, monthly, ad_hoc
    average_duration VARCHAR(100), -- "2 hours", "1 day"
    volume_estimate VARCHAR(100), -- "10 per day", "50 per month"

    -- Pain points & improvements
    pain_points JSONB DEFAULT '[]'::jsonb,
    current_inefficiencies JSONB DEFAULT '[]'::jsonb,
    desired_improvements JSONB DEFAULT '[]'::jsonb,

    -- Priority
    business_criticality INTEGER DEFAULT 5, -- 1-10
    automation_potential INTEGER DEFAULT 5, -- 1-10

    -- Source
    conversation_id UUID REFERENCES deep_probe_conversations(id),
    source_insights UUID[], -- Related insight IDs

    -- Status
    status VARCHAR(50) DEFAULT 'active',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deep_probe_workflows_tenant ON deep_probe_workflows(tenant_id);
CREATE INDEX idx_deep_probe_workflows_criticality ON deep_probe_workflows(business_criticality DESC);
CREATE INDEX idx_deep_probe_workflows_automation ON deep_probe_workflows(automation_potential DESC);

COMMENT ON TABLE deep_probe_workflows IS 'Documented workflows discovered through Deep Probe';

-- =====================================================
-- 5. ORGANIZATIONAL VALUES
-- =====================================================

CREATE TABLE deep_probe_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Value identification
    value_name VARCHAR(255) NOT NULL,
    value_statement TEXT,

    -- Context
    category VARCHAR(100), -- core_value, operating_principle, decision_criteria
    priority_level INTEGER DEFAULT 5, -- 1-10

    -- Evidence & examples
    examples JSONB DEFAULT '[]'::jsonb, -- Real examples from conversation
    behavioral_indicators JSONB DEFAULT '[]'::jsonb, -- How this value shows up

    -- Application
    applies_to JSONB DEFAULT '[]'::jsonb, -- Areas where this applies
    decision_influence TEXT, -- How this influences decisions

    -- Source
    conversation_id UUID REFERENCES deep_probe_conversations(id),
    source_insights UUID[],

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_deep_probe_values_tenant ON deep_probe_values(tenant_id);
CREATE INDEX idx_deep_probe_values_priority ON deep_probe_values(priority_level DESC);

COMMENT ON TABLE deep_probe_values IS 'Organizational values and principles identified through Deep Probe';

-- =====================================================
-- 6. ENABLE RLS
-- =====================================================

ALTER TABLE deep_probe_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_probe_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_probe_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_probe_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_probe_values ENABLE ROW LEVEL SECURITY;

-- Service role policies
CREATE POLICY service_role_all ON deep_probe_conversations FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON deep_probe_messages FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON deep_probe_insights FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON deep_probe_workflows FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON deep_probe_values FOR ALL TO service_role USING (true);

-- Tenant isolation policies
CREATE POLICY tenant_isolation_conversations ON deep_probe_conversations
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_messages ON deep_probe_messages
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_insights ON deep_probe_insights
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_workflows ON deep_probe_workflows
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_values ON deep_probe_values
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

-- =====================================================
-- 7. UPDATE TRIGGERS
-- =====================================================

CREATE TRIGGER update_deep_probe_conversations_updated_at BEFORE UPDATE ON deep_probe_conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deep_probe_insights_updated_at BEFORE UPDATE ON deep_probe_insights
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deep_probe_workflows_updated_at BEFORE UPDATE ON deep_probe_workflows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_deep_probe_values_updated_at BEFORE UPDATE ON deep_probe_values
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Deep Probe schema created successfully
