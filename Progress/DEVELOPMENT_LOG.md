# EWC Development Log
**Project**: Aria — Edgbaston Wellness Clinic Operational Intelligence System
**Client**: Dr Suresh Ganata, Medical Director, Edgbaston, Birmingham
**Agency**: Jwebly Ltd — Joseph Enemuwe, Solutions Architect
**AI**: Claude Sonnet 4.6 (Claude Code)

---

## How to Use This Log
Every meaningful action, decision, or architectural change is recorded here in reverse-chronological order (newest first). Each session appends its actions. Session = one conversation with Claude Code.

---

## Session: 2026-03-01 — CrewAI Fix + Documentation Setup

### Actions Taken
1. **Discovered `agent-service/` already exists** with full CrewAI implementation (EWC, Orion, Aria via `crews/primary_crew.py`)
2. **Diagnosed critical bug**: Every Python tool filters by `tenant_id` — a column that does not exist in our single-tenant schema. This caused all DB queries from the Python service to silently fail or error.
3. **Diagnosed missing tools**: Python service lacks `query_patients`, `query_appointments`, `get_clinic_overview` (present in TypeScript but not Python)
4. **Fixed all tenant_id bugs** across: `routes/chat.py`, `tools/signals.py`, `tools/knowledge_base.py`, `tools/departments.py`, `tools/agents.py`, `tools/users.py`, `tools/scan.py`, `tools/reports.py`, `tools/judgement.py`
5. **Added new clinic tools**: `tools/patients.py` (QueryPatientsTool, QueryAppointmentsTool), `tools/clinic_overview.py` (GetClinicOverviewTool)
6. **Updated `tools/registry.py`**: Added new tools to both `build_primary_tools()` and `build_specialist_tools()`
7. **Added live context injection to `crews/primary_crew.py`**: `build_live_snapshot(agent_key)` queries DB and injects agent-specific operational snapshot before each interaction
8. **Created Progress/ documentation folder** with this log and AGENT_STATUS.md

### Architecture Confirmed
- Next.js API route (`/api/primary-agent/chat`) already tries Python CrewAI service first, falls back to TypeScript ReAct loop if unavailable
- Python service runs on port 8001, Next.js on port 3000
- Single-tenant: NO tenant_id in schema anywhere — `createSovereignClient()` / service-role bypasses all RLS

### Decisions
- **Keep TypeScript fallback**: The Next.js fallback executor remains in place. If Python service is down (e.g. not started in dev), the TypeScript loop handles requests seamlessly.
- **Keep `tenant_id` as constructor param in Python tools**: Removed from DB queries but kept as class attribute so registry.py doesn't need to change calling signature. Value stored as `self.tenant_id = "clinic"` but not used in queries.
- **Live snapshot injected via `build_live_snapshot()`** in Python crews, matching the TypeScript `buildAgentLiveContext()` pattern

---

## Session: 2026-02-XX — Agent Hub + Chat History + Archive/Delete

### Actions Taken
1. Removed keywords/domains/critical keywords section from agent card overview (`src/app/staff/agents/page.tsx`)
2. Added chat history sidebar to agent workspace (`src/app/staff/agents/[agentKey]/page.tsx`)
3. Added Tools panel (pill button → 2-col popover with descriptions per agent)
4. Added manual conversation naming modal (intercepts first send OR New Chat click)
5. Added per-conversation Archive (soft) and Delete (hard) with confirmation
6. Added `hardDeleteConversation()` to `src/lib/actions/chat.ts`

### Key Files Changed
- `src/app/staff/agents/page.tsx`
- `src/app/staff/agents/[agentKey]/page.tsx`
- `src/lib/actions/chat.ts`

---

## Session: 2026-02-XX — Orion + Aria Sophisticated System Prompts + Live Context

### Actions Taken
1. Created `database/migrations/025_sophisticated_agents.sql`:
   - EWC: tool priority order, morning briefing format, signal authority, KPI table
   - Orion: upsell matrix, lead scoring, corporate pitch, treatment revenue profile
   - Aria: per-treatment follow-up schedule, DNA protocol, empathy language, complaint framework, GDPR
2. Added `buildAgentLiveContext()` to `src/lib/actions/primary-agent.ts`:
   - EWC: active/critical/pending signal counts
   - Orion: corporate enquiries this week, overdue invoices, top commercial signals
   - Aria: churn risk signals (named), follow-up count, open DNAs
3. Live snapshot injected between base prompt and user context in TypeScript `loadAgentContext()`

### Decisions
- Injecting live snapshot at runtime (not in migration) means it's always current without redeployment
- System prompts in migration 025 are the canonical source — DB update required to take effect

---

## Session: 2026-02-XX — Signals Page Redesign + askSignalAI

### Actions Taken
- Confirmed signals page already complete with B&W theme, action trail, pending banner
- Verified all server actions wired: approve/reject/resolve/dismiss

---

## Session: 2026-02-XX — Initial Build (Login → Dashboard → Chat → Signals → Patients → Automations → Voice)

### Actions Taken
- Full stack build from migration 012 onwards
- 3 agents seeded: EWC (primary_agent), Orion (sales_agent), Aria (crm_agent)
- Voice receptionist Komal provisioned on Vapi.ai
- TypeScript agent executor with retry on 529/503
- SSE streaming chat implemented
- B&W design system established: black `#000000` background, white `#ffffff` text

---

## Standing Decisions (Never Change Without Review)

| Decision | Rationale |
|---|---|
| Single-tenant | One clinic, one system. No RLS, no tenant_id anywhere. |
| Service role client only | `createSovereignClient()` — never client-side DB access |
| No tenant_id in schema | CLAUDE.md: "Single-tenant: No RLS, no tenant_id anywhere" |
| Python service port 8001 | Next.js port 3000, Python FastAPI port 8001 |
| TypeScript fallback always on | Python service may not be running in dev |
| Agent prompts from DB | `agents.system_prompt` — change via migration, no code deploy needed |
| Models: Sonnet for agents, Haiku for classification/titles | Cost vs capability balance |
| All responses in British English | Client preference |
| No emojis unless requested | Design standard |
