-- =====================================================
-- JWEBLY SYSTEM - Migration 008: Chat System
-- Primary AI Command Interface with Conversation Memory
-- =====================================================

-- =====================================================
-- 1. CHAT CONVERSATIONS
-- =====================================================

CREATE TABLE IF NOT EXISTS chat_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Conversation metadata
    title VARCHAR(200),                         -- AI-generated title from first message
    agent_scope VARCHAR(50),                    -- NULL = general, or 'judge'|'agent'|'automate'|'integrate'|'simulate'

    -- Status
    is_archived BOOLEAN DEFAULT FALSE,
    message_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_conversations_tenant ON chat_conversations(tenant_id);
CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id);
CREATE INDEX idx_chat_conversations_updated ON chat_conversations(updated_at DESC);

COMMENT ON TABLE chat_conversations IS 'Primary AI chat conversation threads';

-- =====================================================
-- 2. CHAT MESSAGES
-- =====================================================

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Message content
    role VARCHAR(20) NOT NULL,                  -- 'user' or 'assistant'
    content TEXT NOT NULL,

    -- Context
    agent_scope VARCHAR(50),                    -- scope active when message was sent

    -- AI metadata
    tokens_used INTEGER,
    model_used VARCHAR(100),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_tenant ON chat_messages(tenant_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(conversation_id, created_at ASC);

COMMENT ON TABLE chat_messages IS 'Individual messages within chat conversations';

-- =====================================================
-- 3. TRIGGERS
-- =====================================================

-- Auto-update updated_at on conversations
CREATE OR REPLACE FUNCTION update_chat_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_chat_conversation_updated
    BEFORE UPDATE ON chat_conversations
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_conversation_timestamp();

-- =====================================================
-- 4. RLS POLICIES
-- =====================================================

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- Service role bypass (used by server actions)
CREATE POLICY "service_role_chat_conversations" ON chat_conversations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_role_chat_messages" ON chat_messages
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Tenant isolation for authenticated users
CREATE POLICY "tenant_chat_conversations" ON chat_conversations
    FOR ALL TO authenticated
    USING (tenant_id = auth.uid())
    WITH CHECK (tenant_id = auth.uid());

CREATE POLICY "tenant_chat_messages" ON chat_messages
    FOR ALL TO authenticated
    USING (tenant_id = auth.uid())
    WITH CHECK (tenant_id = auth.uid());
