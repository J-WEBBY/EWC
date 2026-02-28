# JWEBLY — Operational Intelligence OS

## Architectural Blueprint & Build Guide

**Product**: Jwebly (white-labelled as "Ilyas" per tenant)
**Built by**: Jwebly Agency
**Version**: MVP 1.0
**Date**: February 2026

---

## 1. What is Jwebly?

Jwebly is a **multi-tenant operational intelligence operating system** that transforms how organisations make decisions. It is not a chatbot. It is not a dashboard. It is a living system that ingests operational data, monitors it through autonomous AI agents, generates evidence-based recommendations through a judgement engine, executes approved actions through automations, and gets measurably smarter the longer an organisation uses it.

The system is white-labelled per tenant. Each organisation experiences it as their own AI — branded with their name, colours, and personality. The default identity is **Ilyas**, the primary AI agent that serves as the front door to the entire platform.

**One sentence**: Jwebly turns your organisation's data into decisions, and your decisions into institutional intelligence.

---

## 2. Target Industries

Jwebly is industry-agnostic at its core but ships with vertical-specific agent configurations:

| Industry | Example Org | Core Signal Domains |
|---|---|---|
| **Education & Charity** | Students' Union, University, NGO | Welfare, events, compliance, engagement, funding |
| **Recruitment** | Staffing agency, RPO | Pipeline, candidate welfare, client SLA, compliance |
| **Accounting** | Practice, bookkeeping firm | Deadlines, client risk, regulatory, workflow |
| **Legal** | Law firm, chambers | Case management, compliance, billing, conflicts |
| **Property** | Estate agency, management co. | Tenancy, maintenance, compliance, revenue |
| **Supply Chain** | Logistics, manufacturing | Inventory, delivery, supplier risk, demand |

Each industry gets a pre-configured set of **Core Agents** built by the agency. Tenants who need additional agents request custom builds from the agency (paid add-on).

---

## 3. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACE LAYER                     │
│  Dashboard  |  Agent Pages  |  Ilyas Chat  |  Analytics     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  ILYAS — PRIMARY AGENT                        │
│  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐ │
│  │ Query        │ │ Classifier   │ │ Router                │ │
│  │ Interface    │ │ (AI-powered) │ │ (Agent orchestration) │ │
│  └─────────────┘ └──────────────┘ └───────────────────────┘ │
└──┬──────────┬──────────┬──────────┬──────────┬──────────────┘
   │          │          │          │          │
┌──▼───┐  ┌──▼───┐  ┌──▼───┐  ┌──▼───┐  ┌──▼───┐
│Welfare│  │Events│  │Comms │  │Engage│  │Impact│  ← Specialist Agents
│Agent  │  │Agent │  │Agent │  │Agent │  │Agent │    (Agency-built)
└──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘  └──┬───┘
   │          │          │          │          │
┌──▼──────────▼──────────▼──────────▼──────────▼──────────────┐
│                    JUDGEMENT ENGINE                           │
│  Confidence Scoring | Pattern Detection | Institutional      │
│  Cross-Signal Analysis | Outcome Tracking | Learning Loop    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    EXECUTION LAYER                            │
│  Automation Wing | Integration Hub | Notification Engine     │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    INTELLIGENCE LAYER                         │
│  Predictive Modeling | Simulations | Real-time Analytics     │
│  Knowledge Base (Vector Search) | Institutional Memory       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    DATA LAYER                                 │
│  Supabase (PostgreSQL) | pgvector | RLS Multi-tenancy        │
│  Signals | Judgements | Decisions | Outcomes | Documents      │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Core Components — Detailed Specifications

### 4.1 Ilyas — The Primary Agent

**What it is**: The front door to the entire system. Every interaction — whether from a user, an external trigger, or a scheduled check — enters through Ilyas.

**Identity**: Ilyas is the white-labelled AI name stored in the tenant's database record (`ai_name`). It appears throughout the UI as the system's personality. Users talk to Ilyas, not to "the system."

**Capabilities**:

| Function | Description | Example |
|---|---|---|
| **Natural Language Query** | Users type anything in plain English. Ilyas understands, classifies, and responds or routes. | "A student just told me they can't afford rent this month" |
| **Signal Classification** | Takes unstructured input and converts it into a structured signal with type, priority, department, and agent assignment. | Free text → `{type: 'welfare_case', priority: 'high', agent: 'co_welfare'}` |
| **Intelligent Routing** | Determines which specialist agent should handle a signal. Routes to the best match or handles directly if no specialist applies. | Housing dispute → Welfare Agent. "What's our budget?" → Direct answer. |
| **General Q&A** | Answers questions about the organisation using the knowledge base, signal history, and outcome data. | "How many welfare cases did we resolve last month?" → Queries data, responds. |
| **Proactive Monitoring** | Runs scheduled checks against thresholds, deadlines, and anomalies. Creates signals automatically when issues are detected. | Daily check: "Bar stock below 15% → Create signal, route to Events Agent." |
| **Context Aggregation** | When routing to a specialist agent, Ilyas gathers relevant context: similar past signals, department workload, org policies, related documents from the knowledge base. | Welfare case gets enriched with: 3 similar past cases, resolution patterns, relevant policies. |

**What Ilyas does NOT do**:
- Make final decisions (that's the human's job, informed by the Judgement Engine)
- Execute actions without approval (unless the tenant has enabled Autonomous mode for specific action types)
- Replace specialist agents (Ilyas routes; specialists reason about their domain)

**Data flow**:
```
User Input (text/voice/form)
    │
    ▼
Ilyas Classifier (AI)
    │
    ├── Direct Answer (Q&A, data lookup) → Response to user
    │
    ├── New Signal Created → Structured signal in DB
    │       │
    │       ▼
    │   Route to Specialist Agent
    │       │
    │       ▼
    │   Agent Reasoning + Judgement Engine
    │       │
    │       ▼
    │   Recommendation presented to user
    │
    └── Task/Objective → Create multi-step plan → Track execution
```

---

### 4.2 Judgement Engine

**What it is**: The analytical brain of the system. It does not act — it evaluates. Every recommendation, every signal, every pattern passes through the Judgement Engine for quality control and confidence scoring.

**Core functions**:

#### 4.2.1 Signal Evaluation
When a signal arrives (from database data, user input, or external trigger), the Judgement Engine:
1. Gathers context: similar past signals, their outcomes, department workload, org policies
2. Generates a **judgement**: confidence score (0-100), recommendation, reasoning, flags, cross-signal references
3. Presents the judgement to the appropriate human decision-maker

**Judgement output structure**:
```json
{
  "confidence": 78.5,
  "recommendation": "Assign to Welfare Advisor B and initiate emergency housing protocol",
  "reasoning": "This matches 3 similar cases from Maple Court this month. Previous cases resolved fastest when emergency protocol was initiated within 24 hours. Advisor B has capacity and resolved 4/5 similar cases successfully.",
  "suggested_actions": [
    "Assign to Welfare Advisor B",
    "Initiate emergency housing protocol",
    "Notify accommodation office of pattern"
  ],
  "flags": [
    "Part of Maple Court cluster (3 cases this month)",
    "Student has existing academic appeal — check for compounding stress"
  ],
  "cross_signals": [
    "signal_id_123 — Financial hardship, Maple Court, 3 days ago",
    "signal_id_456 — Housing dispute, Maple Court, 7 days ago"
  ],
  "suggested_priority": "high",
  "suggested_assignee": "Welfare Advisor B"
}
```

#### 4.2.2 Cross-Signal Pattern Detection
The engine continuously analyses signals across all departments and agents to find patterns no single agent can see:
- **Spatial clustering**: 3+ signals from the same location (e.g., Maple Court)
- **Temporal clustering**: Spike in similar signals within a short window
- **Cross-domain correlation**: Engagement dropping + welfare cases rising = systemic issue
- **Anomaly detection**: Metric deviates significantly from historical baseline

When a pattern is detected, the engine creates a **cross-signal alert** — a special signal that references all contributing signals and recommends investigation scope.

#### 4.2.3 Decision Recording
When a human responds to a judgement:
- **Accept**: The recommendation is adopted as-is. Signal moves to `acted` status.
- **Modify**: The recommendation is adjusted. Modification notes are recorded for learning.
- **Reject**: The recommendation is refused. Rejection reason is recorded for learning.

Every decision is stored in the `decisions` table with full context.

#### 4.2.4 Outcome Tracking & Learning Loop
After a decision is acted upon and the situation resolves:
- The user records the **outcome**: resolved/escalated/failed/ongoing
- They rate: Was the AI recommendation correct? Quality score (1-5). Lessons learned.
- This data feeds back into future judgements. The engine learns which recommendation patterns work and which don't.

**The learning loop**:
```
Signal → Context → Judgement → Human Decision → Action → Outcome
   ▲                                                        │
   └────────────── Feedback (accuracy, quality) ────────────┘
```

#### 4.2.5 Maturity Modes
The engine's behaviour evolves based on accumulated experience:

| Mode | Trigger | Behaviour |
|---|---|---|
| **Bootstrap** | 0-30 decisions recorded | Conservative. Higher context gathering. Explicit uncertainty in recommendations. "I'm still learning your organisation." |
| **Guided** | 31-100 decisions recorded | Confident on familiar patterns. References past outcomes. Suggests assignees based on track record. "Based on 47 similar cases..." |
| **Autonomous** | 100+ decisions recorded | Can auto-execute routine actions (with tenant permission). Flags only novel or high-risk signals for human review. "I've handled this type 83 times with 91% success." |

#### 4.2.6 Direct User Queries
Users can ask the Judgement Engine questions directly:
- "How accurate have our welfare recommendations been this month?"
- "Which agent has the highest acceptance rate?"
- "Show me all signals where the AI recommendation was rejected — what went wrong?"
- "What patterns have you detected across departments this quarter?"

These queries are routed through Ilyas and answered using the engine's accumulated data.

---

### 4.3 Specialist Agents

**What they are**: Domain-expert AI units, each with a defined objective, scope, and reasoning capability. They are built and configured by the Jwebly agency for each tenant's industry and operational structure.

**Key distinction from Judgement Engine**:
- Agents think about **"What should we do?"**
- Judgement Engine thinks about **"Is this the right call, and how confident are we?"**

**Agent structure**:

```
┌─────────────────────────────────────┐
│         SPECIALIST AGENT            │
├─────────────────────────────────────┤
│ Identity:                           │
│   - Name (e.g., "Welfare Monitor")  │
│   - Objective (goal statement)      │
│   - Scope (signal types, depts)     │
│   - Type (industry / company)       │
├─────────────────────────────────────┤
│ Capabilities:                       │
│   - Domain reasoning                │
│   - Signal interpretation           │
│   - Context-aware recommendations   │
│   - Self-performance monitoring     │
│   - Escalation logic                │
├─────────────────────────────────────┤
│ Configuration:                      │
│   - Approval mode (nudge/alert/auto)│
│   - Priority thresholds             │
│   - Escalation rules                │
│   - Connected integrations          │
└─────────────────────────────────────┘
```

**Agent types**:

| Type | Prefix | Description | Example |
|---|---|---|---|
| **Industry Agent** | `ind_` | Monitors industry-specific KPIs and patterns. Available across all tenants in that vertical. | `ind_engagement` — tracks member/student engagement metrics |
| **Company Agent** | `co_` | Monitors operational functions specific to the tenant's structure. Configured during onboarding. | `co_welfare` — monitors welfare cases for a Students' Union |

**Guild demo agents** (Education/Charity vertical):

| Agent ID | Name | Objective | Signal Types | Departments |
|---|---|---|---|---|
| `ind_engagement` | Engagement Pulse | Ensure member participation stays above healthy thresholds | society_dormancy, attendance_low, engagement_drop, handover_incomplete | Student Activities |
| `ind_impact` | Impact Tracker | Track outcomes and funding deadlines to demonstrate organisational value | outcome_report_due, kpi_breach, funding_deadline | All |
| `co_events` | Events Coordinator | Ensure all events are properly planned, risk-assessed, and resourced | event_request, room_conflict, risk_assessment_overdue | Student Activities, Operations |
| `co_welfare` | Welfare Monitor | Ensure every welfare case is triaged within 4 hours and resolved within 5 working days | welfare_case, safeguarding, academic_appeal, housing_dispute | Welfare & Support |
| `co_comms` | Comms Analyst | Monitor communication effectiveness and flag anomalies | sentiment_drop, newsletter_anomaly, traffic_spike, campaign_review | Marketing & Comms |

**Agent reasoning flow**:
1. Ilyas routes a signal to the specialist agent
2. Agent reads the signal data and gathers domain-specific context
3. Agent applies its objective: "Does this signal threaten my goal?"
4. Agent reasons about the best course of action within its domain
5. Agent's recommendation is sent to the Judgement Engine for scoring
6. Scored recommendation is presented to the human

**Agent self-monitoring**:
Each agent tracks its own performance against its objective:
- co_welfare: "Average triage time: 2.3 hours (target: 4 hours) — on track"
- co_welfare: "Average resolution time: 6.2 days (target: 5 days) — ALERT: exceeding target"
- ind_engagement: "Society participation: -12% this month — investigating"

When an agent detects it's failing its objective, it can proactively create signals ("Resolution times are trending above target — review caseload distribution").

**Agent creation model**: Agency-only. Tenants request additional agents through their account manager. This ensures quality, proper configuration, and creates recurring consulting revenue for the agency.

---

### 4.4 Automation Wing

**What it is**: The execution layer that turns approved decisions into actions. Without the Automation Wing, the system recommends but doesn't do. With it, the system operates.

**Automation types**:

| Type | Trigger | Example |
|---|---|---|
| **Decision-triggered** | Human approves a judgement | "Accept → Send acknowledgement email to student, create task for advisor, update case status" |
| **Threshold-triggered** | A metric crosses a defined boundary | "Bar stock < 15% → Create purchase order draft, notify manager" |
| **Schedule-triggered** | Time-based recurring check | "Every Monday 9am → Generate weekly welfare summary for GM" |
| **Escalation-triggered** | A signal remains unacted beyond SLA | "Signal unacted for 4 hours → Escalate priority, notify department head" |
| **Maturity-triggered** | Autonomous mode auto-approves routine actions | "Routine budget approval < £100 → Auto-approve, log decision, notify finance" |

**Automation actions available**:

| Action | Description |
|---|---|
| **Send notification** | Email, in-app alert, or push notification to specified user(s) |
| **Create task** | Generate a task assigned to a user with deadline and context |
| **Update record** | Change signal status, priority, assignee, or custom fields |
| **Generate document** | Draft an email, report, or letter using AI based on context |
| **Trigger webhook** | Send data to an external system (Slack, Teams, CRM, etc.) |
| **Create follow-up signal** | Schedule a future check ("Follow up in 7 days") |
| **Log to audit trail** | Record action for compliance and accountability |

**Automation builder** (future):
A visual workflow builder where agency consultants (and eventually power users) can create automation chains:
```
IF signal.type = 'welfare_case' AND signal.priority = 'critical'
THEN
  → Assign to on-call welfare advisor
  → Send immediate notification (email + in-app)
  → Create safeguarding log entry
  → Schedule 24-hour follow-up signal
  → Notify department head
```

**For MVP**: Automations are defined in code (server actions). The system executes them when decisions are recorded. Visual builder is a post-MVP feature.

---

### 4.5 Integration Hub

**What it is**: The connective tissue between Jwebly and the organisation's existing tools. Integrations serve two purposes: **ingesting external signals** (data in) and **executing external actions** (data out).

**Integration categories**:

| Category | Direction | Examples |
|---|---|---|
| **Communication** | In + Out | Email (receive reports, send notifications), Slack/Teams (receive messages, post alerts) |
| **Calendar** | In | Google Calendar, Outlook (detect scheduling conflicts, deadline proximity) |
| **Finance** | In | Xero, QuickBooks, bank feeds (detect spending anomalies, threshold breaches) |
| **HR / People** | In | BambooHR, PeopleHR (staff changes, absence patterns) |
| **CRM** | In + Out | HubSpot, Salesforce (client signals, update records) |
| **Forms** | In | Typeform, Google Forms, custom web forms (structured signal intake) |
| **Storage** | In | Google Drive, SharePoint, Dropbox (document monitoring, knowledge base sync) |
| **Custom Webhooks** | In + Out | Any system that can send/receive HTTP requests |

**How external signals work**:
```
External Event (e.g., email from student)
    │
    ▼
Integration Adapter (parses the event)
    │
    ▼
Ilyas Classifier (determines signal type, priority, agent)
    │
    ▼
Structured Signal created in DB
    │
    ▼
Normal flow: Agent → Judgement → Human Decision → Automation
```

**For MVP**: Integration Hub is demonstrated through the "Report Signal" input (manual intake) and webhook-ready API endpoints. Live integrations with specific tools are post-MVP but the architecture supports them from day one.

---

### 4.6 Predictive Modeling & Simulations

**What it is**: The forward-looking layer. While the Judgement Engine evaluates what's happening now, Predictive Modeling anticipates what's coming next. Simulations allow users to test "what if" scenarios before committing to a course of action.

**Predictive capabilities**:

| Model | Input | Output | Example |
|---|---|---|---|
| **Signal Forecasting** | Historical signal patterns, seasonal data | Predicted signal volume and type for next 7/30 days | "Based on patterns, expect 3-5 welfare cases next week (mid-term stress period)" |
| **Resource Planning** | Signal forecast + staff capacity data | Staffing recommendations | "Welfare team will be at 120% capacity next week — consider temporary support" |
| **Risk Scoring** | Organisation data + industry benchmarks | Risk heat map by department | "Finance department: HIGH risk — 3 overdue audits, spending at 87% of annual budget in Q3" |
| **Outcome Prediction** | Signal characteristics + historical outcomes | Likely outcome if standard process is followed | "Signals like this resolve in 4.2 days average, but Maple Court cases take 6.8 days" |
| **Trend Detection** | Time-series analysis of all metrics | Emerging trends before they become critical | "Society engagement declining 3% per week — will hit critical threshold in 12 days" |

**Simulation capabilities**:

| Simulation | Description | Example |
|---|---|---|
| **Decision Simulation** | "If I approve this, what's the likely impact?" | "If you approve the £2,400 Freshers' Fair budget: 78% chance of positive ROI based on 3 previous events. Risk: overspend if attendance < 200." |
| **Resource Simulation** | "What happens if I redistribute staff?" | "Moving 1 advisor from Activities to Welfare reduces Activities SLA by 12% but brings Welfare within target." |
| **Scenario Planning** | "What if student numbers drop 10%?" | Model cascading effects: reduced income → budget pressure → fewer events → engagement drop → welfare increase |
| **Policy Simulation** | "What if we change the approval threshold?" | "Lowering event budget auto-approval from £500 to £200: 40% more signals requiring human review, but 15% reduction in overspend incidents." |

**Data requirements**: Predictive modeling becomes meaningful after 60+ days of operational data. Before that, the system uses industry benchmarks and the tenant's uploaded historical data as a baseline.

**For MVP**: Show the framework — risk scoring based on current signals, basic trend detection from the 30 seed signals, and one simulation scenario. Full predictive suite is a growth feature that improves with data volume.

---

### 4.7 Real-Time Analytics Dashboard

**What it is**: The nerve centre. A live, always-current view of the organisation's operational health. Not a static reporting tool — a dynamic surface that reflects every signal, decision, and outcome as they happen.

**Dashboard layers**:

#### 4.7.1 Executive Dashboard (GM / Leadership)
- **Signal Overview**: Total active, by priority, by department, trend sparklines
- **Judgement Engine Stats**: Accuracy rate, average confidence, decisions made, resolution time
- **Agent Performance**: Each agent's goal progress, signal throughput, success rate
- **Risk Heat Map**: Departments colour-coded by current risk level
- **Cross-Signal Alerts**: Active patterns requiring attention
- **KPI Tracker**: Organisation-wide metrics vs targets

#### 4.7.2 Department Dashboard (Department Heads)
- Filtered view: Only signals, agents, and metrics for their department
- Team workload: Signal assignments per team member
- SLA tracking: Are we meeting response time targets?
- Decision queue: Pending judgements awaiting their approval

#### 4.7.3 Agent Dashboard (Individual Agent Pages)
- Signal feed: All signals in this agent's scope
- Judgement panel: Generate/view/act on recommendations
- Performance metrics: Agent's accuracy, throughput, goal progress
- Maturity indicator: Bootstrap → Guided → Autonomous progression
- Monitoring scope: What signal types and departments this agent watches

#### 4.7.4 Analytics Deep-Dive
- Historical trend analysis (7d, 30d, 90d, custom)
- Department comparison charts
- Signal type distribution over time
- Decision pattern analysis (acceptance rate, modification frequency)
- Outcome quality distribution
- Predictive overlays (where forecast meets actual)

**Real-time updates**: The dashboard reflects changes as they happen. When a signal is created, resolved, or a decision is made, the dashboard updates without page refresh (Supabase real-time subscriptions or polling).

**For MVP**: The executive dashboard and agent dashboards are built. Department-filtered views and deep-dive analytics are next-phase features.

---

### 4.8 Knowledge Base

**What it is**: The organisation's document memory. During onboarding, tenants upload their policies, procedures, handbooks, and reference materials. These are chunked, vectorised (1536-dimension embeddings), and stored for semantic search.

**How it's used**:
- **Judgement context**: When the engine evaluates a welfare case, it searches the knowledge base for relevant policies ("What does our safeguarding policy say about this?")
- **Agent reasoning**: Agents reference the knowledge base when forming recommendations ("The event policy requires risk assessment for groups > 50")
- **Direct Q&A**: Users ask Ilyas a question, and it searches the knowledge base for the answer ("What's our refund policy for cancelled events?")

**Knowledge base structure**:
```
Documents → Chunks (512 tokens each) → Vector Embeddings (1536 dim)
                                              │
                                              ▼
                                     pgvector similarity search
                                              │
                                              ▼
                                     Top-K relevant chunks returned
                                     as context for AI reasoning
```

---

## 5. Data Flow — End to End

### 5.1 Primary Flow: Database Signal Processing

This is the main flow — signals derived from uploaded/existing organisational data.

```
Step 1: DATA INGESTION
        Tenant uploads operational data during onboarding
        (spreadsheets, database exports, document uploads)
            │
Step 2: SIGNAL GENERATION
        System scans data for actionable items:
        - Threshold breaches (budget at 87%)
        - Deadline proximity (audit in 5 days)
        - Anomaly detection (engagement drop)
        - Pattern matching (3 cases from same location)
            │
Step 3: SIGNAL CLASSIFICATION
        Each signal gets: type, priority, department,
        source_agent_id, structured data JSONB
            │
Step 4: AGENT MONITORING
        Specialist agents see signals in their scope
        Agent applies domain reasoning to the signal
            │
Step 5: JUDGEMENT
        Judgement Engine scores the agent's recommendation
        Gathers context, calculates confidence, flags risks
            │
Step 6: HUMAN DECISION
        User sees: signal + recommendation + confidence + flags
        User decides: Accept / Modify / Reject
            │
Step 7: EXECUTION
        Automation Wing executes the approved action
        (notifications, tasks, record updates, webhooks)
            │
Step 8: OUTCOME
        Situation resolves (or escalates)
        User records: what happened, was AI correct, quality score
            │
Step 9: LEARNING
        Outcome feeds back into Judgement Engine
        Future recommendations improve based on what worked
```

### 5.2 Secondary Flow: User Query / New Task

When a user needs help with something not already in the signal pipeline.

```
Step 1: USER INPUT
        User types into Ilyas query interface:
        "A student just told me they're being evicted
         from their accommodation this Friday"
            │
Step 2: ILYAS CLASSIFICATION
        AI parses the input and determines:
        - Signal type: housing_dispute (welfare)
        - Priority: critical (imminent — this Friday)
        - Department: Welfare & Support
        - Agent: co_welfare
        - Structured data extracted from free text
            │
Step 3: SIGNAL CREATED
        New signal inserted into DB with all fields populated
        Signal appears in co_welfare agent's feed immediately
            │
Step 4: AUTOMATIC JUDGEMENT
        Because priority = critical, system auto-generates
        a judgement without waiting for user to click
            │
Step 5: NOTIFICATION
        Relevant users notified immediately:
        - Welfare team gets in-app alert
        - Department head gets email
        - Signal appears on dashboard with "CRITICAL" badge
            │
Step 6: NORMAL FLOW CONTINUES
        → Human decision → Execution → Outcome → Learning
```

### 5.3 Tertiary Flow: External Trigger (Post-MVP)

When an external system sends data into Jwebly.

```
Step 1: EXTERNAL EVENT
        Email arrives: student complaint about accommodation
        OR: Slack message from staff about incident
        OR: Calendar event: audit deadline in 48 hours
        OR: Finance API: spending threshold breached
            │
Step 2: INTEGRATION ADAPTER
        Parses the external format into Jwebly's internal format
        Extracts: who, what, when, urgency indicators
            │
Step 3: ILYAS CLASSIFICATION
        Same as user query flow — AI classifies and routes
            │
Step 4: NORMAL FLOW
        Signal → Agent → Judgement → Decision → Execution → Outcome
```

---

## 6. Scenarios

### Scenario 1: Welfare Crisis Detection (Cross-Signal)

**Context**: University of Oldbury Students' Guild. Three separate students report financial hardship over 10 days. All three live in Maple Court accommodation.

**Flow**:
1. Signals arrive from uploaded welfare referral data (or staff reporting via Ilyas)
2. Each signal is routed to `co_welfare` agent
3. After the 3rd signal, the Judgement Engine's cross-signal detection fires
4. **Cross-signal alert created**: "Pattern: 3 financial hardship cases from Maple Court in 10 days. Possible systemic housing issue."
5. The cross-signal has priority `high` and references all 3 individual signals
6. Judgement Engine recommends: "Investigate Maple Court accommodation. Contact landlord/accommodation office. Check for other affected students. This pattern matches 2 historical accommodation crises at other institutions."
7. GM (Sarah Mitchell) sees the cross-signal on her dashboard, reviews the recommendation
8. She accepts and adds: "Also notify the University accommodation team"
9. Automation Wing: sends email to accommodation office, creates task for welfare team lead, schedules 7-day follow-up
10. Two weeks later, outcome recorded: "Landlord was charging illegal fees. All 3 students received refunds. Accommodation office investigating."
11. Judgement Engine logs: Maple Court pattern → housing fraud → resolution via accommodation office intervention. Future similar patterns will reference this outcome.

**Value demonstrated**: No single advisor would have connected 3 separate cases to a systemic issue. The system saw the pattern, connected the dots, and recommended an investigation that resolved the root cause.

---

### Scenario 2: Event Risk Management (Agent Reasoning + Automation)

**Context**: A student society submits an event proposal for a pub crawl involving 80 students.

**Flow**:
1. Event request signal created (from uploaded form data or Ilyas input)
2. Routed to `co_events` agent
3. Agent reasoning: "Pub crawl with 80 attendees. High alcohol involvement. Previous pub crawls had 2 incidents requiring first aid. Risk assessment required per event policy (Knowledge Base). Current society has no active risk assessment on file."
4. Judgement Engine scores: Confidence 85%. Recommendation: "Require risk assessment before approval. Assign buddy system coordinator. Ensure first aid trained staff attend. Cap alcohol-inclusive ticket price."
5. Flags: "Last pub crawl (3 months ago) had 2 first aid incidents. Society's insurance expires in 14 days."
6. Events coordinator reviews and accepts with modification: "Also require venue to confirm capacity certificate"
7. Automation: Email to society president with requirements checklist, create task for risk assessment review, schedule insurance renewal reminder
8. Outcome: Event runs safely with zero incidents
9. Learning: pub crawl + risk assessment + buddy system = successful outcome pattern

**Value demonstrated**: Agent caught the insurance expiry (14 days out) that would have been missed. Referenced past incident data to justify safety requirements. Automated the requirements communication to the society.

---

### Scenario 3: Budget Intelligence (Predictive + Judgement)

**Context**: Commercial Services department has spent 87% of its annual budget by end of Q3.

**Flow**:
1. Threshold signal generated from financial data: "Commercial at 87% of annual budget with 3 months remaining"
2. Routed to `ind_impact` agent (tracks KPIs and financial health)
3. Agent reasoning: "At current spend rate, department will exceed budget by 16% by year end. Major upcoming commitments: Christmas event (est. £3,200), January stock refresh (est. £2,800)."
4. Predictive model: "Projected year-end spend: 116% of budget. Confidence: 72% (weather-dependent — bar revenue varies with student attendance in winter)"
5. Judgement Engine recommends: "Freeze non-essential spending immediately. Reallocate £1,200 from Marketing (currently at 62% spend). Review Christmas event scope — can it be revenue-positive?"
6. Simulation offered: "If Christmas event charges £5 entry: breaks even at 180 attendees (likely based on past events). If free entry: £3,200 cost with no recovery."
7. GM reviews, modifies: "Freeze spending, but keep Christmas event. Charge £3 entry instead of £5"
8. Automation: Budget freeze notification to Commercial head, calendar reminder for Q4 review, updated budget tracker

**Value demonstrated**: System caught the trend before it became a crisis. Provided actionable alternatives with simulated outcomes. GM made an informed decision with real numbers, not gut feeling.

---

### Scenario 4: User Query — Direct to Ilyas

**Context**: A staff member needs a quick answer during a meeting.

**Flow**:
1. User types into Ilyas: "How many societies are currently active and how does that compare to last year?"
2. Ilyas classifies: This is a **data query**, not a signal. No agent routing needed.
3. Ilyas queries: signals table (society-related), knowledge base (annual reports), engagement data
4. Response: "Currently 42 active societies (activity in last 30 days). Last year at this time: 47. That's an 11% decline. The Engagement Pulse agent has flagged this trend — 5 societies are dormant (no activity in 90+ days). See the engagement report for details."
5. No signal created — this was informational

**Value demonstrated**: Instant institutional knowledge. Instead of hunting through spreadsheets, the staff member gets a contextual answer in seconds, with a connection to the agent that's already monitoring the issue.

---

### Scenario 5: Automation-Driven Workflow (Escalation)

**Context**: A safeguarding concern signal has been sitting in the queue for 3 hours without action.

**Flow**:
1. Signal created at 9:00 AM: "Safeguarding concern — student disclosed domestic issue"
2. Priority: `critical`. Auto-judgement generated. Notification sent to welfare team.
3. 12:00 PM — no decision recorded. **Escalation automation fires.**
4. Automation: Priority upgraded from `critical` to `critical-escalated`. Notification sent to Welfare department head AND GM. In-app banner: "Safeguarding signal has exceeded 3-hour SLA."
5. 12:15 PM — GM sees the escalation, reviews, and accepts the recommendation
6. Automation: Task assigned, external referral initiated, follow-up scheduled for 24 hours
7. Outcome recorded. System logs: "3-hour SLA was nearly breached. Escalation automation was required."
8. Learning: Future safeguarding signals get an additional flag: "Historical SLA risk — assign immediately"

**Value demonstrated**: The system enforced response time standards automatically. No human had to remember to check. The escalation pattern was logged for future improvement.

---

### Scenario 6: Interconnected — Multiple Components Working Together

**Context**: It's mid-October. Multiple things happen simultaneously.

**Flow (Multi-thread)**:

**Thread A — Engagement**:
`ind_engagement` detects society participation has dropped 20% since mid-term break. Creates a cross-signal.

**Thread B — Comms**:
`co_comms` detects newsletter open rate has dropped from 35% to 12%. Flags anomaly.

**Thread C — Welfare**:
`co_welfare` has 3 new welfare cases this week (above the 2/week average).

**Cross-signal detection**:
Judgement Engine connects all three threads: "Engagement down + communication effectiveness down + welfare cases up = possible mid-term wellbeing crisis. This pattern occurred in October 2024 (from knowledge base: annual report data)."

**Predictive model**:
"If pattern matches 2024, expect welfare cases to peak at 8/week within 2 weeks. Current capacity: 5 cases/week. Recommend proactive intervention."

**Recommendation to GM**:
"Three connected trends detected. Recommended response:
1. Send targeted wellbeing check-in campaign (Comms)
2. Extend welfare drop-in hours (Welfare)
3. Run engagement event — low-cost, high-visibility (Events)
4. Brief all society presidents on support available (Engagement)
Confidence: 71% (based on 1 historical occurrence)"

**GM accepts with modifications. Automation Wing executes**:
- Email campaign drafted and queued for approval
- Calendar updated with extended drop-in hours
- Task created for Events team to plan engagement event
- Notification to all society presidents scheduled

**3 weeks later, outcome**:
Welfare cases peaked at 6/week (below predicted 8). Engagement recovered to -8% (from -20%). Newsletter open rate recovered to 28%.

**Value demonstrated**: This is the operating system moment. No single person, tool, or spreadsheet could have connected engagement metrics, communication analytics, welfare caseloads, and historical patterns into a single coherent response. The system orchestrated across 4 departments simultaneously.

---

## 7. Value Proposition

### For the Organisation

| Value | Metric | How Jwebly Delivers |
|---|---|---|
| **Faster decisions** | Response time reduced by 60%+ | AI pre-processes signals, provides recommendations, humans just approve/reject |
| **Better decisions** | Decision accuracy improves from ~65% (gut) to 80%+ (data-informed) | Every decision backed by historical outcomes, cross-signal context, and confidence scoring |
| **Nothing falls through cracks** | 100% signal capture vs ~40% manual detection | Automated monitoring catches every threshold breach, deadline, and anomaly |
| **Institutional memory** | Zero knowledge lost when staff leave | Every decision, outcome, and pattern stored permanently. New staff inherit all past learning. |
| **Cross-department visibility** | Patterns detected across silos | Cross-signal detection connects dots no individual department can see |
| **Compliance confidence** | Full audit trail for every decision | Every signal, judgement, decision, and outcome is logged with timestamps and user attribution |
| **Resource optimisation** | Staff focus on high-value work, not triage | Routine signals handled automatically. Humans only intervene on novel or high-risk situations. |

### For the Agency (Jwebly)

| Value | Description |
|---|---|
| **Recurring revenue** | SaaS subscription + agent build consulting + data growing = increasing switching cost |
| **Defensible moat** | The longer a client uses Jwebly, the more institutional intelligence accumulates. Switching means losing years of learned patterns. |
| **Multi-industry expansion** | Same core engine, different agent configurations per industry. One codebase, 6 verticals. |
| **Data asset** | Aggregated (anonymised) cross-tenant patterns create industry benchmarks no competitor can replicate. |
| **Upsell pathway** | Base → Custom agents → Premium integrations → Predictive suite → Autonomous mode |

### The Moat: Accumulated Intelligence

This is the critical differentiator. Jwebly is not just software — it's an **accumulating intelligence asset**.

- Month 1: System is learning. 30 signals, basic recommendations, 60% accuracy.
- Month 3: System is useful. 200+ signals, pattern detection active, 75% accuracy.
- Month 6: System is essential. 500+ signals, predictive modeling active, 85% accuracy. Staff rely on it daily.
- Month 12: System is irreplaceable. 1000+ decisions with outcomes. Institutional memory deeper than any single employee. Autonomous mode handling 40% of routine signals without human intervention.

**Switching cost at month 12**: Losing 1000+ decisions, their outcomes, all learned patterns, all cross-signal history, all predictive baselines, all institutional knowledge. No competitor can offer this — it can only be built over time.

---

## 8. Technical Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | Next.js 14 (App Router) | Server components, server actions, streaming |
| **UI** | Tailwind CSS + Framer Motion | Dark Palantir aesthetic, micro-animations |
| **Database** | Supabase (PostgreSQL) | Multi-tenant data, real-time subscriptions |
| **Vector Search** | pgvector (1536 dim) | Knowledge base semantic search |
| **AI** | Anthropic Claude (Sonnet) | All reasoning, classification, judgement generation |
| **Auth** | Custom activation key + password | Tenant isolation, role-based access |
| **Multi-tenancy** | Row-Level Security (RLS) | Every table scoped by tenant_id |
| **Deployment** | Vercel (planned) | Edge functions, automatic scaling |

---

## 9. Database Schema (Core Tables)

### Existing (Migrations 001-005)
- `industries` — 6 supported verticals
- `tenants` — Each client organisation
- `departments` — Organisational hierarchy
- `roles` — Permission definitions
- `users` — Staff accounts with role assignments
- `activation_keys` — Onboarding access control
- `onboarding_progress` — 8-phase onboarding tracker
- `discovery_audits` — Pre-onboarding organisational assessment
- `kb_documents` — Knowledge base documents
- `kb_chunks` — Vector-embedded document chunks
- `audit_trail` — System-wide activity log
- `user_settings` — Per-user preferences

### Judgement Engine (Migration 006)
- `signals` — Operational events requiring attention
- `judgements` — AI-generated recommendations with confidence scoring
- `decisions` — Human responses (accept/modify/reject)
- `outcomes` — What actually happened (the learning loop)

### Planned
- `automations` — Defined automation rules and workflows
- `automation_logs` — Execution history for automations
- `integrations` — Connected external system configurations
- `predictions` — Predictive model outputs and accuracy tracking
- `agent_configurations` — Stored agent definitions (moving from code to DB)

---

## 10. Build Guide — Current Status & Roadmap

### Phase 1: COMPLETE — Foundation
- [x] Multi-tenant architecture (RLS, tenant isolation)
- [x] 8-phase onboarding flow (Identity Mirror → Deployment)
- [x] White-label branding (ai_name, brand_color, logo_url)
- [x] Knowledge base with vector search
- [x] Discovery audit (pre-onboarding assessment)
- [x] User/department/role schema
- [x] Login and activation key system

### Phase 2: COMPLETE — Judgement Engine Core
- [x] Signals, Judgements, Decisions, Outcomes tables
- [x] 30 seed signals for Guild demo
- [x] AI judgement generation (Anthropic Sonnet)
- [x] Confidence scoring and reasoning
- [x] Cross-signal pattern detection
- [x] Agent-signal scope mapping
- [x] Decision recording (accept/modify/reject)
- [x] Outcome tracking
- [x] Engine stats and maturity modes

### Phase 3: COMPLETE — Staff Dashboard + Agent Pages
- [x] Executive dashboard with live signal counts
- [x] Agent cards with pending signal badges
- [x] Clickable agents → dedicated agent pages
- [x] Signal feed with priority indicators
- [x] Judgement detail panel (confidence bar, reasoning, flags)
- [x] Decision buttons (accept/modify/reject)
- [x] Agent performance sidebar (stats, scope, maturity)

### Phase 4: IN PROGRESS — Intelligence Layer
- [ ] **Ilyas Primary Agent** — Universal query input + AI classification + routing
- [ ] **Role-based views** — Different dashboard/agent visibility per role
- [ ] **Automation Wing** — Decision-triggered actions (notifications, tasks)
- [ ] **Escalation automations** — SLA breach auto-escalation
- [ ] **Enhanced agent reasoning** — Agents with objectives and self-monitoring

### Phase 5: PLANNED — Predictive & Analytics
- [ ] **Predictive modeling** — Signal forecasting, resource planning
- [ ] **Simulations** — Decision impact modeling, what-if scenarios
- [ ] **Analytics deep-dive** — Historical trends, department comparisons
- [ ] **Real-time updates** — Supabase subscriptions for live dashboard

### Phase 6: PLANNED — External Connectivity
- [ ] **Integration Hub** — Webhook endpoints for external signals
- [ ] **Email integration** — Parse incoming emails into signals
- [ ] **Slack/Teams** — Bi-directional notifications and signal intake
- [ ] **Calendar integration** — Deadline and scheduling awareness
- [ ] **Finance integration** — Automated budget monitoring

### Phase 7: PLANNED — Scale & Polish
- [ ] **Custom agent builder** — Agency-facing tool for building tenant agents
- [ ] **Tenant admin panel** — Self-service for basic configuration
- [ ] **Multi-tenant analytics** — Anonymised cross-tenant industry benchmarks
- [ ] **Mobile-responsive** — Full functionality on mobile devices
- [ ] **API documentation** — For third-party integration development

---

## 11. Pricing Model (Indicative)

| Tier | Target | Includes | Price Range |
|---|---|---|---|
| **Starter** | Small org (< 20 staff) | 3 core agents, Judgement Engine, Dashboard, 1GB KB | £X/month |
| **Professional** | Medium org (20-100 staff) | 5 core agents, Automation Wing, Integrations (3), Predictive basic | £XX/month |
| **Enterprise** | Large org (100+ staff) | Unlimited core agents, Full automation, All integrations, Predictive + Simulations, Priority support | £XXX/month |

**Add-ons**:
- Custom agent build: One-time consulting fee
- Additional integrations: Per-integration monthly fee
- Premium predictive suite: Monthly add-on
- Dedicated account manager: Monthly retainer

---

## 12. Security & Compliance

| Requirement | Implementation |
|---|---|
| **Data isolation** | Row-Level Security — tenants cannot access each other's data |
| **Audit trail** | Every action logged with user, timestamp, and context |
| **Encryption** | All data encrypted at rest (Supabase) and in transit (HTTPS) |
| **Access control** | Role-based permissions — users only see what their role allows |
| **AI transparency** | Every judgement includes reasoning and context_used — no black boxes |
| **Data retention** | Configurable per tenant — comply with local data protection laws |
| **GDPR readiness** | Right to erasure, data export, consent management (planned) |

---

## 13. Summary

Jwebly is not a dashboard. It is not a chatbot. It is an **operational intelligence operating system** that:

1. **Sees everything** — Signals from data, users, and external systems flow into a unified pipeline
2. **Thinks about it** — Specialist agents reason about their domain, the Judgement Engine evaluates quality
3. **Recommends action** — Every recommendation comes with confidence, reasoning, flags, and context
4. **Executes on approval** — The Automation Wing turns decisions into actions
5. **Learns from outcomes** — Every result makes the system smarter
6. **Predicts the future** — Historical patterns power forecasting and simulation
7. **Gets more valuable over time** — Institutional intelligence accumulates, creating an irreplaceable asset

The system is white-labelled, multi-tenant, multi-industry, and designed to be the last operational platform an organisation ever needs.

**Built by Jwebly Agency. Experienced as Ilyas.**
