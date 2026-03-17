'use client';

import React, { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Plus, Trash2, Upload, FileText, Image as ImgIcon, File,
  CheckCircle2, Clock, X, Send, User,
  Star, MessageSquare, Eye, Download, RefreshCw,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';
import type { StaffGoal } from '@/lib/actions/kpi-goals';
import type { AgendaEvidence, AgendaTimelineEntry } from '@/lib/actions/agenda-hub';
import {
  addTimelineNote, uploadEvidence, deleteEvidence,
  updateAgendaMetrics, sendAgendaReport,
} from '@/lib/actions/agenda-hub';
import type { ActiveUser } from '@/lib/actions/compliance';

// ── Tokens ────────────────────────────────────────────────────────────────────
const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';
const GOLD   = '#D8A600';

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d: string) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(ts: string) {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + fmtTime(ts);
}

interface AgendaMeta {
  priority:           string;
  task_type:          string;
  event_time:         string;
  duration_mins:      number;
  treatment_type:     string;
  patient_name:       string;
  compliance_area:    string;
  category_other:     string;
  closed:             boolean;
  // Clinical
  revenue_gbp:        number;
  payment_status:     string;
  satisfaction_rating: number;
  satisfaction_note:  string;
  clinical_outcome:   string;
  follow_up_required: boolean;
  follow_up_date:     string;
  complications:      string;
  // Compliance
  compliance_status:  string;
  regulatory_ref:     string;
  cqc_key_question:   string;
  cert_issue_date:    string;
  cert_expiry_date:   string;
  next_review_date:   string;
  // Operational
  operational_area:   string;
  impact_level:       string;
  actual_duration_mins: number;
  outcome_quality:    string;
  blockers:           string;
  improvements:       string;
  // Personal
  learnings:          string;
}

function getMeta(goal: StaffGoal): AgendaMeta {
  const defaults: AgendaMeta = {
    priority: 'medium', task_type: '', event_time: '', duration_mins: 60,
    treatment_type: '', patient_name: '', compliance_area: '', category_other: '', closed: false,
    revenue_gbp: 0, payment_status: '', satisfaction_rating: 0, satisfaction_note: '',
    clinical_outcome: '', follow_up_required: false, follow_up_date: '', complications: '',
    compliance_status: '', regulatory_ref: '', cqc_key_question: '',
    cert_issue_date: '', cert_expiry_date: '', next_review_date: '',
    operational_area: '', impact_level: '', actual_duration_mins: 0,
    outcome_quality: '', blockers: '', improvements: '', learnings: '',
  };
  try { if (goal.notes) return { ...defaults, ...JSON.parse(goal.notes) }; } catch { /* */ }
  return defaults;
}

function isOverdue(g: StaffGoal) {
  if (g.status === 'completed') return false;
  return !!g.due_date && new Date(g.due_date) < new Date();
}

function categoryColor(cat: string) {
  return cat === 'clinical' ? BLUE : cat === 'compliance' ? ORANGE : cat === 'operational' ? BLUE : MUTED;
}

function categoryLabel(cat: string, other?: string) {
  if (cat === 'personal') return other || 'Other';
  return cat.charAt(0).toUpperCase() + cat.slice(1);
}

const NOTE_TYPE_OPTS = [
  { value: 'update',      label: 'Update',      color: BLUE   },
  { value: 'blocker',     label: 'Blocker',     color: RED    },
  { value: 'observation', label: 'Observation', color: GOLD   },
  { value: 'completion',  label: 'Completion',  color: GREEN  },
] as const;

const EVIDENCE_TYPE_OPTS = [
  { value: 'photo',       label: 'Photo proof'  },
  { value: 'certificate', label: 'Certificate'  },
  { value: 'document',    label: 'Document'     },
  { value: 'screenshot',  label: 'Screenshot'   },
  { value: 'other',       label: 'Other'        },
];

// ── File icon ─────────────────────────────────────────────────────────────────
function FileIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/'))      return <ImgIcon  size={14} style={{ color: BLUE }} />;
  if (mime === 'application/pdf')     return <FileText size={14} style={{ color: RED }} />;
  return <File size={14} style={{ color: MUTED }} />;
}

// ── Star rating ───────────────────────────────────────────────────────────────
function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 1 }}>
          <Star size={18}
            fill={(hover || value) >= n ? GOLD : 'none'}
            style={{ color: (hover || value) >= n ? GOLD : BORDER }} />
        </button>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AgendaHubClient({
  profile, userId, tenantId, agenda,
  initialEvidence, initialTimeline, users,
}: {
  profile:          StaffProfile;
  userId:           string;
  tenantId:         string;
  agenda:           StaffGoal;
  initialEvidence:  AgendaEvidence[];
  initialTimeline:  AgendaTimelineEntry[];
  users:            ActiveUser[];
}) {
  const router = useRouter();
  const brandColor = profile.brandColor || BLUE;
  const meta = getMeta(agenda);
  const catColor = categoryColor(agenda.category);
  const over = isOverdue(agenda);
  const done = agenda.status === 'completed';

  // Timeline state
  const [timeline, setTimeline] = useState<AgendaTimelineEntry[]>(initialTimeline);
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState<'update'|'blocker'|'observation'|'completion'>('update');
  const [addingNote, setAddingNote] = useState(false);
  const [savingNote, setSavingNote] = useState(false);

  // Evidence state
  const [evidence, setEvidence] = useState<AgendaEvidence[]>(initialEvidence);
  const [uploading, setUploading] = useState(false);
  const [uploadCaption, setUploadCaption] = useState('');
  const [uploadType, setUploadType] = useState('photo');
  const [previewEv, setPreviewEv] = useState<AgendaEvidence | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Metrics state (category-specific)
  const [metrics, setMetrics] = useState<Partial<AgendaMeta>>(meta);
  const [savingMetrics, setSavingMetrics] = useState(false);

  // Report state
  const [showReport, setShowReport] = useState(false);
  const [reportRecipient, setReportRecipient] = useState('');
  const [reportNote, setReportNote] = useState('');
  const [sendingReport, setSendingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);

  // Toast
  const [toast, setToast] = useState('');
  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 3000); }

  const upd = useCallback((patch: Partial<AgendaMeta>) => setMetrics(m => ({ ...m, ...patch })), []);

  // ── Note handlers ──────────────────────────────────────────────────────────
  async function handleAddNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    const res = await addTimelineNote(agenda.id, noteText, noteType, userId);
    if (res.success && res.entry) {
      setTimeline(t => [...t, res.entry!]);
      setNoteText('');
      setAddingNote(false);
    }
    setSavingNote(false);
  }

  // ── Evidence upload ────────────────────────────────────────────────────────
  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_200_000) { showToast('File too large. Maximum 2MB.'); return; }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const b64 = (ev.target?.result as string).split(',')[1];
      const res = await uploadEvidence(
        agenda.id, file.name, file.type, b64, file.size,
        uploadCaption, uploadType, userId,
      );
      if (res.success && res.evidence) {
        setEvidence(ev2 => [...ev2, res.evidence!]);
        setUploadCaption('');
        showToast('Evidence uploaded');
      } else {
        showToast('Upload failed. Please try again.');
      }
      setUploading(false);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function handleDeleteEvidence(id: string) {
    const res = await deleteEvidence(id);
    if (res.success) setEvidence(ev => ev.filter(e => e.id !== id));
  }

  // ── Metrics save ───────────────────────────────────────────────────────────
  async function handleSaveMetrics() {
    setSavingMetrics(true);
    const res = await updateAgendaMetrics(agenda.id, metrics as Record<string, unknown>);
    if (res.success) showToast('Details saved');
    setSavingMetrics(false);
  }

  // ── Send report ────────────────────────────────────────────────────────────
  async function handleSendReport() {
    if (!reportRecipient) return;
    setSendingReport(true);
    const res = await sendAgendaReport(agenda.id, reportRecipient, reportNote, userId);
    if (res.success) {
      setReportSent(true);
      showToast('Report sent');
      setTimeout(() => { setShowReport(false); setReportSent(false); setReportNote(''); setReportRecipient(''); }, 1800);
    } else {
      showToast(res.error ?? 'Failed to send report');
    }
    setSendingReport(false);
  }

  const otherUsers = users.filter(u => u.id !== userId);

  // ── INP helper ─────────────────────────────────────────────────────────────
  const INP: React.CSSProperties = {
    width: '100%', padding: '8px 11px', borderRadius: 9,
    border: `1px solid ${BORDER}`, background: 'transparent',
    fontSize: 12, color: NAVY, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
  };
  const SEL: React.CSSProperties = { ...INP, appearance: 'none', WebkitAppearance: 'none' };
  function LBL({ children }: { children: React.ReactNode }) {
    return <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em', fontWeight: 600, color: MUTED, marginBottom: 5 }}>{children}</p>;
  }

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      <StaffNav profile={profile} userId={userId} tenantId={tenantId} brandColor={brandColor} currentPath="Staff KPIs" />

      <div className="nav-offset">

        {/* ── Header ── */}
        <div className="flex items-start justify-between px-10 py-6"
          style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <button
              onClick={() => router.push(`/staff/kpis?userId=${userId}&tenantId=${tenantId}`)}
              className="flex items-center gap-1.5 mb-3 transition-opacity"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, fontSize: 11 }}
              onMouseEnter={e => (e.currentTarget.style.color = SEC)}
              onMouseLeave={e => (e.currentTarget.style.color = MUTED)}>
              <ArrowLeft size={12} /> Staff KPIs
            </button>
            <div className="flex items-center gap-3 mb-2">
              <span style={{
                fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.22em',
                fontWeight: 700, color: catColor,
              }}>
                {categoryLabel(agenda.category, meta.category_other)}
              </span>
              {meta.task_type && <span style={{ fontSize: 9, color: MUTED }}>· {meta.task_type}</span>}
              <span style={{
                fontSize: 9, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                background: done ? `${GREEN}14` : over ? `${RED}14` : `${BLUE}14`,
                color: done ? GREEN : over ? RED : BLUE,
              }}>
                {done ? 'Completed' : over ? 'Overdue' : agenda.status}
              </span>
            </div>
            <h1 className="text-[26px] font-black tracking-[-0.035em] leading-tight" style={{ color: NAVY }}>
              {agenda.title}
            </h1>
            {agenda.description && (
              <p style={{ fontSize: 12, color: TER, marginTop: 6, maxWidth: 560 }}>{agenda.description}</p>
            )}
            <div className="flex items-center gap-4 mt-3 flex-wrap">
              {agenda.due_date && (
                <span style={{ fontSize: 11, color: over ? RED : TER }}>
                  <Clock size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {fmtDate(agenda.due_date)}{meta.event_time ? ` · ${meta.event_time}` : ''}
                </span>
              )}
              {agenda.owner_name && (
                <span style={{ fontSize: 11, color: TER }}>
                  <User size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {agenda.owner_name}
                </span>
              )}
              {agenda.assigner_name && (
                <span style={{ fontSize: 11, color: MUTED }}>from {agenda.assigner_name}</span>
              )}
              {meta.priority && meta.priority !== 'medium' && (
                <span style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 999, fontWeight: 600,
                  background: meta.priority === 'high' ? `${RED}14` : `${ORANGE}14`,
                  color: meta.priority === 'high' ? RED : ORANGE,
                  textTransform: 'uppercase', letterSpacing: '0.16em',
                }}>
                  {meta.priority} priority
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 mt-1">
            {!done && (
              <button
                onClick={() => setShowReport(true)}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-semibold transition-all"
                style={{ background: `${BLUE}14`, border: `1px solid ${BLUE}28`, color: NAVY, cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = `${BLUE}24`)}
                onMouseLeave={e => (e.currentTarget.style.background = `${BLUE}14`)}>
                <Send size={12} style={{ color: BLUE }} /> Send Report
              </button>
            )}
            {done && (
              <button
                onClick={() => setShowReport(true)}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-semibold transition-all"
                style={{ background: `${GREEN}14`, border: `1px solid ${GREEN}28`, color: NAVY, cursor: 'pointer' }}>
                <Send size={12} style={{ color: GREEN }} /> Send Report
              </button>
            )}
          </div>
        </div>

        {/* ── Two-column layout ── */}
        <div className="grid grid-cols-12 min-h-screen">

          {/* ── LEFT: Timeline + Evidence ── */}
          <div className="col-span-7" style={{ borderRight: `1px solid ${BORDER}` }}>

            {/* Timeline */}
            <div style={{ borderBottom: `1px solid ${BORDER}` }}>
              <div className="flex items-center justify-between px-8 py-4"
                style={{ borderBottom: `1px solid ${BORDER}` }}>
                <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>
                  Activity Timeline
                </p>
                <button
                  onClick={() => setAddingNote(v => !v)}
                  className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-semibold transition-all"
                  style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25`, color: NAVY, cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.background = `${BLUE}1c`)}
                  onMouseLeave={e => (e.currentTarget.style.background = `${BLUE}10`)}>
                  <Plus size={11} style={{ color: BLUE }} /> Add Note
                </button>
              </div>

              {/* Add note form */}
              <AnimatePresence>
                {addingNote && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                    style={{ borderBottom: `1px solid ${BORDER}`, overflow: 'hidden' }}>
                    <div style={{ padding: '16px 32px' }}>
                      <div className="flex gap-2 mb-3">
                        {NOTE_TYPE_OPTS.map(o => (
                          <button key={o.value}
                            onClick={() => setNoteType(o.value as typeof noteType)}
                            style={{
                              fontSize: 9, padding: '3px 10px', borderRadius: 999, fontWeight: 600,
                              cursor: 'pointer', border: `1px solid`,
                              borderColor: noteType === o.value ? o.color : BORDER,
                              background: noteType === o.value ? `${o.color}16` : 'transparent',
                              color: noteType === o.value ? o.color : MUTED,
                              textTransform: 'uppercase', letterSpacing: '0.14em',
                            }}>
                            {o.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Add a note, observation or update..."
                        rows={3}
                        style={{ ...INP, resize: 'vertical', lineHeight: 1.5 }}
                      />
                      <div className="flex gap-2 mt-2 justify-end">
                        <button onClick={() => setAddingNote(false)}
                          style={{ fontSize: 11, color: MUTED, background: 'none', border: 'none', cursor: 'pointer' }}>
                          Cancel
                        </button>
                        <button onClick={handleAddNote} disabled={savingNote || !noteText.trim()}
                          className="flex items-center gap-1.5 rounded-xl px-4 py-1.5 text-[11px] font-semibold transition-all"
                          style={{ background: NAVY, color: BG, border: 'none', cursor: savingNote ? 'wait' : 'pointer', opacity: savingNote || !noteText.trim() ? 0.6 : 1 }}>
                          {savingNote ? <RefreshCw size={11} className="animate-spin" /> : <Plus size={11} />} Save
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Timeline entries */}
              <div style={{ padding: '0 32px 16px' }}>
                {timeline.length === 0 ? (
                  <div className="flex flex-col items-center py-8 gap-2">
                    <MessageSquare size={20} style={{ color: BORDER }} />
                    <p style={{ fontSize: 11, color: MUTED }}>No activity yet — add the first note</p>
                  </div>
                ) : (
                  <div className="relative">
                    {/* vertical line */}
                    <div style={{ position: 'absolute', left: 7, top: 24, bottom: 8, width: 1, background: BORDER }} />
                    <AnimatePresence>
                      {timeline.map((entry, i) => {
                        const typeOpt = NOTE_TYPE_OPTS.find(o => o.value === entry.note_type);
                        const col = typeOpt?.color ?? BLUE;
                        return (
                          <motion.div key={entry.id}
                            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="flex gap-4 pt-4">
                            <div style={{
                              width: 15, height: 15, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                              background: `${col}20`, border: `2px solid ${col}`, zIndex: 1,
                            }} />
                            <div style={{ flex: 1, paddingBottom: 4 }}>
                              <div className="flex items-center gap-2 mb-1">
                                <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 700, color: col }}>
                                  {typeOpt?.label ?? entry.note_type}
                                </span>
                                <span style={{ fontSize: 9, color: MUTED }}>
                                  {entry.author_name || 'System'} · {fmtDateTime(entry.created_at)}
                                </span>
                              </div>
                              <p style={{ fontSize: 12, color: SEC, lineHeight: 1.5 }}>{entry.content}</p>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </div>

            {/* Evidence log */}
            <div>
              <div className="flex items-center justify-between px-8 py-4"
                style={{ borderBottom: `1px solid ${BORDER}` }}>
                <div>
                  <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>
                    Evidence Log
                  </p>
                  {evidence.length > 0 && (
                    <p style={{ fontSize: 10, color: TER, marginTop: 1 }}>{evidence.length} file{evidence.length !== 1 ? 's' : ''} attached</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select value={uploadType} onChange={e => setUploadType(e.target.value)}
                    style={{ ...SEL, width: 'auto', paddingRight: 24, fontSize: 10 }}>
                    {EVIDENCE_TYPE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input
                    placeholder="Caption (optional)"
                    value={uploadCaption}
                    onChange={e => setUploadCaption(e.target.value)}
                    style={{ ...INP, width: 160, fontSize: 11 }}
                  />
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[10px] font-semibold transition-all"
                    style={{ background: `${BLUE}10`, border: `1px solid ${BLUE}25`, color: NAVY, cursor: uploading ? 'wait' : 'pointer' }}>
                    {uploading ? <RefreshCw size={11} className="animate-spin" style={{ color: BLUE }} /> : <Upload size={11} style={{ color: BLUE }} />}
                    {uploading ? 'Uploading…' : 'Upload'}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="hidden"
                    onChange={handleFileSelect} />
                </div>
              </div>

              <div style={{ padding: '0 32px 24px' }}>
                {evidence.length === 0 ? (
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="flex flex-col items-center justify-center rounded-2xl cursor-pointer transition-all mt-4"
                    style={{ border: `2px dashed ${BORDER}`, padding: '36px 24px', gap: 8 }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = `${BLUE}60`)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}>
                    <Upload size={22} style={{ color: MUTED }} />
                    <p style={{ fontSize: 12, color: TER }}>Upload photos, certificates, or documents</p>
                    <p style={{ fontSize: 10, color: MUTED }}>JPG, PNG, PDF, DOCX — max 2MB each</p>
                  </div>
                ) : (
                  <div className="space-y-2 mt-4">
                    <AnimatePresence>
                      {evidence.map(ev => (
                        <motion.div key={ev.id}
                          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}
                          className="flex items-center gap-3 rounded-xl group"
                          style={{ padding: '10px 14px', border: `1px solid ${BORDER}`, background: 'transparent', transition: 'background 0.15s' }}
                          onMouseEnter={e => (e.currentTarget.style.background = `${BLUE}04`)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${BLUE}08`, border: `1px solid ${BORDER}` }}>
                            <FileIcon mime={ev.file_mime} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 11, fontWeight: 600, color: NAVY, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.file_name}</p>
                            <p style={{ fontSize: 9, color: MUTED }}>
                              {ev.evidence_type} · {ev.uploader_name || 'Unknown'} · {fmtDateTime(ev.created_at)}
                              {ev.caption ? ` · "${ev.caption}"` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {ev.file_mime.startsWith('image/') && (
                              <button
                                onClick={() => setPreviewEv(ev)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4, display: 'flex', borderRadius: 6 }}
                                title="Preview">
                                <Eye size={13} />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                const a = document.createElement('a');
                                a.href = `data:${ev.file_mime};base64,${ev.file_data}`;
                                a.download = ev.file_name;
                                a.click();
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4, display: 'flex', borderRadius: 6 }}
                              title="Download">
                              <Download size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteEvidence(ev.id)}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: `${RED}88`, padding: 4, display: 'flex', borderRadius: 6 }}
                              title="Remove">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center gap-2 w-full justify-center rounded-xl py-3 transition-all text-[11px]"
                      style={{ border: `1px dashed ${BORDER}`, color: MUTED, background: 'none', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = `${BLUE}50`)}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}>
                      <Plus size={12} /> Add more evidence
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT: Details + Category metrics ── */}
          <div className="col-span-5">

            {/* Category metrics */}
            <div style={{ padding: '24px 28px', borderBottom: `1px solid ${BORDER}` }}>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 18 }}>
                {agenda.category === 'clinical' ? 'Clinical Details' :
                 agenda.category === 'compliance' ? 'Compliance Details' :
                 agenda.category === 'operational' ? 'Operational Details' : 'Agenda Details'}
              </p>

              <div className="space-y-4">

                {/* ── CLINICAL ── */}
                {agenda.category === 'clinical' && (
                  <>
                    <div>
                      <LBL>Patient</LBL>
                      <input value={metrics.patient_name ?? ''} onChange={e => upd({ patient_name: e.target.value })}
                        placeholder="Patient name" style={INP} />
                    </div>
                    <div>
                      <LBL>Treatment Type</LBL>
                      <input value={metrics.treatment_type ?? ''} onChange={e => upd({ treatment_type: e.target.value })}
                        placeholder="e.g. Botox, IV Therapy" style={INP} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <LBL>Session Revenue (£)</LBL>
                        <input type="number" value={metrics.revenue_gbp ?? ''} onChange={e => upd({ revenue_gbp: parseFloat(e.target.value) || 0 })}
                          placeholder="0.00" style={INP} />
                      </div>
                      <div>
                        <LBL>Payment Status</LBL>
                        <select value={metrics.payment_status ?? ''} onChange={e => upd({ payment_status: e.target.value })} style={SEL}>
                          <option value="">Select</option>
                          <option value="paid">Paid</option>
                          <option value="pending">Pending</option>
                          <option value="waived">Waived</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <LBL>Patient Satisfaction</LBL>
                      <StarRating value={metrics.satisfaction_rating ?? 0} onChange={n => upd({ satisfaction_rating: n })} />
                    </div>
                    <div>
                      <LBL>Satisfaction Note</LBL>
                      <input value={metrics.satisfaction_note ?? ''} onChange={e => upd({ satisfaction_note: e.target.value })}
                        placeholder="Patient feedback or observations" style={INP} />
                    </div>
                    <div>
                      <LBL>Clinical Outcome</LBL>
                      <select value={metrics.clinical_outcome ?? ''} onChange={e => upd({ clinical_outcome: e.target.value })} style={SEL}>
                        <option value="">Select outcome</option>
                        <option value="excellent">Excellent</option>
                        <option value="good">Good</option>
                        <option value="satisfactory">Satisfactory</option>
                        <option value="needs_review">Needs Review</option>
                      </select>
                    </div>
                    <div>
                      <LBL>Complications</LBL>
                      <select value={metrics.complications ?? ''} onChange={e => upd({ complications: e.target.value })} style={SEL}>
                        <option value="">Select</option>
                        <option value="none">None</option>
                        <option value="minor">Minor</option>
                        <option value="managed">Managed</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <LBL>Follow-up Required</LBL>
                        <select value={metrics.follow_up_required ? 'yes' : 'no'} onChange={e => upd({ follow_up_required: e.target.value === 'yes' })} style={SEL}>
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </div>
                      {metrics.follow_up_required && (
                        <div>
                          <LBL>Follow-up Date</LBL>
                          <input type="date" value={metrics.follow_up_date ?? ''} onChange={e => upd({ follow_up_date: e.target.value })} style={INP} />
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* ── COMPLIANCE ── */}
                {agenda.category === 'compliance' && (
                  <>
                    <div>
                      <LBL>Compliance Area</LBL>
                      <select value={metrics.compliance_area ?? ''} onChange={e => upd({ compliance_area: e.target.value })} style={SEL}>
                        <option value="">Select area</option>
                        {['DBS Check','Training & CPD','CQC Audit','Equipment Check','Insurance','GDPR','Health & Safety','Medicines','Other']
                          .map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <LBL>CQC Key Question</LBL>
                      <select value={metrics.cqc_key_question ?? ''} onChange={e => upd({ cqc_key_question: e.target.value })} style={SEL}>
                        <option value="">Not applicable</option>
                        {['Safe','Effective','Caring','Responsive','Well-led'].map(q => <option key={q} value={q.toLowerCase().replace('-','_')}>{q}</option>)}
                      </select>
                    </div>
                    <div>
                      <LBL>Status</LBL>
                      <select value={metrics.compliance_status ?? ''} onChange={e => upd({ compliance_status: e.target.value })} style={SEL}>
                        <option value="">Select</option>
                        <option value="pass">Pass</option>
                        <option value="fail">Fail</option>
                        <option value="in_progress">In Progress</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                    <div>
                      <LBL>Regulatory Reference</LBL>
                      <input value={metrics.regulatory_ref ?? ''} onChange={e => upd({ regulatory_ref: e.target.value })}
                        placeholder="Standard or reg reference" style={INP} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <LBL>Issue Date</LBL>
                        <input type="date" value={metrics.cert_issue_date ?? ''} onChange={e => upd({ cert_issue_date: e.target.value })} style={INP} />
                      </div>
                      <div>
                        <LBL>Expiry Date</LBL>
                        <input type="date" value={metrics.cert_expiry_date ?? ''} onChange={e => upd({ cert_expiry_date: e.target.value })} style={INP} />
                      </div>
                    </div>
                    <div>
                      <LBL>Next Review Date</LBL>
                      <input type="date" value={metrics.next_review_date ?? ''} onChange={e => upd({ next_review_date: e.target.value })} style={INP} />
                    </div>
                  </>
                )}

                {/* ── OPERATIONAL ── */}
                {agenda.category === 'operational' && (
                  <>
                    <div>
                      <LBL>Operational Area</LBL>
                      <select value={metrics.operational_area ?? ''} onChange={e => upd({ operational_area: e.target.value })} style={SEL}>
                        <option value="">Select area</option>
                        {['Reception','Clinical','Management','Administration','IT','Finance','Other'].map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                    <div>
                      <LBL>Impact Level</LBL>
                      <select value={metrics.impact_level ?? ''} onChange={e => upd({ impact_level: e.target.value })} style={SEL}>
                        <option value="">Select</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <LBL>Estimated (mins)</LBL>
                        <input type="number" value={metrics.duration_mins ?? ''} readOnly style={{ ...INP, color: MUTED }} />
                      </div>
                      <div>
                        <LBL>Actual (mins)</LBL>
                        <input type="number" value={metrics.actual_duration_mins ?? ''} onChange={e => upd({ actual_duration_mins: parseInt(e.target.value) || 0 })} style={INP} />
                      </div>
                    </div>
                    <div>
                      <LBL>Outcome Quality</LBL>
                      <select value={metrics.outcome_quality ?? ''} onChange={e => upd({ outcome_quality: e.target.value })} style={SEL}>
                        <option value="">Select</option>
                        <option value="completed">Completed as planned</option>
                        <option value="partial">Partially completed</option>
                        <option value="needs_revision">Needs revision</option>
                      </select>
                    </div>
                    <div>
                      <LBL>Blockers Encountered</LBL>
                      <textarea value={metrics.blockers ?? ''} onChange={e => upd({ blockers: e.target.value })}
                        placeholder="What slowed or blocked this?" rows={2} style={{ ...INP, resize: 'vertical' }} />
                    </div>
                    <div>
                      <LBL>Process Improvements</LBL>
                      <textarea value={metrics.improvements ?? ''} onChange={e => upd({ improvements: e.target.value })}
                        placeholder="What could be done better next time?" rows={2} style={{ ...INP, resize: 'vertical' }} />
                    </div>
                  </>
                )}

                {/* ── PERSONAL / OTHER ── */}
                {(agenda.category === 'personal' || !['clinical','compliance','operational'].includes(agenda.category)) && (
                  <>
                    <div>
                      <LBL>Category</LBL>
                      <input value={metrics.category_other ?? ''} onChange={e => upd({ category_other: e.target.value })}
                        placeholder="Describe this agenda type" style={INP} />
                    </div>
                    <div>
                      <LBL>Learnings & Reflections</LBL>
                      <textarea value={metrics.learnings ?? ''} onChange={e => upd({ learnings: e.target.value })}
                        placeholder="What did you learn or discover?" rows={4} style={{ ...INP, resize: 'vertical' }} />
                    </div>
                  </>
                )}

              </div>

              {/* Save metrics */}
              <button onClick={handleSaveMetrics} disabled={savingMetrics}
                className="flex items-center gap-2 rounded-xl px-4 py-2 text-[11px] font-semibold transition-all mt-5 w-full justify-center"
                style={{ background: NAVY, color: BG, border: 'none', cursor: savingMetrics ? 'wait' : 'pointer', opacity: savingMetrics ? 0.7 : 1 }}>
                {savingMetrics ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Save Details
              </button>
            </div>

            {/* Progress / reporting quick stats */}
            <div style={{ padding: '20px 28px' }}>
              <p style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED, marginBottom: 14 }}>
                Summary
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${BORDER}` }}>
                  <p style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>Evidence files</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: NAVY, letterSpacing: '-0.03em' }}>{evidence.length}</p>
                </div>
                <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${BORDER}` }}>
                  <p style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>Timeline notes</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: NAVY, letterSpacing: '-0.03em' }}>{timeline.length}</p>
                </div>
                {agenda.category === 'clinical' && metrics.revenue_gbp ? (
                  <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${BORDER}` }}>
                    <p style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>Revenue</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: GREEN, letterSpacing: '-0.03em' }}>£{(metrics.revenue_gbp ?? 0).toFixed(0)}</p>
                  </div>
                ) : null}
                {agenda.category === 'clinical' && metrics.satisfaction_rating ? (
                  <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${BORDER}` }}>
                    <p style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>Satisfaction</p>
                    <p style={{ fontSize: 18, fontWeight: 800, color: GOLD, letterSpacing: '-0.03em' }}>{'★'.repeat(metrics.satisfaction_rating ?? 0)}</p>
                  </div>
                ) : null}
                {agenda.category === 'compliance' && metrics.compliance_status && (
                  <div style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${BORDER}` }}>
                    <p style={{ fontSize: 9, color: MUTED, marginBottom: 4 }}>Status</p>
                    <p style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '-0.01em',
                      color: metrics.compliance_status === 'pass' ? GREEN : metrics.compliance_status === 'fail' ? RED : ORANGE }}>
                      {metrics.compliance_status?.replace('_', ' ')}
                    </p>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* ── Image preview lightbox ── */}
      <AnimatePresence>
        {previewEv && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}
            onClick={() => setPreviewEv(null)}>
            <button onClick={() => setPreviewEv(null)}
              style={{ position: 'absolute', top: 20, right: 20, background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer', color: '#fff', borderRadius: 8, padding: 8, display: 'flex' }}>
              <X size={18} />
            </button>
            <motion.img
              src={`data:${previewEv.file_mime};base64,${previewEv.file_data}`}
              alt={previewEv.caption || previewEv.file_name}
              initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 12, objectFit: 'contain' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Send report modal ── */}
      <AnimatePresence>
        {showReport && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,29,92,0.45)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
            onClick={e => { if (e.target === e.currentTarget) setShowReport(false); }}>
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              style={{ background: BG, borderRadius: 20, width: '100%', maxWidth: 440, border: `1px solid ${BORDER}`, overflow: 'hidden' }}>

              <div style={{ padding: '20px 24px 16px', borderBottom: `1px solid ${BORDER}` }}>
                <div className="flex items-center justify-between">
                  <p style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>Send Agenda Report</p>
                  <button onClick={() => setShowReport(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, display: 'flex' }}>
                    <X size={16} />
                  </button>
                </div>
                <p style={{ fontSize: 11, color: TER, marginTop: 4 }}>
                  Send a full report — evidence, notes and details — to a colleague&apos;s Knowledge Base.
                </p>
              </div>

              {reportSent ? (
                <div className="flex flex-col items-center justify-center py-10 gap-3">
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: `${GREEN}14`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={22} style={{ color: GREEN }} />
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>Report sent!</p>
                  <p style={{ fontSize: 11, color: TER }}>They&apos;ll see it in Knowledge Base → Reports.</p>
                </div>
              ) : (
                <div style={{ padding: '20px 24px 24px' }}>
                  <div className="mb-4">
                    <LBL>Send to</LBL>
                    <select value={reportRecipient} onChange={e => setReportRecipient(e.target.value)} style={SEL}>
                      <option value="">Select a colleague</option>
                      {otherUsers.map(u => (
                        <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                      ))}
                    </select>
                  </div>
                  <div className="mb-5">
                    <LBL>Cover note (optional)</LBL>
                    <textarea value={reportNote} onChange={e => setReportNote(e.target.value)}
                      placeholder="Add context or a message for the recipient…"
                      rows={3} style={{ ...INP, resize: 'vertical' }} />
                  </div>

                  {/* What's included */}
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: `${BLUE}06`, border: `1px solid ${BLUE}18`, marginBottom: 16 }}>
                    <p style={{ fontSize: 10, fontWeight: 600, color: BLUE, marginBottom: 6 }}>Report includes</p>
                    <div className="space-y-1">
                      {[
                        `Agenda details & ${agenda.category} metrics`,
                        `${evidence.length} evidence file${evidence.length !== 1 ? 's' : ''}`,
                        `${timeline.length} timeline note${timeline.length !== 1 ? 's' : ''}`,
                        'Completion status & dates',
                      ].map(item => (
                        <div key={item} className="flex items-center gap-2">
                          <div style={{ width: 4, height: 4, borderRadius: '50%', background: BLUE, flexShrink: 0 }} />
                          <p style={{ fontSize: 10, color: SEC }}>{item}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button onClick={handleSendReport} disabled={!reportRecipient || sendingReport}
                    className="flex items-center gap-2 w-full justify-center rounded-xl py-2.5 text-[12px] font-semibold transition-all"
                    style={{ background: NAVY, color: BG, border: 'none', cursor: !reportRecipient || sendingReport ? 'not-allowed' : 'pointer', opacity: !reportRecipient || sendingReport ? 0.6 : 1 }}>
                    {sendingReport ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                    {sendingReport ? 'Sending…' : 'Send Report'}
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: NAVY, color: BG, padding: '10px 20px', borderRadius: 12, fontSize: 12, fontWeight: 500, zIndex: 300, pointerEvents: 'none', whiteSpace: 'nowrap', boxShadow: '0 8px 24px rgba(0,0,0,0.18)' }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
