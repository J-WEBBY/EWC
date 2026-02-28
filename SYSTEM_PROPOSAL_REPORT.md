# Aria — Operational Intelligence System
## Edgbaston Wellness Clinic
### Comprehensive System Proposal & Feature Reference
**Version 2.0 — February 2026**

---

## Executive Summary

Aria is a purpose-built, AI-native operational intelligence platform for Edgbaston Wellness Clinic — a premium private clinic in Edgbaston, Birmingham, specialising in aesthetics (Botox, fillers, CoolSculpting, skin treatments), wellness (IV therapy, weight loss, hormone therapy), and medical services (GP consultations, health screening).

Aria is not a chatbot. It is not a CRM addon. It is the clinic's operational brain — a unified AI layer that replaces fragmented tools (Cliniko + GoHighLevel + Make + Zapier + spreadsheets) with a single intelligence system that:

- **Acquires patients** — AI voice receptionist answers calls, handles objections, books appointments in real time
- **Retains patients** — treatment-specific follow-ups timed to clinical intervals (not arbitrary schedules)
- **Automates revenue** — payment links sent automatically, overdue invoices chased, packages upsold
- **Manages compliance** — CQC readiness, equipment servicing, staff certifications, incident tracking
- **Runs operations** — signals, signals, dashboards, analytics, staff KPIs, all from one place

**Tech stack:** Next.js 15, Supabase (PostgreSQL + pgvector), Anthropic Claude Sonnet/Haiku, Vapi.ai, Twilio, Stripe/GoCardless, n8n, Cliniko API.

**Architecture:** Single-tenant — the clinic's private system, fully isolated, no shared infrastructure.

---

## System Architecture

### Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 15 (App Router), React 19, Framer Motion | Staff UI |
| Database | Supabase (PostgreSQL 15) + pgvector | All persistent data + embeddings |
| AI (primary) | Anthropic Claude Sonnet | Aria, agent reasoning, reports, analysis |
| AI (lightweight) | Anthropic Claude Haiku | Smart replies, summaries, quick classifications |
| Voice | Vapi.ai | AI voice receptionist, outbound calls |
| SMS | Twilio | Patient reminders, payment links, follow-ups |
| WhatsApp | WhatsApp Business API | Conversational patient messaging |
| Payments | Stripe / GoCardless | Payment links, invoice collection |
| Automation runtime | n8n (self-hosted) | Cron jobs, webhook execution, workflow pipelines |
| Embeddings | OpenAI text-embedding-3-small (1536d) | Knowledge base semantic search |
| Auth | Custom bcrypt | No external auth dependency |
| Deployment | Vercel | Zero-config Next.js hosting |

### Core Design Principles

1. **Single-tenant** — one installation, one clinic, fully owned
2. **Server-first** — all data access via Next.js Server Actions, service-role Supabase (no client DB access)
3. **AI as infrastructure** — agents are first-class citizens woven into every workflow
4. **Audit by default** — all significant actions logged to `audit_trail`
5. **Privacy by design** — data never leaves the system except via explicit, configured integrations
6. **Cliniko as source of truth** — all patient/appointment data flows from Cliniko; Aria enriches it

### AI Agent Architecture — ReAct Loop

```
User message / system trigger
  → Agent selector (keyword/domain routing)
  → Specialist agent selected (or Aria as catch-all)
  → System prompt + tool definitions sent to Claude Sonnet
  → Claude reasons → calls tools (DB, web, knowledge base, signals)
  → Receives tool results → reasons again
  → Calls more tools if needed (up to max iterations)
  → Streams final response token-by-token to UI
```

**Executor properties:**
- Streaming: real-time via `runAgentLoopStreaming()` — UI receives tokens as they generate
- Batch mode: `runAgentLoop()` for automations and background jobs
- Retry: exponential backoff on HTTP 503/529/500 (up to 3 retries, jitter)
- Tool timeout: 30 seconds per tool call
- Observability: every tool call is recorded with input, output, duration, iteration number

---

## Database Schema

### Core Tables (18 tables, Migration 013)

| Domain | Tables |
|---|---|
| Clinic identity | `clinic_config` |
| Organisation | `departments`, `roles`, `users` |
| AI Agents | `agents`, `agent_memories` |
| Operational signals | `signals`, `judgements` |
| Chat | `chat_conversations`, `chat_messages` |
| Knowledge base | `knowledge_categories`, `knowledge_documents`, `knowledge_chunks` |
| Cliniko integration | `cliniko_config`, `cliniko_patients`, `cliniko_appointments`, `cliniko_sync_logs` |
| Audit | `audit_trail` |

### Additional Tables Required (Proposed — Migration 016)

| Table | Purpose |
|---|---|
| `voice_calls` | Vapi.ai call log — direction, duration, transcript, outcome, caller |
| `voice_config` | Vapi.ai API config, phone number, prompt templates |
| `sms_messages` | Twilio outbound/inbound SMS log with status tracking |
| `payment_links` | Generated Stripe/GoCardless links — amount, status, sent_at, paid_at |
| `staff_kpis` | Daily KPI snapshots per user (treatments, revenue, satisfaction, rebooking) |
| `inventory_items` | Products/stock catalogue (Botox vials, fillers, IV vitamins, etc.) |
| `inventory_stock` | Current levels with batch numbers, expiry dates |
| `inventory_movements` | Usage per treatment, adjustments, wastage |
| `corporate_accounts` | Corporate clients with contract terms, discounts, account manager |
| `corporate_bookings` | Bookings linked to corporate accounts |
| `referrals` | Referrer patient, referred patient, credit amount, status |
| `compliance_evidence` | Documents tagged against specific CQC regulations |
| `compliance_tasks` | Action plan items with owner, deadline, completion status |
| `equipment_register` | Equipment catalogue with service schedule, calibration dates |
| `staff_certifications` | DBS, GMC/NMC/HCPC registration, indemnity, training records |
| `incidents` | Clinical incidents, near-misses, complaints (Duty of Candour) |
| `marketing_campaigns` | Campaign source, attributed bookings, revenue |

---

## Staff Roles & Permissions

| Role | Permission Level | Key Access |
|---|---|---|
| System Admin | 200 | Full system — users, agents, integrations, audit trail |
| Clinic Director | 100 | Full operational — approve signals, manage agents, all reports |
| Senior Clinician | 50 | All signals, create signals, all reports |
| Clinician | 30 | Department signals, create signals |
| Sales Consultant | 30 | Department signals, create signals |
| Receptionist | 20 | Department signals, create signals |

---

## Departments

- **Management** — clinic leadership, strategy, administration
- **Clinical** — practitioners, therapists, clinical delivery
- **Reception & Patient Care** — front desk, appointments, patient flow
- **Sales & Business Development** — patient acquisition, packages, revenue growth

---

# THE FIVE PILLARS

---

## Pillar 1 — Intelligent Patient Acquisition

The front door of the clinic is as important as the clinical services inside it. This pillar covers everything from the moment a potential patient makes contact — by phone, web, or social — to the moment they are booked and confirmed.

### 1.1 Advanced AI Voice Receptionist

**Integration:** Vapi.ai + Cliniko calendar API

The AI receptionist answers every inbound call — after hours, during appointments, during peak hours — with the intelligence of a trained sales consultant, not a simple script.

**Capabilities:**
- **Natural conversation** — not IVR menus, not robotic scripts. Full conversational AI powered by Claude Sonnet via Vapi.ai
- **Real-time calendar integration** — reads live Cliniko availability during the call and books directly. No "I'll check and call you back"
- **Objection handling:**
  - Price objection → explains value, available payment plans, treatment outcomes and longevity
  - Uncertainty → nurtures with relevant success stories, offers a no-obligation consultation
  - Competitor comparison → highlights specific clinic differentiators (CoolSculpting, IV therapy, medical-grade treatments, Dr Ganata's credentials)
  - Fear or anxiety → reassures with safety record, qualifications, patient reviews
- **Lead qualification** — determines genuine intent vs browsing; categorises high-value enquiries (aesthetics) vs routine (GP); flags urgent medical cases for human escalation
- **Instant confirmation** — SMS confirmation sent via Twilio the moment a booking is made
- **Call recording and transcription** — every call recorded for compliance, quality review, and AI training
- **Post-call signal creation** — every call generates a signal in Aria with outcome, sentiment, and next action

**Page:** `/staff/voice` — Live call monitoring dashboard showing active calls, queue, and call feed in real time

### 1.2 Missed Call Recovery

When a call is missed (after-hours, engaged, staff busy), the system detects it and triggers an automated recovery within 15 minutes:

1. Vapi.ai places an outbound call: *"Hi, this is Aria calling from Edgbaston Wellness Clinic — sorry we missed your call. How can I help?"*
2. Full AI conversation — books appointment, takes message, or escalates
3. If call unanswered: sends WhatsApp/SMS with booking link
4. Logs the missed call, recovery attempt, and outcome as a signal

**This alone recovers an estimated 10–20 bookings per month that would otherwise be lost.**

### 1.3 Multi-Channel Enquiry Response

| Channel | Response | SLA |
|---|---|---|
| Website contact form | AI email response with availability | < 2 minutes |
| WhatsApp Business message | AI WhatsApp reply with booking link | < 1 minute |
| Instagram / Facebook DM | AI reply with consultation booking link | < 5 minutes |
| Email enquiry | Personalised reply referencing their enquiry | < 5 minutes |

All enquiry responses are generated by Claude Haiku using the clinic's brand voice and knowledge base for accurate pricing and availability.

### 1.4 Conversion Analytics

**Page:** `/staff/analytics` (Acquisition tab)

- Call → booking conversion rate (overall and per call type)
- Objection breakdown: which objections arise most, how AI handled them, conversion outcome
- Revenue per call
- Lead source attribution (Google, social, referral, walk-in)
- Time-to-respond metrics
- Missed call recovery rate and revenue recovered
- AI performance scoring — which response variants convert best

---

## Pillar 2 — Intelligent Patient Retention

Acquiring a patient once is easy. Keeping them, reactivating them, and growing their lifetime value is where the real revenue lies. This pillar runs autonomously — staff configure it once, and it runs indefinitely.

### 2.1 Treatment-Specific Follow-Up Intelligence

Follow-ups are timed to the clinical interval for each treatment, not an arbitrary schedule. These are encoded in the automation registry and execute via n8n + Twilio/WhatsApp:

| Treatment | Follow-up Interval | Message Theme |
|---|---|---|
| B12 Injection | 3 months | "Time for your next B12 boost — energy and immunity support" |
| Botox | 4 months | "Ready to refresh your look? Your Botox results will be fading" |
| Dermal Filler | 6 months | "Top-up recommended for optimal results" |
| CoolSculpting | 8 weeks | "Check-in: How are your results looking? We'd love to hear" |
| IV Therapy | 4 weeks | "How are you feeling? Many patients find a monthly IV session ideal" |
| Weight Loss Program | Weekly | Progress check-in + motivational message |
| Skin Treatment | 6 weeks | "Ready for your next session? Skin treatments work best in courses" |
| GP Consultation | 3 months | "Don't forget your follow-up — preventative care keeps you ahead" |
| Hormone Therapy | Monthly | Check-in and next appointment reminder |

**Multi-channel outreach:**
- SMS for appointment reminders (highest open rate)
- WhatsApp for check-in messages (conversational)
- Email for educational content and longer-form communication
- Outbound AI call for high-value patients (£500+ LTV) who haven't responded to SMS/WhatsApp

### 2.2 Re-Engagement for Dormant Patients

Automated identification and outreach for patients who haven't returned in 90+ days:

1. System detects patient inactive > 90 days
2. Pulls last treatment from Cliniko
3. Sends personalised message referencing their specific treatment
4. Offer: relevant promotion, new service announcement, or birthday/anniversary message
5. If no response at 7 days: follow-up SMS
6. If no response at 14 days: AI outbound call
7. If still unresponsive: flagged as churned, signal created for manual review

### 2.3 Appointment Reminder & No-Show Prevention

| Timing | Channel | Content |
|---|---|---|
| 48 hours before | WhatsApp + SMS | Appointment reminder with date/time/clinician/service |
| 24 hours before | SMS | Shorter reminder with confirmation link |
| 2 hours before | WhatsApp | "Looking forward to seeing you today" |
| Missed appointment | AI outbound call | "We noticed you weren't able to make it — can we rebook?" |
| Post-no-show | SMS (2 hours later) | Rebooking link with next availability |

**For patients with a history of no-shows:** the AI places a personal call 24 hours before rather than just sending SMS.

### 2.4 Churn Prediction

The CRM agent monitors patient behaviour and flags patients at churn risk before they leave:

- Patients who've cancelled twice without rebooking
- Patients who haven't opened follow-up messages
- Patients whose satisfaction scores are declining
- Patients whose booking frequency is slowing

Each churn-risk flag creates a signal assigned to Sales & Business Development for proactive outreach.

### 2.5 Patient Loyalty Intelligence

- **Lifetime value tracking** — total spend, visit frequency, treatment mix
- **VIP designation** — patients above configurable LTV threshold receive elevated service (priority booking, personal calls, complimentary consultations)
- **Next treatment recommendations** — AI suggests next relevant treatment based on history
- **Package and membership suggestions** — when a patient has booked 3+ individual treatments that could be packaged more economically
- **Birthday/anniversary offers** — automated personalised offers on key dates
- **Referral tracking** — monitor which patients refer others, automate thank-you messages and credits

---

## Pillar 3 — Revenue Intelligence & Automation

### 3.1 Automated Payment Collection

**When a booking is created in Cliniko:**
1. Aria detects new appointment via Cliniko webhook
2. Twilio sends SMS/WhatsApp with Stripe payment link within 30 seconds
3. Message includes: service name, amount, deposit requirement, payment terms
4. Patient pays via Stripe — appointment confirmed
5. Cliniko invoice updated automatically via Stripe webhook

**Overdue invoice chasing (automated):**
- 3 days overdue: SMS reminder with payment link
- 7 days overdue: WhatsApp message
- 14 days overdue: AI outbound call (gentle, professional tone)
- 21 days overdue: signal created for manual review by management

### 3.2 Revenue Performance Dashboard

**Page:** `/staff/analytics` (Revenue tab)

- Daily / weekly / monthly revenue vs target
- Revenue by treatment type (Botox, fillers, IV therapy, GP, etc.)
- Revenue by practitioner
- Outstanding invoices with collection rate
- Booking conversion funnel (enquiry → call → booking → payment confirmed)
- Package and membership sales performance
- Average transaction value trend

### 3.3 Corporate Client Management

**Page:** `/staff/corporate`

Premium clinics often serve corporate wellness contracts (company health screening packages, executive wellbeing programmes).

- Corporate account profiles with contract terms, discount rate, account manager
- Bulk booking management
- Corporate invoicing with NET 30 / NET 60 terms
- Volume tracking vs contract commitment
- Usage reporting for corporate clients (monthly PDF)
- Renewal reminders and renegotiation signals

### 3.4 Referral Programme Automation

- Patient refers a friend → referred patient books → credit automatically applied to referrer's account
- Configurable credit amount per referral (e.g. £50 account credit)
- Referral leaderboard (monthly top referrers — eligible for free treatment)
- Automated thank-you message with credit confirmation
- Referral tracking: source attribution on every new patient booking

### 3.5 Dynamic Pricing Intelligence (Advanced)

Using the `web_search` tool and Cliniko booking data:

- AI scrapes competitor pricing weekly
- Alerts when a direct competitor undercuts the clinic's pricing
- Seasonal demand analysis: identifies when to apply premium pricing (e.g. Botox demand spikes pre-Christmas)
- Package optimisation: which bundles sell best and at what margin
- A/B testing support: price variant testing across channels

---

## Pillar 4 — Compliance & Regulatory Intelligence

**This is the most critical pillar for a CQC-regulated healthcare provider.** A single failed inspection can result in enforcement action, reputational damage, and significant legal costs. Aria makes compliance continuous rather than reactive.

### 4.1 CQC Compliance Dashboard

**Page:** `/staff/compliance`

CQC's five key questions, tracked in real time with RAG (red/amber/green) status:

| Key Question | Focus Areas Tracked |
|---|---|
| **Safe** | Equipment servicing, PAT testing, safeguarding, infection control, incident reports |
| **Effective** | Staff training, clinical outcomes, treatment protocols, evidence-based practice |
| **Caring** | Patient satisfaction scores, complaint resolution, communication quality |
| **Responsive** | Appointment availability, waiting times, accessibility, complaint response times |
| **Well-led** | Governance, policy review dates, staff acknowledgements, audit trail |

**Inspection readiness score:** AI-calculated percentage across all five domains. "You are 78% inspection-ready. 3 gaps found in Safe: laser machine service overdue, 1 DBS check expired, safeguarding level 3 not completed for 2 staff."

**Gap analysis:** Lists every outstanding item with severity, owner, and deadline.

**One-click inspection evidence pack:** AI compiles all tagged evidence documents, generates PDF with table of contents, ready to hand to an inspector.

### 4.2 Equipment & Safety Compliance

**Equipment register** — every clinical device catalogued:
- Laser machines (Nd:YAG, diode, etc.)
- CoolSculpting applicators
- Ultrasound / RF devices
- Autoclaves and sterilisation equipment
- Medical grade fridges (vaccine/filler storage)
- Electrical equipment requiring PAT testing

For each item:
- Service schedule with next due date
- Calibration requirements
- Responsible person
- Certificate upload (scanned service reports, calibration certificates)
- Status: Compliant / Due soon (30-day warning) / Overdue (blocked from use flag)
- Signal created automatically when service is overdue

### 4.3 Staff Compliance Management

For every staff member:
- DBS check expiry and renewal reminder (2-month warning)
- Professional registration (GMC, NMC, HCPC, BABTAC, etc.) — expiry tracking
- Professional indemnity insurance — policy upload and renewal reminder
- Mandatory training tracker:
  - Safeguarding Level 2/3 (renewal schedule)
  - Infection control
  - BLS / ALS (Basic/Advanced Life Support)
  - Fire safety
  - GDPR / Information Governance
  - CQC-specific mandatory training
- Competency assessments — last demonstrated competency per procedure
- All training certificates uploadable with AI-extracted expiry date

### 4.4 Clinical Governance

**Incident log (Duty of Candour — Regulation 20):**

- Staff report adverse events, near-misses, and complaints via a structured form
- AI automatically categorises (clinical / operational / HR / facilities)
- Severity scoring (serious incident / incident / near-miss / concern)
- Root cause analysis prompted by AI (5 Whys framework)
- Action plan generation with owners and deadlines
- Audit trail of every status change
- Notifiable incidents escalated to clinic director immediately

**Consent form tracking:**
- All patient consent forms timestamped and linked to appointment
- Outstanding consents flagged before appointment

### 4.5 Policy & Procedure Management

- **Centralised policy library** — upload all clinic policies (consent, safeguarding, GDPR, infection control, etc.)
- **Version control** — track every policy revision with change log
- **Staff acknowledgement tracking** — who has read and acknowledged each policy, when
- **Review reminders** — annual policy review notifications to policy owner
- **AI policy assistant** — "Is our consent process compliant with CQC Regulation 11?" — AI checks policy against regulatory standard and flags gaps

---

## Pillar 5 — Operational Intelligence Hub

### 5.1 Unified Operational Dashboard

**Page:** `/staff/dashboard`
**Status: Built**

Real-time clinic health at a glance:
- Today's bookings and revenue
- Active AI receptionist calls
- Outstanding signals by priority
- Compliance status summary
- Quick actions (create signal, start chat, run scan)

### 5.2 Signal Intelligence

**Page:** `/staff/signals`
**Status: Built**

Signals are the nervous system of the platform — structured intelligence events that represent anything requiring attention, action, or decision.

**Signal lifecycle:** `new → pending_approval → processing → judged → awaiting_decision → decided → acted → outcome_recorded → closed`

**Signal types:** task, event, alert, objective, insight

**Sources:**
- AI-generated (agent detected something noteworthy)
- System-generated (automation triggered a signal)
- Staff-raised (manual signal via UI or chat)
- Integration-triggered (Cliniko webhook, voice call outcome)

**Every signal has:**
- Priority (low / medium / high / critical)
- Assigned agent and department
- AI judgement (risk level, recommendation, suggested actions)
- Full audit trail

### 5.3 Staff KPI Tracking

**Page:** `/staff/kpis`
**Status: Proposed**

Per-clinician performance metrics:
- Treatments delivered (daily / weekly / monthly)
- Revenue generated
- Patient satisfaction score (from post-appointment feedback)
- Rebooking rate
- No-show rate attributable to specific clinician

Per-reception/admin:
- Call handling and conversion rate
- Follow-up completion rate
- Booking confirmation turnaround time

**Leaderboard:** Monthly top performers eligible for recognition. Configurable by clinic director.

### 5.4 Calendar & Appointment Intelligence

**Page:** `/staff/patients` (calendar view)

- Visual day/week/month calendar
- Room allocation — AI suggests assignments to minimise gaps
- Practitioner utilisation — "Dr X is 70% booked this week — opportunity to fill"
- Peak time analysis — "Saturdays are 95% booked — consider adding capacity"
- Cancellation pattern alerts — "3 cancellations this morning is unusual, flagged as signal"

### 5.5 Patient Intelligence View

**Page:** `/staff/patients`
**Status: Built (awaiting Cliniko API connection)**

Per-patient view:
- Full appointment history from Cliniko
- Treatment history with dates and clinical notes
- All communications in one timeline (calls, SMS, WhatsApp, email)
- Invoices and payment status
- Staff notes and flags ("prefers WhatsApp", "price-sensitive", "VIP")
- Predicted lifetime value
- Churn risk score
- Next recommended treatment

**Patient cohort analysis:**
- "All patients who received Botox 4–5 months ago" (reminder campaign target)
- "All patients who spent > £2,000 in the last 12 months" (VIP segment)
- "All patients who haven't returned in 90 days" (re-engagement target)

### 5.6 Inventory Management

**Page:** `/staff/inventory`
**Status: Proposed**

Tracks consumable stock used in treatments:
- Botox vials (units)
- Dermal fillers (by product and volume)
- IV vitamins and compounds
- Cannulas, syringes, needles
- Skincare products

Per item:
- Current stock level
- Reorder threshold (auto-signal when low)
- Batch number and expiry date tracking
- Usage linked to treatment delivery (reduces wastage)
- Supplier and cost tracking

### 5.7 AI Reporting & Insights

**Page:** `/staff/reports`
**Status: Proposed**

- **Weekly clinic summary** — auto-generated every Monday, emailed to clinic director. Key metrics, anomalies, recommendations
- **Monthly performance report** — deep dive across all 5 pillars
- **Patient retention report** — cohort analysis, churn rate, LTV trends
- **Revenue intelligence report** — conversion funnel, treatment revenue, lead source attribution
- **Compliance evidence pack** — one-click CQC inspection preparation
- **Custom report builder** — select date range, departments, metrics; generate PDF or CSV

All reports generated by Aria's `generate_report` tool using live database data.

---

## Additional Premium Features

### Voice of Customer Intelligence

- Post-appointment feedback automated (SMS survey 24h after treatment)
- All patient reviews, complaints, and compliments analysed by AI
- Sentiment trending — "3 patients mentioned wait times this week"
- Satisfaction score per clinician, per treatment type
- Alert when sentiment drops (signal created immediately)

### AI Consultation Assistant

During a clinical consultation, the practitioner can ask Aria:
- "What treatments has this patient had before?"
- "Are there any known contraindications for filler in someone on blood thinners?"
- "What's the recommended interval for Botox top-ups at standard dosing?"

Aria pulls from the patient record (via Cliniko) and the knowledge base (clinical protocols). **Saves clinical time. Improves safety. Reduces errors.**

### Marketing Campaign Intelligence

- Track campaign attribution: which Google Ad, which social post, which email drives bookings
- Revenue per campaign source
- AI recommendation: "Your filler posts generate 3× the booking rate of Botox posts — shift budget"
- Seasonal planning: "Book in extra capacity in early December based on last year's Botox surge"

### Competitor Intelligence

- AI web scan of competitor clinics weekly
- Compares pricing, services, and promotions
- Alerts when a competitor undercuts the clinic's pricing by > 10%
- Recommends response (price adjustment, differentiated offer, promotional campaign)

### Predictive Analytics

- **Demand forecasting:** "Botox bookings historically spike 3 weeks before Christmas — consider pre-booking staff now"
- **Revenue projection:** "Based on current trends and booked appointments, March revenue is projected at £X"
- **Churn prediction:** "Patient X has a 78% probability of churning within 30 days based on engagement pattern"

### Patient Education Automation

- Post-treatment care guides sent automatically (24h after appointment)
- Pre-treatment instructions sent (48h before appointment)
- AI answers common patient questions via WhatsApp:
  - "Is bruising after filler normal?"
  - "How long should I avoid exercise after Botox?"
  - AI responds using knowledge base clinical protocols — never inventing clinical guidance

---

## AI Agent Roster

### Aria — Primary Agent (Catch-all Orchestrator)
**`primary_agent`** | Scope: general | Catch-all: yes

The clinic's operational brain and the name clients interact with. Handles all general queries, coordinates specialists, monitors clinic health, and provides strategic oversight. Every query routes through or ends at Aria.

**System prompt:** Precise, calm, professional. A premium clinic tone. Prioritises patient welfare and clinic reputation above all else. Never gives clinical diagnoses or medical advice — administrative intelligence only.

**Domains:** operations, management, reporting, clinic health, coordination, analytics, oversight
**Critical keywords (always escalate to human):** emergency, urgent, critical, safeguarding, serious incident

---

### Sales Intelligence Agent
**`sales_agent`** | Scope: sales

Revenue pipeline intelligence. Tracks lead conversion, treatment package enquiries, booking rates, and upsell opportunities.

**Domains:** sales, revenue, bookings, leads, packages, conversions, pricing, corporate, membership, enquiry
**Critical keywords:** lost lead, cancelled package, complaint about price, refund request, dispute

---

### Patient Relations Agent
**`crm_agent`** | Scope: patient_relations

Patient experience guardian. Monitors satisfaction, complaint risk, retention, no-shows, and communication quality.

**Domains:** patient experience, complaints, retention, satisfaction, communication, follow-up, feedback, no-show, cancellation, rebooking
**Critical keywords:** legal action, solicitor, refund demand, serious complaint, safeguarding, negligence

---

### Proposed Additional Agents

| Agent | Scope | Purpose |
|---|---|---|
| `compliance_agent` | compliance | Monitors CQC requirements, certification expiries, incident tracking |
| `clinical_assistant` | clinical | In-consultation support — patient history, contraindications, treatment protocols |
| `finance_agent` | finance | Revenue monitoring, invoice collection, payment anomalies |

---

## Agent Tools (9 Active)

| Tool | What it does |
|---|---|
| `knowledge_base_search` | Semantic vector search across all clinic documents (pgvector cosine similarity) |
| `query_signals` | Query signals table by status, priority, category, date |
| `create_signal` | Raise a new signal programmatically from AI reasoning |
| `web_search` | Live web search for external information (competitor pricing, regulatory updates) |
| `get_department_info` | Department structure, staff counts, configuration |
| `get_available_agents` | List active agents and their scopes — used for routing decisions |
| `route_to_specialist` | Delegate a query to a specialist agent and return their response |
| `generate_report` | Produce formatted analytical reports from live data |
| `run_proactive_scan` | Clinic-wide health scan — surfaces operational issues across all domains |

---

## Integration Roadmap

### Tier 1 — Phase 1 (Critical — unlock core functionality)

| Integration | What it enables | Status |
|---|---|---|
| **Cliniko API** | Live patient/appointment data, no-show detection, invoice sync | Schema ready, API not connected |
| **Vapi.ai** | AI voice receptionist, outbound calls, missed call recovery | Not yet connected |
| **Twilio** | SMS reminders, payment links, follow-up sequences | Not yet connected |
| **WhatsApp Business API** | Conversational patient messaging, check-ins | Not yet connected |
| **Stripe / GoCardless** | Payment link generation, invoice auto-pay, overdue chasing | Not yet connected |
| **n8n (self-hosted)** | Cron execution for scheduled automations, webhook handler | Not yet connected |
| **OpenAI Embeddings** | Knowledge base semantic search (text-embedding-3-small) | Schema ready, pipeline not wired |

### Tier 2 — Phase 2

| Integration | Business value |
|---|---|
| Google Workspace / Outlook | Bridge communications inbox — email into Aria |
| Mailchimp | Marketing campaign performance signals |
| Calendly | Consultation booking for new patients |
| SurveyMonkey | Post-treatment satisfaction surveys |

### Tier 3 — Strategic

| Integration | Business value |
|---|---|
| Zapier / n8n advanced | Edge-case workflows, 5,000+ app connections |
| DocuSign | Patient consent form tracking |
| Sage / Xero | Financial data for revenue intelligence |
| Power BI | Push operational data to external dashboards |

---

## Automation Workflows

### 15 Automations (7 existing + 8 new)

| Automation | Trigger | Category | Status |
|---|---|---|---|
| Treatment Reminder Sweep | Daily 9:00 AM | Patient Care | Active |
| No-show Follow-up | Appointment → Did Not Arrive (Cliniko) | Patient Care | Active |
| Re-engagement Sweep | Weekly Monday 8:00 AM | Patient Care | Active |
| Appointment Payment Link | New appointment created in Cliniko | Revenue | Inactive |
| New Lead Outreach | Missed call or new enquiry form | Revenue | Inactive |
| Cliniko Data Sync | Every hour | Sync | Inactive |
| Compliance Check Reminder | Weekly Friday 4:00 PM | Compliance | Inactive |
| **B12 Follow-up** | 3 months after B12 treatment | Patient Care | *Proposed* |
| **Botox Follow-up** | 4 months after Botox treatment | Patient Care | *Proposed* |
| **Filler Follow-up** | 6 months after filler treatment | Patient Care | *Proposed* |
| **CoolSculpting Check-in** | 8 weeks after CoolSculpting | Patient Care | *Proposed* |
| **Post-Treatment Education** | 24 hours after any appointment | Patient Care | *Proposed* |
| **Overdue Payment Reminder** | Invoice overdue 3/7/14 days | Revenue | *Proposed* |
| **Referral Credit Processing** | Referred patient completes first booking | Revenue | *Proposed* |
| **Missed Call Recovery** | Missed call detected (Vapi webhook) | Revenue | *Proposed* |

**Automation runtime:** n8n executes all scheduled and webhook-triggered automations. The Aria automations UI manages configuration; n8n handles execution.

---

## Knowledge Base

The clinic's private intelligence vault — every document uploaded powers Aria's ability to give accurate, clinic-specific answers.

### Architecture
1. Staff uploads document (PDF, Word, text)
2. Text extracted → split into ~512-token chunks
3. Each chunk embedded via OpenAI `text-embedding-3-small` (1536 dimensions)
4. Stored in `knowledge_chunks.embedding` (pgvector)
5. At query time, message embedded → top-N chunks retrieved via cosine similarity
6. Retrieved context injected into agent's system prompt

### 6 Knowledge Categories

| Category | What to upload |
|---|---|
| Clinical Protocols | Treatment protocols, adverse reaction procedures, safety guidelines, contraindication lists |
| Patient Policies | Consent forms, cancellation policy, GDPR privacy notice, patient rights |
| Pricing & Packages | Full price list, package descriptions, membership tiers, corporate rates |
| Staff Handbook | HR policies, onboarding materials, clinic procedures, dress code, rotas |
| Marketing & Brand | Brand guidelines, service descriptions, FAQs, social media tone of voice |
| Compliance & Legal | CQC registration details, insurance policies, regulatory correspondence |

### AI Document Operations
- Upload → auto-chunk → auto-embed
- AI document analysis on upload (summary, key topics, quality score, suggested category)
- AI suggestion engine: "Based on your clinic profile, here are 8 documents you should add"
- Chat assistant: Aria helps staff understand what to upload and why
- Delete with cascade (removes all chunks and embeddings)

---

## AI Learning & Memory

### Agent Memory System

Each agent maintains a persistent memory store (`agent_memories`) across four types:

| Memory Type | What is stored |
|---|---|
| `conversation` | Summaries of notable past interactions |
| `correction` | Cases where staff corrected AI routing — feeds back into future decisions |
| `pattern` | Recurring patterns the agent has observed (e.g. "Monday mornings always have higher no-show rates") |
| `preference` | Clinic-specific preferences learned over time |

Memories are ranked by importance score (0–1) and access frequency. The most relevant memories are injected into each agent's context at runtime.

### Correction Learning

When a staff member corrects an AI routing decision (wrong agent, wrong category):
1. Correction written to `routing_corrections` table
2. Agent memory updated with the correction and context
3. Signal updated with corrected classification
4. Over time: agent learns the clinic's specific terminology and case patterns

---

## All Pages — Build Status

| Page | Status | Notes |
|---|---|---|
| `/login` | Built | Two-column split, bcrypt auth, clinic branding from DB |
| `/staff/chat` | Built | Streaming AI chat, conversation history, tool visibility |
| `/staff/dashboard` | Built | KPI cards, signals queue, activity feed |
| `/staff/signals` | Built | Full lifecycle, filters, detail panel, create panel |
| `/staff/patients` | Built | Patient list + detail, appointment timeline (needs Cliniko data) |
| `/staff/automations` | Built | 7 automations, toggle, history, Aria slide-over |
| `/staff/analytics` | Backend built | UI needs B&W redesign |
| `/staff/bridge` | Backend built | UI needs B&W redesign |
| `/staff/integrations` | Backend built | UI needs B&W redesign |
| `/staff/simulations` | Backend built | UI needs B&W redesign |
| `/staff/knowledge-base` | Backend built | UI not yet built |
| `/staff/compliance` | Not built | Schema extension needed |
| `/staff/guardrails` | Not built | AI behavioural controls — healthcare critical |
| `/staff/agents` | Not built | Manage agent prompts, memories, test panel |
| `/staff/reports` | Not built | Scheduled + on-demand formal reports |
| `/staff/settings` | Not built | User management, Aria persona, neural contract |
| `/staff/voice` | Not built | Live call monitoring, Vapi.ai dashboard |
| `/staff/kpis` | Not built | Staff performance, leaderboard |
| `/staff/corporate` | Not built | Corporate accounts, bulk bookings |
| `/staff/inventory` | Not built | Stock tracking, expiry, reorder |
| `/staff/deep-probe` | Partially built | Clinic-wide proactive anomaly detection |

---

## Build Priority Order

### Critical (must-have for clinic go-live)

1. **Cliniko API connection** — unlocks all patient data, automations, and no-show detection
2. **Vapi.ai voice receptionist** — highest immediate commercial value; recovers missed revenue from day one
3. **Twilio SMS** — payment links, appointment reminders, follow-up sequences
4. **Stripe/GoCardless** — payment automation; instant revenue impact
5. **n8n automation executor** — makes the 15 automations actually run
6. **OpenAI embedding pipeline** — wires up knowledge base semantic search
7. `/staff/knowledge-base` UI — backend complete; staff need the interface to upload documents
8. `/staff/compliance` — CQC is not optional for a regulated clinic

### High (premium features, phase 2)

9. `/staff/guardrails` — responsible AI controls in a healthcare setting
10. `/staff/agents` — no-code agent management for the clinic director
11. `/staff/voice` — live call monitoring dashboard
12. WhatsApp Business API — conversational patient messaging
13. Treatment-specific automations (B12, Botox, filler timings)
14. `/staff/reports` — formal reporting for governance
15. `/staff/settings` — user management and Aria persona editing

### Phase 3 (expansion)

16. `/staff/kpis` — staff performance leaderboard
17. `/staff/corporate` — corporate account management
18. `/staff/inventory` — stock and expiry tracking
19. Analytics, Bridge, Integrations, Simulations page redesigns
20. Referral programme automation
21. Competitor intelligence
22. Predictive analytics (churn, demand forecasting, revenue projection)
23. Marketing campaign attribution
24. AI Consultation Assistant

---

## Data Privacy & Security

- **Single-tenant** — the clinic's data is isolated. No shared infrastructure, no other clients on the same system
- **Service-role server access** — all DB queries via Supabase service role, server-side only. No client-side DB access
- **bcrypt password hashing** — cost factor 10 via PostgreSQL pgcrypto
- **Audit trail** — all significant actions logged with user ID, timestamp, before/after state
- **Cliniko API key encryption** — stored encrypted, decrypted only at application layer
- **Vapi.ai calls** — recorded and stored in the system. Compliant with UK GDPR (consent obtained at call start)
- **No telemetry** — no analytics, training data, or usage data leaves the system
- **Stripe/GoCardless** — payment data never touches Aria's database; handled entirely within payment processor's PCI-DSS environment

---

## Design System

Pure monochrome — consistent with premium B2B SaaS (OpenAI, Linear, Vercel aesthetic).

| Token | Value | Usage |
|---|---|---|
| Background | `#000000` | All page backgrounds |
| Surface | `white/[0.04]` | Card and panel backgrounds |
| Border | `white/[0.08]` | Single border level everywhere |
| Text — primary | `white/90` | Headings and key labels |
| Text — secondary | `white/45` | Body text |
| Text — tertiary | `white/25` | Metadata, captions |
| Brand colour | `#ffffff` white | Aria orb animation in nav only |
| Primary button | `bg-white text-black` | CTAs |
| Secondary button | `bg-white/[0.06] border-white/[0.08]` | Supporting actions |
| Slide-over panels | `bg-[#0a0a0a] border-l border-white/[0.08]` | Detail/create panels |

---

## Commercial Context

**The system replaces and outperforms:**
- GoHighLevel CRM subscription (~£100–200/month)
- Make / Zapier automation (~£100–200/month)
- Primitive AI receptionist (limited, no objection handling)
- Manual follow-up processes (10–15 staff hours/week)
- Compliance consultant retainer (~£500–1,000/month)

**Conservative value created monthly:**
- Recovered missed calls: 10–20 bookings × £150 avg = £1,500–3,000
- Improved conversion: 5–10 bookings = £750–1,500
- Dormant patient recovery: 5–10 bookings = £750–1,500
- Staff time saved: 15 hours × £20/hr = £300
- Compliance consultant avoided: £500–1,000
- Tools eliminated: £200–400

**Total: ~£4,000–7,700/month in direct value**

---

*Document version 2.0 — Updated February 2026 to incorporate full clinic context, 5-pillar commercial framework, Vapi.ai voice receptionist, treatment-specific automations, and complete build roadmap.*
