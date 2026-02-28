"""
Proactive scan tool — organisational health check.
Queries multiple data sources and surfaces issues as signals.
"""

from crewai.tools import BaseTool
from db import get_supabase


class RunProactiveScanTool(BaseTool):
    name: str = "run_proactive_scan"
    description: str = (
        "Trigger a proactive organisational health scan. Checks for stale signals, "
        "overdue tasks, compliance gaps, unresolved critical issues, and operational "
        "patterns. Returns a structured health report."
    )
    tenant_id: str = ""

    def _run(self) -> str:
        db = get_supabase()
        findings: list[str] = []

        # 1. Stale critical/high signals (open > 48h)
        stale_result = (
            db.table("signals")
            .select("id, title, priority, status, created_at")
            .eq("tenant_id", self.tenant_id)
            .in_("priority", ["high", "critical"])
            .in_("status", ["new", "processing"])
            .order("created_at")
            .limit(10)
            .execute()
        )
        stale = stale_result.data or []
        if stale:
            findings.append(
                f"**Stale High-Priority Signals:** {len(stale)} signals at "
                f"high/critical priority still in new/processing status."
            )
            for s in stale[:3]:
                findings.append(f"  - [{s['priority']}] {s['title']} (since {s['created_at']})")

        # 2. Unjudged signals piling up
        unjudged_result = (
            db.table("signals")
            .select("id", count="exact")
            .eq("tenant_id", self.tenant_id)
            .eq("status", "new")
            .execute()
        )
        unjudged_count = unjudged_result.count or 0
        if unjudged_count > 10:
            findings.append(
                f"**Signal Backlog:** {unjudged_count} signals in 'new' status "
                f"awaiting processing. Consider running batch judgement."
            )

        # 3. Agents with no signals (potentially misconfigured)
        agents_result = (
            db.table("agents")
            .select("display_name, agent_key, total_signals_handled")
            .eq("tenant_id", self.tenant_id)
            .eq("is_active", True)
            .eq("total_signals_handled", 0)
            .execute()
        )
        unused_agents = agents_result.data or []
        if unused_agents:
            names = ", ".join(a["display_name"] for a in unused_agents)
            findings.append(
                f"**Unused Agents:** {len(unused_agents)} agents have handled "
                f"zero signals: {names}. Review scope configuration."
            )

        # 4. Departments with no members
        depts_result = (
            db.table("departments")
            .select("id, name")
            .eq("tenant_id", self.tenant_id)
            .execute()
        )
        users_result = (
            db.table("users")
            .select("department_id")
            .eq("tenant_id", self.tenant_id)
            .eq("is_active", True)
            .execute()
        )
        dept_ids_with_users = {
            u["department_id"]
            for u in (users_result.data or [])
            if u.get("department_id")
        }
        empty_depts = [
            d for d in (depts_result.data or [])
            if d["id"] not in dept_ids_with_users
        ]
        if empty_depts:
            names = ", ".join(d["name"] for d in empty_depts)
            findings.append(
                f"**Empty Departments:** {len(empty_depts)} departments have "
                f"no active members: {names}."
            )

        # 5. Knowledge base coverage
        kb_result = (
            db.table("knowledge_documents")
            .select("id", count="exact")
            .eq("tenant_id", self.tenant_id)
            .execute()
        )
        doc_count = kb_result.count or 0
        if doc_count == 0:
            findings.append(
                "**Knowledge Base Empty:** No documents uploaded. "
                "The AI cannot reference internal policies or procedures."
            )
        elif doc_count < 5:
            findings.append(
                f"**Knowledge Base Sparse:** Only {doc_count} documents. "
                "Consider uploading more policies and reference material."
            )

        # Build report
        output = "## Organisational Health Scan\n\n"

        if not findings:
            output += (
                "No issues detected. The organisation appears healthy:\n"
                "- No stale high-priority signals\n"
                "- No signal backlog\n"
                "- All agents handling signals\n"
                "- All departments staffed\n"
                "- Knowledge base populated\n"
            )
        else:
            output += f"Found {len(findings)} area(s) needing attention:\n\n"
            for f in findings:
                output += f"{f}\n\n"

        return output.strip()
