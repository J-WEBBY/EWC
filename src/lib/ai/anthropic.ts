import Anthropic from '@anthropic-ai/sdk';

// Singleton instance
let anthropicClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set in environment variables. ' +
        'Please add it to your .env.local file.'
      );
    }

    anthropicClient = new Anthropic({
      apiKey,
    });
  }

  return anthropicClient;
}

// Model configurations
export const ANTHROPIC_MODELS = {
  OPUS: 'claude-opus-4-20250514',
  SONNET: 'claude-sonnet-4-20250514',
  HAIKU: 'claude-haiku-4-20250514',
} as const;

// Default model for Deep Probe conversations
export const DEFAULT_DEEP_PROBE_MODEL = ANTHROPIC_MODELS.SONNET;

// Streaming configuration
export const DEFAULT_MAX_TOKENS = 4096;
export const DEFAULT_TEMPERATURE = 1.0;
