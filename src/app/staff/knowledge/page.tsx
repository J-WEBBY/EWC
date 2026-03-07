'use client';

// =============================================================================
// Knowledge Base — Treatment protocols, SOPs, FAQs, CQC guidance
// Light design system — AI-powered search + inline viewer
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getKnowledgeBase,
  searchKnowledge,
  getAIDocumentSummary,
  markHelpful,
} from '@/lib/actions/knowledge';
import type { KnowledgeDocument, KnowledgeCategory, KnowledgeStats } from '@/lib/actions/knowledge';
import { getStaffProfile, getLatestTenantAndUser } from '@/lib/actions/staff-onboarding';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// CONSTANTS
// =============================================================================

const ACCENT = '#0058E6';

const CATEGORY_META: Record<KnowledgeCategory, { label: string; color: string; icon: string }> = {
  treatment_protocols: { label: 'Treatment Protocols', color: '#0058E6', icon: '◈' },
  faqs:               { label: 'FAQs',                 color: '#00A693', icon: '◈' },
  sops:               { label: 'SOPs',                 color: '#2563EB', icon: '◈' },
  cqc_guidance:       { label: 'CQC Guidance',         color: '#D8A600', icon: '◈' },
  consent_templates:  { label: 'Consent Templates',    color: '#059669', icon: '◈' },
  aftercare:          { label: 'Aftercare',             color: '#0284C7', icon: '◈' },
  contraindications:  { label: 'Contraindications',    color: '#DC2626', icon: '◈' },
  pricing:            { label: 'Pricing',               color: '#96989B', icon: '◈' },
};

const STATUS_STYLE: Record<KnowledgeDocument['status'], { bg: string; border: string; text: string; label: string }> = {
  published:    { bg: 'rgba(5,150,105,0.07)',   border: 'rgba(5,150,105,0.25)',   text: '#059669', label: 'Published' },
  draft:        { bg: 'rgba(217,119,6,0.07)',   border: 'rgba(217,119,6,0.25)',   text: '#D8A600', label: 'Draft' },
  archived:     { bg: 'rgba(110,102,136,0.06)', border: '#EBE5FF',                text: '#96989B', label: 'Archived' },
  under_review: { bg: 'rgba(37,99,235,0.07)',   border: 'rgba(37,99,235,0.25)',   text: '#2563EB', label: 'Under Review' },
};

const FALLBACK: StaffProfile = {
  userId: '', firstName: 'Staff', lastName: '', email: '',
  jobTitle: null, departmentName: null, departmentId: null,
  roleName: null, isAdmin: false, isOwner: false,
  companyName: 'Edgbaston Wellness Clinic',
  aiName: 'Aria', brandColor: '#0058E6', logoUrl: null,
  industry: null, reportsTo: null, teamSize: 0,
};

// =============================================================================
// HELPERS
// =============================================================================

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Simple markdown-ish renderer (for doc viewer)
function renderContent(md: string) {
  const lines = md.split('\n');
  return lines.map((line, i) => {
    if (line.startsWith('## ')) return <h2 key={i} style={{ fontSize: 15, fontWeight: 800, color: '#181D23', margin: '18px 0 8px', letterSpacing: '-0.02em' }}>{line.slice(3)}</h2>;
    if (line.startsWith('### ')) return <h3 key={i} style={{ fontSize: 13, fontWeight: 700, color: '#181D23', margin: '14px 0 6px' }}>{line.slice(4)}</h3>;
    if (line.startsWith('**') && line.endsWith('**')) return <p key={i} style={{ fontSize: 12, fontWeight: 700, color: '#181D23', margin: '6px 0' }}>{line.slice(2, -2)}</p>;
    if (line.startsWith('- ')) return <div key={i} style={{ display: 'flex', gap: 8, margin: '3px 0' }}><span style={{ color: '#96989B', flexShrink: 0 }}>–</span><span style={{ fontSize: 12, color: '#3D4451' }}>{line.slice(2)}</span></div>;
    if (line.startsWith('| ') && line.includes(' | ')) {
      const cells = line.split('|').filter(Boolean).map(c => c.trim());
      return <div key={i} style={{ display: 'flex', gap: 0, borderBottom: '1px solid #EBE5FF' }}>
        {cells.map((c, j) => (
          <span key={j} style={{ flex: 1, fontSize: 11, padding: '4px 8px', color: j === 0 ? '#181D23' : '#3D4451', fontWeight: j === 0 ? 600 : 400, background: i === 1 ? 'rgba(0,88,230,0.05)' : 'transparent' }}>{c}</span>
        ))}
      </div>;
    }
    if (!line.trim()) return <div key={i} style={{ height: 8 }} />;
    return <p key={i} style={{ fontSize: 12, color: '#3D4451', lineHeight: 1.65, margin: '2px 0' }}>{line}</p>;
  });
}

// =============================================================================
// DOCUMENT CARD
// =============================================================================

function DocCard({
  doc,
  onSelect,
  accentColor,
}: {
  doc: KnowledgeDocument;
  onSelect: (d: KnowledgeDocument) => void;
  accentColor: string;
}) {
  const [hovered, setHovered] = useState(false);
  const meta = CATEGORY_META[doc.category];
  const status = STATUS_STYLE[doc.status];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onSelect(doc)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? meta.color + '40' : '#EBE5FF'}`,
        borderRadius: 16,
        padding: '18px 20px',
        background: hovered ? `${meta.color}05` : 'transparent',
        cursor: 'pointer',
        transition: 'all 0.2s',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Left accent */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: hovered ? meta.color : 'transparent',
        borderRadius: '3px 0 0 3px',
        transition: 'background 0.2s',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
              background: `${meta.color}12`, color: meta.color,
              textTransform: 'uppercase', letterSpacing: '0.12em',
            }}>
              {meta.label}
            </span>
            {doc.cqc_relevant && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)',
                color: '#D8A600', letterSpacing: '0.12em',
              }}>
                CQC
              </span>
            )}
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
              background: status.bg, border: `1px solid ${status.border}`, color: status.text,
            }}>
              {status.label}
            </span>
          </div>

          <h3 style={{ fontSize: 13, fontWeight: 800, color: '#181D23', letterSpacing: '-0.02em', margin: '0 0 6px' }}>
            {doc.title}
          </h3>
          <p style={{ fontSize: 11, color: '#5A6475', lineHeight: 1.5, margin: 0 }}>
            {doc.summary}
          </p>

          <div style={{ display: 'flex', gap: 12, marginTop: 10, alignItems: 'center' }}>
            <span style={{ fontSize: 10, color: '#96989B' }}>By {doc.author}</span>
            {doc.last_reviewed && (
              <span style={{ fontSize: 10, color: '#96989B' }}>Reviewed {fmtDate(doc.last_reviewed)}</span>
            )}
            <span style={{ fontSize: 10, color: '#96989B', marginLeft: 'auto' }}>
              {doc.view_count} views · {doc.helpful_count} helpful
            </span>
          </div>

          {/* Tags */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {doc.tags.slice(0, 4).map(tag => (
              <span key={tag} style={{
                fontSize: 9, padding: '1px 6px', borderRadius: 4,
                background: 'rgba(0,88,230,0.06)', color: accentColor,
              }}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Arrow */}
        <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2, opacity: hovered ? 1 : 0.3, transition: 'opacity 0.2s' }}>
          <path d="M6 4l4 4-4 4" stroke={meta.color} strokeWidth={1.5} strokeLinecap="round" />
        </svg>
      </div>
    </motion.div>
  );
}

// =============================================================================
// DOCUMENT VIEWER
// =============================================================================

function DocViewer({
  doc,
  onClose,
  tenantId,
  accentColor,
}: {
  doc: KnowledgeDocument;
  onClose: () => void;
  tenantId: string;
  accentColor: string;
}) {
  const [question, setQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [helpful, setHelpful] = useState(false);
  const meta = CATEGORY_META[doc.category];

  async function handleAIAsk() {
    if (!question.trim()) return;
    setAiLoading(true);
    const res = await getAIDocumentSummary(tenantId, doc.id, question);
    if (res.success && res.data) setAiAnswer(res.data.answer);
    setAiLoading(false);
  }

  async function handleHelpful() {
    await markHelpful(tenantId, doc.id);
    setHelpful(true);
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      style={{
        position: 'sticky', top: 32,
        border: '1px solid #EBE5FF', borderRadius: 20,
        background: '#fff',
        overflow: 'hidden',
        maxHeight: 'calc(100vh - 160px)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid #EBE5FF', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <span style={{
                fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                background: `${meta.color}12`, color: meta.color,
                textTransform: 'uppercase', letterSpacing: '0.12em',
              }}>
                {meta.label}
              </span>
              {doc.cqc_relevant && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 5, background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)', color: '#D8A600' }}>CQC</span>
              )}
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: '#181D23', letterSpacing: '-0.025em', margin: 0 }}>{doc.title}</h2>
            <p style={{ fontSize: 11, color: '#5A6475', marginTop: 6 }}>
              By {doc.author} · Updated {fmtDate(doc.updated_at)}
              {doc.last_reviewed && ` · Reviewed ${fmtDate(doc.last_reviewed)}`}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: '#96989B', flexShrink: 0 }}
          >
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* AI Ask */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAIAsk()}
            placeholder="Ask AI about this document…"
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8,
              border: '1px solid #EBE5FF', background: '#FAF7F2',
              fontSize: 11, color: '#181D23', outline: 'none',
            }}
          />
          <button
            onClick={handleAIAsk}
            disabled={aiLoading || !question.trim()}
            style={{
              padding: '8px 14px', borderRadius: 8,
              background: accentColor, color: '#fff',
              border: 'none', fontSize: 11, fontWeight: 700,
              cursor: aiLoading ? 'wait' : 'pointer',
              opacity: aiLoading || !question.trim() ? 0.5 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {aiLoading ? '…' : 'Ask'}
          </button>
        </div>

        {/* AI Answer */}
        <AnimatePresence>
          {aiAnswer && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                marginTop: 10, padding: '12px 14px',
                background: `${accentColor}08`, border: `1px solid ${accentColor}25`,
                borderRadius: 10,
              }}>
                <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: accentColor, marginBottom: 6 }}>AI Answer</p>
                <p style={{ fontSize: 12, color: '#3D4451', lineHeight: 1.65 }}>{aiAnswer}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {renderContent(doc.content)}
      </div>

      {/* Footer */}
      <div style={{ padding: '14px 24px', borderTop: '1px solid #EBE5FF', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, color: '#96989B' }}>{doc.view_count} views</span>
        <button
          onClick={handleHelpful}
          disabled={helpful}
          style={{
            padding: '6px 14px', borderRadius: 8,
            background: helpful ? 'rgba(5,150,105,0.08)' : 'transparent',
            border: `1px solid ${helpful ? 'rgba(5,150,105,0.25)' : '#EBE5FF'}`,
            color: helpful ? '#059669' : '#96989B',
            fontSize: 11, fontWeight: 700, cursor: helpful ? 'default' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {helpful ? 'Marked helpful' : 'Helpful?'}
        </button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// STATS BAR
// =============================================================================

function StatsBar({ stats, accentColor }: { stats: KnowledgeStats; accentColor: string }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid #EBE5FF' }}>
      {[
        { label: 'Total Documents', value: stats.total },
        { label: 'CQC Relevant', value: stats.cqc_relevant },
        { label: 'Under Review', value: stats.under_review },
        { label: 'Draft', value: stats.draft },
      ].map((m, i) => (
        <div key={m.label} style={{
          flex: 1, padding: '20px 24px',
          borderRight: i < 3 ? '1px solid #EBE5FF' : 'none',
        }}>
          <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 4 }}>{m.label}</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: '#181D23', letterSpacing: '-0.04em' }}>{m.value}</p>
        </div>
      ))}
      <div style={{ flex: 1, padding: '20px 24px' }}>
        <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 4 }}>Categories</p>
        <p style={{ fontSize: 28, fontWeight: 900, color: accentColor, letterSpacing: '-0.04em' }}>
          {Object.keys(CATEGORY_META).length}
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function KnowledgeBasePage() {
  const params = useSearchParams();
  const userId = params.get('userId') ?? '';

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<KnowledgeDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<KnowledgeCategory | null>(null);
  const [tenantId] = useState('clinic');
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadDocs = useCallback(async (cat?: KnowledgeCategory | null) => {
    setLoading(true);
    const [, profileRes, kbRes] = await Promise.all([
      getLatestTenantAndUser(),
      getStaffProfile('clinic', userId),
      getKnowledgeBase('clinic', cat ?? undefined),
    ]);
    setProfile(profileRes.success && profileRes.data ? profileRes.data.profile : FALLBACK);
    if (kbRes.success && kbRes.data) {
      setDocuments(kbRes.data.documents);
      setStats(kbRes.data.stats);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  function handleCategoryFilter(cat: KnowledgeCategory | null) {
    setActiveCategory(cat);
    setSearchQuery('');
    loadDocs(cat);
  }

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (searchRef.current) clearTimeout(searchRef.current);
    if (!q.trim()) {
      loadDocs(activeCategory);
      return;
    }
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchKnowledge(tenantId, q);
      if (res.success && res.data) setDocuments(res.data.map(r => r.document));
      setSearching(false);
    }, 300);
  }

  const accentColor = profile?.brandColor ?? ACCENT;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#FAF7F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 32, height: 32, border: '2px solid #EBE5FF', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 12, color: '#96989B' }}>Loading knowledge base…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAF7F2' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={accentColor} currentPath="Knowledge Base" />}

      <main style={{ paddingLeft: 'var(--nav-w, 240px)', minHeight: '100vh' }}>
        {/* ── Header ── */}
        <div style={{ padding: '40px 40px 0', borderBottom: '1px solid #EBE5FF' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', paddingBottom: 24 }}>
            <div>
              <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B', marginBottom: 6 }}>Clinical</p>
              <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: '#181D23', lineHeight: 1 }}>Knowledge Base</h1>
              <p style={{ fontSize: 13, color: '#3D4451', marginTop: 6 }}>
                Treatment protocols, SOPs, FAQs and CQC guidance — AI-searchable
              </p>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', width: 340 }}>
              <svg width={14} height={14} viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#96989B' }}>
                <circle cx={6} cy={6} r={4.5} stroke="currentColor" strokeWidth={1.5} />
                <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
              </svg>
              <input
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Search protocols, SOPs, FAQs…"
                style={{
                  width: '100%', padding: '10px 14px 10px 34px',
                  borderRadius: 10, border: '1px solid #EBE5FF',
                  background: '#fff', fontSize: 12, color: '#181D23',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              {searching && (
                <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid #EBE5FF', borderTopColor: accentColor, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              )}
            </div>
          </div>

          {/* Category filters */}
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 0 }}>
            <button
              onClick={() => handleCategoryFilter(null)}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700,
                background: activeCategory === null ? accentColor : 'transparent',
                color: activeCategory === null ? '#fff' : '#96989B',
                transition: 'all 0.2s', flexShrink: 0,
              }}
            >
              All
            </button>
            {(Object.keys(CATEGORY_META) as KnowledgeCategory[]).map(cat => {
              const meta = CATEGORY_META[cat];
              const isActive = activeCategory === cat;
              return (
                <button
                  key={cat}
                  onClick={() => handleCategoryFilter(cat)}
                  style={{
                    padding: '6px 14px', borderRadius: 20, border: `1px solid ${isActive ? meta.color : '#EBE5FF'}`,
                    cursor: 'pointer', fontSize: 11, fontWeight: 700,
                    background: isActive ? `${meta.color}12` : 'transparent',
                    color: isActive ? meta.color : '#96989B',
                    transition: 'all 0.2s', flexShrink: 0,
                  }}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Stats ── */}
        {stats && <StatsBar stats={stats} accentColor={accentColor} />}

        {/* ── Content ── */}
        <div style={{ padding: '32px 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: selectedDoc ? '1fr 420px' : '1fr', gap: 28 }}>

            {/* Document list */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#96989B' }}>
                  {documents.length} {searchQuery ? 'Results' : 'Documents'}
                  {activeCategory ? ` — ${CATEGORY_META[activeCategory].label}` : ''}
                </p>
                {searchQuery && (
                  <button
                    onClick={() => { setSearchQuery(''); loadDocs(activeCategory); }}
                    style={{ fontSize: 11, color: accentColor, background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 700 }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {documents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#96989B' }}>
                  <p style={{ fontSize: 24, marginBottom: 8 }}>○</p>
                  <p style={{ fontSize: 13 }}>No documents found{searchQuery ? ` for "${searchQuery}"` : ''}.</p>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: selectedDoc ? '1fr' : '1fr 1fr', gap: 12 }}>
                  <AnimatePresence>
                    {documents.map(doc => (
                      <DocCard
                        key={doc.id}
                        doc={doc}
                        onSelect={setSelectedDoc}
                        accentColor={accentColor}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Document viewer */}
            <AnimatePresence>
              {selectedDoc && (
                <DocViewer
                  key={selectedDoc.id}
                  doc={selectedDoc}
                  onClose={() => setSelectedDoc(null)}
                  tenantId={tenantId}
                  accentColor={accentColor}
                />
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
