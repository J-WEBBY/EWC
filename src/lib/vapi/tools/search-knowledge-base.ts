// =============================================================================
// Vapi Tool: search_knowledge_base
// Wraps the existing knowledgeBaseSearch tool for voice context.
// Returns a concise plain-text summary suitable for spoken response.
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';

export async function searchKnowledgeBase(args: {
  query: string;
  limit?: number;
}): Promise<string> {
  const query = String(args.query || '').trim();
  if (!query) return 'No search query provided.';

  const limit = Math.min(Number(args.limit) || 3, 5);

  try {
    const db = createSovereignClient();

    const { data: chunks } = await db
      .from('knowledge_chunks')
      .select(`
        content,
        section_title,
        document:knowledge_documents!knowledge_chunks_document_id_fkey(title)
      `)
      .or(`content.ilike.%${query}%,section_title.ilike.%${query}%`)
      .limit(limit);

    if (chunks && chunks.length > 0) {
      // Return concise summaries for voice — strip markdown headers
      const lines: string[] = [];
      for (const chunk of chunks) {
        const text = chunk.content
          .replace(/#{1,6}\s/g, '')
          .replace(/\*\*/g, '')
          .replace(/\*/g, '')
          .slice(0, 400);
        lines.push(text);
      }
      return lines.join('\n\n').trim();
    }

    // Fallback: document title search
    const { data: docs } = await db
      .from('knowledge_documents')
      .select('title, summary')
      .ilike('title', `%${query}%`)
      .limit(3);

    if (docs && docs.length > 0) {
      return docs
        .map(d => d.summary ? `${d.title}: ${d.summary.slice(0, 300)}` : d.title)
        .join('\n\n');
    }

    return `I don't have specific information about "${query}" in our knowledge base right now. I can get one of our team to follow up with the details — shall I take your number?`;

  } catch (err) {
    console.error('[vapi/search-kb] Error:', err);
    return 'I was not able to search our information right now. Let me take your details and have someone follow up with the full information.';
  }
}
