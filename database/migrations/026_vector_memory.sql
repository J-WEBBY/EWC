-- Migration 026: Vector Memory for Agent Intelligence
-- Adds embedding column to agent_memories + similarity search RPC function.
-- Enables semantic recall: agents can find relevant past context by meaning,
-- not just keyword match. Requires pgvector extension (already enabled).

-- 1. Add embedding column
ALTER TABLE agent_memories
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 2. IVFFlat index for fast cosine similarity search
CREATE INDEX IF NOT EXISTS agent_memories_embedding_idx
    ON agent_memories
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- 3. RPC function called by VectorMemorySearchTool
CREATE OR REPLACE FUNCTION search_agent_memories(
    query_embedding vector(1536),
    match_agent_key text,
    match_threshold  float DEFAULT 0.55,
    match_count      int   DEFAULT 5
)
RETURNS TABLE (
    id          uuid,
    agent_key   text,
    content     text,
    memory_type text,
    importance  float,
    similarity  float
)
LANGUAGE sql STABLE
AS $$
    SELECT
        id,
        agent_key,
        content,
        memory_type,
        importance,
        1 - (embedding <=> query_embedding) AS similarity
    FROM agent_memories
    WHERE agent_key = match_agent_key
      AND embedding IS NOT NULL
      AND 1 - (embedding <=> query_embedding) > match_threshold
    ORDER BY embedding <=> query_embedding
    LIMIT match_count;
$$;
