"""
Classification endpoint — signal routing powered by CrewAI.
Replaces the HAIKU-based JSON classification with an intelligent agent
that reasons about the best agent assignment.
"""

import json
import time
import asyncio
from typing import Optional
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from crewai import Agent, Task, Crew, Process
from db import get_supabase
from config import CLASSIFIER_MODEL


router = APIRouter()


# ---------------------------------------------------------------------------
# Request model
# ---------------------------------------------------------------------------

class ClassifyRequest(BaseModel):
    tenant_id: str
    user_id: str
    text: str
    source: str = "user_chat"
    metadata: dict = Field(default_factory=dict)


# ---------------------------------------------------------------------------
# Classify and Route
# ---------------------------------------------------------------------------

@router.post("/route")
async def classify_and_route(request: ClassifyRequest):
    """
    Classify incoming text and route to the best specialist agent.
    Creates a signal assigned to that agent.
    """
    if not request.text.strip():
        return JSONResponse(
            status_code=400, content={"success": False, "error": "EMPTY_INPUT"}
        )

    try:
        db = get_supabase()

        # Load tenant + agents
        tenant_result = (
            db.table("tenants")
            .select("company_name, ai_name")
            .eq("id", request.tenant_id)
            .single()
            .execute()
        )
        tenant = tenant_result.data or {}

        agents_result = (
            db.table("agents")
            .select("id, agent_key, display_name, description, scope, is_catch_all, priority_weight")
            .eq("tenant_id", request.tenant_id)
            .eq("is_active", True)
            .order("priority_weight", desc=True)
            .execute()
        )
        agents = agents_result.data or []

        if not agents:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": "NO_AGENTS_CONFIGURED"},
            )

        # Build agent descriptions for the classifier
        agent_descriptions = "\n\n".join(
            f"### {a['display_name']} (key: {a['agent_key']})\n"
            f"- Description: {a.get('description', 'N/A')}\n"
            f"- Domains: {', '.join((a.get('scope') or {}).get('domains', []))}\n"
            f"- Keywords: {', '.join((a.get('scope') or {}).get('keywords', []))}\n"
            f"- Handles: {', '.join((a.get('scope') or {}).get('handles', []))}\n"
            f"{'- CATCH-ALL: Route here if no other agent matches' if a.get('is_catch_all') else ''}"
            for a in agents
        )

        ai_name = tenant.get("ai_name", "Ilyas")
        company = tenant.get("company_name", "Organisation")

        # Create classifier agent
        classifier = Agent(
            role=f"{ai_name} — Signal Classifier",
            goal=(
                "Analyse the input and determine which specialist agent should handle it. "
                "Provide a structured classification with confidence score and reasoning."
            ),
            backstory=(
                f"You are the classification module of {ai_name}, the AI system for {company}. "
                "Your job is to analyse incoming signals and route them accurately."
            ),
            llm=f"anthropic/{CLASSIFIER_MODEL}",
            verbose=False,
            memory=False,
            allow_delegation=False,
        )

        task = Task(
            description=(
                f"## Available Agents\n{agent_descriptions}\n\n"
                f"## Input to Classify\n{request.text}\n\n"
                "Classify this input. Respond with ONLY valid JSON:\n"
                "```json\n"
                "{\n"
                '  "agent": "<agent_key>",\n'
                '  "agent_confidence": <0.0-1.0>,\n'
                '  "reasoning": "<1-2 sentences>",\n'
                '  "category": "<descriptive label>",\n'
                '  "subcategory": "<or null>",\n'
                '  "intent": "<concise summary, max 80 chars>",\n'
                '  "urgency": "<low|medium|high|critical>",\n'
                '  "extracted_data": {},\n'
                '  "needs_clarification": false,\n'
                '  "clarification_questions": []\n'
                "}\n"
                "```"
            ),
            expected_output="Valid JSON classification object",
            agent=classifier,
        )

        crew = Crew(
            agents=[classifier],
            tasks=[task],
            process=Process.sequential,
            verbose=False,
        )

        # Run in thread pool
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, crew.kickoff)

        raw = str(result).strip()

        # Parse JSON
        try:
            cleaned = raw.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)
        except json.JSONDecodeError:
            catch_all = next((a for a in agents if a.get("is_catch_all")), agents[0])
            parsed = {
                "agent": catch_all["agent_key"],
                "agent_confidence": 0.5,
                "reasoning": "Could not parse classification — routing to catch-all",
                "category": "general",
                "subcategory": None,
                "intent": "unknown",
                "urgency": "medium",
                "extracted_data": {},
                "needs_clarification": False,
                "clarification_questions": [],
            }

        # Handle clarification
        if parsed.get("needs_clarification") and parsed.get("clarification_questions"):
            partial_agent = next(
                (a for a in agents if a["agent_key"] == parsed.get("agent")), None
            )
            return {
                "success": True,
                "clarification": {
                    "needsClarification": True,
                    "questions": parsed["clarification_questions"],
                    "partialClassification": {
                        "agentKey": partial_agent["agent_key"] if partial_agent else parsed.get("agent"),
                        "agentName": partial_agent["display_name"] if partial_agent else "Unknown",
                        "confidence": parsed.get("agent_confidence", 0),
                        "category": parsed.get("category"),
                    } if partial_agent else None,
                },
            }

        # Resolve agent
        matched = next(
            (a for a in agents if a["agent_key"] == parsed.get("agent")), None
        )
        if not matched:
            matched = next((a for a in agents if a.get("is_catch_all")), agents[0])

        priority = parsed.get("urgency", "medium")
        if priority not in ("low", "medium", "high", "critical"):
            priority = "medium"

        confidence = min(1.0, max(0.0, float(parsed.get("agent_confidence", 0.5))))

        # Create signal
        signal_result = (
            db.table("signals")
            .insert({
                "tenant_id": request.tenant_id,
                "signal_type": parsed.get("category", "general"),
                "title": (parsed.get("intent") or request.text[:80])[:200],
                "description": request.text,
                "priority": priority,
                "status": "pending_approval",
                "source_type": "manual",
                "source_agent_id": matched["id"],
                "created_by_user_id": request.user_id,
                "data": json.dumps({
                    "routed_by": "primary_agent",
                    "routed_to": matched["agent_key"],
                    "source": request.source,
                    **request.metadata,
                }),
                "tags": ["routed", f"agent:{matched['agent_key']}"],
                "category": parsed.get("category"),
                "user_input": request.text,
                "ai_classification": json.dumps({
                    "agent": parsed.get("agent"),
                    "agent_confidence": confidence,
                    "reasoning": parsed.get("reasoning"),
                    "category": parsed.get("category"),
                    "subcategory": parsed.get("subcategory"),
                    "intent": parsed.get("intent"),
                    "urgency": priority,
                }),
                "assignment_confidence": confidence,
                "assigned_reasoning": parsed.get("reasoning", "Classified by primary agent"),
            })
            .execute()
        )

        if not signal_result.data:
            return JSONResponse(
                status_code=500,
                content={"success": False, "error": "SIGNAL_CREATE_FAILED"},
            )

        signal_id = signal_result.data[0]["id"]

        # Increment agent count (fire and forget)
        try:
            db.table("agents").update({
                "total_signals_handled": matched.get("total_signals_handled", 0) + 1
            }).eq("id", matched["id"]).execute()
        except Exception:
            pass

        return {
            "success": True,
            "result": {
                "agentId": matched["agent_key"],
                "agentName": matched["display_name"],
                "signalId": signal_id,
                "agentUUID": matched["id"],
                "classification": {
                    "signalType": parsed.get("category", "general"),
                    "priority": priority,
                    "title": parsed.get("intent") or request.text[:80],
                    "confidence": round(confidence * 100),
                    "reasoning": parsed.get("reasoning", "Classified by primary agent"),
                    "category": parsed.get("category"),
                    "subcategory": parsed.get("subcategory"),
                    "intent": parsed.get("intent"),
                    "extractedData": parsed.get("extracted_data", {}),
                },
            },
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": "CRITICAL_FAILURE"},
        )
