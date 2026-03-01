"""
Settings and configuration tools — read/write system settings.
The Primary Agent can inspect and modify tenant configuration.
"""

import json
from typing import Optional
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from db import get_supabase


# ---------------------------------------------------------------------------
# Read Tenant Settings
# ---------------------------------------------------------------------------

class ReadSettingsTool(BaseTool):
    name: str = "read_settings"
    description: str = (
        "Read the organisation's current settings including AI name, brand colour, "
        "subscription tier, onboarding phase, and system configuration. "
        "Use this to understand the current state of the platform."
    )
    tenant_id: str = ""

    def _run(self) -> str:
        db = get_supabase()

        result = (
            db.table("tenants")
            .select(
                "id, company_name, primary_email, ai_name, brand_color, "
                "onboarding_phase, subscription_tier, logo_url, "
                "industry:industries(name, slug)"
            )
            .eq("id", self.tenant_id)
            .single()
            .execute()
        )

        if not result.data:
            return "Tenant settings not found."

        t = result.data
        industry = t.get("industry") or {}
        ind_name = industry.get("name", "Unknown") if isinstance(industry, dict) else "Unknown"

        output = "## Organisation Settings\n\n"
        output += f"- **Company:** {t.get('company_name', 'N/A')}\n"
        output += f"- **Industry:** {ind_name}\n"
        output += f"- **AI Name:** {t.get('ai_name', 'Ilyas')}\n"
        output += f"- **Brand Colour:** {t.get('brand_color', '#00e5a0')}\n"
        output += f"- **Subscription:** {t.get('subscription_tier', 'N/A')}\n"
        output += f"- **Onboarding Phase:** {t.get('onboarding_phase', 'N/A')}\n"
        output += f"- **Primary Email:** {t.get('primary_email', 'N/A')}\n"
        output += f"- **Logo:** {'Set' if t.get('logo_url') else 'Not set'}\n"

        return output.strip()


# ---------------------------------------------------------------------------
# Update Tenant Settings
# ---------------------------------------------------------------------------

class UpdateSettingsInput(BaseModel):
    ai_name: Optional[str] = Field(None, description="New AI assistant name")
    brand_color: Optional[str] = Field(None, description="New brand colour (hex)")


class UpdateSettingsTool(BaseTool):
    name: str = "update_settings"
    description: str = (
        "Update the organisation's settings such as AI name or brand colour. "
        "Use with caution — these changes affect the entire platform appearance."
    )
    args_schema: type[BaseModel] = UpdateSettingsInput
    tenant_id: str = ""

    def _run(
        self,
        ai_name: Optional[str] = None,
        brand_color: Optional[str] = None,
    ) -> str:
        updates: dict = {}
        if ai_name and ai_name.strip():
            updates["ai_name"] = ai_name.strip()[:50]
        if brand_color and brand_color.strip():
            updates["brand_color"] = brand_color.strip()

        if not updates:
            return "No settings to update."

        db = get_supabase()
        result = (
            db.table("tenants")
            .update(updates)
            .eq("id", self.tenant_id)
            .execute()
        )

        if not result.data:
            return "Failed to update settings."

        changes = ", ".join(f"{k} = {v}" for k, v in updates.items())
        return f"Settings updated: {changes}"


# ---------------------------------------------------------------------------
# Get Integration Status
# ---------------------------------------------------------------------------

class GetIntegrationsTool(BaseTool):
    name: str = "get_integrations"
    description: str = (
        "List all configured integrations and their connection status. "
        "Shows which external systems are connected (Slack, email, calendars, etc.)."
    )
    tenant_id: str = ""

    def _run(self) -> str:
        db = get_supabase()

        result = (
            db.table("integrations")
            .select(
                "id, status, last_synced_at, "
                "integration_type:integration_types(name, category, description)"
            )
            .execute()
        )

        integrations = result.data or []

        if not integrations:
            return "No integrations configured for this organisation."

        output = f"## Integrations ({len(integrations)})\n\n"
        for i in integrations:
            itype = i.get("integration_type") or {}
            name = itype.get("name", "Unknown") if isinstance(itype, dict) else "Unknown"
            category = itype.get("category", "") if isinstance(itype, dict) else ""
            status = i.get("status", "unknown")
            last_sync = i.get("last_synced_at", "Never")
            output += f"- **{name}** ({category}): {status} — Last synced: {last_sync}\n"

        return output.strip()
