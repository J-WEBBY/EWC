"""
Supabase-backed long-term memory for CrewAI agents.

Stores agent memories as searchable records in a dedicated table.
Supports both exact recall and semantic search (when embeddings are available).

Memory types:
- conversation: Key points from past conversations
- correction: When a human corrected the agent's behaviour
- pattern: Recurring patterns the agent has observed
- preference: User/org preferences learned over time
"""

import json
from datetime import datetime, timezone
from typing import Optional
from db import get_supabase


# ---------------------------------------------------------------------------
# Migration SQL (run this to create the memory table)
# ---------------------------------------------------------------------------
MEMORY_TABLE_SQL = """
-- Agent long-term memory table
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

CREATE INDEX IF NOT EXISTS idx_agent_memories_tenant
    ON agent_memories(tenant_id, agent_key);
CREATE INDEX IF NOT EXISTS idx_agent_memories_type
    ON agent_memories(tenant_id, memory_type);

ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_bypass_agent_memories"
    ON agent_memories FOR ALL
    USING (auth.role() = 'service_role');
"""


# ---------------------------------------------------------------------------
# Memory CRUD
# ---------------------------------------------------------------------------

def store_memory(
    tenant_id: str,
    content: str,
    memory_type: str = "conversation",
    agent_key: str = "primary",
    metadata: Optional[dict] = None,
    importance: float = 0.5,
) -> Optional[str]:
    """Store a new memory. Returns the memory ID."""
    try:
        db = get_supabase()
        result = (
            db.table("agent_memories")
            .insert({
                "tenant_id": tenant_id,
                "agent_key": agent_key,
                "memory_type": memory_type,
                "content": content,
                "metadata": json.dumps(metadata or {}),
                "importance": min(1.0, max(0.0, importance)),
            })
            .execute()
        )
        return result.data[0]["id"] if result.data else None
    except Exception as e:
        print(f"[memory] store error: {e}")
        return None


def recall_memories(
    tenant_id: str,
    query: Optional[str] = None,
    memory_type: Optional[str] = None,
    agent_key: str = "primary",
    limit: int = 10,
) -> list[dict]:
    """
    Recall memories. Text search if query provided, otherwise most recent.
    Updates access_count on retrieved memories.
    """
    try:
        db = get_supabase()
        q = (
            db.table("agent_memories")
            .select("id, content, memory_type, metadata, importance, created_at")
            .eq("tenant_id", tenant_id)
            .eq("agent_key", agent_key)
        )

        if memory_type:
            q = q.eq("memory_type", memory_type)

        if query:
            q = q.ilike("content", f"%{query}%")

        q = q.order("importance", desc=True).order("created_at", desc=True).limit(limit)

        result = q.execute()
        memories = result.data or []

        # Update access counts (fire and forget)
        if memories:
            now = datetime.now(timezone.utc).isoformat()
            for m in memories:
                try:
                    db.table("agent_memories").update({
                        "access_count": (m.get("access_count", 0) or 0) + 1,
                        "last_accessed_at": now,
                    }).eq("id", m["id"]).execute()
                except Exception:
                    pass

        return memories
    except Exception as e:
        print(f"[memory] recall error: {e}")
        return []


def store_correction(
    tenant_id: str,
    original_behaviour: str,
    corrected_behaviour: str,
    context: str = "",
    agent_key: str = "primary",
) -> Optional[str]:
    """Store a correction memory — agent learns from human feedback."""
    content = (
        f"CORRECTION: When presented with '{context}', "
        f"I initially {original_behaviour}. "
        f"The correct action was: {corrected_behaviour}."
    )
    return store_memory(
        tenant_id=tenant_id,
        content=content,
        memory_type="correction",
        agent_key=agent_key,
        metadata={
            "original": original_behaviour,
            "corrected": corrected_behaviour,
            "context": context,
        },
        importance=0.9,  # Corrections are high importance
    )


def get_memory_context(
    tenant_id: str,
    agent_key: str = "primary",
    limit: int = 5,
) -> str:
    """
    Build a memory context string for injection into agent prompts.
    Returns the most important and recent memories as formatted text.
    """
    memories = recall_memories(
        tenant_id=tenant_id,
        agent_key=agent_key,
        limit=limit,
    )

    if not memories:
        return ""

    lines = ["## Long-Term Memory", ""]
    for m in memories:
        mtype = m.get("memory_type", "general")
        content = m.get("content", "")
        lines.append(f"- [{mtype}] {content}")

    return "\n".join(lines)
