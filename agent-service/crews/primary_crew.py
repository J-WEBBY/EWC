"""
Primary Agent Crew — the supreme orchestrator of the JWEBLY platform.

This is NOT a router. This is the brain. It:
- Handles requests directly when it has the knowledge and tools
- Searches for information (web + knowledge base)
- Queries, creates, updates, and escalates signals
- Judges signals with confidence scores and risk assessments
- Delegates to specialist agents only when domain expertise is needed
- Generates reports and analytics
- Runs proactive scans
- Reads and modifies system settings
- Manages users and department information

The Primary Agent has a bird's-eye view and command over every page and
feature: agents, judgement engine, automations, integrations, risk analysis,
signals, bridges, and settings.
"""

from typing import Optional
from crewai import Agent, Task, Crew, Process
from config import PRIMARY_MODEL
from tools.registry import build_primary_tools
from memory.supabase_memory import get_memory_context, store_memory
from db import get_supabase


def build_system_prompt(
    tenant: dict,
    user: dict,
    agents: list[dict],
    agent_scope: Optional[str] = None,
) -> str:
    """Build the comprehensive system prompt from tenant context."""
    from datetime import datetime

    ai_name = tenant.get("ai_name", "Ilyas")
    company_name = tenant.get("company_name", "the organisation")

    industry = tenant.get("industry") or {}
    industry_name = industry.get("name", "operations") if isinstance(industry, dict) else "operations"

    user_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip() or "Team Member"

    user_role_obj = user.get("role") or {}
    user_role = user_role_obj.get("name", "Staff") if isinstance(user_role_obj, dict) else "Staff"

    user_dept_obj = user.get("department") or {}
    user_dept = user_dept_obj.get("name", "General") if isinstance(user_dept_obj, dict) else "General"

    agent_list = "\n".join(
        f"- **{a['display_name']}** (`{a['agent_key']}`): "
        f"{a.get('description', 'No description')}. "
        f"Domains: {', '.join((a.get('scope') or {}).get('domains', []))}"
        for a in agents
    )

    now = datetime.now()
    date_str = now.strftime("%A, %d %B %Y")
    time_str = now.strftime("%H:%M")

    prompt = f"""You are {ai_name}, the Primary Intelligence Agent for {company_name}, operating in the {industry_name} sector.

You are speaking with {user_name}, a {user_role} in the {user_dept} department.

## CURRENT CONTEXT
- **Date:** {date_str}
- **Time:** {time_str}
- **Location:** United Kingdom
- **Timezone:** GMT/BST

## YOUR ROLE
You are the supreme orchestrator — the most intelligent and capable agent in the entire system. You are NOT a router. You are the brain. You exercise real intelligence in every interaction — dynamic, flexible, reasoned. No predefined algorithmic options. Pure intelligence.

You have a bird's-eye view and command over every subsystem:
1. **Signals** — query, create, update, escalate, close any operational signal
2. **Judgement Engine** — assess risk, score confidence, provide reasoned recommendations
3. **Specialist Agents** — delegate to specialists and review their output
4. **Knowledge Base** — search internal policies, procedures, and documents
5. **Web Search** — find current information from external sources
6. **Reports & Analytics** — generate operational intelligence reports
7. **Organisation** — query departments, users, and org structure
8. **Settings** — read and modify system configuration
9. **Integrations** — inspect connected external systems
10. **Proactive Scans** — run health checks to surface hidden issues

## INTERACTION STYLE
- **Be inquisitive first, act second** — when a user brings a request (especially planning, strategy, or new initiatives), ask clarifying questions before jumping to action. Understand their goals, constraints, and preferences.
- **Help users develop their thinking** — don't accept vague requests at face value. Probe deeper: What are the specific objectives? Who is the audience? What does success look like? What resources or constraints exist?
- **Propose, don't impose** — present plans and recommendations as proposals for discussion. Use phrases like "Here's what I'd suggest — what do you think?" or "Before I create this, let me check a few things with you."
- **Collaborate iteratively** — work through complex requests step by step with the user. First understand, then outline, then refine, then act. Don't try to do everything in one response.
- **Only use tools when the user's intent is clear** — don't immediately create signals, delegate tasks, or run searches at the first mention. First understand what the user actually wants, then propose, then execute once confirmed.
- **Ask 2-3 focused questions** when a request is ambiguous — don't overwhelm with too many questions, but don't assume either.

## INTELLIGENCE PRINCIPLES
- **Connect the dots** — link signals, patterns, and context across the system
- **Exercise judgement** — provide opinions, risk assessments, and recommendations
- **Explain your reasoning** — transparency builds trust

## AVAILABLE SPECIALIST AGENTS
{agent_list}

Only delegate to specialists when:
- The task specifically requires their domain expertise AND the user has confirmed
- You cannot handle it directly with your own tools
- The specialist has capabilities beyond what you can offer

## COMMUNICATION & FORMATTING
- Use British English throughout
- Be concise, professional, and action-oriented
- **Always format responses in rich Markdown** — use headers (##, ###), bullet points, bold, and numbered lists
- When presenting data, provide analysis and recommendations, not just raw numbers
- Use tables for comparative data when appropriate
- When reporting web search results, synthesise the information into a well-structured answer with clear sections — do NOT just dump raw search results
- For questions about current events or time-sensitive topics, use web_search with search_depth "advanced"
- Confirm before taking destructive or irreversible actions"""

    # Add scope-specific mode instructions
    scope_instructions = {
        "judge": (
            "\n\n## ACTIVE MODE: JUDGE\n"
            "Focus on evaluating signals. Provide risk assessments, confidence scores, "
            "and actionable recommendations. For each signal, consider: priority, impact, "
            "urgency, and the most effective response."
        ),
        "agent": (
            "\n\n## ACTIVE MODE: AGENT ASSIGNMENT\n"
            "Focus on routing tasks to the correct specialist agent. Analyse the request, "
            "match it against agent capabilities, and delegate with clear instructions."
        ),
        "automate": (
            "\n\n## ACTIVE MODE: AUTOMATION\n"
            "Focus on defining automated workflows, triggers, and rules. Suggest which "
            "signals should be auto-processed and how to reduce manual work."
        ),
        "integrate": (
            "\n\n## ACTIVE MODE: INTEGRATION\n"
            "Focus on connecting external tools and data sources. Discuss API connections, "
            "data syncing, and how external systems can feed into the platform."
        ),
        "simulate": (
            "\n\n## ACTIVE MODE: SIMULATION\n"
            "Focus on modelling scenarios and predicting outcomes. Discuss potential impacts "
            "of decisions on operations."
        ),
    }

    if agent_scope and agent_scope in scope_instructions:
        prompt += scope_instructions[agent_scope]

    return prompt


def load_context(tenant_id: str, user_id: str) -> tuple[dict, dict, list[dict]]:
    """Load tenant, user, and agent context from DB."""
    db = get_supabase()

    tenant_result = (
        db.table("tenants")
        .select("company_name, ai_name, brand_color, industry:industries(name)")
        .eq("id", tenant_id)
        .single()
        .execute()
    )
    tenant = tenant_result.data or {}

    user_result = (
        db.table("users")
        .select(
            "first_name, last_name, job_title, "
            "department:departments!users_department_id_fkey(name), "
            "role:roles(name)"
        )
        .eq("id", user_id)
        .eq("tenant_id", tenant_id)
        .single()
        .execute()
    )
    user = user_result.data or {}

    agents_result = (
        db.table("agents")
        .select("id, agent_key, display_name, description, scope, is_catch_all")
        .eq("tenant_id", tenant_id)
        .eq("is_active", True)
        .order("priority_weight", desc=True)
        .execute()
    )
    agents = agents_result.data or []

    return tenant, user, agents


def run_primary_agent(
    tenant_id: str,
    user_id: str,
    message: str,
    conversation_id: Optional[str] = None,
    agent_scope: Optional[str] = None,
    chat_history: Optional[list[dict]] = None,
) -> dict:
    """
    Run the Primary Agent crew on a user message.

    Returns:
        {
            "response": str,      # Agent's text response
            "tool_calls": list,   # Tool calls made during execution
        }
    """
    # Load context
    tenant, user, agents = load_context(tenant_id, user_id)
    backstory = build_system_prompt(tenant, user, agents, agent_scope)

    # Inject long-term memory into backstory
    memory_ctx = get_memory_context(tenant_id, agent_key="primary", limit=5)
    if memory_ctx:
        backstory += f"\n\n{memory_ctx}"

    ai_name = tenant.get("ai_name", "Ilyas")

    # Build tenant-scoped tools
    tools = build_primary_tools(tenant_id, user_id, conversation_id)

    # Create the Primary Agent
    primary_agent = Agent(
        role=f"{ai_name} — Primary Intelligence Agent",
        goal=(
            "Understand the user's intent fully, then use your tools and intelligence "
            "to provide the most helpful, accurate, and actionable response possible. "
            "Exercise genuine reasoning — never give canned responses."
        ),
        backstory=backstory,
        tools=tools,
        llm=f"anthropic/{PRIMARY_MODEL}",
        verbose=False,
        memory=True,
        max_iter=15,
        max_rpm=30,
        allow_delegation=False,  # Primary handles directly; delegates via tools
    )

    # Build the task with conversation context
    context_str = ""
    if chat_history:
        recent = chat_history[-10:]  # Last 10 messages for context
        context_str = "\n\n## Conversation History\n"
        for msg in recent:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            context_str += f"**{role.capitalize()}:** {content}\n\n"

    # Inject current date/time directly into task description so the model sees it
    from datetime import datetime
    now = datetime.now()
    date_str = now.strftime("%A, %d %B %Y")
    time_str = now.strftime("%H:%M")

    task = Task(
        description=(
            f"**Current date:** {date_str}\n"
            f"**Current time:** {time_str} (UK time, GMT/BST)\n"
            f"**Location:** United Kingdom\n"
            f"{context_str}\n\n"
            f"## Current User Message\n{message}\n\n"
            "Respond to the user's message using your full capabilities. "
            "You DO have access to the current date and time — it is shown above. "
            "Use tools when you need data, external information, or to take action. "
            "Reason through complex requests step by step. "
            "Be concise but thorough. Always format responses in rich Markdown."
        ),
        expected_output=(
            "A clear, actionable response that directly addresses the user's request. "
            "Include relevant data from tools if used. Provide analysis and "
            "recommendations where appropriate. Use Markdown formatting."
        ),
        agent=primary_agent,
    )

    # Run the crew
    crew = Crew(
        agents=[primary_agent],
        tasks=[task],
        process=Process.sequential,
        verbose=False,
    )

    result = crew.kickoff()

    response_text = str(result)

    # Store conversation memory (non-blocking, best-effort)
    try:
        summary = f"User asked: {message[:100]}. Agent responded about: {response_text[:100]}"
        store_memory(
            tenant_id=tenant_id,
            content=summary,
            memory_type="conversation",
            agent_key="primary",
            importance=0.3,
        )
    except Exception:
        pass

    return {
        "response": response_text,
        "tool_calls": [],  # CrewAI tracks internally; we log separately
    }
