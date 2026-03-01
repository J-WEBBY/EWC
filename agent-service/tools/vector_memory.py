"""
Vector Memory tool — semantic search over past agent memories.
Requires OPENAI_API_KEY for embeddings; falls back to keyword search if absent.
"""

from typing import Optional
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from db import get_supabase
from embeddings import generate_embedding


class VectorMemorySearchInput(BaseModel):
    query: str = Field(
        ...,
        description="What to search for in past memories (natural language)",
    )
    limit: int = Field(5, description="Max results (1-10)", ge=1, le=10)


class VectorMemorySearchTool(BaseTool):
    name: str = "search_agent_memories"
    description: str = (
        "Search your past conversation memories and learnings using semantic similarity. "
        "Use this when you need context about previous discussions, past decisions, "
        "patient patterns you've noticed before, or clinic situations you've encountered. "
        "Returns the most relevant past memories ranked by similarity to your query."
    )
    args_schema: type[BaseModel] = VectorMemorySearchInput
    agent_key: str = ""

    def _run(self, query: str, limit: int = 5) -> str:
        db = get_supabase()
        embedding = generate_embedding(query)

        if embedding:
            # Semantic vector search via Supabase RPC
            try:
                result = db.rpc("search_agent_memories", {
                    "query_embedding": embedding,
                    "match_agent_key": self.agent_key,
                    "match_threshold": 0.55,
                    "match_count": limit,
                }).execute()
                memories = result.data or []

                if not memories:
                    return "No relevant memories found for this query."

                output = f"Found {len(memories)} relevant memories:\n\n"
                for m in memories:
                    sim = round(m.get("similarity", 0) * 100)
                    tag = (m.get("memory_type") or "note").upper()
                    output += f"- [{tag}] ({sim}% match) {m['content']}\n"
                return output.strip()

            except Exception as e:
                print(f"[vector_memory] RPC search error: {e}")
                # Fall through to keyword search

        # Fallback: recency + importance keyword search (no OpenAI key or RPC error)
        result = (
            db.table("agent_memories")
            .select("content, memory_type, importance")
            .eq("agent_key", self.agent_key)
            .order("importance", desc=True)
            .limit(limit)
            .execute()
        )
        memories = result.data or []

        if not memories:
            return "No memories found."

        output = f"Found {len(memories)} recent memories (add OPENAI_API_KEY for semantic search):\n\n"
        for m in memories:
            tag = (m.get("memory_type") or "note").upper()
            output += f"- [{tag}] {m['content']}\n"
        return output.strip()
