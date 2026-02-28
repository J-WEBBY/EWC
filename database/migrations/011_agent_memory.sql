-- =============================================================================
-- Migration 011: Agent Long-Term Memory
-- Stores persistent memories for CrewAI agents (corrections, patterns, preferences)
-- =============================================================================

-- Agent memories table
CREATE TABLE IF NOT EXISTS agent_memories (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    agent_key VARCHAR(100) NOT NULL DEFAULT 'primary',
    memory_type VARCHAR(50) NOT NULL DEFAULT 'conversation',
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    importance FLOAT DEFAULT 0.5,
    access_count INT DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_memories_tenant
    ON agent_memories(tenant_id, agent_key);
CREATE INDEX IF NOT EXISTS idx_agent_memories_type
    ON agent_memories(tenant_id, memory_type);
CREATE INDEX IF NOT EXISTS idx_agent_memories_importance
    ON agent_memories(tenant_id, importance DESC);

-- RLS
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_bypass_agent_memories"
    ON agent_memories FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "tenant_isolation_agent_memories"
    ON agent_memories FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM users WHERE auth_id = auth.uid()
        )
    );
