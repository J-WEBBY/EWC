# CLAUDE.md — EWC Operational Intelligence System

This file gives Claude Code context for the jwebly-system project.

## Project

**Client:** Edgbaston Wellness Clinic — Dr Suresh Ganata, Medical Director, Edgbaston, Birmingham.
**Product:** Aria — EWC Operational Intelligence System (private clinic ops platform).
**Agency:** Jwebly Ltd. — Joseph Enemuwe, Solutions Architect.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 App Router, React, Tailwind CSS, Framer Motion |
| Database | Supabase (PostgreSQL + pgvector) — service role only |
| AI | Anthropic Claude Sonnet (primary), Haiku (lightweight) |
| Voice | Vapi.ai (not yet connected) |
| SMS | Twilio (not yet connected) |
| Payments | Stripe / GoCardless (not yet connected) |
| Automation | n8n (not yet connected) |
| Embeddings | OpenAI text-embedding-3-small (1536d) |
| Hosting | Vercel |

## Architecture

- **Single-tenant**: No RLS, no tenant_id anywhere. One clinic, one system.
- **Auth**: bcryptjs against `users.password_hash`. Admin: admin@edgbastonwellness.co.uk / Admin13!
- **DB client**: Always `createSovereignClient()` (service role). Never client-side DB access.
- **Server actions**: `'use server'` + `createSovereignClient()` for all data access.
- **AI client**: `getAnthropicClient()` from `@/lib/ai/anthropic.ts`, model: SONNET constant.

## Key Files

```
src/
  app/
    (auth)/         Login flow
    staff/
      dashboard/    Main ops dashboard
      chat/         Aria chat (SSE streaming via /api/primary-agent/chat)
      signals/      Operational signals
      patients/     Patient intelligence
      voice/        AI receptionist page
      automations/  15 automation workflows
      analytics/    Revenue analytics
      bridge/       System bridge
      integrations/ Integration management
  lib/
    actions/        Server actions (agent-service, staff-onboarding, integrations)
    ai/
      agent-executor.ts   ReAct loop with retry on 529/503
      tools/              Agent tools (8 tools)
      anthropic.ts        getAnthropicClient()
  components/
    staff-nav.tsx   Nav component
```

## Patterns

- `getLatestTenantAndUser()` — returns `{ tenantId: 'clinic', userId }` for auth fallback
- `getStaffProfile('clinic', uid)` — loads profile + brandColor
- `Agent.display_name` is optional — always use `a.display_name || a.name`
- UUID regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- All server actions accept `_tenantId` for compat but ignore it
- Tailwind opacity: `bg-white/[0.03]`, `border-white/[0.08]` etc.
- Framer Motion: AnimatePresence + motion.div on all list items and tab transitions

## Styling

- Background: `#000000` (pure black)
- Brand: white (`#ffffff`) on black, loaded from `clinic_config` via `getClinicInfo()`
- Font sizes: `text-[11px]` labels, `text-[13px]` body, `text-[28px]` KPI values
- Label style: `text-[11px] uppercase tracking-[0.18em] text-white/25 font-medium`
- Cards: `bg-white/[0.03] border border-white/[0.08] rounded-xl`
- No emojis. No gradients (except subtle brand accents). Clean monochrome B&W.

## Agents

Three agents seeded:
- `primary_agent` — **EWC** (catch-all orchestrator)
- `sales_agent` — **Orion** (patient acquisition)
- `crm_agent` — **Arry** (patient retention)

## Build Commands

```bash
npx tsc --noEmit        # Type check (must be zero errors)
npx next build          # Full build (warnings OK, errors not OK)
npx next dev            # Dev server on localhost:3000
```

## Database Migrations (run in Supabase SQL editor in order)

1. `database/migrations/012_drop_all.sql`
2. `database/migrations/013_wellness_schema.sql`
3. `database/migrations/014_wellness_seed.sql`

## 3-Week Development Plan

- **Week 1**: All pages built with simulated data, all 5 pillars functional
- **Week 2**: Cliniko API, Vapi.ai, Twilio, Stripe — real integrations
- **Week 3**: Prompt engineering, signal calibration, KPI thresholds, monitoring

## Pages Status

| Page | Status |
|---|---|
| Login | ✅ Complete |
| Dashboard | ✅ Complete |
| Chat (Aria) | ✅ Complete |
| Signals | ✅ Complete |
| Patients | ✅ Complete |
| Automations | ✅ Complete |
| Voice (AI Receptionist) | ✅ Complete |
| Analytics | Needs B&W redesign |
| Bridge | Needs B&W redesign |
| Integrations | Needs B&W redesign |
| Knowledge Base | Not built |
| Compliance | Not built |
| Agents | Not built |
| Settings | Not built |
| KPIs | Not built |
| Reports | Not built |
| Corporate | Not built |
| Inventory | Not built |

## Do Not

- Add tenant_id to schema or queries
- Use client-side Supabase access (always service role)
- Make clinical decisions — the system is operational only
- Add RLS policies
- Commit secrets or API keys
