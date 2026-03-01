// =============================================================================
// Vapi Tool: ask_agent
// Routes a question to EWC, Orion, or Aria mid-call via a full ReAct loop.
// Returns plain text for Komal to speak naturally.
// Timeout: 8 seconds. Fallback: graceful phrase.
// Model: SONNET for reasoning quality.
// =============================================================================

import { runAgentLoop } from '@/lib/ai/agent-executor';
import { getAgentByKey, getAgentMemoriesByKey } from '@/lib/actions/agent-service';
import { SPECIALIST_TOOLS } from '@/lib/ai/tools';
import { ANTHROPIC_MODELS } from '@/lib/ai/anthropic';

const AGENT_KEY_MAP: Record<string, string> = {
  ewc:   'primary_agent',
  orion: 'sales_agent',
  aria:  'crm_agent',
};

const FALLBACK_PROMPTS: Record<string, string> = {
  primary_agent: `You are EWC, the operational intelligence for Edgbaston Wellness Clinic. Answer the question clearly and concisely for a voice receptionist to relay to a caller. Keep your response under 100 words and in plain conversational British English.`,
  sales_agent:   `You are Orion, the patient acquisition specialist for Edgbaston Wellness Clinic. Answer the question clearly for a voice receptionist to relay to a caller. Be consultative, confident, and guide towards a free consultation booking. Keep your response under 100 words in plain conversational British English.`,
  crm_agent:     `You are Aria, the patient retention specialist for Edgbaston Wellness Clinic. Answer the question clearly for a voice receptionist to relay to a caller. Be warm, caring, and focused on the patient's wellbeing and relationship with the clinic. Keep your response under 100 words in plain conversational British English.`,
};

const FALLBACK_RESPONSE = "I'll have one of our specialists follow up with you on that shortly — they'll have the full details to hand.";

export async function askAgent(args: {
  agent: 'ewc' | 'orion' | 'aria';
  question: string;
  context?: string;
}): Promise<string> {
  const { agent, question, context } = args;
  if (!question) return FALLBACK_RESPONSE;

  const agentKey = AGENT_KEY_MAP[agent] ?? 'primary_agent';

  // Wrap in AbortController for 8-second voice timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);

  try {
    // Load agent system prompt from DB
    const agentData = await getAgentByKey(agentKey);
    const systemPrompt = (agentData?.system_prompt as string | null) ?? FALLBACK_PROMPTS[agentKey] ?? FALLBACK_PROMPTS.primary_agent;

    // Load top 3 memories for context
    const memories = await getAgentMemoriesByKey(agentKey, 3);
    const memoryBlock = memories.length > 0
      ? `\n\nRECENT CONTEXT:\n${memories.map(m => m.content).join('\n---\n').slice(0, 800)}`
      : '';

    // Build voice-aware system prompt
    const voiceSystemPrompt = `${systemPrompt}${memoryBlock}

IMPORTANT: You are answering a question for Komal, our voice receptionist, to relay to a caller in real time. Keep your response under 100 words. Use plain conversational British English — no markdown, no bullet points, no headers. Speak directly as if you are informing the receptionist what to say.`;

    const userMessage = context
      ? `${question}\n\nCall context: ${context}`
      : question;

    const response = await runAgentLoop(
      {
        tenantId:      'clinic',
        userId:        'komal',
        systemPrompt:  voiceSystemPrompt,
        tools:         SPECIALIST_TOOLS,
        model:         ANTHROPIC_MODELS.SONNET,
        maxIterations: 3,
        maxTokens:     400,
        temperature:   0.4,
      },
      userMessage,
    );

    clearTimeout(timeoutId);

    const text = response.text?.trim();
    if (!text) return FALLBACK_RESPONSE;

    // Sanitise for voice — remove any markdown that slipped through
    return text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, 600);

  } catch (err) {
    clearTimeout(timeoutId);
    const isTimeout = controller.signal.aborted || String(err).includes('abort');
    if (!isTimeout) {
      console.error('[vapi/ask-agent] Error:', err);
    }
    return FALLBACK_RESPONSE;
  }
}
