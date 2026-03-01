# Agent Status — EWC Operational Intelligence System

**Last updated**: 2026-03-01

---

## Agent Overview

| Agent | Key | Persona | Scope | Model |
|---|---|---|---|---|
| EWC | `primary_agent` | Orchestrator | All clinic operations | Sonnet 4.6 |
| Orion | `sales_agent` | Revenue Intelligence | Acquisition, commercial pipeline | Sonnet 4.6 |
| Aria | `crm_agent` | Patient Relations | Retention, welfare, complaints | Sonnet 4.6 |

---

## Execution Layer

Two parallel executors exist. The Next.js API route tries Python first, falls back to TypeScript.

### 1. Python CrewAI (Primary)
- **Location**: `agent-service/` (FastAPI, port 8001)
- **Framework**: CrewAI + Anthropic SDK
- **Entry point**: `crews/primary_crew.py` → `run_agent()`
- **Wiring**: `/api/primary-agent/chat` → `http://localhost:8001/chat/stream`
- **Status**: ✅ Fixed (2026-03-01) — tenant_id bugs resolved, missing tools added

### 2. TypeScript ReAct Loop (Fallback)
- **Location**: `src/lib/ai/agent-executor.ts`
- **Framework**: Custom ReAct loop with Anthropic SDK
- **Entry point**: `src/lib/actions/primary-agent.ts` → `agentChatStream()`
- **Status**: ✅ Active — always available as fallback

---

## EWC — Primary Orchestrator

**Sophistication**: 9/10 (with CrewAI + live context)

### Python CrewAI Tools (18 total)
| Tool | Purpose |
|---|---|
| `query_signals` | Search operational signals |
| `create_signal` | Raise new signals |
| `update_signal` | Progress signal lifecycle |
| `escalate_signal` | Raise signal priority |
| `knowledge_base_search` | Query clinic KB |
| `get_department_info` | Org structure |
| `get_user_info` | Staff member info |
| `get_available_agents` | List agents |
| `route_to_specialist` | Delegate to Orion/Aria |
| `judge_signal` | Risk assessment |
| `assess_risk` | Risk scoring |
| `get_pending_judgements` | Pending decisions |
| `generate_report` | Management reports |
| `web_search` | Public web search (Tavily) |
| `read_settings` | Clinic config |
| `update_settings` | Modify config |
| `get_integrations` | Integration status |
| `run_proactive_scan` | Full system health scan |
| `get_clinic_overview` | ✅ NEW — clinic dashboard snapshot |
| `query_patients` | ✅ NEW — patient records |
| `query_appointments` | ✅ NEW — appointment history |

### System Prompt
Source: `agents.system_prompt` DB field (migration 025)
Live context injected at runtime: active signals, critical count, pending approval count

---

## Orion — Revenue Intelligence

**Sophistication**: 8/10 (with CrewAI + live context + detailed domain knowledge)

### Python CrewAI Tools (9 total — specialist subset)
| Tool | Purpose |
|---|---|
| `query_signals` | Revenue/commercial signals |
| `create_signal` | Raise commercial signals |
| `update_signal` | Progress commercial signals |
| `knowledge_base_search` | Pricing, packages, offers |
| `generate_report` | Revenue reports |
| `web_search` | Market research |
| `run_proactive_scan` | Commercial health scan |
| `query_patients` | ✅ NEW — patient treatment history |
| `query_appointments` | ✅ NEW — booking patterns, DNA |

### System Prompt
Source: `agents.system_prompt` DB field (migration 025)
Includes: upsell matrix, lead scoring, corporate pitch, treatment revenue profile, signal triggers
Live context injected: corporate enquiries this week, overdue invoices, top commercial signals

---

## Aria — Patient Relations & Retention

**Sophistication**: 8/10 (with CrewAI + live context + empathy framework)

### Python CrewAI Tools (9 total — specialist subset)
| Tool | Purpose |
|---|---|
| `query_signals` | Retention/welfare signals |
| `create_signal` | Raise patient signals |
| `update_signal` | Progress patient signals |
| `knowledge_base_search` | GDPR, complaints, protocols |
| `generate_report` | Retention reports |
| `web_search` | Clinical guidance |
| `run_proactive_scan` | Patient welfare scan |
| `query_patients` | ✅ NEW — patient records, LTV, last visit |
| `query_appointments` | ✅ NEW — DNA history, booking patterns |

### System Prompt
Source: `agents.system_prompt` DB field (migration 025)
Includes: follow-up schedule, DNA protocol, empathy language, complaint framework, GDPR
Live context injected: churn risk signals (named), follow-up count, open DNA count

---

## What Unlocks Each Agent's Full Potential

| Integration | Unlocks |
|---|---|
| **Cliniko API** | Real patient data in `query_patients`/`query_appointments` — CRITICAL |
| **Twilio** | Aria can draft real SMS messages, Orion can send payment links |
| **Stripe/GoCardless** | Orion can generate payment links, track revenue vs target live |
| **n8n** | Automated signal creation from crons (retention schedules, invoice monitoring) |
| **Vapi Webhooks** | Post-call signals feed into Aria (DNA detection, sentiment) |

---

## How to Start the Python Service

```bash
cd agent-service
# Create .env from .env.example or set vars:
# ANTHROPIC_API_KEY=sk-ant-...
# SUPABASE_URL=https://....supabase.co
# SUPABASE_SERVICE_ROLE_KEY=...
# AGENT_SERVICE_SECRET=your-shared-secret
# AGENT_SERVICE_PORT=8001

python -m venv venv
venv/Scripts/activate  # Windows
pip install -r requirements.txt
python main.py
```

Then in a separate terminal:
```bash
cd ..  # back to jwebly-system root
npx next dev
```

The Next.js app auto-detects the Python service and routes through it.
