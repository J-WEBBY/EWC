-- =====================================================
-- JWEBLY SYSTEM - Migration 009: Primary Agent System
-- DB-driven agents, dynamic classification, learning
-- =====================================================

-- =====================================================
-- 1. INDUSTRY TEMPLATES — predefined agent sets per industry
-- =====================================================

CREATE TABLE industry_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    industry_key VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    default_agents JSONB DEFAULT '[]'::jsonb,
    default_integrations JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_industry_templates_key ON industry_templates(industry_key);

COMMENT ON TABLE industry_templates IS 'Predefined agent/integration templates per industry vertical';

-- =====================================================
-- 2. TENANT TEMPLATES — custom per-tenant additions
-- =====================================================

CREATE TABLE tenant_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    based_on_industry VARCHAR(50),
    custom_agents JSONB DEFAULT '[]'::jsonb,
    custom_integrations JSONB DEFAULT '[]'::jsonb,
    onboarding_notes TEXT,
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenant_templates_tenant ON tenant_templates(tenant_id);

COMMENT ON TABLE tenant_templates IS 'Custom agent/integration configs per tenant from onboarding';

-- =====================================================
-- 3. AGENTS — live agent instances per tenant
-- =====================================================

CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    agent_key VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,

    -- Scope definition for AI routing
    scope JSONB DEFAULT '{}'::jsonb,
    -- Expected shape: { domains: [], keywords: [], critical_keywords: [], handles: [], example_requests: [] }

    -- Display
    icon VARCHAR(50) DEFAULT 'Bot',
    color VARCHAR(20),
    type VARCHAR(20) DEFAULT 'company',

    -- State
    is_active BOOLEAN DEFAULT true,
    is_catch_all BOOLEAN DEFAULT false,
    priority_weight DECIMAL(3,2) DEFAULT 1.00,

    -- Origin
    source VARCHAR(30) DEFAULT 'industry_template',

    -- Metrics (updated by system)
    total_signals_handled INTEGER DEFAULT 0,
    avg_confidence_score DECIMAL(5,4) DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(tenant_id, agent_key)
);

CREATE INDEX idx_agents_tenant ON agents(tenant_id);
CREATE INDEX idx_agents_key ON agents(agent_key);
CREATE INDEX idx_agents_active ON agents(is_active);
CREATE INDEX idx_agents_tenant_active ON agents(tenant_id, is_active);

CREATE TRIGGER update_agents_updated_at
    BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE agents IS 'Live agent instances per tenant — loaded from templates or user-created';

-- =====================================================
-- 4. SIGNAL CATEGORIES — AI-discovered taxonomy
-- =====================================================

CREATE TABLE signal_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,

    category VARCHAR(255) NOT NULL,
    subcategory VARCHAR(255),

    created_by_ai BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 1,
    user_approved BOOLEAN DEFAULT false,
    user_approved_by UUID REFERENCES users(id),
    user_approved_at TIMESTAMPTZ,
    description TEXT,
    example_signals TEXT[] DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_signal_categories_unique
    ON signal_categories(tenant_id, agent_id, category, COALESCE(subcategory, ''));

CREATE INDEX idx_signal_categories_tenant ON signal_categories(tenant_id);
CREATE INDEX idx_signal_categories_agent ON signal_categories(agent_id);
CREATE INDEX idx_signal_categories_usage ON signal_categories(usage_count DESC);

CREATE TRIGGER update_signal_categories_updated_at
    BEFORE UPDATE ON signal_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE signal_categories IS 'Dynamically discovered categories per agent — AI creates, users approve';

-- =====================================================
-- 5. ROUTING CORRECTIONS — learning from user feedback
-- =====================================================

CREATE TABLE routing_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,

    -- Original AI classification
    original_agent_id UUID REFERENCES agents(id),
    original_category VARCHAR(255),
    original_subcategory VARCHAR(255),
    original_confidence DECIMAL(5,4),

    -- User correction
    corrected_agent_id UUID REFERENCES agents(id),
    corrected_category VARCHAR(255),
    corrected_subcategory VARCHAR(255),
    correction_reason TEXT,

    -- Context for learning
    signal_text TEXT,
    signal_metadata JSONB DEFAULT '{}'::jsonb,

    corrected_by UUID REFERENCES users(id),
    corrected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_routing_corrections_tenant ON routing_corrections(tenant_id);
CREATE INDEX idx_routing_corrections_signal ON routing_corrections(signal_id);
CREATE INDEX idx_routing_corrections_date ON routing_corrections(corrected_at DESC);
CREATE INDEX idx_routing_corrections_agents ON routing_corrections(original_agent_id, corrected_agent_id);

COMMENT ON TABLE routing_corrections IS 'User corrections to AI routing — used for learning and improvement';

-- =====================================================
-- 6. CLARIFICATION CONVERSATIONS — multi-turn dialog
-- =====================================================

CREATE TABLE clarification_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    turn_number INTEGER NOT NULL,
    speaker VARCHAR(10) NOT NULL,
    message TEXT NOT NULL,
    is_question BOOLEAN DEFAULT false,
    missing_info TEXT[] DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_clarification_signal ON clarification_conversations(signal_id);
CREATE INDEX idx_clarification_order ON clarification_conversations(signal_id, turn_number);

COMMENT ON TABLE clarification_conversations IS 'Multi-turn clarification dialogs when input is ambiguous';

-- =====================================================
-- 7. ALTER SIGNALS — add Primary Agent classification fields
-- =====================================================

ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_input TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS ai_classification JSONB DEFAULT '{}'::jsonb;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS assignment_confidence DECIMAL(5,4);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS assigned_reasoning TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_corrected_agent_id UUID;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS user_corrected_classification JSONB;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS correction_reason TEXT;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS corrected_by UUID REFERENCES users(id);
ALTER TABLE signals ADD COLUMN IF NOT EXISTS needs_clarification BOOLEAN DEFAULT false;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS clarification_questions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS clarification_responses JSONB DEFAULT '[]'::jsonb;
ALTER TABLE signals ADD COLUMN IF NOT EXISTS parent_signal_id UUID REFERENCES signals(id);

-- Add FK for user_corrected_agent_id now that agents table exists
ALTER TABLE signals ADD CONSTRAINT fk_signals_corrected_agent
    FOREIGN KEY (user_corrected_agent_id) REFERENCES agents(id) ON DELETE SET NULL;

CREATE INDEX idx_signals_ai_classification ON signals USING GIN (ai_classification);
CREATE INDEX idx_signals_needs_clarification ON signals(needs_clarification) WHERE needs_clarification = true;
CREATE INDEX idx_signals_parent ON signals(parent_signal_id) WHERE parent_signal_id IS NOT NULL;

-- =====================================================
-- 8. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE industry_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE signal_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE clarification_conversations ENABLE ROW LEVEL SECURITY;

-- Service role bypass
CREATE POLICY service_role_all ON industry_templates FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON tenant_templates FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON agents FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON signal_categories FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON routing_corrections FOR ALL TO service_role USING (true);
CREATE POLICY service_role_all ON clarification_conversations FOR ALL TO service_role USING (true);

-- Tenant isolation
CREATE POLICY tenant_isolation_tenant_templates ON tenant_templates
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_agents ON agents
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_signal_categories ON signal_categories
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_routing_corrections ON routing_corrections
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

CREATE POLICY tenant_isolation_clarification ON clarification_conversations
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));

-- Industry templates are global (read-only for authenticated)
CREATE POLICY read_industry_templates ON industry_templates
    FOR SELECT TO authenticated
    USING (true);

-- =====================================================
-- 9. SEED — Education industry template
-- =====================================================

INSERT INTO industry_templates (industry_key, display_name, description, default_agents, default_integrations) VALUES
('education', 'Education / Student Union', 'Student unions, guilds, and educational organisations', '[
  {"agent_key":"ind_engagement","display_name":"Engagement Pulse","description":"Monitors society participation, attendance, engagement trends — flags declining attendance, dormant groups, low-engagement patterns across the organisation","icon":"Activity","type":"industry","scope":{"domains":["engagement","societies","attendance"],"keywords":["society","club","attendance","engagement","membership","participation","dormant","inactive","handover","committee","kpi","volunteer"],"critical_keywords":["safeguarding via engagement","missing student"],"handles":["Performance drops","Engagement analysis","Society monitoring","Membership tracking"],"example_requests":["Why has society attendance dropped?","Which clubs are dormant?","Flag low engagement societies"]}},
  {"agent_key":"ind_events","display_name":"Events & Activities","description":"Manages event proposals, risk assessments, room bookings, scheduling conflicts, venue allocation — flags overdue approvals and resource clashes","icon":"Calendar","type":"industry","scope":{"domains":["events","booking","scheduling"],"keywords":["event","room","booking","venue","schedule","risk assessment","freshers","ball","conference","meeting room","capacity","catering","speaker"],"critical_keywords":["fire risk","safety concern","overcapacity","emergency"],"handles":["Event planning","Room bookings","Risk assessments","Scheduling conflicts","Venue allocation"],"example_requests":["Book a room for Friday","Plan the freshers fair","Check risk assessment for the ball"]}},
  {"agent_key":"co_welfare","display_name":"Welfare Monitor","description":"Triages student welfare cases — financial hardship, housing disputes, academic appeals, safeguarding referrals — detects patterns like location clusters and repeat referrals","icon":"Heart","type":"company","scope":{"domains":["welfare","support","safeguarding","crisis"],"keywords":["welfare","wellbeing","mental health","hardship","housing","appeal","safeguarding","crisis","counselling","vulnerable","complaint","dispute","academic","eviction","rent","homeless"],"critical_keywords":["safeguarding","suicide","self-harm","abuse","danger","emergency","missing"],"handles":["Welfare cases","Crisis situations","Academic appeals","Housing disputes","Safeguarding referrals","Financial hardship"],"example_requests":["Student needs urgent accommodation support","Safeguarding concern reported","Academic appeal for failed module","Student in financial hardship"]}},
  {"agent_key":"co_comms","display_name":"Social Media & Comms","description":"Helps staff create and execute posting plans for Instagram and TikTok, monitors social sentiment, tracks campaign performance, and suggests optimal content timing","icon":"Radio","type":"company","scope":{"domains":["social media","content","campaigns","communications","marketing"],"keywords":["social media","instagram","tiktok","post","content","campaign","newsletter","sentiment","brand","marketing","comms","followers","engagement rate","analytics"],"critical_keywords":["pr crisis","viral negative","defamation","legal threat"],"handles":["Content creation","Posting schedules","Campaign planning","Sentiment tracking","Newsletter management","Brand communications"],"example_requests":["Need Instagram content for Mental Health Week","Schedule TikTok posts for freshers","Why did engagement drop last week?","Plan a newsletter campaign"]}},
  {"agent_key":"sys_research_admin","display_name":"Research & Admin","description":"Catch-all autonomous agent — monitors compliance deadlines, resource utilisation, procurement thresholds, HR admin, knowledge base health across all departments — auto-processes routine items and escalates complex findings","icon":"Bot","type":"company","is_catch_all":true,"scope":{"domains":["compliance","admin","procurement","facilities","HR","research","operations"],"keywords":["compliance","policy","audit","budget","procurement","expense","contract","training","onboarding","document","knowledge base","maintenance","facilities","gdpr","dbs","invoice","report","research"],"critical_keywords":["regulatory breach","data breach","fraud","legal deadline"],"handles":["Compliance monitoring","Document reviews","Budget tracking","Procurement","Research tasks","Admin questions","Facilities management"],"example_requests":["Find the January invoice","When is the DBS check due?","Research competitor pricing","Check policy review deadlines","What is the budget status?"]}}
]'::jsonb, '[]'::jsonb);

-- =====================================================
-- 10. SEED — Agents for test tenant (University of Oldbury)
-- =====================================================

DO $$
DECLARE
    v_tenant_id UUID := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    v_agent JSONB;
    v_agents JSONB;
BEGIN
    -- Get the education template agents
    SELECT default_agents INTO v_agents
    FROM industry_templates
    WHERE industry_key = 'education';

    IF v_agents IS NULL THEN
        RAISE NOTICE 'Education template not found, skipping agent seed';
        RETURN;
    END IF;

    -- Insert each agent for the test tenant
    FOR v_agent IN SELECT * FROM jsonb_array_elements(v_agents)
    LOOP
        INSERT INTO agents (
            tenant_id, agent_key, display_name, description, scope,
            icon, type, is_active, is_catch_all, source
        ) VALUES (
            v_tenant_id,
            v_agent->>'agent_key',
            v_agent->>'display_name',
            v_agent->>'description',
            COALESCE(v_agent->'scope', '{}'::jsonb),
            COALESCE(v_agent->>'icon', 'Bot'),
            COALESCE(v_agent->>'type', 'company'),
            true,
            COALESCE((v_agent->>'is_catch_all')::boolean, false),
            'industry_template'
        ) ON CONFLICT (tenant_id, agent_key) DO NOTHING;
    END LOOP;

    RAISE NOTICE 'Seeded agents for test tenant %', v_tenant_id;
END $$;
