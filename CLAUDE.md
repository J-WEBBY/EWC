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

All pages must match the dashboard design language exactly.

### Color Palette (EWC Brand — updated Mar 2026)
Source: Edgbaston Wellness Clinic CSS kit (jkit variables)

- Background: `#F8FAFF` (barely-blue white) — use as page base
- Primary text: `#181D23` (EWC dark navy)
- Secondary text: `#3D4451`
- Tertiary text: `#5A6475`
- Label/muted text: `#96989B`
- Divider/border: `#D4E2FF` (blue-tinted)
- Light border accent: `#A8C4FF`
- Panel background: transparent with `border: '1px solid #D4E2FF'`
- Hover tint: `${accentColor}0d` — per-component accent at ~5% opacity

### Agent Accent Colors
- EWC (primary_agent): `#0058E6` (brand royal blue)
- Orion (sales_agent): `#D8A600` (brand gold)
- Aria (crm_agent): `#00A693` (healthcare teal)

### Lifecycle Accent Colors (for patient pages)
- Lead: `#0058E6`, Active: `#059669`, Loyal: `#D8A600`, At Risk: `#DC2626`, Lapsed: `#6B7280`, New: `#0284C7`

### Typography
- Section labels: `text-[8px] uppercase tracking-[0.28em] font-semibold text-[#96989B]`
- Page headings: `text-[38px] font-black tracking-[-0.035em] text-[#181D23]`
- KPI values: `text-[40px] font-black tracking-[-0.045em] text-[#181D23]`
- Sub-KPI: `text-[24px] font-black tracking-[-0.03em] text-[#181D23]`
- Body text: `text-[11-13px] text-[#3D4451]`
- Meta text: `text-[10px] text-[#5A6475]`

### Layout Patterns
- Sections separated by `borderBottom: '1px solid #D4E2FF'` — NOT floating cards
- Panels: `rounded-2xl overflow-hidden` with `border: '1px solid #D4E2FF'`
- Grid layouts: `grid grid-cols-N` for metric strips
- Main content: 8/4 or 9/3 column split
- Left margin: `pl-[240px]` (matches StaffNav width)
- Nav background: `#181D23` (EWC dark navy)

### Interactions
- Hover backgrounds: `${accentColor}0d` tint (per-component color)
- Left edge accents: `2px` colored strip on hover
- Framer Motion: AnimatePresence + motion.div on all list items and transitions
- Transitions: `duration-250` / `0.25s` / `transition-all`
- Sparklines: SVG polyline + fill gradient per metric card

### Rules
- No emojis in UI
- No black backgrounds — dark pages use `#0D1420` (dark navy), not pure black
- No pure white cards — panels are transparent on `#F8FAFF` base
- Dividers not shadows for separation
- Micro-interactions (hover reveals, opacity transitions) on all interactive elements

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
| Analytics | Needs redesign (match dashboard) |
| Bridge | Needs redesign (match dashboard) |
| Integrations | Needs redesign (match dashboard) |
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
