// =============================================================================
// JWEBLY Agent System — Shared Types
// Used by agent-executor, tools, streaming routes, and chat integration
// =============================================================================

// -----------------------------------------------------------------------------
// Tool Definitions
// -----------------------------------------------------------------------------

export interface AgentTool {
  /** Unique tool name — matches Anthropic function calling name */
  name: string;
  /** Human-readable description for the AI model */
  description: string;
  /** JSON Schema for the tool's input parameters */
  input_schema: Record<string, unknown>;
  /** Executes the tool and returns a result */
  handler: (input: Record<string, unknown>, ctx: AgentContext) => Promise<ToolResult>;
}

export interface ToolResult {
  /** Text content returned to the model as tool_result */
  content: string;
  /** If true, returned as is_error to the model */
  isError?: boolean;
  /** Optional structured metadata (not sent to model, used for observability) */
  metadata?: Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Agent Context — passed to every tool handler and the executor
// -----------------------------------------------------------------------------

export interface AgentContext {
  tenantId: string;
  userId: string;
  conversationId?: string;
  /** Full system prompt for the agent */
  systemPrompt: string;
  /** Tools available in this execution */
  tools: AgentTool[];
  /** Anthropic model ID */
  model: string;
  /** Maximum ReAct iterations before forced stop (default 10) */
  maxIterations: number;
  /** Max tokens per AI response (default 4096) */
  maxTokens: number;
  /** Temperature for AI calls (default 0.3) */
  temperature: number;
  /** Callback fired after each tool execution */
  onToolCall?: (event: ToolCallEvent) => void;
  /** Callback fired for each text chunk during streaming */
  onTextDelta?: (text: string) => void;
}

// -----------------------------------------------------------------------------
// Tool Call Events — for streaming and observability
// -----------------------------------------------------------------------------

export interface ToolCallEvent {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  durationMs: number;
  iteration: number;
}

// -----------------------------------------------------------------------------
// Agent Responses
// -----------------------------------------------------------------------------

export interface AgentResponse {
  /** Final text response from the agent */
  text: string;
  /** All tool calls made during execution */
  toolCalls: ToolCallRecord[];
  /** Number of ReAct iterations completed */
  totalIterations: number;
  /** Why the loop ended */
  stopReason: 'end_turn' | 'max_iterations' | 'error';
}

export interface ToolCallRecord {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
  isError: boolean;
  durationMs: number;
}

// -----------------------------------------------------------------------------
// Streaming Events — sent via SSE to the client
// -----------------------------------------------------------------------------

export type AgentStreamEvent =
  | { type: 'tool_call'; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; name: string; output: string; durationMs: number; isError: boolean }
  | { type: 'text_delta'; content: string }
  | { type: 'done'; response: string; toolCalls: ToolCallRecord[] }
  | { type: 'error'; content: string };
