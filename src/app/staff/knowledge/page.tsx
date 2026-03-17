'use client';

// =============================================================================
// Knowledge Base — Upload, browse, and search documents for agent training
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, Upload, FileText, FileCode, Table2, File,
  Trash2, Plus, Search, X, Tag, CheckCircle, Clock,
  AlertCircle, Layers, Eye, Inbox, ChevronDown, Send,
} from 'lucide-react';
import {
  getKnowledgeData,
  deleteKnowledgeDocument,
  processDocumentUpload,
  searchKnowledgeChunks,
} from '@/lib/actions/knowledge-wellness';
import type {
  KnowledgeCategory,
  KnowledgeDocument,
  KnowledgeStats,
} from '@/lib/actions/knowledge-wellness';
import { getMyReceivedReports, acknowledgeReport, markReportRead } from '@/lib/actions/agenda-hub';
import type { AgendaReport } from '@/lib/actions/agenda-hub';
import { getStaffProfile } from '@/lib/actions/staff-onboarding';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const RED    = '#DC2626';
const PURPLE = '#7C3AED';
const GOLD   = '#D8A600';
const ORANGE = '#EA580C';

// =============================================================================
// HELPERS
// =============================================================================

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtBytes(n: number | null) {
  if (!n) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

function fileTypeIcon(type: string | null) {
  const t = (type || '').toLowerCase();
  if (t.includes('pdf'))  return { Icon: File,     color: RED };
  if (t.includes('txt'))  return { Icon: FileText,  color: NAVY };
  if (t.includes('md'))   return { Icon: FileCode,  color: PURPLE };
  if (t.includes('csv'))  return { Icon: Table2,    color: GREEN };
  if (t.includes('docx') || t.includes('doc')) return { Icon: FileText, color: BLUE };
  return { Icon: File, color: MUTED };
}

function statusDot(status: KnowledgeDocument['processing_status']) {
  if (status === 'completed')  return { color: GREEN,  label: 'Ready',      Icon: CheckCircle };
  if (status === 'processing') return { color: GOLD,   label: 'Processing', Icon: Clock };
  if (status === 'failed')     return { color: RED,    label: 'Failed',     Icon: AlertCircle };
  return { color: MUTED, label: 'Pending', Icon: Clock };
}

const FALLBACK_PROFILE: StaffProfile = {
  userId: '', firstName: 'Staff', lastName: '', email: '',
  jobTitle: null, departmentName: null, departmentId: null,
  roleName: null, isAdmin: false, isOwner: false,
  companyName: 'Edgbaston Wellness Clinic',
  aiName: 'Aria', brandColor: BLUE, logoUrl: null,
  industry: null, reportsTo: null, teamSize: 0,
};

// =============================================================================
// DOCUMENT CARD
// =============================================================================

function DocumentCard({
  doc,
  onDelete,
  accentColor,
}: {
  doc: KnowledgeDocument;
  onDelete: (id: string) => void;
  accentColor: string;
}) {
  const [hovered, setHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { Icon: TypeIcon, color: typeColor } = fileTypeIcon(doc.file_type);
  const { color: statusColor, label: statusLabel, Icon: StatusIcon } = statusDot(doc.processing_status);

  async function handleDelete() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setDeleting(true);
    await deleteKnowledgeDocument(doc.id);
    onDelete(doc.id);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirmDelete(false); }}
      style={{
        border: `1px solid ${hovered ? accentColor + '40' : BORDER}`,
        borderRadius: 16,
        padding: '16px 18px',
        background: hovered ? `${accentColor}05` : 'transparent',
        cursor: 'default',
        transition: 'all 0.2s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left accent strip */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: hovered ? typeColor : 'transparent',
        borderRadius: '3px 0 0 3px',
        transition: 'background 0.2s',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* File type icon */}
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: `${typeColor}12`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <TypeIcon size={16} color={typeColor} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title + badges row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {doc.title}
            </span>
          </div>

          {/* Category + status row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
            {doc.category && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                background: `${BLUE}10`, color: BLUE,
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                {doc.category.name}
              </span>
            )}
            <span style={{
              display: 'flex', alignItems: 'center', gap: 3,
              fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
              background: `${statusColor}10`, color: statusColor,
            }}>
              <StatusIcon size={9} />
              {statusLabel}
            </span>
            {doc.chunk_count > 0 && (
              <span style={{
                display: 'flex', alignItems: 'center', gap: 3,
                fontSize: 9, fontWeight: 600, padding: '2px 7px', borderRadius: 5,
                background: `${MUTED}10`, color: MUTED,
              }}>
                <Layers size={9} />
                {doc.chunk_count} chunks
              </span>
            )}
          </div>

          {/* Description */}
          {doc.description && (
            <p style={{ fontSize: 11, color: TER, lineHeight: 1.5, margin: '0 0 6px', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
              {doc.description}
            </p>
          )}

          {/* Tags */}
          {doc.tags.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
              {doc.tags.slice(0, 5).map(tag => (
                <span key={tag} style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 9, padding: '2px 6px', borderRadius: 4,
                  background: `${accentColor}08`, color: accentColor,
                }}>
                  <Tag size={8} />
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Footer row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: MUTED }}>
              {fmtDate(doc.created_at)}
              {doc.file_size_bytes ? ` · ${fmtBytes(doc.file_size_bytes)}` : ''}
            </span>

            {/* Delete button — hover reveal */}
            <AnimatePresence>
              {hovered && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  onClick={handleDelete}
                  disabled={deleting}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 10px', borderRadius: 6,
                    background: confirmDelete ? RED : `${RED}12`,
                    color: confirmDelete ? '#fff' : RED,
                    border: `1px solid ${confirmDelete ? RED : RED + '30'}`,
                    fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <Trash2 size={10} />
                  {deleting ? 'Deleting…' : confirmDelete ? 'Confirm' : 'Delete'}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// UPLOAD MODAL
// =============================================================================

function UploadModal({
  categories,
  tenantId,
  userId,
  onClose,
  onSuccess,
}: {
  categories: KnowledgeCategory[];
  tenantId: string;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tagsRaw, setTagsRaw] = useState('');
  const [description, setDescription] = useState('');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('text/plain');
  const [fileSizeBytes, setFileSizeBytes] = useState<number | undefined>(undefined);
  const [isPdf, setIsPdf] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function processFile(file: File) {
    setFileName(file.name);
    setFileSizeBytes(file.size);
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const mime = file.type || `application/${ext}`;
    setFileType(mime);

    if (ext === 'pdf' || mime.includes('pdf')) {
      setIsPdf(true);
      setContent('');
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
      return;
    }

    setIsPdf(false);
    const reader = new FileReader();
    reader.onload = e => {
      const text = (e.target?.result as string) || '';
      setContent(text);
      if (!title) setTitle(file.name.replace(/\.[^.]+$/, ''));
    };
    reader.readAsText(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) { setError('Title is required'); return; }
    if (!content.trim()) { setError('Document content is required'); return; }

    setSubmitting(true);
    const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

    const result = await processDocumentUpload({
      title,
      content,
      category_id: categoryId || null,
      file_name: fileName || `${title.toLowerCase().replace(/\s+/g, '-')}.txt`,
      file_type: fileType,
      file_size_bytes: fileSizeBytes,
      tags,
      description,
      uploaded_by_user_id: userId || null,
      tenant_id: tenantId,
    });

    setSubmitting(false);

    if (result.success) {
      setToast(`Document uploaded. ${result.chunk_count} chunks created.`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1800);
    } else {
      setError(result.error ?? 'Upload failed');
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(24,29,35,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.97 }}
        style={{
          background: BG, border: `1px solid ${BORDER}`,
          borderRadius: 20, width: '100%', maxWidth: 600,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: MUTED, marginBottom: 4 }}>Knowledge Base</p>
            <h2 style={{ fontSize: 20, fontWeight: 900, color: NAVY, letterSpacing: '-0.03em', margin: 0 }}>Upload Document</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '24px 28px' }}>
          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? BLUE : BORDER}`,
              borderRadius: 12, padding: '28px 20px', textAlign: 'center',
              cursor: 'pointer', marginBottom: 20,
              background: dragging ? `${BLUE}05` : 'transparent',
              transition: 'all 0.2s',
            }}
          >
            <Upload size={24} style={{ color: dragging ? BLUE : MUTED, margin: '0 auto 8px', display: 'block' }} />
            <p style={{ fontSize: 13, fontWeight: 600, color: dragging ? BLUE : NAVY, marginBottom: 4 }}>
              {fileName ? fileName : 'Drag and drop or click to select'}
            </p>
            <p style={{ fontSize: 11, color: MUTED }}>Accepts .txt, .md, .csv, .pdf</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.pdf,.docx"
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
          </div>

          {isPdf && (
            <div style={{
              padding: '12px 14px', borderRadius: 10, marginBottom: 16,
              background: `${GOLD}08`, border: `1px solid ${GOLD}30`,
            }}>
              <p style={{ fontSize: 11, color: GOLD, fontWeight: 600, margin: 0 }}>
                PDF detected — auto-extraction is limited. Paste the full text content in the field below if extraction fails.
              </p>
            </div>
          )}

          {/* Title */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginBottom: 6 }}>
              Title <span style={{ color: RED }}>*</span>
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Botox Treatment Protocol"
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, background: 'transparent',
                fontSize: 13, color: NAVY, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Category */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginBottom: 6 }}>
              Category
            </label>
            <select
              value={categoryId}
              onChange={e => setCategoryId(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, background: BG,
                fontSize: 13, color: NAVY, outline: 'none',
                boxSizing: 'border-box',
              }}
            >
              <option value="">— No category —</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Tags */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginBottom: 6 }}>
              Tags <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(comma-separated)</span>
            </label>
            <input
              value={tagsRaw}
              onChange={e => setTagsRaw(e.target.value)}
              placeholder="botox, aesthetics, protocol"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, background: 'transparent',
                fontSize: 13, color: NAVY, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Description */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginBottom: 6 }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="Brief summary of this document's purpose"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, background: 'transparent',
                fontSize: 13, color: NAVY, outline: 'none', resize: 'vertical',
                boxSizing: 'border-box', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Content */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, marginBottom: 6 }}>
              Document Content (extracted text) <span style={{ color: RED }}>*</span>
            </label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={8}
              placeholder="Paste or type the document content here…"
              required
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, background: 'transparent',
                fontSize: 12, color: NAVY, outline: 'none', resize: 'vertical',
                boxSizing: 'border-box', fontFamily: 'monospace',
                lineHeight: 1.6,
              }}
            />
          </div>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: `${RED}08`, border: `1px solid ${RED}25`, color: RED, fontSize: 12, fontWeight: 600 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: `${GREEN}08`, border: `1px solid ${GREEN}25`, color: GREEN, fontSize: 12, fontWeight: 600 }}
              >
                {toast}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
                background: 'transparent', border: `1px solid ${BORDER}`,
                fontSize: 13, fontWeight: 600, color: TER,
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 22px', borderRadius: 8, cursor: submitting ? 'wait' : 'pointer',
                background: submitting ? `${BLUE}60` : BLUE,
                border: 'none', fontSize: 13, fontWeight: 700, color: '#fff',
                transition: 'all 0.2s',
              }}
            >
              <Upload size={13} />
              {submitting ? 'Uploading…' : 'Upload Document'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// =============================================================================
// SEARCH RESULTS PANEL
// =============================================================================

function SearchResults({
  results,
  query,
  onClear,
}: {
  results: Awaited<ReturnType<typeof searchKnowledgeChunks>>;
  query: string;
  onClear: () => void;
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: MUTED }}>
          {results.length} chunk{results.length !== 1 ? 's' : ''} matching &ldquo;{query}&rdquo;
        </p>
        <button
          onClick={onClear}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: BLUE, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
        >
          <X size={11} />
          Clear
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {results.map(r => {
          const idx = r.content.toLowerCase().indexOf(query.toLowerCase());
          const start = Math.max(0, idx - 60);
          const end = Math.min(r.content.length, idx + query.length + 120);
          const excerpt = (start > 0 ? '…' : '') + r.content.slice(start, end) + (end < r.content.length ? '…' : '');

          return (
            <motion.div
              key={r.chunk_id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                padding: '14px 16px', borderRadius: 12,
                border: `1px solid ${BORDER}`,
                background: 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Eye size={12} color={BLUE} />
                <span style={{ fontSize: 11, fontWeight: 700, color: NAVY }}>{r.document_title}</span>
                {r.category_name && (
                  <span style={{
                    fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
                    background: `${BLUE}10`, color: BLUE,
                  }}>
                    {r.category_name}
                  </span>
                )}
              </div>
              <p style={{ fontSize: 11, color: SEC, lineHeight: 1.6, margin: 0 }}>
                {excerpt}
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// STATS BAR
// =============================================================================

function StatsBar({ stats }: { stats: KnowledgeStats }) {
  const tiles = [
    { label: 'Total Documents', value: stats.total_documents, color: NAVY },
    { label: 'Total Chunks',    value: stats.total_chunks,    color: BLUE },
    { label: 'Categories',      value: stats.total_categories, color: PURPLE },
    { label: 'Last Updated',    value: stats.last_uploaded_at ? fmtDate(stats.last_uploaded_at) : '—', color: NAVY },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: `1px solid ${BORDER}` }}>
      {tiles.map((t, i) => (
        <div key={t.label} style={{
          padding: '20px 28px',
          borderRight: i < 3 ? `1px solid ${BORDER}` : 'none',
        }}>
          <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: MUTED, marginBottom: 4 }}>{t.label}</p>
          <p style={{ fontSize: typeof t.value === 'string' ? 18 : 32, fontWeight: 900, color: t.color, letterSpacing: '-0.04em', margin: 0 }}>
            {t.value}
          </p>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// REPORTS PANEL
// =============================================================================

function ReportsPanel({ reports, onAcknowledge }: {
  reports: AgendaReport[];
  onAcknowledge: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  function catColor(cat: string) {
    if (cat === 'clinical')    return BLUE;
    if (cat === 'compliance')  return ORANGE;
    if (cat === 'operational') return NAVY;
    return MUTED;
  }

  if (reports.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 0' }}>
        <Inbox size={32} style={{ color: BORDER, margin: '0 auto 16px', display: 'block' }} />
        <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>No reports yet</p>
        <p style={{ fontSize: 12, color: MUTED }}>Reports sent to you from colleagues will appear here.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px 0' }}>
      <AnimatePresence>
        {reports.map(r => {
          const snapshot = r.agenda_snapshot ?? {};
          const agendaData = (snapshot.agenda ?? {}) as Record<string, unknown>;
          const ev  = (snapshot.evidence as unknown[]) ?? [];
          const tl  = (snapshot.timeline as unknown[]) ?? [];
          const isOpen = expanded === r.id;

          return (
            <motion.div key={r.id}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              style={{ borderBottom: `1px solid ${BORDER}` }}>

              {/* Summary row */}
              <div
                onClick={() => { setExpanded(e => e === r.id ? null : r.id); }}
                className="flex items-start justify-between gap-4 cursor-pointer"
                style={{
                  padding: '16px 32px',
                  background: !r.is_read ? `${BLUE}04` : 'transparent',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = `${BLUE}06`)}
                onMouseLeave={e => (e.currentTarget.style.background = !r.is_read ? `${BLUE}04` : 'transparent')}>

                <div className="flex items-start gap-3" style={{ flex: 1, minWidth: 0 }}>
                  {/* Unread dot */}
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%', flexShrink: 0, marginTop: 5,
                    background: !r.is_read ? BLUE : 'transparent',
                    border: !r.is_read ? 'none' : `1.5px solid ${BORDER}`,
                  }} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, lineHeight: 1.3 }}>{r.agenda_title}</span>
                      {r.agenda_category && (
                        <span style={{
                          fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 700,
                          color: catColor(r.agenda_category),
                        }}>{r.agenda_category}</span>
                      )}
                      {r.acknowledged_at && (
                        <span style={{ fontSize: 9, color: GREEN, fontWeight: 600 }}>Acknowledged</span>
                      )}
                    </div>
                    <p style={{ fontSize: 11, color: TER, marginBottom: 2 }}>
                      From {r.sender_name} · {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    {r.cover_note && (
                      <p style={{ fontSize: 11, color: SEC, fontStyle: 'italic', marginTop: 3 }}>&ldquo;{r.cover_note}&rdquo;</p>
                    )}
                    <div className="flex items-center gap-3 mt-2">
                      <span style={{ fontSize: 9, color: MUTED }}>{ev.length} file{ev.length !== 1 ? 's' : ''}</span>
                      <span style={{ fontSize: 9, color: MUTED }}>{tl.length} note{tl.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {!r.acknowledged_at && (
                    <button
                      onClick={e => { e.stopPropagation(); onAcknowledge(r.id); }}
                      style={{ fontSize: 10, fontWeight: 600, padding: '4px 12px', borderRadius: 8, cursor: 'pointer', background: `${GREEN}12`, border: `1px solid ${GREEN}28`, color: GREEN }}>
                      Acknowledge
                    </button>
                  )}
                  <ChevronDown size={14} style={{ color: MUTED, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>
              </div>

              {/* Expanded detail */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    style={{ overflow: 'hidden' }}>
                    <div style={{ padding: '0 32px 20px 52px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                      {/* Agenda details */}
                      <div>
                        <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED, marginBottom: 10 }}>Agenda Details</p>
                        <div className="space-y-2">
                          {[
                            { label: 'Status',   value: String(agendaData.status  ?? '') },
                            { label: 'Due Date', value: agendaData.due_date ? new Date(agendaData.due_date as string).toLocaleDateString('en-GB') : '' },
                            { label: 'Owner',    value: String(snapshot.sender_name ?? '') },
                          ].filter(r2 => r2.value).map(row => (
                            <div key={row.label} className="flex justify-between">
                              <span style={{ fontSize: 10, color: MUTED }}>{row.label}</span>
                              <span style={{ fontSize: 10, color: SEC, textTransform: 'capitalize' }}>{row.value}</span>
                            </div>
                          ))}
                        </div>

                        {/* Timeline notes */}
                        {tl.length > 0 && (
                          <div style={{ marginTop: 16 }}>
                            <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED, marginBottom: 8 }}>Notes</p>
                            <div className="space-y-2">
                              {(tl as Record<string, unknown>[]).map((n, i) => (
                                <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: `${BORDER}40`, border: `1px solid ${BORDER}` }}>
                                  <p style={{ fontSize: 9, color: MUTED, textTransform: 'capitalize', marginBottom: 2 }}>{String(n.note_type ?? 'update')}</p>
                                  <p style={{ fontSize: 11, color: SEC }}>{String(n.content ?? '')}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Evidence */}
                      <div>
                        {ev.length > 0 && (
                          <>
                            <p style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 700, color: MUTED, marginBottom: 10 }}>Evidence</p>
                            <div className="space-y-2">
                              {(ev as Record<string, unknown>[]).map((e2, i) => (
                                <div key={i} className="flex items-center gap-2"
                                  style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${BORDER}` }}>
                                  <FileText size={12} style={{ color: BLUE, flexShrink: 0 }} />
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: 10, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(e2.file_name ?? 'File')}</p>
                                    {!!e2.caption && <p style={{ fontSize: 9, color: MUTED }}>{String(e2.caption)}</p>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function KnowledgeBasePage() {
  const params = useSearchParams();
  const userId = params.get('userId') ?? '';
  const tenantId = params.get('tenantId') ?? 'clinic';

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<'documents' | 'reports'>('documents');
  const [reports, setReports] = useState<AgendaReport[]>([]);
  const [reportsLoaded, setReportsLoaded] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Awaited<ReturnType<typeof searchKnowledgeChunks>> | null>(null);
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve tenantId from session if not in URL
  const [resolvedTenantId, setResolvedTenantId] = useState<string>(tenantId);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [profileRes, kbRes, sessionRes] = await Promise.all([
      getStaffProfile(tenantId || 'clinic', userId),
      getKnowledgeData(),
      getStaffSession(),
    ]);

    if (profileRes.success && profileRes.data) {
      setProfile(profileRes.data.profile);
    } else {
      setProfile(FALLBACK_PROFILE);
    }

    if (sessionRes?.tenantId) {
      setResolvedTenantId(sessionRes.tenantId);
    }

    if (kbRes.success) {
      setCategories(kbRes.categories ?? []);
      setDocuments(kbRes.documents ?? []);
      setStats(kbRes.stats ?? null);
    }

    setLoading(false);
  }, [userId, tenantId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleTabSwitch(tab: 'documents' | 'reports') {
    setActiveTab(tab);
    if (tab === 'reports' && !reportsLoaded && userId) {
      const data = await getMyReceivedReports(userId);
      setReports(data);
      setReportsLoaded(true);
      // Mark all as read
      data.filter(r => !r.is_read).forEach(r => markReportRead(r.id));
      setReports(d => d.map(r => ({ ...r, is_read: true })));
    }
  }

  async function handleAcknowledge(reportId: string) {
    await acknowledgeReport(reportId);
    setReports(d => d.map(r => r.id === reportId ? { ...r, acknowledged_at: new Date().toISOString(), is_read: true } : r));
  }

  function handleCategoryClick(id: string | null) {
    setActiveCategoryId(id);
    setSearchQuery('');
    setSearchResults(null);
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!q.trim()) { setSearchResults(null); return; }
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchKnowledgeChunks(resolvedTenantId, q, 10);
      setSearchResults(results);
      setSearching(false);
    }, 350);
  }

  function handleDeleteDoc(id: string) {
    setDocuments(prev => prev.filter(d => d.id !== id));
    if (stats) {
      setStats({ ...stats, total_documents: stats.total_documents - 1 });
    }
  }

  const accentColor = profile?.brandColor ?? BLUE;

  // Filtered documents by active category
  const filteredDocs = activeCategoryId
    ? documents.filter(d => d.category_id === activeCategoryId)
    : documents;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: BG, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: `2px solid ${BORDER}`, borderTopColor: BLUE, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 12, color: MUTED }}>Loading knowledge base…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: BG }}>
      {profile && (
        <StaffNav
          profile={profile}
          userId={userId}
          brandColor={accentColor}
          currentPath="Knowledge Base"
        />
      )}

      <main style={{ paddingLeft: 'var(--nav-w, 240px)', minHeight: '100vh' }}>

        {/* ── Header ── */}
        <div style={{ padding: '40px 40px 28px', borderBottom: `1px solid ${BORDER}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: MUTED, marginBottom: 6 }}>
              Intelligence
            </p>
            <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: NAVY, lineHeight: 1, margin: 0 }}>
              Knowledge Base
            </h1>
            <p style={{ fontSize: 13, color: SEC, marginTop: 8, margin: '8px 0 0' }}>
              Documents and content that train the agents
            </p>
          </div>
          <button
            onClick={() => setShowUpload(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 20px', borderRadius: 10,
              background: BLUE, color: '#fff', border: 'none',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              transition: 'opacity 0.2s',
            }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '0.88')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
          >
            <Upload size={14} />
            Upload Document
          </button>
        </div>

        {/* ── Tab strip ── */}
        <div className="flex items-center gap-0 px-10"
          style={{ borderBottom: `1px solid ${BORDER}` }}>
          {([
            { key: 'documents' as const, label: 'Documents', count: documents.length },
            { key: 'reports'   as const, label: 'Reports',   count: reports.filter(r => !r.acknowledged_at).length },
          ]).map(t => (
            <button key={t.key}
              onClick={() => handleTabSwitch(t.key)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '14px 0', marginRight: 24,
                color: activeTab === t.key ? NAVY : MUTED,
                fontSize: 12, fontWeight: activeTab === t.key ? 700 : 500,
                borderBottom: activeTab === t.key ? `2px solid ${BLUE}` : '2px solid transparent',
                display: 'flex', alignItems: 'center', gap: 6, transition: 'all 0.15s',
              }}>
              {t.label}
              {t.count > 0 && (
                <span style={{
                  fontSize: 9, padding: '1px 6px', borderRadius: 999, fontWeight: 700,
                  background: activeTab === t.key ? `${BLUE}18` : `${MUTED}18`,
                  color: activeTab === t.key ? BLUE : MUTED,
                }}>{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── Stats ── */}
        {activeTab === 'documents' && stats && <StatsBar stats={stats} />}

        {/* ── Reports tab ── */}
        {activeTab === 'reports' && (
          <ReportsPanel reports={reports} onAcknowledge={handleAcknowledge} />
        )}

        {/* ── Search bar (documents only) ── */}
        {activeTab === 'documents' && <div style={{ padding: '20px 40px', borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ position: 'relative', maxWidth: 480 }}>
            <Search size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: MUTED, pointerEvents: 'none' }} />
            <input
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              placeholder="Search knowledge chunks…"
              style={{
                width: '100%', padding: '10px 40px 10px 36px', borderRadius: 10,
                border: `1px solid ${searchQuery ? accentColor + '60' : BORDER}`,
                background: 'transparent', fontSize: 13, color: NAVY,
                outline: 'none', boxSizing: 'border-box',
                transition: 'border-color 0.2s',
              }}
            />
            {searching && (
              <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: `2px solid ${BORDER}`, borderTopColor: accentColor, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            )}
            {searchQuery && !searching && (
              <button
                onClick={() => { setSearchQuery(''); setSearchResults(null); }}
                style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 2 }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>}

        {/* ── Body: two-column (documents only) ── */}
        {activeTab === 'documents' && <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 0 }}>

          {/* Left: categories sidebar */}
          <div style={{ borderRight: `1px solid ${BORDER}`, padding: '24px 20px', minHeight: 'calc(100vh - 260px)' }}>
            <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: MUTED, marginBottom: 12 }}>
              Categories
            </p>

            {/* All */}
            <button
              onClick={() => handleCategoryClick(null)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                background: activeCategoryId === null ? `${accentColor}10` : 'transparent',
                border: activeCategoryId === null ? `1px solid ${accentColor}30` : '1px solid transparent',
                borderLeft: activeCategoryId === null ? `2px solid ${accentColor}` : `2px solid transparent`,
                color: activeCategoryId === null ? accentColor : TER,
                fontSize: 12, fontWeight: activeCategoryId === null ? 700 : 500,
                transition: 'all 0.15s', marginBottom: 2,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BookOpen size={13} />
                All Documents
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, color: MUTED }}>{documents.length}</span>
            </button>

            {/* Category list */}
            <div style={{ marginTop: 8 }}>
              {categories.map(cat => {
                const count = documents.filter(d => d.category_id === cat.id).length;
                const isActive = activeCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryClick(cat.id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      background: isActive ? `${accentColor}10` : 'transparent',
                      border: isActive ? `1px solid ${accentColor}30` : '1px solid transparent',
                      borderLeft: isActive ? `2px solid ${accentColor}` : `2px solid transparent`,
                      color: isActive ? accentColor : TER,
                      fontSize: 12, fontWeight: isActive ? 700 : 500,
                      transition: 'all 0.15s', marginBottom: 2,
                    }}
                    onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = NAVY; }}
                    onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = TER; }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {cat.name}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: MUTED, flexShrink: 0, marginLeft: 4 }}>{count}</span>
                  </button>
                );
              })}
            </div>

            {categories.length === 0 && (
              <p style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>No categories yet</p>
            )}
          </div>

          {/* Right: documents grid */}
          <div style={{ padding: '24px 32px' }}>
            {searchResults !== null ? (
              <SearchResults
                results={searchResults}
                query={searchQuery}
                onClear={() => { setSearchResults(null); setSearchQuery(''); }}
              />
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: MUTED }}>
                    {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
                    {activeCategoryId ? ` — ${categories.find(c => c.id === activeCategoryId)?.name ?? ''}` : ''}
                  </p>
                  <button
                    onClick={() => setShowUpload(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                      background: `${BLUE}08`, border: `1px solid ${BLUE}25`,
                      fontSize: 11, fontWeight: 700, color: BLUE,
                    }}
                  >
                    <Plus size={12} />
                    Add Document
                  </button>
                </div>

                {filteredDocs.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    style={{ textAlign: 'center', padding: '80px 0' }}
                  >
                    <BookOpen size={32} style={{ color: BORDER, margin: '0 auto 16px', display: 'block' }} />
                    <p style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 8 }}>No documents yet</p>
                    <p style={{ fontSize: 12, color: MUTED, marginBottom: 20 }}>
                      Upload your first document to train the agents.
                    </p>
                    <button
                      onClick={() => setShowUpload(true)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '10px 22px', borderRadius: 10,
                        background: BLUE, color: '#fff', border: 'none',
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      }}
                    >
                      <Upload size={14} />
                      Upload Document
                    </button>
                  </motion.div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                    <AnimatePresence>
                      {filteredDocs.map(doc => (
                        <DocumentCard
                          key={doc.id}
                          doc={doc}
                          onDelete={handleDeleteDoc}
                          accentColor={accentColor}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </>
            )}
          </div>
        </div>}
      </main>

      {/* Upload Modal */}
      <AnimatePresence>
        {showUpload && (
          <UploadModal
            categories={categories}
            tenantId={resolvedTenantId}
            userId={userId}
            onClose={() => setShowUpload(false)}
            onSuccess={loadData}
          />
        )}
      </AnimatePresence>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
