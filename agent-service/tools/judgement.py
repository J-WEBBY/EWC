"""
Judgement and risk assessment tools — the Primary Agent's decision-making interface.
"""

import json
from typing import Optional
from crewai.tools import BaseTool
from pydantic import BaseModel, Field
from db import get_supabase


# ---------------------------------------------------------------------------
# Judge Signal — assess and provide recommendation
# ---------------------------------------------------------------------------

class JudgeSignalInput(BaseModel):
    signal_id: str = Field(..., description="UUID of the signal to judge")
    confidence: float = Field(
        ..., description="Confidence score 0.0-1.0", ge=0.0, le=1.0
    )
    reasoning: str = Field(..., description="Detailed reasoning for the judgement")
    recommendation: str = Field(
        ...,
        description="Recommended action: accept, reject, escalate, defer, investigate",
    )
    suggested_actions: list[str] = Field(
        default_factory=list,
        description="List of specific actions to take",
    )
    risk_level: str = Field(
        "medium", description="Risk level: low, medium, high, critical"
    )


class JudgeSignalTool(BaseTool):
    name: str = "judge_signal"
    description: str = (
        "Assess a signal and provide a structured judgement with confidence score, "
        "reasoning, recommendation, and risk assessment. This creates a judgement "
        "record that can then be approved or modified by a human decision-maker."
    )
    args_schema: type[BaseModel] = JudgeSignalInput
    tenant_id: str = ""

    def _run(
        self,
        signal_id: str,
        confidence: float,
        reasoning: str,
        recommendation: str,
        suggested_actions: list[str] | None = None,
        risk_level: str = "medium",
    ) -> str:
        db = get_supabase()

        # Verify signal exists
        signal_result = (
            db.table("signals")
            .select("id, title, status")
            .eq("id", signal_id)
            .eq("tenant_id", self.tenant_id)
            .single()
            .execute()
        )

        if not signal_result.data:
            return f"Signal {signal_id} not found."

        signal = signal_result.data

        # Create judgement record
        judgement_row = {
            "tenant_id": self.tenant_id,
            "signal_id": signal_id,
            "confidence": confidence,
            "reasoning": reasoning,
            "recommendation": recommendation,
            "suggested_actions": suggested_actions or [],
            "risk_level": risk_level,
            "maturity_mode": "autonomous",
            "metadata": json.dumps({
                "judged_by": "primary_agent",
                "signal_title": signal["title"],
            }),
        }

        result = db.table("judgements").insert(judgement_row).execute()

        if not result.data:
            return "Failed to create judgement."

        judgement_id = result.data[0]["id"]

        # Update signal status to judged
        db.table("signals").update({"status": "judged"}).eq(
            "id", signal_id
        ).eq("tenant_id", self.tenant_id).execute()

        actions_str = ""
        if suggested_actions:
            actions_str = "\n**Suggested Actions:**\n" + "\n".join(
                f"  - {a}" for a in suggested_actions
            )

        return (
            f"Judgement recorded for signal '{signal['title']}'.\n"
            f"- Judgement ID: {judgement_id}\n"
            f"- Confidence: {round(confidence * 100)}%\n"
            f"- Recommendation: {recommendation}\n"
            f"- Risk Level: {risk_level}\n"
            f"- Reasoning: {reasoning}"
            f"{actions_str}"
        )


# ---------------------------------------------------------------------------
# Assess Risk — lightweight risk analysis without creating a full judgement
# ---------------------------------------------------------------------------

class AssessRiskInput(BaseModel):
    context: str = Field(
        ..., description="Description of the situation to assess"
    )
    domain: str = Field(
        "general",
        description="Risk domain: financial, operational, welfare, compliance, reputational, general",
    )


class AssessRiskTool(BaseTool):
    name: str = "assess_risk"
    description: str = (
        "Perform a quick risk assessment on a described situation. "
        "Returns a structured risk analysis without creating a formal "
        "judgement record. Use for preliminary analysis or advisory responses."
    )
    args_schema: type[BaseModel] = AssessRiskInput
    tenant_id: str = ""

    def _run(self, context: str, domain: str = "general") -> str:
        # This tool returns a prompt for the agent to reason about risk
        # The actual risk assessment is done by the LLM, not hardcoded logic
        return (
            f"Risk assessment context received for domain '{domain}'.\n"
            f"Situation: {context}\n\n"
            "Analyse this situation and provide:\n"
            "1. Risk level (low/medium/high/critical)\n"
            "2. Key risk factors identified\n"
            "3. Potential impact if unaddressed\n"
            "4. Recommended mitigations\n"
            "5. Urgency of response needed"
        )


# ---------------------------------------------------------------------------
# Get Pending Judgements — signals awaiting decisions
# ---------------------------------------------------------------------------

class GetPendingJudgementsInput(BaseModel):
    limit: int = Field(10, description="Max results", ge=1, le=50)


class GetPendingJudgementsTool(BaseTool):
    name: str = "get_pending_judgements"
    description: str = (
        "List signals that have been judged but are awaiting a human decision. "
        "Shows the judgement details and recommended actions."
    )
    args_schema: type[BaseModel] = GetPendingJudgementsInput
    tenant_id: str = ""

    def _run(self, limit: int = 10) -> str:
        db = get_supabase()

        result = (
            db.table("judgements")
            .select(
                "id, signal_id, confidence, reasoning, recommendation, "
                "suggested_actions, risk_level, created_at, "
                "signal:signals!judgements_signal_id_fkey(title, priority, status)"
            )
            .eq("tenant_id", self.tenant_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )

        judgements = result.data or []

        if not judgements:
            return "No pending judgements found."

        output = f"## Pending Judgements ({len(judgements)})\n\n"
        for j in judgements:
            signal = j.get("signal") or {}
            signal_title = signal.get("title", "Unknown") if isinstance(signal, dict) else "Unknown"
            output += f"### {signal_title}\n"
            output += f"- **Judgement ID:** {j['id']}\n"
            output += f"- **Signal ID:** {j['signal_id']}\n"
            output += f"- **Confidence:** {round(j['confidence'] * 100)}%\n"
            output += f"- **Recommendation:** {j['recommendation']}\n"
            output += f"- **Risk Level:** {j.get('risk_level', 'N/A')}\n"
            output += f"- **Reasoning:** {j['reasoning'][:200]}\n\n"

        return output.strip()
