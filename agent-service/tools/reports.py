"""
Reporting and analytics tools — compile intelligence from operational data.
"""

from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from db import get_supabase


class GenerateReportInput(BaseModel):
    report_type: str = Field(
        "overview",
        description='Report type: "overview" (comprehensive), "signals", "agents", "departments", "risk"',
    )


class GenerateReportTool(BaseTool):
    name: str = "generate_report"
    description: str = (
        "Generate operational reports including signal statistics, agent activity, "
        "department performance, and risk summaries. Use when users ask for "
        "summaries, reports, metrics, or operational overviews."
    )
    args_schema: type[BaseModel] = GenerateReportInput
    tenant_id: str = ""

    def _run(self, report_type: str = "overview") -> str:
        db = get_supabase()
        output = ""

        if report_type in ("signals", "overview"):
            output += self._signal_report(db)

        if report_type in ("agents", "overview"):
            output += self._agent_report(db)

        if report_type in ("departments", "overview"):
            output += self._department_report(db)

        if report_type in ("risk", "overview"):
            output += self._risk_report(db)

        return output.strip() or "No report data available."

    def _signal_report(self, db) -> str:
        result = (
            db.table("signals")
            .select("id, priority, status, category, created_at")
            .execute()
        )
        signals = result.data or []

        if not signals:
            return "## Signal Overview\nNo signals found.\n\n"

        # Count by status
        by_status: dict[str, int] = {}
        by_priority: dict[str, int] = {}
        by_category: dict[str, int] = {}
        active_statuses = {"new", "processing", "judged", "awaiting_decision"}

        for s in signals:
            st = s.get("status", "unknown")
            by_status[st] = by_status.get(st, 0) + 1
            pr = s.get("priority", "unknown")
            by_priority[pr] = by_priority.get(pr, 0) + 1
            cat = s.get("category") or "uncategorised"
            by_category[cat] = by_category.get(cat, 0) + 1

        active = sum(by_status.get(s, 0) for s in active_statuses)
        critical = by_priority.get("critical", 0)

        output = "## Signal Overview\n\n"
        output += f"- **Total Signals:** {len(signals)}\n"
        output += f"- **Active:** {active}\n"
        output += f"- **Critical:** {critical}\n\n"

        output += "**By Priority:**\n"
        for p in ("critical", "high", "medium", "low"):
            if by_priority.get(p, 0) > 0:
                output += f"- {p}: {by_priority[p]}\n"

        output += "\n**By Status:**\n"
        for st, count in sorted(by_status.items(), key=lambda x: -x[1]):
            output += f"- {st}: {count}\n"

        output += "\n**By Category:**\n"
        for cat, count in sorted(by_category.items(), key=lambda x: -x[1])[:10]:
            output += f"- {cat}: {count}\n"

        output += "\n"
        return output

    def _agent_report(self, db) -> str:
        result = (
            db.table("agents")
            .select("display_name, agent_key, total_signals_handled, avg_confidence_score, is_active")
            .order("total_signals_handled", desc=True)
            .execute()
        )
        agents = result.data or []

        if not agents:
            return "## Agent Activity\nNo agents configured.\n\n"

        output = "## Agent Activity\n\n"
        for a in agents:
            status = "Active" if a.get("is_active") else "Inactive"
            conf = (
                f"{round(a['avg_confidence_score'] * 100)}%"
                if a.get("avg_confidence_score")
                else "N/A"
            )
            output += (
                f"- **{a['display_name']}** (`{a['agent_key']}`): "
                f"{a.get('total_signals_handled', 0)} signals, "
                f"avg confidence {conf} [{status}]\n"
            )

        output += "\n"
        return output

    def _department_report(self, db) -> str:
        depts_result = (
            db.table("departments")
            .select("id, name")
            .execute()
        )
        depts = depts_result.data or []

        if not depts:
            return "## Department Summary\nNo departments configured.\n\n"

        # Count users per dept
        users_result = (
            db.table("users")
            .select("department_id")
            .eq("is_active", True)
            .execute()
        )
        user_counts: dict[str, int] = {}
        for u in users_result.data or []:
            did = u.get("department_id")
            if did:
                user_counts[did] = user_counts.get(did, 0) + 1

        # Count signals per dept
        signals_result = (
            db.table("signals")
            .select("source_department_id")
            .execute()
        )
        signal_counts: dict[str, int] = {}
        for s in signals_result.data or []:
            did = s.get("source_department_id")
            if did:
                signal_counts[did] = signal_counts.get(did, 0) + 1

        output = "## Department Summary\n\n"
        for d in depts:
            uc = user_counts.get(d["id"], 0)
            sc = signal_counts.get(d["id"], 0)
            output += f"- **{d['name']}**: {uc} members, {sc} signals\n"

        output += "\n"
        return output

    def _risk_report(self, db) -> str:
        # High/critical signals that are still active
        result = (
            db.table("signals")
            .select("id, title, priority, status, category, created_at")
            .in_("priority", ["high", "critical"])
            .in_("status", ["new", "processing", "judged", "awaiting_decision"])
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        signals = result.data or []

        output = "## Risk Summary\n\n"
        if not signals:
            output += "No high-priority active signals. Risk posture is stable.\n\n"
            return output

        critical = [s for s in signals if s["priority"] == "critical"]
        high = [s for s in signals if s["priority"] == "high"]

        output += f"- **Critical active signals:** {len(critical)}\n"
        output += f"- **High active signals:** {len(high)}\n\n"

        if critical:
            output += "**Critical Signals (immediate attention):**\n"
            for s in critical[:5]:
                output += f"- {s['title']} [{s['status']}] — {s.get('category', 'uncategorised')}\n"
            output += "\n"

        if high:
            output += "**High Priority Signals:**\n"
            for s in high[:5]:
                output += f"- {s['title']} [{s['status']}] — {s.get('category', 'uncategorised')}\n"
            output += "\n"

        return output
