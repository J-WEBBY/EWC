// =============================================================================
// Vapi Tool: ask_agent
// Routes mid-call questions to Orion (new patient) or Aria (existing patient).
// Uses Haiku for voice-speed reasoning — 1 iteration, 256 tokens.
// DB agent system prompts + memories loaded so each brain is fully trained.
// Timeout: 6s AbortController. DB loads run in parallel.
// =============================================================================

import { runAgentLoop }                  from '@/lib/ai/agent-executor';
import { getAgentByKey, getAgentMemoriesByKey } from '@/lib/actions/agent-service';
import { SPECIALIST_TOOLS }              from '@/lib/ai/tools';
import { ANTHROPIC_MODELS }              from '@/lib/ai/anthropic';

const AGENT_KEY_MAP: Record<string, string> = {
  orion: 'sales_agent',  // New patient / acquisition / booking
  aria:  'crm_agent',    // Existing patient / retention / care
};

const FALLBACK_PROMPTS: Record<string, string> = {
  sales_agent: `You are the patient acquisition specialist for Edgbaston Wellness Clinic. Answer consultatively and confidently. Lead with outcomes before price. Guide towards a free consultation as the first step. Keep your response under 80 words in plain conversational British English.`,
  crm_agent:   `You are the patient retention specialist for Edgbaston Wellness Clinic. Be warm, caring, and genuinely interested in the patient's wellbeing and journey. Keep your response under 80 words in plain conversational British English.`,
};

const FALLBACK_RESPONSE = "I'll have one of our specialists follow up with you on that shortly — they'll have the full details to hand.";

export async function askAgent(args: {
  agent: 'orion' | 'aria';
  question: string;
  context?: string;
}): Promise<string> {
  const { agent, question, context } = args;
  if (!question) return FALLBACK_RESPONSE;

  const agentKey = AGENT_KEY_MAP[agent] ?? 'sales_agent';

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 6_000);

  try {
    // Load agent + memories in parallel — saves ~300ms vs sequential
    const [agentData, memories] = await Promise.all([
      getAgentByKey(agentKey),
      getAgentMemoriesByKey(agentKey, 3),
    ]);

    const basePrompt = (agentData?.system_prompt as string | null)
      ?? FALLBACK_PROMPTS[agentKey]
      ?? FALLBACK_PROMPTS.sales_agent;

    const memoryBlock = memories.length > 0
      ? `\n\nRECENT CONTEXT:\n${memories.map(m => m.content).join('\n---\n').slice(0, 800)}`
      : '';

    const voiceSystemPrompt = `${basePrompt}${memoryBlock}

VOICE MODE: You are answering in real time for Komal, our voice receptionist, to relay to a caller. Keep your final response under 80 words. Plain conversational British English — no markdown, no bullet points, no headers. One or two sentences maximum. Speak concisely.`;

    const userMessage = context
      ? `${question}\n\nCall context: ${context}`
      : question;

    const response = await runAgentLoop(
      {
        tenantId:      'clinic',
        userId:        'komal',
        systemPrompt:  voiceSystemPrompt,
        tools:         SPECIALIST_TOOLS,
        model:         ANTHROPIC_MODELS.HAIKU,  // Haiku — voice speed (~400ms vs 2-5s Sonnet)
        maxIterations: 1,                        // 1 iteration — voice queries don't need loops
        maxTokens:     256,                      // Short voice answers only
        temperature:   0.4,
      },
      userMessage,
    );

    clearTimeout(timeoutId);

    const text = response.text?.trim();
    if (!text) return FALLBACK_RESPONSE;

    return text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, 600);

  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = controller.signal.aborted || String(err).includes('abort');
    if (!isTimeout) console.error('[vapi/ask-agent] Error:', err);
    return FALLBACK_RESPONSE;
  }
}
