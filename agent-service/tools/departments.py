"""
Department and organisation structure tools.
"""

from typing import Optional
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from db import get_supabase


class DepartmentInfoInput(BaseModel):
    department_id: Optional[str] = Field(
        None,
        description="Department UUID for detailed info. Omit for full org structure.",
    )


class DepartmentInfoTool(BaseTool):
    name: str = "get_department_info"
    description: str = (
        "Get information about the organisation's departments, including "
        "members, signal counts, and hierarchy. Omit department_id for the "
        "full org structure, or provide a UUID for detailed department info."
    )
    args_schema: type[BaseModel] = DepartmentInfoInput
    tenant_id: str = ""

    def _run(self, department_id: Optional[str] = None) -> str:
        db = get_supabase()

        if department_id:
            return self._get_department_detail(db, department_id)
        return self._get_org_structure(db)

    def _get_department_detail(self, db, dept_id: str) -> str:
        # Fetch dept, members, signals in parallel-ish (sequential in Python)
        dept_result = (
            db.table("departments")
            .select("id, name, description, parent_department_id, head_user_id, created_at")
            .eq("id", dept_id)
            .eq("tenant_id", self.tenant_id)
            .single()
            .execute()
        )

        if not dept_result.data:
            return f"Department not found: {dept_id}"

        dept = dept_result.data

        members_result = (
            db.table("users")
            .select("id, first_name, last_name, job_title, email")
            .eq("tenant_id", self.tenant_id)
            .eq("department_id", dept_id)
            .eq("is_active", True)
            .execute()
        )
        members = members_result.data or []

        signals_result = (
            db.table("signals")
            .select("id, priority, status")
            .eq("tenant_id", self.tenant_id)
            .eq("source_department_id", dept_id)
            .execute()
        )
        signals = signals_result.data or []
        active_count = sum(
            1 for s in signals if s.get("status") in ("new", "processing", "judged")
        )

        output = f"## {dept['name']}\n"
        if dept.get("description"):
            output += f"{dept['description']}\n"
        output += f"\n**Members:** {len(members)}\n"
        output += f"**Active Signals:** {active_count} / {len(signals)} total\n\n"

        if members:
            output += "**Team:**\n"
            for m in members:
                is_head = " (Head)" if m["id"] == dept.get("head_user_id") else ""
                output += f"- {m['first_name']} {m['last_name']}{is_head} — {m.get('job_title', 'No title')}\n"

        return output.strip()

    def _get_org_structure(self, db) -> str:
        depts_result = (
            db.table("departments")
            .select("id, name, description, parent_department_id")
            .eq("tenant_id", self.tenant_id)
            .order("name")
            .execute()
        )
        depts = depts_result.data or []

        if not depts:
            return "No departments configured for this organisation."

        # Count members per department
        users_result = (
            db.table("users")
            .select("department_id")
            .eq("tenant_id", self.tenant_id)
            .eq("is_active", True)
            .execute()
        )
        counts: dict[str, int] = {}
        for u in users_result.data or []:
            did = u.get("department_id")
            if did:
                counts[did] = counts.get(did, 0) + 1

        output = f"## Organisation Structure ({len(depts)} departments)\n\n"
        for d in depts:
            c = counts.get(d["id"], 0)
            output += f"- **{d['name']}** ({c} members)"
            if d.get("description"):
                output += f" — {d['description']}"
            output += f"\n  ID: {d['id']}\n"

        return output.strip()
