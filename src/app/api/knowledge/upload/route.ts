// =============================================================================
// POST /api/knowledge/upload
// Accepts multipart form: file (.txt, .md, .pdf), title, category_id, description, tags
// Extracts text → chunks → inserts into knowledge_documents + knowledge_chunks
//
// NOTE: Uses Supabase directly — does NOT import from knowledge-wellness.ts
// ('use server'). Importing 'use server' modules from API routes corrupts
// the server action registry and causes all page server actions to 500.
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';

// Import from lib directly — avoids the index.js debug-mode check that reads
// test/data/*.pdf at module load time (breaks under webpack/Next.js bundling)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (buf: Buffer) => Promise<{ text: string }>;

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

async function extractText(file: File): Promise<{ text: string; error?: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

  if (['txt', 'md', 'csv'].includes(ext)) {
    const text = await file.text();
    return { text };
  }

  if (ext === 'pdf') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const data = await pdfParse(buffer);
      return { text: data.text?.trim() || '' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { text: '', error: `PDF parse error: ${msg}` };
    }
  }

  return { text: '', error: `Unsupported file type: .${ext}` };
}

function chunkText(text: string, maxChars = 500): string[] {
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

export async function POST(req: NextRequest) {
  try {
    const formData   = await req.formData();
    const file       = formData.get('file') as File | null;
    const title      = String(formData.get('title') || '').trim();
    const categoryId = String(formData.get('category_id') || '').trim() || null;
    const description = String(formData.get('description') || '').trim() || undefined;
    const tagsRaw    = String(formData.get('tags') || '').trim();

    if (!file)  return NextResponse.json({ error: 'No file provided' },   { status: 400 });
    if (!title) return NextResponse.json({ error: 'Title is required' },  { status: 400 });

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max 5 MB, received ${(file.size / 1048576).toFixed(1)} MB)` },
        { status: 413 },
      );
    }

    const { text, error: extractError } = await extractText(file);
    if (extractError) return NextResponse.json({ error: extractError }, { status: 422 });
    if (!text.trim()) return NextResponse.json({ error: 'No text could be extracted. Try a different format.' }, { status: 422 });

    const tags          = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];
    const fileSizeBytes = new TextEncoder().encode(text).length;
    const db            = createSovereignClient();

    const { data: doc, error: docErr } = await db
      .from('knowledge_documents')
      .insert({
        category_id:       categoryId || null,
        file_name:         `${title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}.txt`,
        file_type:         'text/plain',
        file_size_bytes:   fileSizeBytes,
        title:             title.trim(),
        description:       description?.trim() || null,
        tags:              JSON.stringify(tags),
        processing_status: 'processing',
        chunk_count:       0,
        visibility:        'internal',
      })
      .select('id')
      .single();

    if (docErr || !doc) {
      console.error('[/api/knowledge/upload] document insert failed:', docErr?.message);
      return NextResponse.json({ error: 'Save failed' }, { status: 500 });
    }

    const docId  = doc.id as string;
    const chunks = chunkText(text, 500);

    if (chunks.length > 0) {
      const rows = chunks.map((c, i) => ({ document_id: docId, chunk_index: i, content: c, section_title: null }));
      const { error: chunkErr } = await db.from('knowledge_chunks').insert(rows);
      if (chunkErr) {
        await db.from('knowledge_documents').update({ processing_status: 'failed' }).eq('id', docId);
        return NextResponse.json({ error: 'Chunk save failed' }, { status: 500 });
      }
    }

    await db.from('knowledge_documents').update({
      processing_status: 'completed',
      chunk_count:       chunks.length,
      processed_at:      new Date().toISOString(),
    }).eq('id', docId);

    return NextResponse.json({ success: true, documentId: docId, chunkCount: chunks.length, charCount: text.length });
  } catch (err) {
    console.error('[/api/knowledge/upload]', err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
