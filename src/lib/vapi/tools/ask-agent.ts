// =============================================================================
// Vapi Tool: ask_agent
// Routes a question to EWC, Orion, or Aria mid-call.
// Single Haiku call — optimised for voice latency (~300ms vs 2–8s ReAct loop).
// =============================================================================

import { getAnthropicClient } from '@/lib/ai/anthropic';
import { getAgentByKey, getAgentMemoriesByKey } from '@/lib/actions/agent-service';

const VOICE_MODEL = 'claude-haiku-4-5-20251001';

const AGENT_KEY_MAP: Record<string, string> = {
  ewc:   'primary_agent',
  orion: 'sales_agent',
  aria:  'crm_agent',
};

const FALLBACK_PROMPTS: Record<string, string> = {
  primary_agent: `You are EWC, the operational intelligence for Edgbaston Wellness Clinic. Answer the question clearly and concisely for a voice receptionist to relay to a caller. Keep your response under 80 words in plain conversational British English.`,
  sales_agent:   `You are Orion, the patient acquisition specialist for Edgbaston Wellness Clinic. Answer the question clearly for a voice receptionist to relay to a caller. Be consultative and confident. Guide towards a free consultation. Keep your response under 80 words in plain conversational British English.`,
  crm_agent:     `You are Aria, the patient retention specialist for Edgbaston Wellness Clinic. Answer the question clearly for a voice receptionist to relay to a caller. Be warm and caring. Keep your response under 80 words in plain conversational British English.`,
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

  try {
    // Load agent + memories in parallel to minimise DB round trips
    const [agentData, memories] = await Promise.all([
      getAgentByKey(agentKey),
      getAgentMemoriesByKey(agentKey, 3),
    ]);

    const basePrompt = (agentData?.system_prompt as string | null) ?? FALLBACK_PROMPTS[agentKey] ?? FALLBACK_PROMPTS.primary_agent;

    const memoryBlock = memories.length > 0
      ? `\n\nRECENT CONTEXT:\n${memories.map(m => m.content).join('\n---\n').slice(0, 600)}`
      : '';

    const systemPrompt = `${basePrompt}${memoryBlock}

IMPORTANT: You are answering in real time for Komal, our voice receptionist, to relay to a caller. Keep your response under 80 words. Plain conversational British English — no markdown, no bullet points, no headers.`;

    const userMessage = context
      ? `${question}\n\nCall context: ${context}`
      : question;

    const client = getAnthropicClient();
    const response = await client.messages.create({
      model:       VOICE_MODEL,
      max_tokens:  300,
      temperature: 0.4,
      system:      systemPrompt,
      messages:    [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0]?.type === 'text'
      ? response.content[0].text.trim()
      : '';

    if (!text) return FALLBACK_RESPONSE;

    // Strip any markdown that slipped through
    return text
      .replace(/#{1,6}\s/g, '')
      .replace(/\*\*/g, '')
      .replace(/\*/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .slice(0, 500);

  } catch (err) {
    console.error('[vapi/ask-agent] Error:', err);
    return FALLBACK_RESPONSE;
  }
}
