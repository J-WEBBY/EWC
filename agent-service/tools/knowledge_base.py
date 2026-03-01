"""
Knowledge base tools — search internal documents, policies, and procedures.
"""

from typing import Optional
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from db import get_supabase


class KnowledgeBaseSearchInput(BaseModel):
    query: str = Field(..., description="Search query — keywords or natural language")
    limit: int = Field(5, description="Max results (1-20)", ge=1, le=20)


class KnowledgeBaseSearchTool(BaseTool):
    name: str = "knowledge_base_search"
    description: str = (
        "Search the organisation's internal knowledge base for policies, "
        "procedures, documents, and reference material. Use this before "
        "web search for organisation-specific questions."
    )
    args_schema: type[BaseModel] = KnowledgeBaseSearchInput
    tenant_id: str = ""

    def _run(self, query: str, limit: int = 5) -> str:
        query = query.strip()
        if not query:
            return "Missing search query."

        db = get_supabase()

        # Text-based search on chunk content and section titles
        result = (
            db.table("knowledge_chunks")
            .select(
                "id, content, chunk_index, section_title, document_id, "
                "document:knowledge_documents!knowledge_chunks_document_id_fkey("
                "title, doc_type)"
            )
            .or_(f"content.ilike.%{query}%,section_title.ilike.%{query}%")
            .order("chunk_index")
            .limit(limit)
            .execute()
        )

        chunks = result.data or []

        if not chunks:
            # Fallback: search document titles
            docs_result = (
                db.table("knowledge_documents")
                .select("id, title, doc_type, summary")
                .ilike("title", f"%{query}%")
                .limit(limit)
                .execute()
            )
            docs = docs_result.data or []

            if docs:
                output = f'Found {len(docs)} document(s) matching "{query}":\n\n'
                for doc in docs:
                    output += f"- **{doc['title']}** ({doc['doc_type']})\n"
                    if doc.get("summary"):
                        output += f"  {doc['summary'][:200]}\n"
                    output += "\n"
                return output.strip()

            return f'No knowledge base results found for "{query}".'

        output = f'Found {len(chunks)} result(s) for "{query}":\n\n'
        for chunk in chunks:
            doc = chunk.get("document") or {}
            doc_title = doc.get("title", "Unknown Document") if isinstance(doc, dict) else "Unknown Document"
            section = f" > {chunk['section_title']}" if chunk.get("section_title") else ""
            output += f"### {doc_title}{section}\n"
            output += f"{chunk['content'][:600]}\n\n"

        return output.strip()
