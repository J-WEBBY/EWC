// =============================================================================
// Tool: knowledge_base_search — pgvector similarity + text fallback
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import type { AgentTool, ToolResult, AgentContext } from '@/lib/ai/types';

async function handler(
  input: Record<string, unknown>,
  ctx: AgentContext,
): Promise<ToolResult> {
  const query = String(input.query || '').trim();
  if (!query) {
    return { content: 'Missing required parameter: query', isError: true };
  }

  const limit = Math.min(Number(input.limit) || 5, 20);

  try {
    const sovereign = createSovereignClient();

    // Text-based search (always available, no embeddings required)
    // Search across document titles, chunk content, and section titles
    const { data: chunks, error } = await sovereign
      .from('knowledge_chunks')
      .select(`
        id,
        content,
        chunk_index,
        section_title,
        document_id,
        document:knowledge_documents!knowledge_chunks_document_id_fkey(title, doc_type)
      `)
      .or(`content.ilike.%${query}%,section_title.ilike.%${query}%`)
      .order('chunk_index', { ascending: true })
      .limit(limit);

    if (error) {
      return { content: `Knowledge base query failed: ${error.message}`, isError: true };
    }

    if (!chunks || chunks.length === 0) {
      // Try broader search on document titles
      const { data: docs } = await sovereign
        .from('knowledge_documents')
        .select('id, title, doc_type, summary')
        .ilike('title', `%${query}%`)
        .limit(limit);

      if (docs?.length) {
        let output = `Found ${docs.length} document(s) matching "${query}":\n\n`;
        for (const doc of docs) {
          output += `- **${doc.title}** (${doc.doc_type})\n`;
          if (doc.summary) output += `  ${doc.summary.slice(0, 200)}\n`;
          output += '\n';
        }
        return { content: output.trim(), metadata: { matchCount: docs.length, searchType: 'document_title' } };
      }

      return { content: `No knowledge base results found for "${query}".` };
    }

    // Format chunk results
    let output = `Found ${chunks.length} knowledge base result(s) for "${query}":\n\n`;

    for (const chunk of chunks) {
      const doc = chunk.document as unknown as { title: string; doc_type: string } | null;
      const docTitle = doc?.title || 'Unknown Document';
      const section = chunk.section_title ? ` > ${chunk.section_title}` : '';
      output += `### ${docTitle}${section}\n`;
      output += `${chunk.content.slice(0, 600)}\n\n`;
    }

    return {
      content: output.trim(),
      metadata: { matchCount: chunks.length, searchType: 'text' },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Knowledge base search failed: ${msg}`, isError: true };
  }
}

export const knowledgeBaseSearchTool: AgentTool = {
  name: 'knowledge_base_search',
  description:
    'Search the organisation\'s internal knowledge base for policies, procedures, documents, and reference material. Use this before web search for organisation-specific questions.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query — keywords or natural language question',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (1-20, default 5)',
      },
    },
    required: ['query'],
  },
  handler,
};
