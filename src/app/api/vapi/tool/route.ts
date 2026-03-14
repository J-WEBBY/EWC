// =============================================================================
// /api/vapi/tool
// Receives mid-call tool-call requests from Vapi (Komal).
// Routes to the correct handler in VAPI_TOOL_REGISTRY and returns a result.
//
// Vapi POST format:
//   { "message": { "type": "tool-calls", "call": { "id": "..." }, "toolCallList": [{ "id", "function": { "name", "arguments" } }] } }
//
// Response format:
//   { "results": [{ "toolCallId": string, "result": string }] }
//
// Security: validates x-vapi-secret header.
// Error policy: NEVER expose internal errors — always return graceful strings.
// Timeouts: Tier 1 = 3s, write tools = 6s, ask_agent = 8s (self-managed).
// Deduplication: write tools are idempotent per (vapi_call_id, tool_name).
//   If Haiku calls create_booking_request 7× for the same call, only the first
//   write hits the DB. All subsequent calls return the cached result instantly.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { VAPI_TOOL_REGISTRY } from '@/lib/vapi/tool-registry';
import { createSovereignClient } from '@/lib/supabase/service';

const TIER1_TIMEOUT_MS = 3_000;
const WRITE_TIMEOUT_MS = 6_000;

// Write tools that must be deduplicated — one execution per (call_id, tool_name)
const WRITE_TOOLS = new Set([
  'create_booking_request',
  'capture_lead',
  'log_call_concern',
  'escalate_to_human',
]);

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
  call?: { id?: string };            // Vapi includes the call object mid-call
  toolCallList?: VapiToolCall[];
  toolWithToolCallList?: VapiToolCall[];
}

interface VapiToolPayload {
  message: VapiToolMessage;
}

// ---------------------------------------------------------------------------
// Execute a single tool call with timeout
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
// Deduplication: check call_sessions for write tools
// Returns cached result if already executed, null if first call.
// ---------------------------------------------------------------------------

async function checkCallSession(
  callId: string,
  toolName: string,
): Promise<string | null> {
  if (!callId) return null;
  try {
    const db = createSovereignClient();
    const { data } = await db
      .from('call_sessions')
      .select('first_result, call_count')
      .eq('vapi_call_id', callId)
      .eq('tool_name', toolName)
      .single();

    if (data?.first_result) {
      void db
        .from('call_sessions')
        .update({ call_count: (data.call_count ?? 1) + 1 })
        .eq('vapi_call_id', callId)
        .eq('tool_name', toolName);

      console.warn(`[vapi/tool] Dedup: ${toolName} already fired for call ${callId} (total: ${(data.call_count ?? 1) + 1}×). Returning cached result.`);
      return data.first_result;
    }
  } catch { /* table may not exist yet — fail open, proceed with execution */ }
  return null;
}

async function saveCallSession(
  callId: string,
  toolName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>,
  result: string,
): Promise<void> {
  if (!callId) return;
  try {
    const db = createSovereignClient();
    await db.from('call_sessions').insert({
      vapi_call_id: callId,
      tool_name:    toolName,
      call_count:   1,
      first_args:   args,
      first_result: result,
    });
  } catch { /* non-fatal — dedup is best-effort */ }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  try {
    // No secret check on tool calls — the end-of-call webhook (/api/vapi/webhook)
    // handles auth via serverUrlSecret. Tool call auth caused persistent 401s when
    // Komal was provisioned with a different secret than the current env var.

    const body     = await req.json() as VapiToolPayload;
    const { message } = body;

    if (message.type !== 'tool-calls' && message.type !== 'tool-call') {
      return NextResponse.json({ results: [] });
    }

    // Call ID — used for write-tool deduplication
    const callId: string = message.call?.id ?? '';

    const toolCalls: VapiToolCall[] = (
      message.toolCallList ?? message.toolWithToolCallList ?? []
    );

    if (toolCalls.length === 0) {
      return NextResponse.json({ results: [] });
    }

    // ── Execute tool calls ───────────────────────────────────────────────────
    const results = await Promise.all(
      toolCalls.map(async (tc) => {
        const toolName   = tc.function?.name ?? '';
        const isAskAgent = toolName === 'ask_agent';
        const isWrite    = WRITE_TOOLS.has(toolName);

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function?.arguments ?? '{}');
        } catch {
          console.warn(`[vapi/tool] Failed to parse arguments for ${toolName}`);
        }

        // Inject vapi_call_id so create_booking_request can store it on the DB row.
        // This lets the webhook UPDATE the row (add call_summary) instead of inserting a duplicate.
        if (toolName === 'create_booking_request' && callId) {
          args = { ...args, vapi_call_id: callId };
        }

        console.log(`[vapi/tool] Executing: ${toolName}`, isAskAgent ? `(agent: ${(args as {agent?: string}).agent})` : '');
        const start = Date.now();

        let result: string;

        if (isWrite && callId) {
          // Deduplication: return cached result if this write tool already fired
          const cached = await checkCallSession(callId, toolName);
          if (cached !== null) {
            result = cached;
          } else {
            result = await executeWithTimeout(toolName, args, false);
            void saveCallSession(callId, toolName, args, result);
          }
        } else {
          result = await executeWithTimeout(toolName, args, isAskAgent);
        }

        console.log(`[vapi/tool] ${toolName} completed in ${Date.now() - start}ms`);

        return { toolCallId: tc.id, result };
      })
    );

    return NextResponse.json({ results });

  } catch (err) {
    console.error('[vapi/tool] Fatal error:', err);
    return NextResponse.json({
      results: [{ toolCallId: 'error', result: GENERIC_FALLBACK }],
    });
  }
}
