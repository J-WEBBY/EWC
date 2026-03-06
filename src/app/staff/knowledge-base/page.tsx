'use client';

import { useState, useEffect, useCallback, useRef, DragEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, FileText, Layers, Search, Trash2,
  CheckCircle2, Clock, XCircle, ChevronRight,
  Plus, Tag, RefreshCw, X, Loader2, Upload,
  FileUp, AlertCircle, type LucideIcon,
} from 'lucide-react';
import {
  getKnowledgeData,
  deleteKnowledgeDocument,
  createKnowledgeDocument,
  type KnowledgeCategory,
  type KnowledgeDocument,
  type KnowledgeStats,
} from '@/lib/actions/knowledge-wellness';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// HELPERS
// =============================================================================

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtBytes(n: number | null): string {
  if (!n) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function statusIcon(s: KnowledgeDocument['processing_status']): LucideIcon {
  if (s === 'completed') return CheckCircle2;
  if (s === 'failed')    return XCircle;
  return Clock;
}

function statusColor(s: KnowledgeDocument['processing_status']): string {
  if (s === 'completed') return 'text-[#3D4451]';
  return 'text-[#96989B]';
}

// =============================================================================
// STAT CARD
// =============================================================================

function StatCard({ label, value, icon: Icon }: { label: string; value: number | string; icon: LucideIcon }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl p-5 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium">{label}</span>
        <Icon size={14} className="text-[#5A6475]" />
      </div>
      <p className="text-[28px] font-semibold tracking-tight text-[#181D23] leading-none">{value}</p>
    </motion.div>
  );
}

// =============================================================================
// DOCUMENT ROW
// =============================================================================

function DocumentRow({ doc, onDelete }: { doc: KnowledgeDocument; onDelete: (id: string) => void }) {
  const [deleting, setDeleting] = useState(false);
  const SIcon = statusIcon(doc.processing_status);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.18 }}
      className="flex items-start gap-4 py-3.5 border-b border-[#D4E2FF] last:border-0"
    >
      <FileText size={15} className="text-[#96989B] mt-0.5 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-[13px] font-medium text-[#181D23] truncate">{doc.title || doc.file_name}</p>
          <SIcon size={11} className={statusColor(doc.processing_status)} />
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {doc.category && (
            <span className="text-[11px] text-[#5A6475] uppercase tracking-[0.1em]">{doc.category.name}</span>
          )}
          {doc.chunk_count > 0 && (
            <span className="text-[11px] text-[#96989B]">{doc.chunk_count} chunks</span>
          )}
          <span className="text-[11px] text-[#96989B]">{fmtBytes(doc.file_size_bytes)}</span>
          <span className="text-[11px] text-[#96989B]">{relativeTime(doc.created_at)}</span>
        </div>
        {doc.tags.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {doc.tags.slice(0, 4).map(t => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 bg-[#F5F3FF] border border-[#D4E2FF] rounded-md text-[#5A6475]">{t}</span>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={async () => { setDeleting(true); await deleteKnowledgeDocument(doc.id); onDelete(doc.id); }}
        disabled={deleting}
        className="p-1.5 rounded-lg hover:bg-[#FAF9F5] transition-colors disabled:opacity-30"
        title="Delete document"
      >
        <Trash2 size={13} className="text-[#96989B]" />
      </button>
    </motion.div>
  );
}

// =============================================================================
// ADD DOCUMENT PANEL
// =============================================================================

type InputMode = 'paste' | 'upload';

interface SharedFields {
  title: string;
  categoryId: string;
  description: string;
  tagsInput: string;
}

function AddDocumentPanel({
  categories,
  onClose,
  onSuccess,
}: {
  categories: KnowledgeCategory[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode]         = useState<InputMode>('paste');
  const [fields, setFields]     = useState<SharedFields>({ title: '', categoryId: '', description: '', tagsInput: '' });
  const [content, setContent]   = useState('');
  const [file, setFile]         = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSub]    = useState(false);
  const [error, setError]       = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const updateField = (k: keyof SharedFields, v: string) => setFields(f => ({ ...f, [k]: v }));

  // Auto-fill title from file name
  const applyFile = (f: File) => {
    setFile(f);
    if (!fields.title) {
      const name = f.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      updateField('title', name);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) applyFile(dropped);
  };

  const canSubmit = fields.title.trim() && (mode === 'paste' ? content.trim() : !!file);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSub(true);
    setError('');

    const tags = fields.tagsInput.split(',').map(t => t.trim()).filter(Boolean);

    if (mode === 'paste') {
      const res = await createKnowledgeDocument({
        title: fields.title.trim(),
        content: content.trim(),
        category_id: fields.categoryId || null,
        description: fields.description.trim() || undefined,
        tags,
      });
      setSub(false);
      if (res.success) { onSuccess(); }
      else { setError(`Save failed (${res.error}). Please try again.`); }
    } else {
      // File upload via API route
      const form = new FormData();
      form.append('file', file!);
      form.append('title', fields.title.trim());
      form.append('category_id', fields.categoryId || '');
      form.append('description', fields.description.trim());
      form.append('tags', fields.tagsInput);

      try {
        const res = await fetch('/api/knowledge/upload', { method: 'POST', body: form });
        const json = await res.json() as { success?: boolean; error?: string; chunkCount?: number };
        setSub(false);
        if (json.success) { onSuccess(); }
        else { setError(json.error || 'Upload failed. Please try again.'); }
      } catch {
        setSub(false);
        setError('Network error. Please try again.');
      }
    }
  };

  const sharedFieldsUI = (
    <div className="space-y-4">
      {/* Title */}
      <div>
        <label className="block text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium mb-2">Title *</label>
        <input
          type="text"
          value={fields.title}
          onChange={e => updateField('title', e.target.value)}
          placeholder="e.g. Post-Treatment Care Guidelines"
          className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-[#D4E2FF] rounded-xl text-[13px] text-[#181D23] placeholder:text-[#96989B] outline-none focus:border-[#181D23] transition-colors"
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium mb-2">Category</label>
        <select
          value={fields.categoryId}
          onChange={e => updateField('categoryId', e.target.value)}
          className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-[#D4E2FF] rounded-xl text-[13px] text-[#181D23] outline-none focus:border-[#181D23] transition-colors"
        >
          <option value="">— No category —</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.name}</option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label className="block text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium mb-2">Description</label>
        <input
          type="text"
          value={fields.description}
          onChange={e => updateField('description', e.target.value)}
          placeholder="Brief summary of this document"
          className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-[#D4E2FF] rounded-xl text-[13px] text-[#181D23] placeholder:text-[#96989B] outline-none focus:border-[#181D23] transition-colors"
        />
      </div>

      {/* Tags */}
      <div>
        <label className="block text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium mb-2">
          Tags <span className="normal-case tracking-normal text-[#96989B]">(comma-separated)</span>
        </label>
        <input
          type="text"
          value={fields.tagsInput}
          onChange={e => updateField('tagsInput', e.target.value)}
          placeholder="e.g. botox, aftercare, protocols"
          className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-[#D4E2FF] rounded-xl text-[13px] text-[#181D23] placeholder:text-[#96989B] outline-none focus:border-[#181D23] transition-colors"
        />
      </div>
    </div>
  );

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 28, stiffness: 280 }}
      className="fixed top-0 right-0 h-full w-[520px] bg-[#FAF7F2] border-l border-[#EBE5FF] z-50 flex flex-col shadow-xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-[#D4E2FF] flex-shrink-0">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#96989B] mb-0.5">Knowledge Base</p>
          <h2 className="text-[16px] font-semibold text-[#181D23]">Add Document</h2>
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#FAF9F5] transition-colors">
          <X size={16} className="text-[#5A6475]" />
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex border-b border-[#D4E2FF] flex-shrink-0">
        {(['paste', 'upload'] as InputMode[]).map(m => (
          <button
            key={m}
            onClick={() => { setMode(m); setError(''); }}
            className={`flex-1 py-3 text-[12px] font-medium transition-colors border-b-2 ${
              mode === m
                ? 'border-[#181D23] text-[#181D23]'
                : 'border-transparent text-[#96989B] hover:text-[#5A6475]'
            }`}
          >
            {m === 'paste' ? 'Paste Text' : 'Upload File'}
          </button>
        ))}
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {sharedFieldsUI}

        {/* Mode-specific input */}
        {mode === 'paste' ? (
          <div>
            <label className="block text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium mb-2">Content *</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Paste the full document text here. Separate sections with blank lines for best chunking results."
              rows={12}
              className="w-full px-3.5 py-2.5 bg-[#FAF9F5] border border-[#D4E2FF] rounded-xl text-[13px] text-[#181D23] placeholder:text-[#96989B] outline-none focus:border-[#181D23] transition-colors resize-none font-mono"
            />
            <p className="text-[11px] text-[#96989B] mt-1.5">
              {content.length > 0
                ? `${content.length} chars · ~${Math.ceil(content.length / 500)} chunks estimated`
                : 'Text will be split into searchable chunks automatically.'}
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-[11px] uppercase tracking-[0.15em] text-[#5A6475] font-medium mb-2">File *</label>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed transition-colors py-10 px-6 text-center ${
                dragOver
                  ? 'border-[#181D23] bg-[#F5F3FF]'
                  : file
                  ? 'border-[#181D23] bg-[#FAF9F5]'
                  : 'border-[#A8C4FF] bg-[#FAF9F5] hover:border-[#181D23]'
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".txt,.md,.pdf,.csv"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) applyFile(f); }}
              />

              {file ? (
                <div className="flex flex-col items-center gap-2">
                  <FileUp size={22} className="text-[#181D23]" />
                  <p className="text-[13px] font-medium text-[#181D23]">{file.name}</p>
                  <p className="text-[11px] text-[#96989B]">{fmtBytes(file.size)}</p>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setFile(null); }}
                    className="text-[11px] text-[#5A6475] underline mt-1"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={22} className="text-[#96989B]" />
                  <p className="text-[13px] font-medium text-[#3D4451]">Drop file here or click to browse</p>
                  <p className="text-[11px] text-[#96989B]">PDF, TXT, MD, CSV — max 5 MB</p>
                </div>
              )}
            </div>

            {/* Supported formats note */}
            <div className="mt-3 flex items-start gap-2 p-3 bg-[#FAF9F5] border border-[#D4E2FF] rounded-xl">
              <AlertCircle size={13} className="text-[#96989B] mt-0.5 flex-shrink-0" />
              <p className="text-[11px] text-[#5A6475] leading-relaxed">
                Text is extracted automatically and split into searchable chunks. Aria and the other agents will be able to reference this content immediately after upload.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
            <AlertCircle size={13} className="text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-[12px] text-red-600">{error}</p>
          </div>
        )}
      </form>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-[#D4E2FF] flex items-center justify-between gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-lg text-[13px] text-[#5A6475] border border-[#D4E2FF] hover:bg-[#FAF9F5] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit as unknown as React.MouseEventHandler<HTMLButtonElement>}
          disabled={submitting || !canSubmit}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-[13px] font-medium bg-[#181D23] text-white hover:bg-[#2A1F50] transition-colors disabled:opacity-40"
        >
          {submitting ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {submitting
            ? mode === 'upload' ? 'Uploading…' : 'Saving…'
            : mode === 'upload' ? 'Upload & Process' : 'Add Document'}
        </button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function KnowledgeBasePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId]         = useState<string | null>(urlUserId);
  const [profile, setProfile]       = useState<StaffProfile | null>(null);
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [documents, setDocuments]   = useState<KnowledgeDocument[]>([]);
  const [stats, setStats]           = useState<KnowledgeStats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');
  const [activeCat, setActiveCat]   = useState<string | null>(null);
  const [addPanelOpen, setAddPanel] = useState(false);

  const brandColor = profile?.brandColor || '#181D23';

  const loadData = useCallback(async (uid: string, silent = false) => {
    if (!silent) setLoading(true); else setRefreshing(true);

    const [profileRes, kbRes] = await Promise.all([
      getStaffProfile('clinic', uid),
      getKnowledgeData(),
    ]);

    if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
    if (kbRes.success) {
      setCategories(kbRes.categories || []);
      setDocuments(kbRes.documents || []);
      setStats(kbRes.stats || null);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);
      await loadData(uid);
    })();
  }, [urlUserId, router, loadData]);

  const handleDelete = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  const handleAddSuccess = useCallback(() => {
    setAddPanel(false);
    if (userId) loadData(userId, true);
  }, [userId, loadData]);

  const filtered = documents.filter(d => {
    const matchCat = !activeCat || d.category_id === activeCat;
    const matchQ   = !search || (d.title || d.file_name).toLowerCase().includes(search.toLowerCase());
    return matchCat && matchQ;
  });

  if (loading || !profile) {
    return (
      <div className="min-h-screen nav-offset bg-[#F8FAFF] flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-[#A8C4FF]"
        />
      </div>
    );
  }

  const statCards = [
    { label: 'Documents',  value: stats?.total_documents  ?? 0, icon: FileText },
    { label: 'Categories', value: stats?.total_categories ?? 0, icon: Layers },
    { label: 'Chunks',     value: stats?.total_chunks     ?? 0, icon: BookOpen },
    { label: 'Processed',  value: stats?.completed_documents ?? 0, icon: CheckCircle2 },
  ];

  return (
    <div className="min-h-screen nav-offset">
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Knowledge" />

      <AnimatePresence>
        {addPanelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAddPanel(false)}
              className="fixed inset-0 bg-black/20 z-40"
            />
            <AddDocumentPanel
              categories={categories}
              onClose={() => setAddPanel(false)}
              onSuccess={handleAddSuccess}
            />
          </>
        )}
      </AnimatePresence>

      <div className="min-h-screen flex">

        {/* ── MAIN ── */}
        <main className="flex-1 px-8 py-10 min-w-0">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#96989B] mb-2">Knowledge Base</p>
                <h1 className="text-[26px] font-semibold tracking-tight text-[#181D23]">Document Library</h1>
                <p className="text-[13px] text-[#5A6475] mt-1">Clinic protocols, procedures and reference documents powering Aria.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => userId && loadData(userId, true)}
                  disabled={refreshing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] text-[#5A6475] bg-[#FAF7F2] border border-[#EBE5FF] hover:bg-[#FAF9F5] transition-colors"
                >
                  <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                  Refresh
                </button>
                <button
                  onClick={() => setAddPanel(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium bg-[#181D23] text-white hover:bg-[#2A1F50] transition-colors"
                >
                  <Plus size={13} />
                  Add Document
                </button>
              </div>
            </div>
          </motion.div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {statCards.map((s, i) => (
              <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
                <StatCard label={s.label} value={s.value} icon={s.icon} />
              </motion.div>
            ))}
          </div>

          {/* Search + filter */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex items-center gap-3 mb-6 flex-wrap"
          >
            <div className="flex items-center gap-2 flex-1 min-w-[200px] px-3.5 py-2.5 bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl">
              <Search size={14} className="text-[#96989B] flex-shrink-0" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search documents…"
                className="flex-1 bg-transparent text-[13px] text-[#181D23] placeholder:text-[#96989B] outline-none"
              />
            </div>
            <button
              onClick={() => setActiveCat(null)}
              className={`px-3.5 py-2.5 rounded-xl text-[12px] border transition-colors whitespace-nowrap ${
                !activeCat ? 'bg-[#1A1035] text-[#FAF7F2] border-[#1A1035]' : 'bg-[#FAF7F2] border-[#EBE5FF] text-[#524D66] hover:border-[#1A1035] hover:text-[#1A1035]'
              }`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCat(cat.id)}
                className={`px-3.5 py-2.5 rounded-xl text-[12px] border transition-colors whitespace-nowrap ${
                  activeCat === cat.id ? 'bg-[#1A1035] text-[#FAF7F2] border-[#1A1035]' : 'bg-[#FAF7F2] border-[#EBE5FF] text-[#524D66] hover:border-[#1A1035] hover:text-[#1A1035]'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </motion.div>

          {/* Document list */}
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl px-5 py-2"
          >
            {filtered.length === 0 ? (
              <div className="py-12 text-center">
                <BookOpen size={24} className="mx-auto mb-3 text-[#96989B]" />
                <p className="text-[13px] text-[#5A6475]">
                  {search || activeCat ? 'No documents match your filter' : 'No documents added yet'}
                </p>
                {!search && !activeCat && (
                  <p className="text-[12px] text-[#96989B] mt-1">
                    Click &quot;Add Document&quot; to upload clinic protocols and procedures.
                  </p>
                )}
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filtered.map(doc => (
                  <DocumentRow key={doc.id} doc={doc} onDelete={handleDelete} />
                ))}
              </AnimatePresence>
            )}
          </motion.div>
        </main>

        {/* ── SIDEBAR ── */}
        <aside className="w-[240px] flex-shrink-0 px-6 py-10 border-l border-[#D4E2FF]">

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="mb-8">
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#96989B] font-medium mb-3">Categories</h3>
            <div className="space-y-1">
              {categories.length === 0 ? (
                <p className="text-[12px] text-[#5A6475] px-2">No categories</p>
              ) : (
                categories.map(cat => {
                  const count = documents.filter(d => d.category_id === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCat(activeCat === cat.id ? null : cat.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[12px] transition-colors text-left ${
                        activeCat === cat.id ? 'bg-[#181D23] text-white' : 'text-[#5A6475] hover:bg-[#FAF9F5] hover:text-[#3D4451]'
                      }`}
                    >
                      <span className="truncate">{cat.name}</span>
                      <span className={`text-[10px] ml-2 flex-shrink-0 ${activeCat === cat.id ? 'text-white/60' : 'text-[#96989B]'}`}>{count}</span>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>

          {/* How agents use the KB */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24 }} className="mb-8">
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#96989B] font-medium mb-3">Agent Access</h3>
            <div className="space-y-2">
              {[
                { name: 'EWC', key: 'primary_agent', desc: 'Orchestration & ops' },
                { name: 'Orion', key: 'sales_agent', desc: 'Patient acquisition' },
                { name: 'Aria', key: 'crm_agent', desc: 'Patient retention' },
              ].map(a => (
                <div key={a.key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#FAF9F5] border border-[#D4E2FF]">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#181D23] flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-[#181D23]">{a.name}</p>
                    <p className="text-[10px] text-[#96989B] truncate">{a.desc}</p>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-[#96989B] px-1 pt-1 leading-relaxed">
                All agents search this library in real time when answering questions.
              </p>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#96989B] font-medium mb-3">Quick Actions</h3>
            <div className="space-y-1">
              {[
                { label: 'Ask Aria about KB', href: `/staff/chat?userId=${userId}` },
                { label: 'View Automations',  href: `/staff/automations?userId=${userId}` },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => router.push(a.href)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-[12px] text-[#5A6475] hover:text-[#3D4451] hover:bg-[#FAF9F5] transition-all text-left"
                >
                  <Tag size={12} className="flex-shrink-0" />
                  {a.label}
                  <ChevronRight size={11} className="ml-auto opacity-40" />
                </button>
              ))}
            </div>
          </motion.div>
        </aside>
      </div>
    </div>
  );
}
