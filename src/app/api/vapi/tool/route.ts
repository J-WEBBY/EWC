// =============================================================================
// /api/vapi/tool
// Receives mid-call tool-call requests from Vapi (Komal).
// Routes to the correct handler in VAPI_TOOL_REGISTRY and returns a result.
//
// Vapi POST format:
//   { "message": { "type": "tool-calls", "toolCallList": [{ "id", "function": { "name", "arguments" } }] } }
//
// Response format:
//   { "results": [{ "toolCallId": string, "result": string }] }
//
// Security: validates x-vapi-secret header.
// Error policy: NEVER expose internal errors — always return graceful strings.
// Timeouts: Tier 1 = 3s, Tier 2 (ask_agent) = 8s (enforced inside handler).
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { VAPI_TOOL_REGISTRY } from '@/lib/vapi/tool-registry';

// Tier 1 read tools: 3s timeout. Write tools (multi-step DB): 6s timeout. ask_agent: 8s (self-managed).
const TIER1_TIMEOUT_MS  = 3_000;
const WRITE_TIMEOUT_MS  = 6_000;
const WRITE_TOOLS = new Set(['create_booking_request', 'capture_lead', 'log_call_concern', 'escalate_to_human']);

const GENERIC_FALLBACK = "I wasn't able to get that information right now — let me have our team follow up with you shortly.";

interface VapiToolCall {
  id: string;
  type?: string;
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

interface VapiToolMessage {
  type: string;
  toolCallList?: VapiToolCall[];
  toolWithToolCallList?: VapiToolCall[]; // some Vapi versions
}

interface VapiToolPayload {
  message: VapiToolMessage;
}

// ---------------------------------------------------------------------------
// Execute a single tool call with timeout for Tier 1 tools
// ---------------------------------------------------------------------------

async function executeWithTimeout(
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>,
  isAskAgent: boolean,
): Promise<string> {
  const handler = VAPI_TOOL_REGISTRY[toolName];
  if (!handler) {
    console.warn(`[vapi/tool] Unknown tool: ${toolName}`);
    return GENERIC_FALLBACK;
  }

  if (isAskAgent) {
    // ask_agent manages its own 8s timeout internally
    return handler(args);
  }

  const timeoutMs = WRITE_TOOLS.has(toolName) ? WRITE_TIMEOUT_MS : TIER1_TIMEOUT_MS;
  return new Promise<string>((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[vapi/tool] Timeout (${timeoutMs}ms) on ${toolName}`);
      resolve(GENERIC_FALLBACK);
    }, timeoutMs);

    handler(args)
      .then(result => { clearTimeout(timer); resolve(result); })
      .catch(err => {
        clearTimeout(timer);
        console.error(`[vapi/tool] Handler error for ${toolName}:`, err);
        resolve(GENERIC_FALLBACK);
      });
  });
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // ── Secret validation ────────────────────────────────────────────────────
    const webhookSecret = process.env.VAPI_WEBHOOK_SECRET;
    if (webhookSecret) {
      const incomingSecret = req.headers.get('x-vapi-secret');
      if (incomingSecret !== webhookSecret) {
        console.warn('[vapi/tool] Invalid secret');
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await req.json() as VapiToolPayload;
    const { message } = body;

    // Accept both message types Vapi may send
    if (message.type !== 'tool-calls' && message.type !== 'tool-call') {
      // Not a tool call — return empty results gracefully
      return NextResponse.json({ results: [] });
    }

    const toolCalls: VapiToolCall[] = (
      message.toolCallList ?? message.toolWithToolCallList ?? []
    );

    if (toolCalls.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // ── Execute tool calls (parallel for Tier 1, sequential for ask_agent) ──
    const results = await Promise.all(
      toolCalls.map(async (tc) => {
        const toolName = tc.function?.name ?? '';
        const isAskAgent = toolName === 'ask_agent';

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function?.arguments ?? '{}');
        } catch {
          console.warn(`[vapi/tool] Failed to parse arguments for ${toolName}`);
        }

        console.log(`[vapi/tool] Executing: ${toolName}`, isAskAgent ? `(agent: ${args.agent})` : '');
        const start = Date.now();

        const result = await executeWithTimeout(toolName, args, isAskAgent);

        console.log(`[vapi/tool] ${toolName} completed in ${Date.now() - start}ms`);

        return {
          toolCallId: tc.id,
          result,
        };
      })
    );

    return NextResponse.json({ results });

  } catch (err) {
    console.error('[vapi/tool] Fatal error:', err);
    // Return a graceful fallback result for any outstanding tool calls
    return NextResponse.json({
      results: [{
        toolCallId: 'error',
        result: GENERIC_FALLBACK,
      }],
    });
  }
}
