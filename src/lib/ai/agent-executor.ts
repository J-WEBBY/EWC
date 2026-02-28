// =============================================================================
// JWEBLY Agent Executor — Core ReAct Loop
// Uses Anthropic native tool use (function calling) for agentic interactions
// =============================================================================

import { getAnthropicClient } from '@/lib/ai/anthropic';
import type {
  AgentContext,
  AgentResponse,
  AgentStreamEvent,
  ToolCallRecord,
  ToolResult,
} from '@/lib/ai/types';
import type Anthropic from '@anthropic-ai/sdk';

type MessageParam = Anthropic.MessageParam;
type ContentBlockParam = Anthropic.ContentBlockParam;
type ToolUseBlock = Anthropic.ToolUseBlock;
type ToolResultBlockParam = Anthropic.ToolResultBlockParam;

const TOOL_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2_000;

// -----------------------------------------------------------------------------
// Utility — retry with exponential backoff for transient API errors (529, 529)
// -----------------------------------------------------------------------------

function isRetryableError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status;
    return status === 529 || status === 503 || status === 500;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('529') || msg.includes('overloaded') || msg.includes('503');
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label = 'API call'): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < MAX_RETRIES && isRetryableError(err)) {
        const delay = RETRY_BASE_MS * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(`[agent-executor] ${label} attempt ${attempt + 1} failed (retryable), retrying in ${Math.round(delay)}ms...`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`${label} failed after ${MAX_RETRIES + 1} attempts`);
}

// -----------------------------------------------------------------------------
// runAgentLoop — Async, returns full AgentResponse
// -----------------------------------------------------------------------------

export async function runAgentLoop(
  ctx: AgentContext,
  userMessage: string,
  history: MessageParam[] = [],
): Promise<AgentResponse> {
  const client = getAnthropicClient();
  const toolDefs = ctx.tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool['input_schema'],
  }));

  const messages: MessageParam[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  const allToolCalls: ToolCallRecord[] = [];
  let iterations = 0;

  while (iterations < ctx.maxIterations) {
    iterations++;

    const response = await withRetry(
      () => client.messages.create({
        model: ctx.model,
        max_tokens: ctx.maxTokens,
        temperature: ctx.temperature,
        system: ctx.systemPrompt,
        tools: toolDefs,
        messages,
      }),
      `messages.create (iteration ${iterations})`,
    );

    // Check if the response contains tool use blocks
    const toolUseBlocks = response.content.filter(
      (b): b is ToolUseBlock => b.type === 'tool_use',
    );

    // If no tool use — extract final text and return
    if (response.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('');

      return {
        text: text || 'I was unable to generate a response.',
        toolCalls: allToolCalls,
        totalIterations: iterations,
        stopReason: 'end_turn',
      };
    }

    // Append the assistant's full response (including tool_use blocks)
    messages.push({ role: 'assistant', content: response.content as ContentBlockParam[] });

    // Execute each tool call
    const toolResults: ToolResultBlockParam[] = [];

    for (const block of toolUseBlocks) {
      const tool = ctx.tools.find(t => t.name === block.name);
      const input = (block.input || {}) as Record<string, unknown>;
      const start = Date.now();

      let result: ToolResult;

      if (!tool) {
        result = { content: `Unknown tool: ${block.name}`, isError: true };
      } else {
        try {
          result = await executeWithTimeout(
            tool.handler(input, ctx),
            TOOL_TIMEOUT_MS,
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result = { content: `Tool error: ${msg}`, isError: true };
        }
      }

      const durationMs = Date.now() - start;

      const record: ToolCallRecord = {
        toolName: block.name,
        input,
        output: result.content,
        isError: result.isError || false,
        durationMs,
      };
      allToolCalls.push(record);

      // Fire observability callback
      ctx.onToolCall?.({
        toolName: block.name,
        input,
        output: result.content,
        isError: result.isError || false,
        durationMs,
        iteration: iterations,
      });

      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result.content,
        is_error: result.isError || false,
      });
    }

    // Append tool results as a user message
    messages.push({ role: 'user', content: toolResults });
  }

  // Hit max iterations — extract whatever text we have
  return {
    text: 'I reached the maximum number of reasoning steps. Here is what I found so far based on the tools I used.',
    toolCalls: allToolCalls,
    totalIterations: iterations,
    stopReason: 'max_iterations',
  };
}

// -----------------------------------------------------------------------------
// runAgentLoopStreaming — AsyncGenerator yielding AgentStreamEvents
// -----------------------------------------------------------------------------

export async function* runAgentLoopStreaming(
  ctx: AgentContext,
  userMessage: string,
  history: MessageParam[] = [],
): AsyncGenerator<AgentStreamEvent> {
  const client = getAnthropicClient();
  const toolDefs = ctx.tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool['input_schema'],
  }));

  const messages: MessageParam[] = [
    ...history,
    { role: 'user', content: userMessage },
  ];

  const allToolCalls: ToolCallRecord[] = [];
  let iterations = 0;
  let finalText = '';

  try {
    while (iterations < ctx.maxIterations) {
      iterations++;

      // Emit a "thinking" indicator at the start of each iteration
      // so the user sees immediate feedback while the model processes
      if (iterations === 1) {
        yield { type: 'tool_call', name: 'thinking', input: {} };
      }

      // Use streaming for the AI call (with retry for transient errors)
      const stream = await withRetry(
        async () => client.messages.stream({
          model: ctx.model,
          max_tokens: ctx.maxTokens,
          temperature: ctx.temperature,
          system: ctx.systemPrompt,
          tools: toolDefs,
          messages,
        }),
        `messages.stream (iteration ${iterations})`,
      );

      let currentText = '';
      let clearedThinking = false;
      const contentBlocks: (Anthropic.TextBlock | ToolUseBlock)[] = [];

      // Collect streaming events
      for await (const event of stream) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'text') {
            contentBlocks.push({ ...event.content_block, text: '' });
          } else if (event.content_block.type === 'tool_use') {
            contentBlocks.push({ ...event.content_block, input: {} });
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            // Clear the "thinking" indicator when text starts arriving
            if (!clearedThinking && iterations === 1) {
              clearedThinking = true;
              yield { type: 'tool_result', name: 'thinking', output: 'done', durationMs: 0, isError: false };
            }
            currentText += event.delta.text;
            yield { type: 'text_delta', content: event.delta.text };
            // Update the last text block
            const lastBlock = contentBlocks[contentBlocks.length - 1];
            if (lastBlock && lastBlock.type === 'text') {
              lastBlock.text += event.delta.text;
            }
          } else if (event.delta.type === 'input_json_delta') {
            // Tool input arrives as JSON deltas — accumulate on the block
            const lastBlock = contentBlocks[contentBlocks.length - 1];
            if (lastBlock && lastBlock.type === 'tool_use') {
              // input_json_delta gives partial JSON string
              (lastBlock as unknown as Record<string, string>)._rawInput =
                ((lastBlock as unknown as Record<string, string>)._rawInput || '') +
                event.delta.partial_json;
            }
          }
        }
      }

      // Get the final message to parse tool use blocks properly
      const finalMessage = await stream.finalMessage();
      const toolUseBlocks = finalMessage.content.filter(
        (b): b is ToolUseBlock => b.type === 'tool_use',
      );

      // No tool use — done
      if (finalMessage.stop_reason !== 'tool_use' || toolUseBlocks.length === 0) {
        finalText = finalMessage.content
          .filter((b): b is Anthropic.TextBlock => b.type === 'text')
          .map(b => b.text)
          .join('');

        yield {
          type: 'done',
          response: finalText || currentText,
          toolCalls: allToolCalls,
        };
        return;
      }

      // Append assistant response
      messages.push({
        role: 'assistant',
        content: finalMessage.content as ContentBlockParam[],
      });

      // Execute tool calls
      const toolResults: ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const tool = ctx.tools.find(t => t.name === block.name);
        const input = (block.input || {}) as Record<string, unknown>;

        // Clear thinking indicator if not already cleared
        if (!clearedThinking && iterations === 1) {
          clearedThinking = true;
          yield { type: 'tool_result', name: 'thinking', output: 'done', durationMs: 0, isError: false };
        }

        yield { type: 'tool_call', name: block.name, input };

        const start = Date.now();
        let result: ToolResult;

        if (!tool) {
          result = { content: `Unknown tool: ${block.name}`, isError: true };
        } else {
          try {
            result = await executeWithTimeout(
              tool.handler(input, ctx),
              TOOL_TIMEOUT_MS,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result = { content: `Tool error: ${msg}`, isError: true };
          }
        }

        const durationMs = Date.now() - start;

        const record: ToolCallRecord = {
          toolName: block.name,
          input,
          output: result.content,
          isError: result.isError || false,
          durationMs,
        };
        allToolCalls.push(record);

        ctx.onToolCall?.({
          toolName: block.name,
          input,
          output: result.content,
          isError: result.isError || false,
          durationMs,
          iteration: iterations,
        });

        yield {
          type: 'tool_result',
          name: block.name,
          output: result.content.slice(0, 500),
          durationMs,
          isError: result.isError || false,
        };

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: result.content,
          is_error: result.isError || false,
        });
      }

      messages.push({ role: 'user', content: toolResults });
    }

    // Max iterations
    yield {
      type: 'done',
      response: 'I reached the maximum number of reasoning steps.',
      toolCalls: allToolCalls,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    yield { type: 'error', content: msg };
  }
}

// -----------------------------------------------------------------------------
// Utility — execute a promise with timeout
// -----------------------------------------------------------------------------

function executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tool execution timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise
      .then(val => { clearTimeout(timer); resolve(val); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}
