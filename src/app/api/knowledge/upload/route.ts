// =============================================================================
// POST /api/knowledge/upload
// Accepts multipart form: file (.txt, .md, .pdf), title, category_id, description, tags
// Extracts text → chunks → inserts into knowledge_documents + knowledge_chunks
// =============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { createKnowledgeDocument } from '@/lib/actions/knowledge-wellness';

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

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file        = formData.get('file') as File | null;
    const title       = String(formData.get('title') || '').trim();
    const categoryId  = String(formData.get('category_id') || '').trim() || null;
    const description = String(formData.get('description') || '').trim() || undefined;
    const tagsRaw     = String(formData.get('tags') || '').trim();

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large (max 5 MB, received ${(file.size / 1048576).toFixed(1)} MB)` },
        { status: 413 }
      );
    }

    const { text, error: extractError } = await extractText(file);

    if (extractError) {
      return NextResponse.json({ error: extractError }, { status: 422 });
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: 'No text could be extracted from the file. Try a different format.' },
        { status: 422 }
      );
    }

    const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

    const result = await createKnowledgeDocument({
      title,
      content: text,
      category_id: categoryId,
      description,
      tags,
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Save failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      chunkCount: result.chunkCount,
      charCount: text.length,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[/api/knowledge/upload]', msg);
    return NextResponse.json({ error: 'Unexpected server error' }, { status: 500 });
  }
}
