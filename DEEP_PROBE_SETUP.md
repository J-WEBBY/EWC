# Deep Probe AI Training System - Complete Setup Guide

## Overview
Deep Probe is the conversational AI training phase where the system learns about your organization through intelligent dialogue. It uses **Anthropic's Claude** (Sonnet 4.5) to conduct structured yet natural conversations across 6 core topics.

## Architecture

### 1. **API Setup** ✅
- **Switched from OpenAI to Anthropic**
- File: `src/lib/ai/anthropic.ts`
- Model: Claude Sonnet 4.5 (`claude-sonnet-4-20250514`)
- Environment Variable: `ANTHROPIC_API_KEY` (add to `.env.local`)

### 2. **Database Schema** ✅
- **File**: `database/migrations/005_deep_probe_schema.sql`
- **Tables Created**:
  1. `deep_probe_conversations` - Session tracking
  2. `deep_probe_messages` - Individual messages
  3. `deep_probe_insights` - Extracted structured insights
  4. `deep_probe_workflows` - Documented workflows
  5. `deep_probe_values` - Organizational values

### 3. **AI Agent System** ✅
- **File**: `src/lib/ai/deep-probe-agent.ts`
- **Functions**:
  - `startDeepProbeConversation(tenantId)` - Initializes conversation
  - `continueDeepProbeConversation(conversationId, userMessage)` - Handles dialogue

### 4. **6 Core Topics**
The AI explores these areas systematically:

1. **Organizational Values** - Core principles and decision-making guides
2. **Core Workflows** - Essential operational processes
3. **Pain Points & Bottlenecks** - Current challenges
4. **Decision-Making Approaches** - How decisions are made
5. **Tools & Systems** - Technology stack and usage
6. **Success Metrics & Outcomes** - How success is measured

### 5. **Conversational Flow**
```
Start → Topic 1 (3-5 exchanges) → [TOPIC_COMPLETE]
     → Topic 2 (3-5 exchanges) → [TOPIC_COMPLETE]
     → ... → Topic 6 → [ALL_COMPLETE] → Next Phase
```

### 6. **AI Behavior**
- **Conversational & Natural** - Not a rigid Q&A
- **Probing** - Digs deeper on surface answers
- **Context-Aware** - Builds on previous responses
- **One Question at a Time** - Focused dialogue
- **Signals Completion** - Uses `[TOPIC_COMPLETE]` marker

---

## Setup Instructions

### Step 1: Get Anthropic API Key
1. Go to https://console.anthropic.com/settings/keys
2. Create a new API key
3. Copy the key

### Step 2: Add to Environment
Edit `.env.local` and replace `your-anthropic-api-key-here` with your actual key:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

### Step 3: Run Database Migration
```bash
cd database/migrations
psql -h <your-supabase-host> -U postgres -d postgres -f 005_deep_probe_schema.sql
```

Or via Supabase Dashboard:
1. Go to SQL Editor
2. Copy contents of `005_deep_probe_schema.sql`
3. Run the SQL

### Step 4: Update UI Page
The Deep Probe page at `src/app/onboarding/deep-probe/page.tsx` needs to be updated to use the new Anthropic agent instead of OpenAI.

---

## How It Works

### 1. User Flow
1. User completes Brand Architecture phase
2. Redirected to `/onboarding/deep-probe`
3. AI starts with Topic 1 (Organizational Values)
4. User responds, AI follows up intelligently
5. After 3-5 meaningful exchanges, AI marks topic complete
6. Moves to next topic automatically
7. After all 6 topics: conversation complete
8. User proceeds to next onboarding phase

### 2. Data Storage

**Conversation Messages**:
```sql
INSERT INTO deep_probe_messages (
  conversation_id,
  tenant_id,
  role,           -- 'assistant' or 'user'
  content,        -- Message text
  topic,          -- Current topic ID
  message_index,  -- Order in conversation
  tokens_used,
  model_used
)
```

**Extracted Insights** (populated later by analysis):
```sql
INSERT INTO deep_probe_insights (
  tenant_id,
  category,        -- 'values', 'workflow', 'pain_point', etc.
  title,
  description,
  importance_score, -- 1-10
  confidence_score, -- 0.00-1.00
  data             -- JSONB structured data
)
```

### 3. System Prompt Strategy
The AI receives a dynamic system prompt for each topic:

```typescript
`You are an expert organizational intelligence analyst for ${companyName}.

CURRENT FOCUS: ${currentTopic.name}

KEY AREAS:
1. ${question1}
2. ${question2}
3. ${question3}

APPROACH:
- Ask ONE question at a time
- Probe for specific examples
- Signal completion with [TOPIC_COMPLETE]`
```

---

## Next Steps to Complete Integration

1. **Test API Connection**:
   ```bash
   npm run dev
   # Navigate to /onboarding/deep-probe
   # Check console for any API errors
   ```

2. **Update Page Component**:
   Replace the OpenAI calls in `page.tsx` with Anthropic calls

3. **Add Insight Extraction** (Future Enhancement):
   After conversation completes, run a second AI pass to extract structured insights from the conversation and populate `deep_probe_insights`, `deep_probe_workflows`, and `deep_probe_values` tables.

4. **Build Synthesis View** (Future Enhancement):
   Create a summary view showing all extracted insights before proceeding to next phase.

---

## Key Files Reference

```
src/
├── lib/
│   ├── ai/
│   │   ├── anthropic.ts              # Claude API client ✅
│   │   └── deep-probe-agent.ts       # Conversation agent ✅
│   └── actions/
│       └── deep-probe.ts              # Server actions (needs update)
├── app/
│   └── onboarding/
│       └── deep-probe/
│           └── page.tsx               # UI (needs Anthropic integration)
└── database/
    └── migrations/
        └── 005_deep_probe_schema.sql  # Database schema ✅
```

---

## Sample Conversation

```
AI: "Let's start with the principles that matter most to your organization.
     When you're faced with a difficult decision, what values guide your team?"

USER: "We always prioritize student wellbeing over efficiency."

AI: "That's a powerful principle. Can you share a specific example where
     you chose student wellbeing even when it meant taking the slower path?"

USER: "Last term we extended deadline review periods because students were
      struggling with mental health..."

AI: "That's exactly what I was looking for - a real moment where your values
     showed up in action. How did your team make that decision? Was it
     immediate or did you weigh different factors?"

[... 2-3 more exchanges ...]

AI: "Thank you - I now have a clear picture of how values drive your decisions.
     [TOPIC_COMPLETE]

     Let's shift to your core workflows. Walk me through your most critical
     daily or weekly process..."
```

---

## Cost Estimation

**Per Conversation:**
- ~50-60 message exchanges (user + AI)
- ~2,000 tokens per message
- Total: ~120,000 tokens
- Cost: ~$0.36 per conversation (Sonnet 4.5 pricing)

**Monthly (for 100 tenants):**
- $36/month for Deep Probe conversations

---

## Security & Privacy

✅ **Row-Level Security (RLS)** enabled on all tables
✅ **Tenant Isolation** - Users can only access their tenant's data
✅ **Service Role Access** - Admin operations use service role
✅ **No External Data Sharing** - All data stays in your Supabase instance

---

## Troubleshooting

### "ANTHROPIC_API_KEY is not set"
- Check `.env.local` file exists
- Restart dev server after adding key: `npm run dev`

### "Failed to create conversation"
- Run database migration first
- Check Supabase connection
- Verify tenant_id exists in tenants table

### "No response from AI"
- Check API key is valid
- Check network/firewall settings
- Look for errors in browser console

---

**Status**: ✅ Backend Complete | ⚠️ UI Needs Anthropic Integration
**Next**: Update page.tsx to use new Anthropic-based agent
