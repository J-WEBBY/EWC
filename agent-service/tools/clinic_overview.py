"""
Clinic Overview tool — returns a comprehensive snapshot of the clinic's current state.
Used by EWC as the first tool to call for morning briefings and status checks.
"""

from crewai.tools import BaseTool
from pydantic import BaseModel
from db import get_supabase


class GetClinicOverviewTool(BaseTool):
    name: str = "get_clinic_overview"
    description: str = (
        "Get a comprehensive snapshot of the clinic's current operational state. "
        "Returns: active signal counts by priority, today's appointments, patient stats, "
        "and key KPI indicators. Always call this first for morning briefings or "
        "'how is the clinic doing?' queries before drilling into specific signals or data."
    )
    args_schema: type[BaseModel] = BaseModel
    tenant_id: str = ""

    def _run(self) -> str:
        db = get_supabase()
        output_lines = ["## Clinic Overview — Edgbaston Wellness Clinic\n"]

        # --- Signals breakdown ---
        try:
            signals_result = (
                db.table("signals")
                .select("id, priority, status, signal_type, title, created_at")
                .in_("status", ["new", "processing", "pending_approval"])
                .order("priority", desc=False)
                .limit(100)
                .execute()
            )
            signals = signals_result.data or []

            critical = [s for s in signals if s.get("priority") == "critical"]
            high     = [s for s in signals if s.get("priority") == "high"]
            medium   = [s for s in signals if s.get("priority") == "medium"]
            low      = [s for s in signals if s.get("priority") == "low"]
            pending  = [s for s in signals if s.get("status") == "pending_approval"]

            output_lines.append("### Active Signals")
            output_lines.append(f"- Total active: **{len(signals)}**")
            if critical:
                output_lines.append(f"- 🔴 Critical: **{len(critical)}** — IMMEDIATE ACTION REQUIRED")
                for s in critical:
                    output_lines.append(f"  • {s['title']}")
            if high:
                output_lines.append(f"- 🟠 High: **{len(high)}**")
                for s in high[:3]:
                    output_lines.append(f"  • {s['title']}")
            if medium:
                output_lines.append(f"- 🟡 Medium: **{len(medium)}**")
            if low:
                output_lines.append(f"- ⚪ Low: **{len(low)}**")
            if pending:
                output_lines.append(f"- ⏳ Pending approval: **{len(pending)}** — staff action needed")
        except Exception as e:
            output_lines.append(f"- Signals: unable to load ({e})")

        # --- Recent resolved ---
        try:
            from datetime import datetime, timedelta
            week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat() + "Z"
            resolved_result = (
                db.table("signals")
                .select("*", count="exact")
                .eq("status", "resolved")
                .gte("resolved_at", week_ago)
                .execute()
            )
            resolved_count = resolved_result.count or 0
            output_lines.append(f"- ✅ Resolved this week: **{resolved_count}**")
        except Exception:
            pass

        output_lines.append("")

        # --- Appointments today ---
        try:
            from datetime import datetime, timezone
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            appt_result = (
                db.table("cliniko_appointments")
                .select("id, status, appointment_type")
                .gte("starts_at", f"{today}T00:00:00")
                .lte("starts_at", f"{today}T23:59:59")
                .execute()
            )
            appts = appt_result.data or []
            if appts:
                dnas = sum(1 for a in appts if a.get("status") == "did_not_arrive")
                output_lines.append("### Today's Appointments")
                output_lines.append(f"- Scheduled today: **{len(appts)}**")
                if dnas > 0:
                    output_lines.append(f"- DNAs: **{dnas}** — Aria to follow up")
                output_lines.append("")
        except Exception:
            # Cliniko not connected yet
            output_lines.append("### Appointments")
            output_lines.append("- Live appointment data available once Cliniko is connected")
            output_lines.append("")

        # --- Patient stats ---
        try:
            patient_result = (
                db.table("cliniko_patients")
                .select("*", count="exact")
                .eq("status", "active")
                .execute()
            )
            active_patients = patient_result.count or 0
            output_lines.append("### Patient Intelligence")
            output_lines.append(f"- Active patients: **{active_patients}** (target: 350)")
            output_lines.append("")
        except Exception:
            output_lines.append("### Patients")
            output_lines.append("- Live patient data available once Cliniko is connected")
            output_lines.append("")

        # --- Agents status ---
        try:
            agent_result = (
                db.table("agents")
                .select("display_name, name, agent_key, signal_count, confidence_score")
                .execute()
            )
            agents = agent_result.data or []
            if agents:
                output_lines.append("### Agents Active")
                for a in agents:
                    name = a.get("display_name") or a.get("name", "Agent")
                    key  = a.get("agent_key", "")
                    sigs = a.get("signal_count") or 0
                    conf = a.get("confidence_score")
                    conf_str = f", confidence {round(conf * 100)}%" if conf else ""
                    output_lines.append(f"- **{name}** ({key}): {sigs} signals processed{conf_str}")
                output_lines.append("")
        except Exception:
            pass

        # --- KPI summary ---
        output_lines.append("### KPI Benchmarks (Q1 2026 — update when Cliniko live)")
        output_lines.append("| KPI | Target | Simulated |")
        output_lines.append("|---|---|---|")
        output_lines.append("| Monthly Revenue | £50,000 | £47,280 |")
        output_lines.append("| Booking Conversion | 70% | 68% |")
        output_lines.append("| Patient Retention (12mo) | 85% | 82% |")
        output_lines.append("| NPS | 75+ | 72 |")

        return "\n".join(output_lines)
