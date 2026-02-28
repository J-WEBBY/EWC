"""
User tools — people management and user information.
"""

from typing import Optional
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from db import get_supabase


# ---------------------------------------------------------------------------
# Get User Info
# ---------------------------------------------------------------------------

class GetUserInfoInput(BaseModel):
    user_id: Optional[str] = Field(
        None, description="User UUID. Omit to get all active users."
    )


class GetUserInfoTool(BaseTool):
    name: str = "get_user_info"
    description: str = (
        "Get information about users in the organisation. Provide a user_id "
        "for specific user details, or omit for a list of all active users "
        "with their departments and roles."
    )
    args_schema: type[BaseModel] = GetUserInfoInput
    tenant_id: str = ""

    def _run(self, user_id: Optional[str] = None) -> str:
        db = get_supabase()

        if user_id:
            result = (
                db.table("users")
                .select(
                    "id, first_name, last_name, email, job_title, status, "
                    "created_at, "
                    "department:departments!users_department_id_fkey(name), "
                    "role:roles(name, permission_level)"
                )
                .eq("id", user_id)
                .eq("tenant_id", self.tenant_id)
                .single()
                .execute()
            )

            if not result.data:
                return f"User {user_id} not found."

            u = result.data
            dept = u.get("department") or {}
            dept_name = dept.get("name", "Unassigned") if isinstance(dept, dict) else "Unassigned"
            role = u.get("role") or {}
            role_name = role.get("name", "N/A") if isinstance(role, dict) else "N/A"

            output = f"## {u['first_name']} {u['last_name']}\n"
            output += f"- **Email:** {u.get('email', 'N/A')}\n"
            output += f"- **Job Title:** {u.get('job_title', 'N/A')}\n"
            output += f"- **Department:** {dept_name}\n"
            output += f"- **Role:** {role_name}\n"
            output += f"- **Status:** {u.get('status', 'N/A')}\n"
            output += f"- **Since:** {u.get('created_at', 'N/A')}\n"
            return output.strip()

        # List all active users
        result = (
            db.table("users")
            .select(
                "id, first_name, last_name, job_title, email, status, "
                "department:departments!users_department_id_fkey(name), "
                "role:roles(name)"
            )
            .eq("tenant_id", self.tenant_id)
            .eq("is_active", True)
            .order("first_name")
            .execute()
        )

        users = result.data or []
        if not users:
            return "No active users found."

        output = f"## Active Users ({len(users)})\n\n"
        for u in users:
            dept = u.get("department") or {}
            dept_name = dept.get("name", "Unassigned") if isinstance(dept, dict) else "Unassigned"
            role = u.get("role") or {}
            role_name = role.get("name", "") if isinstance(role, dict) else ""
            output += (
                f"- **{u['first_name']} {u['last_name']}** — "
                f"{u.get('job_title', 'N/A')} | {dept_name} | {role_name}\n"
                f"  ID: {u['id']}\n"
            )

        return output.strip()
