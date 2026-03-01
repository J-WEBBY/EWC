"""
EWC Multi-Agent Crew — EWC orchestrator + Orion (revenue) + Aria (retention)

Architecture:
  - run_agent() is the single entry point, routes based on agent_scope
  - EWC (primary_agent): orchestrator, all 18 tools, can invoke Orion/Aria via tool
  - Orion (sales_agent): revenue/acquisition specialist, focused tool subset
  - Aria (crm_agent): patient retention specialist, focused tool subset

Each agent loads their system_prompt from the DB (set by migration 022) so
config changes take effect without redeployment. Memories are injected as
context after the base prompt.

Backward compat: run_primary_agent() wrapper keeps chat.py unchanged.
"""

from typing import Optional
from datetime import datetime
from crewai import Agent, Task, Crew, Process
from config import PRIMARY_MODEL, SPECIALIST_MODEL
from tools.registry import build_primary_tools, build_specialist_tools
from db import get_supabase
from embeddings import generate_embedding


# =============================================================================
# DB context helpers
# =============================================================================

def load_context(user_id: str) -> tuple[dict, dict]:
    """
    Load clinic config + user. Single-tenant: no tenant_id needed.
    Replaces the old load_context that queried the non-existent tenants table.
    """
    db = get_supabase()

    clinic_result = (
        db.table("clinic_config")
        .select("clinic_name, ai_name")
        .limit(1)
        .single()
        .execute()
    )
    clinic = clinic_result.data or {}

    user_result = (
        db.table("users")
        .select("first_name, last_name, role:roles(name)")
        .eq("id", user_id)
        .single()
        .execute()
    )
    user = user_result.data or {}

    return clinic, user


def load_agent_db_prompt(agent_key: str) -> Optional[str]:
    """Load the agent's system_prompt from the agents table (migration 022)."""
    db = get_supabase()
    result = (
        db.table("agents")
        .select("system_prompt")
        .eq("agent_key", agent_key)
        .single()
        .execute()
    )
    if result.data:
        return result.data.get("system_prompt") or None
    return None


def load_agent_memories(agent_key: str, limit: int = 5) -> str:
    """Return recent memories as a formatted string to inject into backstory."""
    db = get_supabase()
    result = (
        db.table("agent_memories")
        .select("content, memory_type")
        .eq("agent_key", agent_key)
        .order("importance", desc=True)
        .limit(limit)
        .execute()
    )
    memories = result.data or []
    if not memories:
        return ""
    lines = ["\n\n--- RECENT MEMORY ---"]
    for m in memories:
        tag = (m.get("memory_type") or "note").upper()
        lines.append(f"[{tag}] {m['content'][:400]}")
    lines.append("--- END MEMORY ---")
    return "\n".join(lines)


def build_live_snapshot(agent_key: str) -> str:
    """
    Build a real-time operational snapshot for each agent.
    Injected into backstory so agents are aware of current clinic state.
    Mirrors TypeScript buildAgentLiveContext() in primary-agent.ts.
    """
    try:
        db = get_supabase()
        lines = ["", "", "## LIVE OPERATIONAL SNAPSHOT"]

        if agent_key == "primary_agent":
            from datetime import timedelta, timezone
            week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            active_res   = db.table("signals").select("*", count="exact").in_("status", ["new", "processing", "pending_approval"]).execute()
            critical_res = db.table("signals").select("*", count="exact").in_("status", ["new", "processing"]).eq("priority", "critical").execute()
            pending_res  = db.table("signals").select("*", count="exact").eq("status", "pending_approval").execute()
            resolved_res = db.table("signals").select("*", count="exact").eq("status", "resolved").gte("resolved_at", week_ago).execute()
            active   = active_res.count or 0
            critical = critical_res.count or 0
            pending  = pending_res.count or 0
            resolved = resolved_res.count or 0
            lines.append(f"- Active signals (clinic-wide): **{active}**")
            lines.append(f"- Critical signals: **{critical}**{' ⚠️ review immediately' if critical > 0 else ' ✓ none'}")
            lines.append(f"- Pending approval: **{pending}**{' — staff decision required' if pending > 0 else ''}")
            lines.append(f"- Resolved this week: **{resolved}**")

        elif agent_key == "sales_agent":
            from datetime import timedelta, timezone
            week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
            commercial_res = db.table("signals").select("id, title, priority").in_("status", ["new", "processing", "pending_approval"]).overlaps("tags", ["corporate", "invoice", "overdue", "new-account"]).order("priority", desc=True).limit(5).execute()
            corp_week_res  = db.table("signals").select("*", count="exact").overlaps("tags", ["corporate", "new-account"]).gte("created_at", week_ago).execute()
            overdue_res    = db.table("signals").select("*", count="exact").in_("status", ["new", "processing", "pending_approval"]).overlaps("tags", ["invoice", "overdue"]).execute()
            corp_week     = corp_week_res.count or 0
            overdue_count = overdue_res.count or 0
            top_signals   = commercial_res.data or []
            lines.append(f"- Corporate / commercial enquiries this week: **{corp_week}**")
            lines.append(f"- Overdue invoice signals: **{overdue_count}**{' — chase required' if overdue_count > 0 else ''}")
            if top_signals:
                lines.append("- Open commercial signals:")
                for s in top_signals:
                    lines.append(f"  • [{s['priority'].upper()}] {s['title']}")
            else:
                lines.append("- No open commercial signals — pipeline is clear")

        elif agent_key == "crm_agent":
            churn_res   = db.table("signals").select("id, title, priority").in_("status", ["new", "processing", "pending_approval"]).overlaps("tags", ["churn-risk"]).order("priority", desc=True).limit(5).execute()
            followup_res = db.table("signals").select("*", count="exact").in_("status", ["new", "processing"]).overlaps("tags", ["retention", "follow-up", "botox", "coolsculpting", "weight-management"]).execute()
            dna_res      = db.table("signals").select("*", count="exact").in_("status", ["new", "processing"]).overlaps("tags", ["dna"]).execute()
            churn_signals = churn_res.data or []
            follow_ups    = followup_res.count or 0
            dnas          = dna_res.count or 0
            lines.append(f"- Active churn risk signals: **{len(churn_signals)}**{' — patients need attention' if churn_signals else ' ✓ none'}")
            lines.append(f"- Active follow-up / retention tasks: **{follow_ups}**")
            lines.append(f"- Open DNA signals: **{dnas}**{' — follow up within 24h' if dnas > 0 else ''}")
            if churn_signals:
                lines.append("- At-risk patients:")
                for s in churn_signals:
                    lines.append(f"  • [{s['priority'].upper()}] {s['title']}")

        lines.append("(Use your tools to investigate any of the above in detail)")
        return "\n".join(lines)

    except Exception as e:
        print(f"[primary_crew] build_live_snapshot error: {e}")
        return ""


def _context_footer(clinic: dict, user: dict) -> str:
    """Append live date/time and staff context to every agent backstory."""
    now = datetime.now()
    date_str = now.strftime("%A, %d %B %Y")
    time_str = now.strftime("%H:%M")

    user_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Staff Member"
    user_role_obj = user.get("role") or {}
    user_role = user_role_obj.get("name", "Staff") if isinstance(user_role_obj, dict) else "Staff"

    return (
        f"\n\n--- OPERATIONAL CONTEXT ---"
        f"\nDate/Time: {date_str}, {time_str} (UK)"
        f"\nStaff: {user_name} ({user_role})"
        f"\n--- END CONTEXT ---"
    )


def _build_task_description(message: str, chat_history: Optional[list]) -> str:
    """Build task description with conversation history prepended."""
    context = ""
    if chat_history:
        recent = chat_history[-8:]
        context = "\n\n## Conversation History\n"
        for msg in recent:
            role = (msg.get("role") or "user").capitalize()
            content = msg.get("content") or ""
            context += f"**{role}:** {content}\n\n"

    return (
        f"{context}"
        f"\n## Current Message\n{message}\n\n"
        "Respond to the user's message using your full capabilities. "
        "Use tools when you need data or need to take action. "
        "Always format responses in rich Markdown."
    )


# =============================================================================
# Agent runners
# =============================================================================

def run_ewc(
    user_id: str,
    message: str,
    conversation_id: Optional[str] = None,
    chat_history: Optional[list] = None,
) -> dict:
    """
    Run EWC as the primary orchestrator with Orion + Aria as collaborative delegates.
    EWC handles the task directly but can delegate to Orion (revenue) or Aria
    (retention) when their specialist domain adds value.
    """
    clinic, user = load_context(user_id)

    # --- EWC (orchestrator) ---
    ewc_base = load_agent_db_prompt("primary_agent") or (
        f"You are EWC, the primary intelligence agent for "
        f"{clinic.get('clinic_name', 'Edgbaston Wellness Clinic')}. "
        "You are the orchestrator — handle operational queries directly, "
        "and delegate to Orion (revenue/acquisition) or Aria (retention/patient care) "
        "when their specialist domain is specifically needed."
    )
    ewc_memories      = load_agent_memories("primary_agent")
    ewc_snapshot      = build_live_snapshot("primary_agent")
    ewc_backstory     = ewc_base + ewc_snapshot + ewc_memories + _context_footer(clinic, user)

    # --- Orion (revenue specialist — delegate only) ---
    orion_base = load_agent_db_prompt("sales_agent") or (
        f"You are Orion, the revenue and patient acquisition specialist for "
        f"{clinic.get('clinic_name', 'Edgbaston Wellness Clinic')}. "
        "You analyse commercial opportunities, upsell potential, corporate wellness, "
        "and the acquisition pipeline. Be confident, data-driven, and commercially sharp."
    )

    # --- Aria (retention specialist — delegate only) ---
    aria_base = load_agent_db_prompt("crm_agent") or (
        f"You are Aria, the patient retention and relationship specialist for "
        f"{clinic.get('clinic_name', 'Edgbaston Wellness Clinic')}. "
        "You protect the patient experience, identify churn risks, manage follow-ups, "
        "and ensure every patient feels genuinely valued. Be warm, empathetic, precise."
    )

    ewc_tools      = build_primary_tools("clinic", user_id, conversation_id)
    orion_tools    = build_specialist_tools("clinic", user_id, conversation_id, agent_key="sales_agent")
    aria_tools     = build_specialist_tools("clinic", user_id, conversation_id, agent_key="crm_agent")

    ewc_agent = Agent(
        role="EWC — Primary Orchestrator",
        goal=(
            "Understand the request fully, use tools to gather data, and provide "
            "the most helpful, accurate, and actionable response. Delegate to Orion "
            "for commercial/revenue questions and to Aria for patient retention or "
            "relationship questions when their specialist expertise adds clear value."
        ),
        backstory=ewc_backstory,
        tools=ewc_tools,
        llm=f"anthropic/{PRIMARY_MODEL}",
        verbose=False,
        memory=False,
        max_iter=15,
        max_rpm=30,
        allow_delegation=True,
    )

    orion_agent = Agent(
        role="Orion — Revenue Intelligence",
        goal=(
            "Analyse the revenue pipeline, identify acquisition opportunities, "
            "and provide commercially sharp recommendations. Be data-driven. "
            "Frame everything in terms of patient value and clinic growth."
        ),
        backstory=orion_base,
        tools=orion_tools,
        llm=f"anthropic/{SPECIALIST_MODEL}",
        verbose=False,
        memory=False,
        max_iter=8,
        max_rpm=20,
        allow_delegation=False,
    )

    aria_agent = Agent(
        role="Aria — Patient Retention",
        goal=(
            "Protect patient relationships. Identify retention risks early, "
            "recommend empathetic and proactive follow-up actions, and ensure "
            "every patient feels genuinely valued. Be warm, precise, and caring."
        ),
        backstory=aria_base,
        tools=aria_tools,
        llm=f"anthropic/{SPECIALIST_MODEL}",
        verbose=False,
        memory=False,
        max_iter=8,
        max_rpm=20,
        allow_delegation=False,
    )

    task = Task(
        description=_build_task_description(message, chat_history),
        expected_output=(
            "A clear, actionable response in Markdown. Include data from tools "
            "where relevant. If you delegated to Orion or Aria, synthesise their "
            "findings into a cohesive response. Provide analysis and recommendations."
        ),
        agent=ewc_agent,
    )

    crew = Crew(
        agents=[ewc_agent, orion_agent, aria_agent],
        tasks=[task],
        process=Process.sequential,
        verbose=False,
    )

    result = crew.kickoff()
    response_text = str(result)
    _store_memory("primary_agent", message, response_text)
    return {"response": response_text, "tool_calls": []}


def run_orion(
    user_id: str,
    message: str,
    conversation_id: Optional[str] = None,
    chat_history: Optional[list] = None,
) -> dict:
    """Run Orion as the revenue/acquisition specialist."""
    clinic, user = load_context(user_id)

    base_prompt = load_agent_db_prompt("sales_agent") or (
        f"You are Orion, the revenue intelligence agent for "
        f"{clinic.get('clinic_name', 'Edgbaston Wellness Clinic')}. "
        "You own the acquisition and commercial pipeline."
    )
    memories      = load_agent_memories("sales_agent")
    live_snapshot = build_live_snapshot("sales_agent")
    backstory     = base_prompt + live_snapshot + memories + _context_footer(clinic, user)

    tools = build_specialist_tools("clinic", user_id, conversation_id)

    agent = Agent(
        role="Orion — Revenue Intelligence",
        goal=(
            "Analyse the revenue pipeline, identify acquisition opportunities, "
            "and provide commercially sharp recommendations. Be confident and "
            "data-driven. Frame everything in terms of patient value."
        ),
        backstory=backstory,
        tools=tools,
        llm=f"anthropic/{SPECIALIST_MODEL}",
        verbose=False,
        memory=False,
        max_iter=10,
        max_rpm=30,
        allow_delegation=False,
    )

    task = Task(
        description=_build_task_description(message, chat_history),
        expected_output=(
            "A commercially focused response with data from tools where relevant. "
            "Provide clear recommendations for revenue improvement in Markdown."
        ),
        agent=agent,
    )

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=False,
    )

    result = crew.kickoff()
    response_text = str(result)
    _store_memory("sales_agent", message, response_text)
    return {"response": response_text, "tool_calls": []}


def run_aria(
    user_id: str,
    message: str,
    conversation_id: Optional[str] = None,
    chat_history: Optional[list] = None,
) -> dict:
    """Run Aria as the patient retention/CRM specialist."""
    clinic, user = load_context(user_id)

    base_prompt = load_agent_db_prompt("crm_agent") or (
        f"You are Aria, the patient relations and retention agent for "
        f"{clinic.get('clinic_name', 'Edgbaston Wellness Clinic')}. "
        "You protect the patient experience and ensure every patient returns."
    )
    memories      = load_agent_memories("crm_agent")
    live_snapshot = build_live_snapshot("crm_agent")
    backstory     = base_prompt + live_snapshot + memories + _context_footer(clinic, user)

    tools = build_specialist_tools("clinic", user_id, conversation_id)

    agent = Agent(
        role="Aria — Patient Retention",
        goal=(
            "Protect the patient experience. Identify retention risks early, "
            "recommend caring and proactive follow-up actions, and ensure every "
            "patient feels genuinely valued. Be warm, empathetic, and precise."
        ),
        backstory=backstory,
        tools=tools,
        llm=f"anthropic/{SPECIALIST_MODEL}",
        verbose=False,
        memory=False,
        max_iter=10,
        max_rpm=30,
        allow_delegation=False,
    )

    task = Task(
        description=_build_task_description(message, chat_history),
        expected_output=(
            "A patient-focused response in Markdown. Prioritise empathy and care "
            "while providing concrete recommendations for retention and follow-up."
        ),
        agent=agent,
    )

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=False,
    )

    result = crew.kickoff()
    response_text = str(result)
    _store_memory("crm_agent", message, response_text)
    return {"response": response_text, "tool_calls": []}


# =============================================================================
# Entry point
# =============================================================================

def run_agent(
    user_id: str,
    message: str,
    agent_scope: str = "primary_agent",
    conversation_id: Optional[str] = None,
    chat_history: Optional[list] = None,
) -> dict:
    """
    Route to the correct agent based on agent_scope.
    - primary_agent → EWC (orchestrator, all tools)
    - sales_agent   → Orion (revenue/acquisition)
    - crm_agent     → Aria (patient retention)
    """
    if agent_scope == "sales_agent":
        return run_orion(user_id, message, conversation_id, chat_history)
    elif agent_scope == "crm_agent":
        return run_aria(user_id, message, conversation_id, chat_history)
    else:
        return run_ewc(user_id, message, conversation_id, chat_history)


def run_primary_agent(
    tenant_id: str,           # kept for backward compat — ignored (single-tenant)
    user_id: str,
    message: str,
    conversation_id: Optional[str] = None,
    agent_scope: Optional[str] = None,
    chat_history: Optional[list] = None,
) -> dict:
    """Backward-compatible entry point — chat.py calls this unchanged."""
    return run_agent(
        user_id=user_id,
        message=message,
        agent_scope=agent_scope or "primary_agent",
        conversation_id=conversation_id,
        chat_history=chat_history,
    )


# =============================================================================
# Private helpers
# =============================================================================

def _store_memory(agent_key: str, user_message: str, response_text: str) -> None:
    """
    Store conversation summary in agent_memories with vector embedding.
    Embedding is generated if OPENAI_API_KEY is set; stored as-is otherwise.
    """
    try:
        summary = (
            f"User asked: {user_message[:200]}. "
            f"Agent responded: {response_text[:300]}"
        )
        db = get_supabase()
        result = db.table("agent_memories").insert({
            "agent_key":   agent_key,
            "memory_type": "conversation",
            "content":     summary,
            "importance":  0.3,
        }).execute()

        # Generate embedding and update the row if OpenAI is configured
        if result.data:
            memory_id = result.data[0]["id"]
            embedding = generate_embedding(summary)
            if embedding:
                db.table("agent_memories").update({
                    "embedding": embedding,
                }).eq("id", memory_id).execute()
    except Exception as e:
        print(f"[memory] _store_memory error: {e}")
