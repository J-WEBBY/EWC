'use server';

// =============================================================================
// EWC AI Availability Assistant
//
// Natural language → working hours schedule.
// Uses Haiku (low-latency) to parse availability descriptions into structured
// working hours rows that can be saved directly to practitioner_working_hours.
// =============================================================================

import { getAnthropicClient, ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

export interface ParsedSchedule {
  day_of_week:      number;   // 0=Sun, 1=Mon … 6=Sat
  start_time:       string;   // 'HH:MM'
  end_time:         string;   // 'HH:MM'
  slot_duration_min: number;  // 15 | 20 | 30 | 45 | 60
  is_active:        boolean;
}

export interface AvailabilityParseResult {
  success:   boolean;
  schedule?: ParsedSchedule[];   // full 7-row array (Mon-Sun), is_active=false for days off
  message?:  string;             // friendly confirmation to show the user
  error?:    string;
}

// =============================================================================
// parseAvailabilityText
// =============================================================================

export async function parseAvailabilityText(
  text: string,
  currentSchedule?: ParsedSchedule[],  // existing schedule to merge into
): Promise<AvailabilityParseResult> {
  try {
    const client = getAnthropicClient();

    const currentJson = currentSchedule
      ? JSON.stringify(currentSchedule.map(r => ({
          day: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][r.day_of_week],
          active: r.is_active,
          start: r.start_time,
          end: r.end_time,
          slots: r.slot_duration_min,
        })))
      : 'none configured yet';

    const systemPrompt = `You are an AI assistant for Edgbaston Wellness Clinic helping staff configure their weekly working schedule.
Parse natural language availability descriptions into a structured schedule.

OUTPUT: Return ONLY valid JSON with this exact structure, no markdown, no explanation:
{
  "schedule": [
    { "day_of_week": 0, "start_time": "HH:MM", "end_time": "HH:MM", "slot_duration_min": 30, "is_active": false },
    ... (all 7 days, 0=Sun through 6=Sat)
  ],
  "message": "friendly 1-sentence confirmation of what was set"
}

RULES:
- Always output all 7 days (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)
- If a day is not mentioned and no current schedule exists, mark it is_active=false
- If the user says they don't work a day ("day off", "not working", "closed"), set is_active=false
- Default slot_duration_min=30 unless specified
- Parse times like "9am", "9:00", "9-6", "9 to 5", "nine to five", "morning" (=9:00), "afternoon" (=14:00), "evening" (=17:00)
- "morning only" means 09:00-13:00, "half day" means 09:00-13:00
- If the user says something like "keep everything else the same", merge with the current schedule
- Current schedule for context: ${currentJson}`;

    const response = await client.messages.create({
      model:      ANTHROPIC_MODELS.HAIKU,
      max_tokens: 800,
      messages:   [{ role: 'user', content: text }],
      system:     systemPrompt,
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '';

    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/, '').trim();
    const parsed  = JSON.parse(jsonStr) as { schedule: ParsedSchedule[]; message: string };

    if (!Array.isArray(parsed.schedule) || parsed.schedule.length !== 7) {
      return { success: false, error: 'Invalid schedule format returned. Please try rephrasing.' };
    }

    return {
      success:  true,
      schedule: parsed.schedule,
      message:  parsed.message ?? 'Schedule updated.',
    };
  } catch (err) {
    console.error('[availability-ai] parseAvailabilityText error:', err);
    return {
      success: false,
      error:   `Could not parse availability: ${String(err).slice(0, 120)}`,
    };
  }
}

// =============================================================================
// getAvailabilitySuggestion — Komal can call this to suggest times to callers
// =============================================================================

export async function getAvailabilitySuggestion(
  treatment: string,
  preferredDate: string,
): Promise<{ suggestion: string }> {
  // Lightweight advice — in production would call check_appointment_slots
  const suggestions = [
    `We have availability for ${treatment} throughout the week. Morning slots tend to go quickly — would Tuesday or Wednesday around 10am work for you?`,
    `For ${treatment}, we typically have good availability Monday to Friday. ${preferredDate ? `Around ${preferredDate}` : 'Next week'} looks feasible — shall I put you down provisionally?`,
    `${treatment} appointments are usually 30–60 minutes. We have openings most weekdays. What time of day works best for you?`,
  ];
  return { suggestion: suggestions[Math.floor(Math.random() * suggestions.length)] };
}
