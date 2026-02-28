"""
Tool Registry — creates tenant-scoped tool instances for each request.

Every tool receives tenant_id (and user_id where needed) so they query
the correct data. This factory is called once per chat/classify request.
"""

from typing import Optional

from tools.signals import (
    QuerySignalsTool,
    CreateSignalTool,
    UpdateSignalTool,
    EscalateSignalTool,
)
from tools.knowledge_base import KnowledgeBaseSearchTool
from tools.departments import DepartmentInfoTool
from tools.agents import GetAgentsTool, RouteToSpecialistTool
from tools.judgement import (
    JudgeSignalTool,
    AssessRiskTool,
    GetPendingJudgementsTool,
)
from tools.reports import GenerateReportTool
from tools.web_search import WebSearchTool
from tools.settings import ReadSettingsTool, UpdateSettingsTool, GetIntegrationsTool
from tools.users import GetUserInfoTool
from tools.scan import RunProactiveScanTool


def build_primary_tools(
    tenant_id: str,
    user_id: str,
    conversation_id: Optional[str] = None,
) -> list:
    """
    Build the full tool set for the Primary Agent.
    Every tool is scoped to the given tenant and user.
    """
    return [
        # --- Signals (full lifecycle) ---
        QuerySignalsTool(tenant_id=tenant_id),
        CreateSignalTool(
            tenant_id=tenant_id,
            user_id=user_id,
            conversation_id=conversation_id,
        ),
        UpdateSignalTool(tenant_id=tenant_id),
        EscalateSignalTool(tenant_id=tenant_id),

        # --- Knowledge Base ---
        KnowledgeBaseSearchTool(tenant_id=tenant_id),

        # --- Organisation ---
        DepartmentInfoTool(tenant_id=tenant_id),
        GetUserInfoTool(tenant_id=tenant_id),

        # --- Agent Management ---
        GetAgentsTool(tenant_id=tenant_id),
        RouteToSpecialistTool(
            tenant_id=tenant_id,
            user_id=user_id,
            conversation_id=conversation_id,
        ),

        # --- Judgement & Risk ---
        JudgeSignalTool(tenant_id=tenant_id),
        AssessRiskTool(tenant_id=tenant_id),
        GetPendingJudgementsTool(tenant_id=tenant_id),

        # --- Reports & Analytics ---
        GenerateReportTool(tenant_id=tenant_id),

        # --- Web Search ---
        WebSearchTool(),

        # --- Settings & Config ---
        ReadSettingsTool(tenant_id=tenant_id),
        UpdateSettingsTool(tenant_id=tenant_id),
        GetIntegrationsTool(tenant_id=tenant_id),

        # --- Proactive Scan ---
        RunProactiveScanTool(tenant_id=tenant_id),
    ]


# Tool count for reference
TOOL_COUNT = 18
