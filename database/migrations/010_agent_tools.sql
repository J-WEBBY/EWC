-- =====================================================
-- JWEBLY SYSTEM - Migration 010: Agent Tool System
-- Vector search RPC, tool call observability
-- =====================================================

-- =====================================================
-- 1. VECTOR SIMILARITY SEARCH — pgvector RPC function
-- =====================================================

DROP FUNCTION IF EXISTS match_knowledge_chunks(UUID, vector, INT, FLOAT);

CREATE OR REPLACE FUNCTION match_knowledge_chunks(
    p_tenant_id UUID,
    p_embedding vector(1536),
    p_match_count INT DEFAULT 5,
    p_match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    id UUID,
    document_id UUID,
    content TEXT,
    chunk_index INT,
    section_title VARCHAR(500),
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        kc.id,
        kc.document_id,
        kc.content,
        kc.chunk_index,
        kc.section_title,
        (1 - (kc.embedding <=> p_embedding))::FLOAT AS similarity
    FROM knowledge_chunks kc
    WHERE kc.tenant_id = p_tenant_id
        AND kc.embedding IS NOT NULL
        AND (1 - (kc.embedding <=> p_embedding)) > p_match_threshold
    ORDER BY kc.embedding <=> p_embedding
    LIMIT p_match_count;
END;
$$;

COMMENT ON FUNCTION match_knowledge_chunks IS 'Vector similarity search for RAG retrieval — returns closest knowledge chunks';

-- =====================================================
-- 2. EMBEDDING INDEX — enable fast vector search
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_embedding
    ON knowledge_chunks
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =====================================================
-- 3. AGENT TOOL CALLS — observability table
-- =====================================================

CREATE TABLE agent_tool_calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    conversation_id UUID,
    signal_id UUID,
    tool_name VARCHAR(100) NOT NULL,
    tool_input JSONB DEFAULT '{}'::jsonb,
    tool_output JSONB DEFAULT '{}'::jsonb,
    duration_ms INTEGER,
    is_error BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_tool_calls_tenant ON agent_tool_calls(tenant_id);
CREATE INDEX idx_agent_tool_calls_conversation ON agent_tool_calls(conversation_id);
CREATE INDEX idx_agent_tool_calls_tool ON agent_tool_calls(tool_name);
CREATE INDEX idx_agent_tool_calls_created ON agent_tool_calls(created_at DESC);

COMMENT ON TABLE agent_tool_calls IS 'Observability log for every tool invocation by the agent executor';

-- =====================================================
-- 4. ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE agent_tool_calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON agent_tool_calls FOR ALL TO service_role USING (true);

CREATE POLICY tenant_isolation_tool_calls ON agent_tool_calls
    FOR ALL TO authenticated
    USING (tenant_id = (SELECT tenant_id FROM users WHERE auth_id = auth.uid()));
