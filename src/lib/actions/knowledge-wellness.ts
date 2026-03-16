'use server';

import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// TYPES
// =============================================================================

export interface KnowledgeCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_category_id: string | null;
  display_order: number;
  created_at: string;
}

export interface KnowledgeDocument {
  id: string;
  category_id: string | null;
  uploaded_by_user_id: string | null;
  file_name: string;
  file_type: string | null;
  file_size_bytes: number | null;
  title: string;
  description: string | null;
  tags: string[];
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  processed_at: string | null;
  chunk_count: number;
  visibility: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  category?: { name: string; slug: string } | null;
}

export interface KnowledgeStats {
  total_documents: number;
  total_categories: number;
  total_chunks: number;
  completed_documents: number;
  pending_documents: number;
  last_uploaded_at: string | null;
}

// =============================================================================
// getKnowledgeData — load everything the KB page needs
// =============================================================================

export async function getKnowledgeData(): Promise<{
  success: boolean;
  categories?: KnowledgeCategory[];
  documents?: KnowledgeDocument[];
  stats?: KnowledgeStats;
  error?: string;
}> {
  try {
    const sovereign = createSovereignClient();

    const [catRes, docRes] = await Promise.all([
      sovereign
        .from('knowledge_categories')
        .select('*')
        .order('display_order', { ascending: true }),
      sovereign
        .from('knowledge_documents')
        .select('*, category:knowledge_categories(name, slug)')
        .order('created_at', { ascending: false }),
    ]);

    const categories = (catRes.data || []) as KnowledgeCategory[];
    const rawDocs = (docRes.data || []) as Array<KnowledgeDocument & { tags: unknown }>;

    // Normalise tags — new schema stores them as JSONB array
    const documents: KnowledgeDocument[] = rawDocs.map(d => ({
      ...d,
      tags: Array.isArray(d.tags) ? (d.tags as string[]) : [],
    }));

    // Derive chunk total from chunk_count column (avoids a heavy query)
    const totalChunks = documents.reduce((sum, d) => sum + (d.chunk_count || 0), 0);
    const completed   = documents.filter(d => d.processing_status === 'completed').length;
    const pending     = documents.filter(d => d.processing_status === 'pending' || d.processing_status === 'processing').length;
    const lastDoc     = documents[0];

    return {
      success: true,
      categories,
      documents,
      stats: {
        total_documents:    documents.length,
        total_categories:   categories.length,
        total_chunks:       totalChunks,
        completed_documents: completed,
        pending_documents:  pending,
        last_uploaded_at:   lastDoc?.created_at || null,
      },
    };
  } catch (err) {
    console.error('[knowledge-wellness] getKnowledgeData threw:', err);
    return { success: false, error: 'FETCH_FAILED' };
  }
}

// =============================================================================
// deleteKnowledgeDocument
// =============================================================================

export async function deleteKnowledgeDocument(
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  if (!documentId) return { success: false, error: 'INVALID_ID' };

  try {
    const sovereign = createSovereignClient();
    const { error } = await sovereign
      .from('knowledge_documents')
      .delete()
      .eq('id', documentId);

    if (error) {
      console.error('[knowledge-wellness] delete failed:', error.message);
      return { success: false, error: 'DELETE_FAILED' };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'DELETE_FAILED' };
  }
}

// =============================================================================
// createKnowledgeDocument — ingest plain text as document + chunks
// =============================================================================

function chunkText(text: string, maxChars = 500): string[] {
  // Split on double newlines (paragraphs), then group into ~maxChars chunks
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Fallback: if text had no double newlines, split by sentences at maxChars
  if (chunks.length === 0 && text.trim()) {
    const words = text.trim().split(' ');
    let block = '';
    for (const word of words) {
      if (block.length + word.length + 1 > maxChars && block) {
        chunks.push(block.trim());
        block = word;
      } else {
        block = block ? `${block} ${word}` : word;
      }
    }
    if (block.trim()) chunks.push(block.trim());
  }

  return chunks.length > 0 ? chunks : [text.trim()];
}

export async function createKnowledgeDocument(params: {
  title: string;
  content: string;
  category_id: string | null;
  description?: string;
  tags?: string[];
}): Promise<{ success: boolean; documentId?: string; chunkCount?: number; error?: string }> {
  const { title, content, category_id, description, tags = [] } = params;

  if (!title?.trim()) return { success: false, error: 'MISSING_TITLE' };
  if (!content?.trim()) return { success: false, error: 'MISSING_CONTENT' };

  try {
    const sovereign = createSovereignClient();
    const fileSizeBytes = new TextEncoder().encode(content).length;

    // Insert document with pending status
    const { data: doc, error: docErr } = await sovereign
      .from('knowledge_documents')
      .insert({
        category_id: category_id || null,
        file_name: `${title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.txt`,
        file_type: 'text/plain',
        file_size_bytes: fileSizeBytes,
        title: title.trim(),
        description: description?.trim() || null,
        tags: JSON.stringify(tags),
        processing_status: 'processing',
        chunk_count: 0,
        visibility: 'internal',
      })
      .select('id')
      .single();

    if (docErr || !doc) {
      console.error('[knowledge-wellness] createKnowledgeDocument insert failed:', docErr?.message);
      return { success: false, error: 'INSERT_FAILED' };
    }

    const docId = doc.id as string;

    // Split content into chunks
    const chunks = chunkText(content, 500);

    if (chunks.length > 0) {
      const chunkRows = chunks.map((text, i) => ({
        document_id: docId,
        chunk_index: i,
        content: text,
        section_title: null,
      }));

      const { error: chunkErr } = await sovereign.from('knowledge_chunks').insert(chunkRows);
      if (chunkErr) {
        console.error('[knowledge-wellness] chunk insert failed:', chunkErr.message);
        // Mark document as failed
        await sovereign
          .from('knowledge_documents')
          .update({ processing_status: 'failed' })
          .eq('id', docId);
        return { success: false, error: 'CHUNK_INSERT_FAILED' };
      }
    }

    // Update document with final chunk count and completed status
    await sovereign
      .from('knowledge_documents')
      .update({
        processing_status: 'completed',
        chunk_count: chunks.length,
        processed_at: new Date().toISOString(),
      })
      .eq('id', docId);

    return { success: true, documentId: docId, chunkCount: chunks.length };
  } catch (err) {
    console.error('[knowledge-wellness] createKnowledgeDocument threw:', err);
    return { success: false, error: 'UNEXPECTED_ERROR' };
  }
}

// =============================================================================
// getKnowledgeCategories
// =============================================================================

export async function getKnowledgeCategories(): Promise<{
  success: boolean;
  categories?: KnowledgeCategory[];
  error?: string;
}> {
  try {
    const sovereign = createSovereignClient();
    const { data, error } = await sovereign
      .from('knowledge_categories')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) return { success: false, error: 'FETCH_FAILED' };
    return { success: true, categories: (data || []) as KnowledgeCategory[] };
  } catch {
    return { success: false, error: 'FETCH_FAILED' };
  }
}

// =============================================================================
// processDocumentUpload — chunk + store an uploaded document
// =============================================================================

function chunkByWords(text: string, wordsPerChunk = 400, overlapWords = 50): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < words.length) {
    const end = Math.min(start + wordsPerChunk, words.length);
    chunks.push(words.slice(start, end).join(' '));
    if (end >= words.length) break;
    start = end - overlapWords;
  }

  return chunks;
}

export async function processDocumentUpload(data: {
  title: string;
  content: string;
  category_id?: string | null;
  file_name: string;
  file_type: string;
  file_size_bytes?: number;
  tags?: string[];
  description?: string;
  uploaded_by_user_id?: string | null;
  tenant_id: string;
}): Promise<{ success: boolean; document_id?: string; chunk_count?: number; error?: string }> {
  const {
    title, content, category_id, file_name, file_type,
    file_size_bytes, tags = [], description, uploaded_by_user_id, tenant_id,
  } = data;

  if (!title?.trim()) return { success: false, error: 'MISSING_TITLE' };
  if (!content?.trim()) return { success: false, error: 'MISSING_CONTENT' };
  if (!tenant_id) return { success: false, error: 'MISSING_TENANT_ID' };

  const sovereign = createSovereignClient();

  // 1. Insert document with processing status
  const { data: doc, error: docErr } = await sovereign
    .from('knowledge_documents')
    .insert({
      tenant_id,
      category_id: category_id || null,
      uploaded_by_user_id: uploaded_by_user_id || null,
      file_name: file_name || `${title.toLowerCase().replace(/\s+/g, '-')}.txt`,
      file_type: file_type || 'text/plain',
      file_size_bytes: file_size_bytes || new TextEncoder().encode(content).length,
      title: title.trim(),
      description: description?.trim() || null,
      tags: JSON.stringify(tags),
      processing_status: 'processing',
      chunk_count: 0,
      visibility: 'internal',
    })
    .select('id')
    .single();

  if (docErr || !doc) {
    console.error('[knowledge-wellness] processDocumentUpload insert failed:', docErr?.message);
    return { success: false, error: 'INSERT_FAILED' };
  }

  const document_id = doc.id as string;

  try {
    // 2. Split into ~400-word chunks with 50-word overlap
    const chunks = chunkByWords(content, 400, 50);

    if (chunks.length > 0) {
      const chunkRows = chunks.map((text, i) => ({
        tenant_id,
        document_id,
        chunk_index: i,
        content: text,
        section_title: null,
        page_number: null,
      }));

      const { error: chunkErr } = await sovereign.from('knowledge_chunks').insert(chunkRows);
      if (chunkErr) {
        console.error('[knowledge-wellness] chunk insert failed:', chunkErr.message);
        await sovereign
          .from('knowledge_documents')
          .update({ processing_status: 'failed' })
          .eq('id', document_id);
        return { success: false, error: 'CHUNK_INSERT_FAILED' };
      }
    }

    // 3. Mark completed
    await sovereign
      .from('knowledge_documents')
      .update({
        processing_status: 'completed',
        chunk_count: chunks.length,
        processed_at: new Date().toISOString(),
      })
      .eq('id', document_id);

    return { success: true, document_id, chunk_count: chunks.length };
  } catch (err) {
    console.error('[knowledge-wellness] processDocumentUpload threw:', err);
    await sovereign
      .from('knowledge_documents')
      .update({ processing_status: 'failed' })
      .eq('id', document_id);
    return { success: false, error: 'UNEXPECTED_ERROR' };
  }
}

// =============================================================================
// searchKnowledgeChunks — simple ilike search with doc join
// =============================================================================

export async function searchKnowledgeChunks(
  tenant_id: string,
  query: string,
  limit = 5,
): Promise<{ chunk_id: string; document_id: string; content: string; document_title: string; category_name: string | null }[]> {
  if (!query?.trim()) return [];

  try {
    const sovereign = createSovereignClient();

    const { data, error } = await sovereign
      .from('knowledge_chunks')
      .select(`
        id,
        document_id,
        content,
        knowledge_documents!inner(title, knowledge_categories(name))
      `)
      .eq('tenant_id', tenant_id)
      .ilike('content', `%${query.trim()}%`)
      .limit(limit);

    if (error) {
      console.error('[knowledge-wellness] searchKnowledgeChunks failed:', error.message);
      return [];
    }

    return (data || []).map((row: Record<string, unknown>) => {
      const docRow = row.knowledge_documents as Record<string, unknown> | null;
      const catRow = docRow?.knowledge_categories as Record<string, unknown> | null;
      return {
        chunk_id: row.id as string,
        document_id: row.document_id as string,
        content: row.content as string,
        document_title: (docRow?.title as string) ?? 'Unknown',
        category_name: (catRow?.name as string) ?? null,
      };
    });
  } catch (err) {
    console.error('[knowledge-wellness] searchKnowledgeChunks threw:', err);
    return [];
  }
}
