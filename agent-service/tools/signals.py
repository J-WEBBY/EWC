"""
Signal tools — query, create, update, escalate operational signals.
The Primary Agent's main interface for operational intelligence.
"""

import json
from typing import Optional
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from db import get_supabase


# ---------------------------------------------------------------------------
# Query Signals
# ---------------------------------------------------------------------------

class QuerySignalsInput(BaseModel):
    status: Optional[str] = Field(
        None,
        description="Filter by status: new, processing, judged, awaiting_decision, decided, acted, outcome_recorded, closed",
    )
    priority: Optional[str] = Field(
        None, description="Filter by priority: low, medium, high, critical"
    )
    category: Optional[str] = Field(None, description="Filter by category label")
    agent_id: Optional[str] = Field(None, description="Filter by source agent UUID")
    department_id: Optional[str] = Field(None, description="Filter by department UUID")
    search: Optional[str] = Field(
        None, description="Text search across signal titles and descriptions"
    )
    limit: int = Field(20, description="Max results (1-50)", ge=1, le=50)


class QuerySignalsTool(BaseTool):
    name: str = "query_signals"
    description: str = (
        "Search and filter operational signals (tasks, events, alerts). "
        "Use this to find signals by status, priority, category, agent, "
        "department, or text search. Returns structured signal data."
    )
    args_schema: type[BaseModel] = QuerySignalsInput
    tenant_id: str = ""

    def _run(
        self,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        category: Optional[str] = None,
        agent_id: Optional[str] = None,
        department_id: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 20,
    ) -> str:
        db = get_supabase()
        query = (
            db.table("signals")
            .select(
                "id, title, description, signal_type, priority, status, "
                "category, source_agent_id, source_department_id, tags, "
                "created_at, assignment_confidence"
            )
            .eq("tenant_id", self.tenant_id)
            .order("created_at", desc=True)
            .limit(limit)
        )

        if status:
            query = query.eq("status", status)
        if priority:
            query = query.eq("priority", priority)
        if category:
            query = query.eq("category", category)
        if agent_id:
            query = query.eq("source_agent_id", agent_id)
        if department_id:
            query = query.eq("source_department_id", department_id)

        result = query.execute()
        signals = result.data or []

        # Client-side text search
        if search and signals:
            q = search.lower()
            signals = [
                s
                for s in signals
                if q in (s.get("title", "") or "").lower()
                or q in (s.get("description", "") or "").lower()
            ]

        if not signals:
            return "No signals found matching the given filters."

        output = f"Found {len(signals)} signal(s):\n\n"
        for s in signals:
            conf = ""
            if s.get("assignment_confidence"):
                conf = f" ({round(s['assignment_confidence'] * 100)}% confidence)"
            output += f"- **{s['title']}** [{s['priority']}/{s['status']}]{conf}\n"
            output += f"  ID: {s['id']} | Type: {s.get('signal_type', 'N/A')} | Category: {s.get('category', 'none')}\n"
            if s.get("description"):
                output += f"  {s['description'][:150]}\n"
            output += f"  Created: {s['created_at']}\n\n"

        return output.strip()


# ---------------------------------------------------------------------------
# Create Signal
# ---------------------------------------------------------------------------

class CreateSignalInput(BaseModel):
    title: str = Field(..., description="Concise signal title (max 200 chars)")
    description: str = Field("", description="Detailed description")
    priority: str = Field(
        "medium", description="Priority: low, medium, high, critical"
    )
    signal_type: str = Field("general", description="Signal type label")
    category: Optional[str] = Field(None, description="Classification category")
    tags: list[str] = Field(default_factory=list, description="Optional tags")


class CreateSignalTool(BaseTool):
    name: str = "create_signal"
    description: str = (
        "Propose a new operational signal (task, event, alert, or objective) "
        "for user approval. The signal is created with pending_approval status "
        "and the user must approve it before it becomes active. Always describe "
        "the signal details in your response so the user knows what to approve."
    )
    args_schema: type[BaseModel] = CreateSignalInput
    tenant_id: str = ""
    user_id: str = ""
    conversation_id: Optional[str] = None

    def _run(
        self,
        title: str,
        description: str = "",
        priority: str = "medium",
        signal_type: str = "general",
        category: Optional[str] = None,
        tags: list[str] | None = None,
    ) -> str:
        if priority not in ("low", "medium", "high", "critical"):
            priority = "medium"

        db = get_supabase()
        row = {
            "tenant_id": self.tenant_id,
            "signal_type": signal_type,
            "title": title[:200],
            "description": description,
            "priority": priority,
            "status": "pending_approval",
            "source_type": "agent",
            "created_by_user_id": self.user_id,
            "data": json.dumps({
                "created_by": "primary_agent",
                "conversation_id": self.conversation_id,
            }),
            "tags": ["agent-created"] + (tags or []),
            "category": category,
        }

        result = db.table("signals").insert(row).execute()

        if not result.data:
            return "Failed to create signal."

        signal_id = result.data[0]["id"]
        return (
            f"Signal proposed for user approval.\n"
            f"- ID: {signal_id}\n"
            f"- Title: {title}\n"
            f"- Priority: {priority}\n"
            f"- Type: {signal_type}\n"
            f"The user will see a confirmation card and must approve this signal."
        )


# ---------------------------------------------------------------------------
# Update Signal
# ---------------------------------------------------------------------------

class UpdateSignalInput(BaseModel):
    signal_id: str = Field(..., description="UUID of the signal to update")
    status: Optional[str] = Field(None, description="New status")
    priority: Optional[str] = Field(None, description="New priority")
    title: Optional[str] = Field(None, description="New title")
    description: Optional[str] = Field(None, description="New description")
    category: Optional[str] = Field(None, description="New category")


class UpdateSignalTool(BaseTool):
    name: str = "update_signal"
    description: str = (
        "Update an existing signal's status, priority, title, description, "
        "or category. Use this to progress signals through their lifecycle."
    )
    args_schema: type[BaseModel] = UpdateSignalInput
    tenant_id: str = ""

    def _run(
        self,
        signal_id: str,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        title: Optional[str] = None,
        description: Optional[str] = None,
        category: Optional[str] = None,
    ) -> str:
        updates: dict = {}
        if status:
            updates["status"] = status
        if priority and priority in ("low", "medium", "high", "critical"):
            updates["priority"] = priority
        if title:
            updates["title"] = title[:200]
        if description:
            updates["description"] = description
        if category:
            updates["category"] = category

        if not updates:
            return "No updates provided."

        db = get_supabase()
        result = (
            db.table("signals")
            .update(updates)
            .eq("id", signal_id)
            .eq("tenant_id", self.tenant_id)
            .execute()
        )

        if not result.data:
            return f"Signal {signal_id} not found or update failed."

        changes = ", ".join(f"{k}={v}" for k, v in updates.items())
        return f"Signal {signal_id} updated: {changes}"


# ---------------------------------------------------------------------------
# Escalate Signal
# ---------------------------------------------------------------------------

class EscalateSignalInput(BaseModel):
    signal_id: str = Field(..., description="UUID of the signal to escalate")
    reason: str = Field(..., description="Why this signal is being escalated")
    new_priority: str = Field(
        "high", description="Escalated priority: high or critical"
    )


class EscalateSignalTool(BaseTool):
    name: str = "escalate_signal"
    description: str = (
        "Escalate a signal to higher priority with a reason. "
        "Use when a signal needs urgent attention or has been identified as critical."
    )
    args_schema: type[BaseModel] = EscalateSignalInput
    tenant_id: str = ""

    def _run(
        self,
        signal_id: str,
        reason: str,
        new_priority: str = "high",
    ) -> str:
        if new_priority not in ("high", "critical"):
            new_priority = "high"

        db = get_supabase()
        result = (
            db.table("signals")
            .update({
                "priority": new_priority,
                "status": "processing",
                "data": json.dumps({"escalation_reason": reason}),
            })
            .eq("id", signal_id)
            .eq("tenant_id", self.tenant_id)
            .execute()
        )

        if not result.data:
            return f"Signal {signal_id} not found or escalation failed."

        return (
            f"Signal {signal_id} escalated to {new_priority}.\n"
            f"Reason: {reason}"
        )
