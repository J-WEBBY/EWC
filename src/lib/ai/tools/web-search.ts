// =============================================================================
// Tool: web_search — Tavily API (raw fetch, no SDK)
// =============================================================================

import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

const TAVILY_URL = 'https://api.tavily.com/search';

async function handler(
  input: Record<string, unknown>,
  _ctx: AgentContext,
): Promise<ToolResult> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return { content: 'Web search is not configured (TAVILY_API_KEY missing).', isError: true };
  }

  const query = String(input.query || '').trim();
  if (!query) {
    return { content: 'Missing required parameter: query', isError: true };
  }

  const maxResults = Math.min(Number(input.max_results) || 5, 10);
  const searchDepth = input.search_depth === 'basic' ? 'basic' : 'advanced';
  const includeAnswer = input.include_answer !== false;

  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: searchDepth,
        include_answer: includeAnswer,
        include_raw_content: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => 'Unknown error');
      return { content: `Tavily API error (${res.status}): ${errText}`, isError: true };
    }

    const data = await res.json();

    // Format results for the model
    let output = '';

    if (data.answer) {
      output += `**Summary:** ${data.answer}\n\n`;
    }

    if (data.results?.length) {
      output += '**Sources:**\n';
      for (const r of data.results) {
        output += `- [${r.title}](${r.url})\n  ${r.content?.slice(0, 300) || 'No snippet'}\n\n`;
      }
    } else {
      output += 'No results found for this query.';
    }

    return {
      content: output.trim(),
      metadata: {
        resultCount: data.results?.length || 0,
        query,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Web search failed: ${msg}`, isError: true };
  }
}

export const webSearchTool: AgentTool = {
  name: 'web_search',
  description:
    'Search the web for current information, news, trends, or any external data. Use this when you need up-to-date information that is not in the knowledge base.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query',
      },
      max_results: {
        type: 'number',
        description: 'Maximum number of results to return (1-10, default 5)',
      },
      search_depth: {
        type: 'string',
        enum: ['basic', 'advanced'],
        description: 'Search depth — "advanced" for more thorough results',
      },
      include_answer: {
        type: 'boolean',
        description: 'Whether to include an AI-generated answer summary (default true)',
      },
    },
    required: ['query'],
  },
  handler,
};
