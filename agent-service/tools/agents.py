"""
Agent management tools — list, inspect, and delegate to specialist agents.
"""

from typing import Optional
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from db import get_supabase


# ---------------------------------------------------------------------------
# List Available Agents
# ---------------------------------------------------------------------------

class GetAgentsTool(BaseTool):
    name: str = "get_available_agents"
    description: str = (
        "List all available specialist AI agents for this organisation, "
        "including their capabilities, domains, keywords, and signal counts. "
        "Use this to understand what agents can handle before routing."
    )
    tenant_id: str = ""

    def _run(self) -> str:
        db = get_supabase()
        result = (
            db.table("agents")
            .select("*")
            .eq("is_active", True)
            .order("priority_weight", desc=True)
            .execute()
        )

        agents = result.data or []
        if not agents:
            return "No agents configured for this organisation."

        output = f"## Available Agents ({len(agents)})\n\n"
        for a in agents:
            scope = a.get("scope", {}) or {}
            output += f"### {a['display_name']} (`{a['agent_key']}`)\n"
            output += f"- **Type:** {a.get('type', 'N/A')}\n"
            if a.get("description"):
                output += f"- **Description:** {a['description']}\n"
            if scope.get("domains"):
                output += f"- **Domains:** {', '.join(scope['domains'])}\n"
            if scope.get("handles"):
                output += f"- **Handles:** {', '.join(scope['handles'])}\n"
            if scope.get("keywords"):
                kws = scope["keywords"][:10]
                suffix = "..." if len(scope["keywords"]) > 10 else ""
                output += f"- **Keywords:** {', '.join(kws)}{suffix}\n"
            if a.get("is_catch_all"):
                output += "- **Note:** Catch-all agent (handles unmatched requests)\n"
            output += f"- **Signals Handled:** {a.get('total_signals_handled', 0)}\n"
            output += f"- **ID:** {a['id']}\n\n"

        return output.strip()


# ---------------------------------------------------------------------------
# Route to Specialist
# ---------------------------------------------------------------------------

class RouteToSpecialistInput(BaseModel):
    agent: str = Field(
        ..., description='Agent key (e.g. "co_welfare") or UUID'
    )
    message: str = Field(..., description="Task/issue description to delegate")
    title: Optional[str] = Field(
        None, description="Signal title (defaults to first 80 chars of message)"
    )
    priority: str = Field("medium", description="Priority: low, medium, high, critical")
    signal_type: str = Field("delegated_task", description="Signal type label")
    reason: str = Field("", description="Why this is being delegated")


class RouteToSpecialistTool(BaseTool):
    name: str = "route_to_specialist"
    description: str = (
        "Delegate a task or issue to a specialist AI agent. Creates a signal "
        "assigned to that agent. Use when the request needs specialist "
        "handling (welfare, events, finance, comms, etc.)."
    )
    args_schema: type[BaseModel] = RouteToSpecialistInput
    tenant_id: str = ""
    user_id: str = ""
    conversation_id: Optional[str] = None

    def _run(
        self,
        agent: str,
        message: str,
        title: Optional[str] = None,
        priority: str = "medium",
        signal_type: str = "delegated_task",
        reason: str = "",
    ) -> str:
        import re
        import json

        UUID_RE = re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            re.IGNORECASE,
        )

        db = get_supabase()

        # Resolve agent by key or UUID
        if UUID_RE.match(agent):
            agent_result = (
                db.table("agents")
                .select("*")
                .eq("id", agent)
                .single()
                .execute()
            )
        else:
            agent_result = (
                db.table("agents")
                .select("*")
                .eq("agent_key", agent)
                .single()
                .execute()
            )

        if not agent_result.data:
            return (
                f'Agent not found: "{agent}". '
                "Use get_available_agents to see available agents."
            )

        matched = agent_result.data
        if priority not in ("low", "medium", "high", "critical"):
            priority = "medium"

        # Create delegated signal
        signal_result = (
            db.table("signals")
            .insert({
                "signal_type": signal_type,
                "title": (title or message[:80])[:200],
                "description": message,
                "priority": priority,
                "status": "new",
                "source_type": "agent",
                "source_agent_id": matched["id"],
                "created_by_user_id": self.user_id,
                "data": json.dumps({
                    "delegated_by": "primary_agent",
                    "conversation_id": self.conversation_id,
                    "delegation_reason": reason,
                }),
                "tags": ["delegated", f"agent:{matched['agent_key']}"],
                "user_input": message,
                "assigned_reasoning": reason or f"Delegated to {matched['display_name']}",
            })
            .execute()
        )

        if not signal_result.data:
            return "Failed to create delegated signal."

        signal_id = signal_result.data[0]["id"]

        # Increment agent signal count (fire and forget)
        try:
            db.table("agents").update({
                "total_signals_handled": matched.get("total_signals_handled", 0) + 1
            }).eq("id", matched["id"]).execute()
        except Exception:
            pass

        return (
            f"Successfully delegated to **{matched['display_name']}**.\n"
            f"- Signal ID: {signal_id}\n"
            f"- Priority: {priority}\n"
            f"- Agent: {matched['agent_key']} ({matched['display_name']})"
        )
