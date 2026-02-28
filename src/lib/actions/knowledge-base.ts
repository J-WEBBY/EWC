'use server';

import { createSovereignClient } from '@/lib/supabase/service';
import { getAnthropicClient, ANTHROPIC_MODELS, DEFAULT_MAX_TOKENS } from '@/lib/ai/anthropic';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface KnowledgeCategory {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_category_id: string | null;
  display_order: number;
}

export interface KnowledgeDocument {
  id: string;
  tenant_id: string;
  category_id: string | null;
  file_name: string;
  file_type: string | null;
  file_size_bytes: number | null;
  title: string | null;
  description: string | null;
  tags: string[];
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  processed_at: string | null;
  chunk_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  category?: { name: string; slug: string } | null;
}

export interface DocumentSuggestion {
  id: string;
  title: string;
  description: string;
  category_name: string;
  category_slug: string;
  reason: string;
  source: 'onboarding' | 'industry' | 'deep_probe';
  priority: 'critical' | 'recommended' | 'optional';
}

export interface FileAnalysis {
  summary: string;
  key_topics: string[];
  suggested_category: string;
  content_type: string;
  actionable_insights: string[];
  quality_score: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface KnowledgeBaseData {
  companyName: string;
  aiName: string;
  brandColor: string | null;
  logoUrl: string | null;
  industryName: string;
  categories: KnowledgeCategory[];
  documents: KnowledgeDocument[];
  deepProbeInsights: {
    core_principles: string | null;
    speed_vs_accuracy: string | null;
    synthesis: string | null;
  } | null;
  departmentCount: number;
  staffCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// fetchKnowledgeBaseData — Single fetch for everything the page needs
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchKnowledgeBaseData(
  tenantId: string
): Promise<{ success: boolean; data?: KnowledgeBaseData; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_SESSION' };
  }

  try {
    const sovereign = createSovereignClient();

    // 1. Fetch tenant with industry FK join
    const { data: tenant, error: tenantErr } = await sovereign
      .from('tenants')
      .select('company_name, ai_name, brand_color, logo_url, industry:industries(name), onboarding_data')
      .eq('id', tenantId)
      .single();

    if (tenantErr || !tenant) {
      console.error('[knowledge-base] tenant fetch failed:', tenantErr?.message);
      return { success: false, error: 'TENANT_NOT_FOUND' };
    }

    const industryRaw = tenant.industry as unknown;
    const industryName = (industryRaw && typeof industryRaw === 'object' && 'name' in (industryRaw as Record<string, unknown>))
      ? (industryRaw as { name: string }).name
      : 'general business';

    // 2. Fetch categories
    const { data: categories } = await sovereign
      .from('knowledge_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('display_order', { ascending: true });

    // 3. Fetch documents with category join
    const { data: documents } = await sovereign
      .from('knowledge_documents')
      .select('*, category:knowledge_categories(name, slug)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    // 4. Count departments and staff
    const { count: deptCount } = await sovereign
      .from('departments')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const { count: staffCount } = await sovereign
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    // 5. Extract deep probe insights from onboarding_data
    const od = (tenant.onboarding_data || {}) as Record<string, unknown>;
    const neuralHandshake = od.neural_handshake as Record<string, unknown> | undefined;
    const neuralProfile = neuralHandshake?.profile as Record<string, unknown> | undefined;

    let deepProbeInsights = null;
    if (neuralProfile) {
      deepProbeInsights = {
        core_principles: (neuralProfile.operationalPhilosophy as string[])?.join('; ') || null,
        speed_vs_accuracy: null,
        synthesis: (neuralProfile.summaryStatement as string) || null,
      };
    }

    return {
      success: true,
      data: {
        companyName: tenant.company_name || 'Your Organization',
        aiName: tenant.ai_name || 'Atlas',
        brandColor: tenant.brand_color || null,
        logoUrl: tenant.logo_url || null,
        industryName,
        categories: (categories || []) as KnowledgeCategory[],
        documents: (documents || []) as KnowledgeDocument[],
        deepProbeInsights,
        departmentCount: deptCount || 0,
        staffCount: staffCount || 0,
      },
    };
  } catch (err) {
    console.error('[knowledge-base] fetchKnowledgeBaseData threw:', err);
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// uploadDocument — Upload and process a text file
// ═══════════════════════════════════════════════════════════════════════════

export async function uploadDocument(
  tenantId: string,
  fileData: { name: string; type: string; size: number; content: string },
  categoryId: string | null
): Promise<{ success: boolean; document?: { id: string; file_name: string; chunk_count: number; summary: string }; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_SESSION' };
  }
  if (categoryId && !UUID_RE.test(categoryId)) {
    return { success: false, error: 'INVALID_CATEGORY' };
  }

  const sovereign = createSovereignClient();

  try {
    const extractedText = Buffer.from(fileData.content, 'base64').toString('utf-8');

    const { data: doc, error: docError } = await sovereign
      .from('knowledge_documents')
      .insert({
        tenant_id: tenantId,
        file_name: fileData.name,
        file_type: fileData.type.split('/')[1] || 'txt',
        file_size_bytes: fileData.size,
        category_id: categoryId,
        processing_status: 'processing',
        title: fileData.name.replace(/\.\w+$/, ''),
      })
      .select()
      .single();

    if (docError || !doc) {
      console.error('[knowledge-base] doc insert failed:', docError?.message);
      return { success: false, error: 'DOCUMENT_INSERT_FAILED' };
    }

    const chunks = chunkText(extractedText, 512);

    for (let i = 0; i < chunks.length; i++) {
      await sovereign.from('knowledge_chunks').insert({
        document_id: doc.id,
        tenant_id: tenantId,
        chunk_index: i,
        content: chunks[i],
      });
    }

    const summary = await generateDocumentSummary(extractedText);

    await sovereign
      .from('knowledge_documents')
      .update({
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
        chunk_count: chunks.length,
        metadata: { ai_summary: summary },
      })
      .eq('id', doc.id);

    return {
      success: true,
      document: {
        id: doc.id,
        file_name: fileData.name,
        chunk_count: chunks.length,
        summary,
      },
    };
  } catch (error: unknown) {
    console.error('[knowledge-base] Upload failed:', error);
    return { success: false, error: 'UPLOAD_FAILED' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// generateSuggestions — AI-powered document suggestions
// ═══════════════════════════════════════════════════════════════════════════

export async function generateSuggestions(
  tenantId: string
): Promise<{ success: boolean; suggestions?: DocumentSuggestion[]; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_SESSION' };
  }

  const sovereign = createSovereignClient();

  try {
    const { data: tenant } = await sovereign
      .from('tenants')
      .select('company_name, ai_name, industry:industries(name), onboarding_data')
      .eq('id', tenantId)
      .single();

    if (!tenant) return { success: false, error: 'TENANT_NOT_FOUND' };

    const industryRaw = tenant.industry as unknown;
    const industryName = (industryRaw && typeof industryRaw === 'object' && 'name' in (industryRaw as Record<string, unknown>))
      ? (industryRaw as { name: string }).name
      : 'general business';

    const { data: categories } = await sovereign
      .from('knowledge_categories')
      .select('name, slug, description')
      .eq('tenant_id', tenantId)
      .order('display_order');

    const od = (tenant.onboarding_data || {}) as Record<string, unknown>;
    const neuralHandshake = od.neural_handshake as Record<string, unknown> | undefined;
    const neuralProfile = neuralHandshake?.profile as Record<string, unknown> | undefined;
    const identity = od.identity as Record<string, unknown> | undefined;

    const { count: staffCount } = await sovereign
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const anthropic = getAnthropicClient();
    const categoryList = (categories || []).map(c => `${c.slug}: ${c.name} — ${c.description || 'No description'}`).join('\n');

    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODELS.SONNET,
      max_tokens: DEFAULT_MAX_TOKENS,
      system: 'You are a knowledge base consultant for an AI operational intelligence system. You recommend documents that organizations should upload to power their AI judgment engine. Be specific to their industry and organization context. Always respond with valid JSON only.',
      messages: [{
        role: 'user',
        content: `Organization: ${tenant.company_name}
Industry: ${industryName}
AI System Name: ${tenant.ai_name || 'Atlas'}
Team Size: ${staffCount || 0} staff members
Core Principles: ${neuralProfile?.operationalPhilosophy || 'Not yet defined'}
Organization Summary: ${neuralProfile?.summaryStatement || identity?.manifesto || 'Not yet defined'}

Available document categories:
${categoryList}

Generate a JSON array of 8-10 document suggestions this organization should upload. Each suggestion:
{
  "title": "Specific document name",
  "description": "What this document should contain and why it matters for their AI system",
  "category_slug": "one of the available category slugs above",
  "category_name": "matching category display name",
  "reason": "Why this is important for this specific organization",
  "priority": "critical|recommended|optional"
}

CRITICAL REQUIREMENTS — you MUST include suggestions for ALL of these:
1. Client/customer data files (contact lists, CRM exports, client records, stakeholder directories)
2. Past decision records (board minutes, meeting notes, decision logs, project post-mortems, case outcomes)
3. Operational policies and procedures specific to their ${industryName} sector

Make at least 3 critical (client data and decision records must be critical), 3-4 recommended, and the rest optional. Be specific to ${industryName}.
Return ONLY the JSON array, no markdown or preamble.`,
      }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '[]';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[knowledge-base] Failed to parse suggestions:', cleaned);
      parsed = [];
    }

    const suggestions: DocumentSuggestion[] = (Array.isArray(parsed) ? parsed : []).map((s: Record<string, unknown>, i: number) => ({
      id: `sugg_${i}`,
      title: (s.title as string) || 'Untitled Document',
      description: (s.description as string) || '',
      category_name: (s.category_name as string) || 'General',
      category_slug: (s.category_slug as string) || 'governance',
      reason: (s.reason as string) || '',
      source: 'onboarding' as const,
      priority: (['critical', 'recommended', 'optional'].includes(s.priority as string) ? s.priority : 'recommended') as DocumentSuggestion['priority'],
    }));

    return { success: true, suggestions };
  } catch (error) {
    console.error('[knowledge-base] Suggestions failed:', error);
    return { success: false, error: 'SUGGESTIONS_FAILED' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// analyzeDocument — AI analysis of an uploaded document
// ═══════════════════════════════════════════════════════════════════════════

export async function analyzeDocument(
  tenantId: string,
  documentId: string
): Promise<{ success: boolean; analysis?: FileAnalysis; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_SESSION' };
  }

  const sovereign = createSovereignClient();

  try {
    const { data: chunks } = await sovereign
      .from('knowledge_chunks')
      .select('content')
      .eq('document_id', documentId)
      .eq('tenant_id', tenantId)
      .order('chunk_index', { ascending: true })
      .limit(5);

    if (!chunks || chunks.length === 0) {
      return { success: false, error: 'NO_CHUNKS_FOUND' };
    }

    const combinedText = chunks.map(c => c.content).join('\n\n');
    const anthropic = getAnthropicClient();

    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODELS.SONNET,
      max_tokens: 1024,
      system: 'You are a document analyst for an AI operational intelligence system. Analyze documents and return structured JSON assessments. Respond with valid JSON only.',
      messages: [{
        role: 'user',
        content: `Analyze this document excerpt and provide a structured assessment:

${combinedText.slice(0, 3000)}

Return a JSON object:
{
  "summary": "2-3 sentence overview",
  "key_topics": ["topic1", "topic2", "topic3"],
  "suggested_category": "Most fitting category name",
  "content_type": "Policy|Process|Guide|Report|Template|Other",
  "actionable_insights": ["insight1", "insight2"],
  "quality_score": 0-10
}

Return ONLY the JSON, no other text.`,
      }],
    });

    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}';
    const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    let analysis: FileAnalysis;
    try {
      analysis = JSON.parse(cleaned) as FileAnalysis;
    } catch {
      analysis = {
        summary: 'Document uploaded and processed successfully.',
        key_topics: [],
        suggested_category: 'General',
        content_type: 'Other',
        actionable_insights: [],
        quality_score: 5,
      };
    }

    return { success: true, analysis };
  } catch (error) {
    console.error('[knowledge-base] Analysis failed:', error);
    return { success: false, error: 'ANALYSIS_FAILED' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// chatWithAssistant — AI chat helper for knowledge base setup
// ═══════════════════════════════════════════════════════════════════════════

export async function chatWithAssistant(
  tenantId: string,
  message: string,
  conversationHistory: ChatMessage[]
): Promise<{ success: boolean; response?: string; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_SESSION' };
  }

  const sovereign = createSovereignClient();

  try {
    const { data: tenant } = await sovereign
      .from('tenants')
      .select('company_name, ai_name, industry:industries(name), onboarding_data')
      .eq('id', tenantId)
      .single();

    const companyName = tenant?.company_name || 'your organization';
    const aiName = tenant?.ai_name || 'Atlas';

    const industryRaw = tenant?.industry as unknown;
    const industryName = (industryRaw && typeof industryRaw === 'object' && 'name' in (industryRaw as Record<string, unknown>))
      ? (industryRaw as { name: string }).name
      : 'general business';

    const { count: docCount } = await sovereign
      .from('knowledge_documents')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    const { data: categories } = await sovereign
      .from('knowledge_categories')
      .select('name, slug')
      .eq('tenant_id', tenantId);

    const categoryNames = (categories || []).map(c => c.name).join(', ');
    const anthropic = getAnthropicClient();

    const systemPrompt = `You are ${aiName}, the operational intelligence system for ${companyName}, a ${industryName} organisation.

You are helping them build their knowledge base during onboarding. This is where they upload the documents that will power your judgment engine.

Context:
- Documents uploaded so far: ${docCount || 0}
- Available categories: ${categoryNames || 'None configured'}

Your role:
- Guide them on what documents to upload and why each matters
- Explain how documents power the AI judgment engine
- Reassure them about data security — all documents are encrypted, stored in their private vault, and never shared
- Be encouraging, specific to their industry (${industryName}), and concise
- If they ask about categories, explain each one in context of their organisation

Communication style:
- Conversational and sharp, not robotic
- Short paragraphs, no markdown formatting
- Reference their organisation by name
- Keep responses under 120 words unless they ask for detailed help

Never mention that you are an AI or reference your training. Speak as ${aiName}.`;

    const messages = [
      ...conversationHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content: message },
    ];

    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODELS.SONNET,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    const reply = response.content[0].type === 'text'
      ? response.content[0].text
      : 'I encountered an issue. Please try again.';

    return { success: true, response: reply };
  } catch (error) {
    console.error('[knowledge-base] Chat failed:', error);
    return { success: false, error: 'CHAT_FAILED' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// getDocuments — List uploaded documents with category join
// ═══════════════════════════════════════════════════════════════════════════

export async function getDocuments(
  tenantId: string
): Promise<{ success: boolean; documents?: KnowledgeDocument[]; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_SESSION' };
  }

  const sovereign = createSovereignClient();

  try {
    const { data: docs, error } = await sovereign
      .from('knowledge_documents')
      .select('*, category:knowledge_categories(name, slug)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[knowledge-base] getDocuments failed:', error.message);
      return { success: false, error: 'FETCH_FAILED' };
    }

    return { success: true, documents: (docs || []) as KnowledgeDocument[] };
  } catch {
    return { success: false, error: 'FETCH_FAILED' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// deleteDocument — Remove document and cascading chunks
// ═══════════════════════════════════════════════════════════════════════════

export async function deleteDocument(
  tenantId: string,
  documentId: string
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_SESSION' };
  }
  if (!documentId || !UUID_RE.test(documentId)) {
    return { success: false, error: 'INVALID_DOCUMENT' };
  }

  const sovereign = createSovereignClient();

  try {
    const { error } = await sovereign
      .from('knowledge_documents')
      .delete()
      .eq('id', documentId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[knowledge-base] delete failed:', error.message);
      return { success: false, error: 'DELETE_FAILED' };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'DELETE_FAILED' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// completeKnowledgeBase — Mark phase complete, advance to deployment
// ═══════════════════════════════════════════════════════════════════════════

export async function completeKnowledgeBase(
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  if (!tenantId || !UUID_RE.test(tenantId)) {
    return { success: false, error: 'INVALID_SESSION' };
  }

  try {
    const sovereign = createSovereignClient();

    // 1. Mark knowledge_base as completed in onboarding_progress
    const { error: progressErr } = await sovereign
      .from('onboarding_progress')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('phase_slug', 'knowledge_base');

    if (progressErr) {
      console.error('[knowledge-base] progress update failed:', progressErr);
    }

    // 2. Advance tenant to deployment
    await sovereign
      .from('tenants')
      .update({ onboarding_phase: 'deployment' })
      .eq('id', tenantId);

    // 3. Store completion stats in onboarding_data
    const { data: tenant } = await sovereign
      .from('tenants')
      .select('onboarding_data')
      .eq('id', tenantId)
      .single();

    if (tenant) {
      const { data: stats } = await sovereign
        .from('knowledge_documents')
        .select('id, chunk_count')
        .eq('tenant_id', tenantId);

      const docCount = stats?.length || 0;
      const totalChunks = stats?.reduce((sum, d) => sum + (d.chunk_count || 0), 0) || 0;

      const od = (tenant.onboarding_data || {}) as Record<string, unknown>;
      await sovereign
        .from('tenants')
        .update({
          onboarding_data: {
            ...od,
            knowledge_base: {
              completed: true,
              completed_at: new Date().toISOString(),
              document_count: docCount,
              total_chunks: totalChunks,
            },
          },
        })
        .eq('id', tenantId);
    }

    return { success: true };
  } catch (err) {
    console.error('[knowledge-base] completeKnowledgeBase threw:', err);
    return { success: false, error: 'CRITICAL_FAILURE' };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function chunkText(text: string, maxTokens: number = 512): string[] {
  const maxChars = maxTokens * 4;
  const chunks: string[] = [];
  const paragraphs = text.split('\n\n');
  let currentChunk = '';

  for (const para of paragraphs) {
    if ((currentChunk + para).length > maxChars) {
      if (currentChunk) chunks.push(currentChunk.trim());
      currentChunk = para;
    } else {
      currentChunk += '\n\n' + para;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());
  return chunks.filter(c => c.length > 50);
}

async function generateDocumentSummary(text: string): Promise<string> {
  try {
    const anthropic = getAnthropicClient();
    const excerpt = text.slice(0, 2000);

    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODELS.SONNET,
      max_tokens: 200,
      system: 'You are a document analyst. Provide a concise 1-2 sentence summary of the document. No markdown formatting.',
      messages: [{
        role: 'user',
        content: `Summarize this document:\n\n${excerpt}`,
      }],
    });

    return response.content[0].type === 'text'
      ? response.content[0].text
      : 'Document uploaded successfully.';
  } catch {
    return 'Document uploaded successfully.';
  }
}
