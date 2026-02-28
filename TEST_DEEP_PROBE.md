# Deep Probe - Quick Test Guide

**Ready to test the conversational AI training system!**

---

## 🚀 Quick Start

### Step 1: Get Your Test Tenant ID

Run this command to get the University of Oldbury Students' Guild tenant ID:

```bash
node get-tenant-id.mjs
```

Or query manually in Supabase SQL Editor:
```sql
SELECT id, company_name, ai_name FROM tenants
WHERE company_name ILIKE '%oldbury%' OR tenant_key = 'JWEBLY-DEMO-2026';
```

### Step 2: Start Deep Probe

With your tenant ID, navigate to:
```
http://localhost:3003/onboarding/deep-probe?tenantId=YOUR_TENANT_ID
```

Replace `YOUR_TENANT_ID` with the actual UUID from Step 1.

---

## 💬 Expected Conversation Flow

### Topic 1: Organizational Values (3-5 exchanges)
**AI might ask:**
- "What principles are non-negotiable in how you operate?"
- "When faced with difficult decisions, what values guide your team?"
- "Can you share a specific example where a decision reflected your core values?"

**Example Response:**
> "Student wellbeing is our top priority. Last term we extended deadline review periods because students were struggling with mental health. It wasn't efficient, but it was the right thing to do."

### Topic 2: Core Workflows (3-5 exchanges)
**AI might ask:**
- "Walk me through your most critical daily or weekly process"
- "Who is involved and what are the key steps?"
- "What triggers this workflow and what does success look like?"

**Example Response:**
> "Our event approval process involves students submitting proposals, our team reviewing them for safety and budget, then getting VP sign-off. The whole thing should take 3-5 days but often takes 2 weeks."

### Topic 3: Pain Points & Bottlenecks (3-5 exchanges)
**AI might ask:**
- "What operational challenges slow your team down the most?"
- "Where do things typically get stuck or require manual intervention?"
- "What tasks consume disproportionate time relative to their value?"

**Example Response:**
> "Manual data entry into our membership system is a nightmare. We get applications through web forms but have to manually copy everything into our CRM. Takes hours each week."

### Topic 4: Decision-Making Approaches (3-5 exchanges)
**AI might ask:**
- "How are routine vs. critical decisions typically made?"
- "What information is essential before making key decisions?"
- "Who needs to be involved in different types of decisions?"

### Topic 5: Tools & Systems (3-5 exchanges)
**AI might ask:**
- "What systems and tools does your team use daily?"
- "Which tools are indispensable vs. which cause friction?"
- "What data lives in different systems and how do you connect it?"

### Topic 6: Success Metrics & Outcomes (3-5 exchanges)
**AI might ask:**
- "What metrics matter most to your organization?"
- "How do you currently track performance and outcomes?"
- "What would dramatically improved efficiency look like in measurable terms?"

---

## 🎯 What to Look For

### ✅ AI Behavior
- [ ] AI asks natural, conversational questions
- [ ] AI follows up intelligently on your responses
- [ ] AI probes for specific examples when you give surface-level answers
- [ ] AI acknowledges your responses before moving on
- [ ] AI marks topic complete after 3-5 meaningful exchanges
- [ ] AI automatically advances to next topic

### ✅ UI Behavior
- [ ] Messages appear smoothly with animations
- [ ] Chat scrolls automatically to latest message
- [ ] Typing indicator shows while AI is "thinking"
- [ ] Right panel shows current topic highlighted (white pulsing dot)
- [ ] Progress bar updates when topics complete
- [ ] Completed topics show green dot + check mark
- [ ] Completion overlay appears after all 6 topics

### ✅ Data Persistence
Check in Supabase after completing a topic:

```sql
-- View your conversation
SELECT * FROM deep_probe_conversations
WHERE tenant_id = 'YOUR_TENANT_ID'
ORDER BY created_at DESC LIMIT 1;

-- View messages
SELECT role, content, topic, message_index
FROM deep_probe_messages
WHERE conversation_id = 'YOUR_CONVERSATION_ID'
ORDER BY message_index;

-- Check progress
SELECT current_topic, topics_covered, completion_percentage, total_messages
FROM deep_probe_conversations
WHERE id = 'YOUR_CONVERSATION_ID';
```

---

## 🐛 Troubleshooting

### Issue: "Tenant not found"
**Solution:** Verify tenant ID is correct and exists in database

### Issue: AI doesn't respond
**Check:**
1. Browser console for errors
2. Network tab - API calls to `/api/deep-probe/*`
3. Supabase connection (check `.env.local`)
4. Anthropic API key is valid

### Issue: Topic doesn't advance
**Reason:** AI hasn't included `[TOPIC_COMPLETE]` marker yet
**Action:** Continue conversation or click "Continue Anyway" button

### Issue: Database errors
**Check:**
1. Migration 005 was applied: `node check-db.mjs`
2. RLS policies allow access
3. Tenant ID matches authenticated user's tenant

---

## 📊 Monitoring the Conversation

### Option 1: Browser DevTools
Open Console to see:
```
[startDeepProbe] Conversation started: {conversationId}
[continueDeepProbe] Message sent
[continueDeepProbe] Topic complete: {topicId}
[continueDeepProbe] All topics complete!
```

### Option 2: Supabase Logs
Go to Supabase Dashboard → Logs → Postgres Logs
Filter by: `deep_probe_`

### Option 3: Real-time Database Viewer
```sql
-- Watch messages as they're created
SELECT * FROM deep_probe_messages
WHERE conversation_id = 'YOUR_CONVERSATION_ID'
ORDER BY message_index DESC;
```

---

## ✨ Sample Test Scenario

**Persona:** Sarah, VP of Student Activities at University of Oldbury

**Topic 1: Values**
AI: "Let's start with what matters most. When you're faced with a difficult decision, what principles guide your team?"

Sarah: "Student wellbeing always comes first. We'd rather do things slowly and carefully than rush and risk harm."

AI: "That's a powerful guiding principle. Can you share a specific moment where this value was tested?"

Sarah: "Last term during exam season, we had a major event planned. But we noticed students were overwhelmed, so we postponed it. Financially it hurt, but students' mental health mattered more."

AI: "Thank you for that concrete example. How does your team make these judgment calls? Is it instinctive or do you have a process?"

Sarah: "We have weekly check-ins with student reps. If we're hearing stress signals, we adjust. It's both data and gut feeling."

AI: [TOPIC_COMPLETE] "I now have a clear picture of how values drive your decisions. Let's shift to your core workflows..."

---

## 🎉 Success Criteria

**Minimum Test Goals:**
- [ ] Complete at least 2 full topics (12-20 message exchanges)
- [ ] Verify data is saved in database
- [ ] Confirm topic progression works
- [ ] Check UI animations and progress bar

**Full Test Goals:**
- [ ] Complete all 6 topics (~50-60 messages)
- [ ] Verify completion overlay appears
- [ ] Navigate to next phase (Structure Mapping)
- [ ] Review stored conversation in database
- [ ] Verify AI asked intelligent follow-up questions

---

## 📝 Notes Section

Use this space to record observations during testing:

**What worked well:**
-
-

**Issues encountered:**
-
-

**AI conversation quality:**
-
-

**Suggestions for improvement:**
-
-

---

**Ready to start!** 🚀
Navigate to: `http://localhost:3003/onboarding/deep-probe?tenantId=YOUR_TENANT_ID`
