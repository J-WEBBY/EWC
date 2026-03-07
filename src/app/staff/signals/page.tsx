'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, ChevronUp, Plus, Search, RefreshCw,
  CheckCircle2, X, AlertTriangle, Zap, Bot, Clock,
  User, Cpu, MessageSquare, Shield, Activity,
  type LucideIcon,
} from 'lucide-react';
import {
  getStaffProfile, getCurrentUser,
  type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import {
  getSignalStats, getSignalFeed, getPendingSignals,
  approveSignal, rejectSignal, createSignal,
  resolveSignal, dismissSignal, logSignalAction, askSignalAI,
  type SignalStats, type SignalEntry, type PendingSignal,
  type ActionLogEntry, type ResponseMode,
} from '@/lib/actions/signals';
import type { SignalPriority, SignalStatus } from '@/lib/types/database';

// =============================================================================
// CONSTANTS
// =============================================================================

const MODE_CFG: Record<ResponseMode, { label: string; color: string; bg: string; desc: string; Icon: LucideIcon }> = {
  auto:       { label: 'Auto',       color: '#059669', bg: 'rgba(5,150,105,0.08)',    desc: 'Handled automatically',       Icon: Zap    },
  agentic:    { label: 'Agentic',    color: '#0058E6', bg: 'rgba(0,88,230,0.08)',     desc: 'Agent is acting',             Icon: Bot    },
  supervised: { label: 'Supervised', color: '#EA580C', bg: 'rgba(234,88,12,0.08)',   desc: 'Awaiting your decision',       Icon: User   },
  human_only: { label: 'Human Only', color: '#DC2626', bg: 'rgba(220,38,38,0.08)',   desc: 'Requires personal attention',  Icon: Shield },
};

const PRIO_COLOR: Record<SignalPriority, string> = {
  critical: '#DC2626', high: '#DC2626', medium: '#EA580C', low: '#8B84A0',
};

const ACTOR_CFG: Record<string, { label: string; color: string }> = {
  system:                { label: 'System',  color: '#8B84A0' },
  'agent:crm_agent':     { label: 'Aria',    color: '#00A693' },
  'agent:sales_agent':   { label: 'Orion',   color: '#D8A600' },
  'agent:primary_agent': { label: 'EWC',     color: '#0058E6' },
  patient:               { label: 'Patient', color: '#7C3AED' },
  user:                  { label: 'Team',    color: '#524D66' },
};

function actorCfg(actor: string) {
  if (ACTOR_CFG[actor]) return ACTOR_CFG[actor];
  if (actor.startsWith('automation:')) {
    const name = actor.replace('automation:', '').replace(/_/g, ' ');
    return { label: name, color: '#0058E6' };
  }
  if (actor.startsWith('agent:')) {
    return { label: actor.replace('agent:', ''), color: '#7C3AED' };
  }
  return { label: actor, color: '#8B84A0' };
}

const ACTION_LABEL: Record<string, string> = {
  signal_created:         'Signal created',
  sms_sent:               'SMS sent',
  escalated:              'Escalated',
  recommendation_generated: 'Recommendation',
  processing:             'Processing started',
  follow_up:              'Follow-up sent',
  resolved:               'Resolved',
  classified:             'Classified',
  responded:              'Patient responded',
  acknowledged:           'Acknowledged',
  dismissed:              'Dismissed',
  status_changed:         'Status updated',
};

function actionLabel(action: string): string {
  if (ACTION_LABEL[action]) return ACTION_LABEL[action];
  if (action.startsWith('status_changed_to_')) return 'Status updated';
  return action.replace(/_/g, ' ');
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return '1 day ago';
  if (d < 7) return `${d} days ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function formatTrailTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

// =============================================================================
// TRAIL ENTRY
// =============================================================================

function TrailRow({ entry, isLast }: { entry: ActionLogEntry; isLast: boolean }) {
  const cfg = actorCfg(entry.actor);
  return (
    <div className="flex gap-3 relative">
      {!isLast && (
        <div
          className="absolute left-[7px] top-5 bottom-0 w-px"
          style={{ background: '#EBE5FF' }}
        />
      )}
      <div
        className="w-3.5 h-3.5 rounded-full flex-shrink-0 mt-0.5 ring-2 ring-white"
        style={{ background: cfg.color, boxShadow: `0 0 6px ${cfg.color}55` }}
      />
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-[11px] font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
          <span className="text-[11px] text-[#5A6475]">·</span>
          <span className="text-[11px] text-[#5A6475]">{actionLabel(entry.action)}</span>
          <span className="text-[11px] text-[#5A6475] ml-auto">{formatTrailTime(entry.timestamp)}</span>
        </div>
        <p className="text-[12px] text-[#3D4451] leading-relaxed">{entry.note}</p>
      </div>
    </div>
  );
}

// =============================================================================
// SIGNAL CARD
// =============================================================================

function SignalCard({
  signal,
  onResolve,
  onDismiss,
  onApprove,
  onReject,
  tenantId,
  userId,
}: {
  signal: SignalEntry;
  onResolve: (id: string, note: string) => void;
  onDismiss: (id: string, reason: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  tenantId: string;
  userId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [ariaQuestion, setAriaQuestion] = useState('');
  const [ariaResponse, setAriaResponse] = useState('');
  const [ariaLoading, setAriaLoading] = useState(false);

  const mode = MODE_CFG[signal.response_mode] || MODE_CFG.supervised;
  const prio = PRIO_COLOR[signal.priority] || '#94a3b8';
  const isResolved = signal.status === 'resolved' || signal.status === 'archived';
  const isProcessing = signal.status === 'processing';
  const isPending = signal.status === 'pending_approval';
  const trailPreview = signal.action_log.slice(-2);
  const recommendation = trailPreview.findLast(e => e.action === 'recommendation_generated');

  const handleResolve = () => {
    setBusy('resolve');
    onResolve(signal.id, noteText || 'Marked resolved by team');
  };

  const handleDismiss = () => {
    setBusy('dismiss');
    onDismiss(signal.id, noteText || 'Dismissed by team');
  };

  const handleAskAria = async () => {
    if (!ariaQuestion.trim() || ariaLoading) return;
    setAriaLoading(true);
    setAriaResponse('');
    const res = await askSignalAI(tenantId, userId, ariaQuestion, {
      signalId: signal.id,
      signalTitle: signal.title,
      signalDescription: signal.description,
    });
    setAriaResponse(res.response || 'No response.');
    setAriaLoading(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.22 }}
      className="rounded-xl overflow-hidden border border-[#D4E2FF] relative"
      style={{ background: isResolved ? '#F5F2EB' : '#FFFFFF' }}
    >
      {/* Priority left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl"
        style={{ background: isResolved ? 'rgba(0,0,0,0.06)' : prio, opacity: isResolved ? 0.4 : 1 }}
      />

      <div className="pl-4">
        {/* Header row */}
        <button
          className="w-full text-left p-4 flex items-start gap-3"
          onClick={() => setExpanded(e => !e)}
        >
          {/* Mode badge */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border flex-shrink-0 mt-0.5"
            style={{ borderColor: `${mode.color}33`, background: mode.bg }}
          >
            <mode.Icon size={10} style={{ color: mode.color }} />
            <span className="text-[10px] font-semibold tracking-[0.05em]" style={{ color: mode.color }}>
              {mode.label}
            </span>
            {isProcessing && signal.response_mode === 'agentic' && (
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0 animate-pulse"
                style={{ background: mode.color }}
              />
            )}
          </div>

          {/* Priority chip */}
          <span
            className="text-[10px] font-bold uppercase tracking-[0.1em] flex-shrink-0 mt-0.5"
            style={{ color: isResolved ? '#4b5563' : prio }}
          >
            {signal.priority}
          </span>

          {/* Title + description */}
          <div className="flex-1 min-w-0">
            <p
              className="text-[14px] font-medium leading-snug mb-1"
              style={{ color: isResolved ? '#5A6475' : '#181D23' }}
            >
              {signal.title}
            </p>
            <p className="text-[12px] leading-relaxed line-clamp-2"
              style={{ color: isResolved ? '#96989B' : '#5A6475' }}>
              {signal.description}
            </p>

            {/* Tags */}
            {signal.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {signal.tags.slice(0, 4).map(tag => (
                  <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full border border-[#D4E2FF] text-[#5A6475]">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Status + time */}
            <div className="flex items-center gap-3 mt-2">
              <span
                className="text-[11px] uppercase tracking-[0.08em] font-medium"
                style={{ color: isResolved ? '#4b5563' : '#5A6475' }}
              >
                {signal.status.replace(/_/g, ' ')}
              </span>
              <span className="text-[11px] text-[#5A6475]">{relativeTime(signal.created_at)}</span>
              {signal.last_action_at && signal.last_action_at !== signal.created_at && (
                <span className="text-[11px] text-[#96989B]">· updated {relativeTime(signal.last_action_at)}</span>
              )}
            </div>
          </div>

          {/* Expand toggle */}
          <div className="flex-shrink-0 mt-0.5 text-[#5A6475] hover:text-[#3D4451] transition-colors">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </button>

        {/* Trail preview (always visible, last 2 entries) */}
        {!expanded && trailPreview.length > 0 && (
          <div className="px-4 pb-4 border-t border-[#D4E2FF] pt-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] uppercase tracking-[0.12em] text-[#5A6475] font-medium">Trail</span>
              <span className="text-[10px] text-[#96989B]">· {signal.action_log.length} events</span>
            </div>
            <div className="space-y-1">
              {trailPreview.map((entry, i) => {
                const cfg = actorCfg(entry.actor);
                return (
                  <div key={i} className="flex items-start gap-2">
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5"
                      style={{ background: cfg.color }}
                    />
                    <p className="text-[11px] text-[#5A6475] leading-relaxed line-clamp-1">
                      <span className="font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
                      {' · '}{actionLabel(entry.action)} — {entry.note}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* EXPANDED — Full trail + actions */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-[#D4E2FF] mx-4" />

            <div className="p-4 pl-4 flex gap-6">
              {/* Trail timeline */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[#5A6475] font-medium mb-4">
                  Activity Trail · {signal.action_log.length} events
                </p>
                <div>
                  {signal.action_log.length > 0 ? (
                    signal.action_log.map((entry, i) => (
                      <TrailRow key={i} entry={entry} isLast={i === signal.action_log.length - 1} />
                    ))
                  ) : (
                    <p className="text-[12px] text-[#5A6475]">No trail entries yet.</p>
                  )}
                </div>
              </div>

              {/* Ask Aria */}
              <div className="mt-5 pt-4 border-t border-[#D4E2FF]">
                <p className="text-[10px] uppercase tracking-[0.12em] text-[#5A6475] font-medium mb-3 flex items-center gap-1.5">
                  <Bot size={11} className="text-[#96989B]" /> Ask Aria
                </p>
                <div className="flex gap-2">
                  <input
                    value={ariaQuestion}
                    onChange={e => setAriaQuestion(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAskAria(); }}
                    placeholder="Ask about this signal..."
                    className="flex-1 bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3 py-2 text-[12px] text-[#3D4451] placeholder:text-[#96989B] outline-none focus:border-[#A8C4FF] transition-colors"
                  />
                  <button
                    onClick={handleAskAria}
                    disabled={ariaLoading || !ariaQuestion.trim()}
                    className="px-3 py-2 rounded-lg bg-[#0058E618] border border-[#0058E640] text-[#1A1035] text-[12px] font-medium disabled:opacity-30 hover:bg-[#0058E625] transition-colors flex-shrink-0"
                  >
                    {ariaLoading ? '...' : 'Ask'}
                  </button>
                </div>
                {ariaResponse && (
                  <div className="mt-3 p-3 rounded-lg bg-[#FAF7F2] border border-[#EBE5FF]">
                    <p className="text-[12px] text-[#3D4451] leading-relaxed">{ariaResponse}</p>
                  </div>
                )}
              </div>

              {/* Action zone */}
              {!isResolved && (
                <div className="w-64 flex-shrink-0">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-[#5A6475] font-medium mb-4">Actions</p>

                  {/* Recommendation block for supervised */}
                  {recommendation && signal.response_mode === 'supervised' && (
                    <div
                      className="p-3 rounded-lg border mb-4"
                      style={{ borderColor: `${mode.color}33`, background: mode.bg }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.1em] font-medium mb-1.5" style={{ color: mode.color }}>
                        Recommendation
                      </p>
                      <p className="text-[12px] text-[#3D4451] leading-relaxed">{recommendation.note}</p>
                    </div>
                  )}

                  {/* Pending approval */}
                  {isPending && (
                    <div className="flex flex-col gap-2 mb-4">
                      <button
                        onClick={() => { setBusy('approve'); onApprove(signal.id); }}
                        disabled={busy !== null}
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-[12px] font-medium border border-[#A8C4FF] bg-[#FAF9F5] hover:bg-[#F5F2FD] transition-colors disabled:opacity-30 text-[#181D23]"
                      >
                        <CheckCircle2 size={12} className="text-green-400" />
                        Approve Signal
                      </button>
                      <button
                        onClick={() => { setBusy('reject'); onReject(signal.id); }}
                        disabled={busy !== null}
                        className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-[12px] font-medium border border-[#D4E2FF] bg-[#F0ECFF] hover:bg-[#F8FAFF] transition-colors disabled:opacity-30 text-[#5A6475]"
                      >
                        <X size={12} /> Reject
                      </button>
                    </div>
                  )}

                  {/* Resolution note */}
                  {!isPending && (
                    <>
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder="Add a note (optional)..."
                        rows={3}
                        className="w-full bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3 py-2 text-[12px] text-[#3D4451] placeholder:text-[#5A6475] resize-none outline-none focus:border-[#A8C4FF] transition-colors mb-3"
                      />

                      {signal.response_mode !== 'auto' && (
                        <div className="flex flex-col gap-2">
                          <button
                            onClick={handleResolve}
                            disabled={busy !== null}
                            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-[12px] font-medium border border-[#A8C4FF] bg-[#FAF9F5] hover:bg-[#F5F2FD] transition-colors disabled:opacity-30 text-[#181D23]"
                          >
                            <CheckCircle2 size={12} className="text-green-400" />
                            Mark Resolved
                          </button>
                          <button
                            onClick={handleDismiss}
                            disabled={busy !== null}
                            className="flex items-center justify-center gap-2 w-full py-2 rounded-lg text-[12px] font-medium border border-[#D4E2FF] bg-transparent hover:bg-[#F8FAFF] transition-colors disabled:opacity-30 text-[#5A6475]"
                          >
                            <X size={12} /> Dismiss
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Resolved state */}
              {isResolved && (
                <div className="w-48 flex-shrink-0 flex flex-col items-center justify-center gap-2 opacity-40">
                  <CheckCircle2 size={18} className="text-green-400" />
                  <p className="text-[11px] text-[#5A6475] text-center">
                    {signal.status === 'archived' ? 'Dismissed' : 'Resolved'}
                  </p>
                  {signal.resolved_at && (
                    <p className="text-[10px] text-[#5A6475] text-center">{relativeTime(signal.resolved_at)}</p>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// CREATE SIGNAL PANEL
// =============================================================================

function CreatePanel({ onClose, onCreated, tenantId }: {
  onClose: () => void;
  onCreated: () => void;
  tenantId: string;
}) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [priority, setPriority] = useState<SignalPriority>('medium');
  const [mode, setMode] = useState<ResponseMode>('supervised');
  const [category, setCategory] = useState('operations');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!title.trim()) return;
    setBusy(true);
    await createSignal(tenantId, {
      signalType: 'alert',
      title: title.trim(),
      description: desc.trim(),
      priority,
      responseMode: mode,
      sourceType: 'manual',
      category,
      status: 'new',
    });
    onCreated();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="absolute right-0 top-0 bottom-0 w-80 bg-[#FAF7F2] border-l border-[#EBE5FF] z-20 flex flex-col shadow-xl"
    >
      <div className="p-5 border-b border-[#D4E2FF] flex items-center justify-between">
        <p className="text-[13px] font-medium text-[#181D23]">New Signal</p>
        <button onClick={onClose} className="text-[#5A6475] hover:text-[#3D4451] transition-colors">
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-[0.1em] text-[#5A6475] font-medium block mb-1.5">Title</label>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Signal title..."
            className="w-full bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3 py-2 text-[13px] text-[#181D23] placeholder:text-[#5A6475] outline-none focus:border-[#A8C4FF] transition-colors"
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-[0.1em] text-[#5A6475] font-medium block mb-1.5">Description</label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="What needs attention..."
            rows={3}
            className="w-full bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3 py-2 text-[13px] text-[#181D23] placeholder:text-[#5A6475] resize-none outline-none focus:border-[#A8C4FF] transition-colors"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] uppercase tracking-[0.1em] text-[#5A6475] font-medium block mb-1.5">Priority</label>
            <select
              value={priority}
              onChange={e => setPriority(e.target.value as SignalPriority)}
              className="w-full bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3 py-2 text-[12px] text-[#3D4451] outline-none"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-[0.1em] text-[#5A6475] font-medium block mb-1.5">Response</label>
            <select
              value={mode}
              onChange={e => setMode(e.target.value as ResponseMode)}
              className="w-full bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3 py-2 text-[12px] text-[#3D4451] outline-none"
            >
              <option value="auto">Auto</option>
              <option value="agentic">Agentic</option>
              <option value="supervised">Supervised</option>
              <option value="human_only">Human Only</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-[0.1em] text-[#5A6475] font-medium block mb-1.5">Category</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3 py-2 text-[12px] text-[#3D4451] outline-none"
          >
            <option value="operations">Operations</option>
            <option value="governance">Governance / Compliance</option>
            <option value="finance">Finance</option>
            <option value="welfare">Patient Welfare</option>
            <option value="engagement">Engagement</option>
            <option value="communications">Communications</option>
          </select>
        </div>
      </div>

      <div className="p-5 border-t border-[#D4E2FF]">
        <button
          onClick={submit}
          disabled={busy || !title.trim()}
          className="w-full py-2.5 rounded-xl text-[13px] font-medium bg-[#0058E618] border border-[#0058E640] text-[#1A1035] hover:bg-[#0058E625] transition-colors disabled:opacity-30"
        >
          {busy ? 'Creating...' : 'Create Signal'}
        </button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// STAT CELL
// =============================================================================

function StatCell({ label, value, color, sub, Icon }: {
  label: string; value: number | string; color?: string;
  sub?: string; Icon?: LucideIcon;
}) {
  return (
    <div className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.14em] text-[#5A6475] font-medium">{label}</span>
        {Icon && <Icon size={12} className="text-[#96989B]" />}
      </div>
      <p className="text-[26px] font-semibold tracking-tight leading-none" style={{ color: color || '#181D23' }}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-[#5A6475]">{sub}</p>}
    </div>
  );
}

// =============================================================================
// MODE TAB
// =============================================================================

function ModeTab({ id, label, count, color, active, onClick }: {
  id: string; label: string; count: number; color: string;
  active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all relative"
      style={{
        background: active ? `${color}15` : 'transparent',
        color: active ? color : '#5A6475',
        border: active ? `1px solid ${color}30` : '1px solid transparent',
      }}
    >
      {label}
      {count > 0 && (
        <span
          className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
          style={{
            background: active ? `${color}25` : 'rgba(0,0,0,0.05)',
            color: active ? color : '#5A6475',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

type ModeTab = 'all' | ResponseMode | 'resolved';

export default function SignalsPage() {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [tenantId, setTenantId] = useState('clinic');
  const [userId, setUserId] = useState('');
  const [brandColor, setBrandColor] = useState('#ffffff');

  const [stats, setStats] = useState<SignalStats | null>(null);
  const [signals, setSignals] = useState<SignalEntry[]>([]);
  const [pending, setPending] = useState<PendingSignal[]>([]);

  const [activeTab, setActiveTab] = useState<ModeTab>('all');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<SignalPriority | ''>('');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);

    try {
      const { userId: uid } = await getCurrentUser();
      const safeUid = uid || '';
      setTenantId('clinic');
      setUserId(safeUid);

      const [profileRes, statsRes, feedRes, pendingRes] = await Promise.all([
        getStaffProfile('clinic', safeUid),
        getSignalStats('clinic'),
        getSignalFeed('clinic'),
        getPendingSignals('clinic'),
      ]);

      if (profileRes.success && profileRes.data?.profile) {
        setProfile(profileRes.data.profile);
        setBrandColor(profileRes.data.profile.brandColor || '#0058E6');
      }
      if (statsRes.success && statsRes.stats)         setStats(statsRes.stats);
      if (feedRes.success && feedRes.signals)         setSignals(feedRes.signals);
      if (pendingRes.success && pendingRes.signals)   setPending(pendingRes.signals);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(() => load(true), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [load]);

  // Filter signals by tab + search + priority
  const filtered = signals.filter(s => {
    if (activeTab === 'resolved') return s.status === 'resolved' || s.status === 'archived';
    if (activeTab !== 'all') {
      if (s.response_mode !== activeTab) return false;
      if (s.status === 'resolved' || s.status === 'archived') return false;
    } else {
      if (s.status === 'resolved' || s.status === 'archived') return false;
    }
    if (priorityFilter && s.priority !== priorityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!s.title.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Tab counts (active signals only)
  const activeSignals = signals.filter(s => s.status !== 'resolved' && s.status !== 'archived');
  const tabCounts: Record<ModeTab, number> = {
    all:        activeSignals.length,
    auto:       activeSignals.filter(s => s.response_mode === 'auto').length,
    agentic:    activeSignals.filter(s => s.response_mode === 'agentic').length,
    supervised: activeSignals.filter(s => s.response_mode === 'supervised').length,
    human_only: activeSignals.filter(s => s.response_mode === 'human_only').length,
    resolved:   signals.filter(s => s.status === 'resolved' || s.status === 'archived').length,
  };

  const handleResolve = async (signalId: string, note: string) => {
    await resolveSignal(tenantId, signalId, note);
    await load(true);
  };

  const handleDismiss = async (signalId: string, reason: string) => {
    await dismissSignal(tenantId, signalId, reason);
    await load(true);
  };

  const handleApprove = async (signalId: string) => {
    await approveSignal(tenantId, signalId);
    await load(true);
  };

  const handleReject = async (signalId: string) => {
    await rejectSignal(tenantId, signalId);
    await load(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen nav-offset bg-[#F8FAFF] flex items-center justify-center">
        <div className="w-5 h-5 border border-[#A8C4FF] border-t-[#0058E6] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen nav-offset">
      {profile && <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Signals" />}

      <div className="max-w-[1400px] mx-auto px-6 py-10">

        {/* PAGE HEADER */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight text-[#181D23] leading-none mb-1.5">
              Signal Operations
            </h1>
            <p className="text-[13px] text-[#5A6475]">
              {activeSignals.length} active · {stats?.agentic_running || 0} agents working · {stats?.resolved_today || 0} resolved today
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => load(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-[#D4E2FF] text-[#5A6475] hover:text-[#3D4451] transition-colors"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => setShowCreate(s => !s)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#A8C4FF] bg-[#FAF9F5] text-[12px] font-medium text-[#3D4451] hover:bg-[#F5F2FD] hover:text-[#1A1035] transition-colors"
            >
              <Plus size={12} /> New Signal
            </button>
          </div>
        </div>

        {/* STATS STRIP */}
        <div className="grid grid-cols-5 gap-3 mb-8">
          <StatCell label="Active"           value={activeSignals.length}           Icon={Activity}    />
          <StatCell label="Critical"         value={stats?.critical_count || 0}     color="#f87171"    Icon={AlertTriangle} />
          <StatCell label="Agentic Running"  value={stats?.agentic_running || 0}    color="#c084fc"    Icon={Bot}  sub="agents processing" />
          <StatCell label="Pending Approval" value={pending.length}                  color="#fbbf24"    Icon={Clock} />
          <StatCell label="Resolved Today"   value={stats?.resolved_today || 0}     color="#34d399"    Icon={CheckCircle2} />
        </div>

        {/* PENDING APPROVAL BANNER */}
        <AnimatePresence>
          {pending.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6 p-4 rounded-xl border"
              style={{ borderColor: '#D8A600', background: '#FEF3C7' }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Clock size={13} style={{ color: '#fbbf24' }} />
                  <span className="text-[12px] font-medium" style={{ color: '#fbbf24' }}>
                    {pending.length} signal{pending.length > 1 ? 's' : ''} awaiting approval
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                {pending.map(p => (
                  <div key={p.id} className="flex items-center gap-4 p-3 rounded-lg bg-[#FAF7F2] border border-[#EBE5FF]">
                    <div className="w-1 self-stretch rounded-full" style={{ background: PRIO_COLOR[p.priority] }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[#181D23]">{p.title}</p>
                      <p className="text-[11px] text-[#5A6475] mt-0.5">{p.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApprove(p.id)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-[#FAF9F5] border border-[#A8C4FF] text-[#3D4451] hover:bg-[#D4E2FF] transition-colors"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(p.id)}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-transparent border border-[#D4E2FF] text-[#5A6475] hover:bg-[#FAF9F5] transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* MODE TABS + FILTERS */}
        <div className="flex items-center justify-between mb-4 gap-4">
          <div className="flex items-center gap-1 flex-wrap">
            <ModeTab id="all"        label="All"        count={tabCounts.all}        color="#3D4451" active={activeTab === 'all'}        onClick={() => setActiveTab('all')} />
            <ModeTab id="auto"       label="Auto"       count={tabCounts.auto}       color="#60a5fa" active={activeTab === 'auto'}       onClick={() => setActiveTab('auto')} />
            <ModeTab id="agentic"    label="Agentic"    count={tabCounts.agentic}    color="#c084fc" active={activeTab === 'agentic'}    onClick={() => setActiveTab('agentic')} />
            <ModeTab id="supervised" label="Supervised" count={tabCounts.supervised} color="#fbbf24" active={activeTab === 'supervised'} onClick={() => setActiveTab('supervised')} />
            <ModeTab id="human_only" label="Human Only" count={tabCounts.human_only} color="#f87171" active={activeTab === 'human_only'} onClick={() => setActiveTab('human_only')} />
            <div className="w-px h-4 bg-[#A8C4FF] mx-1" />
            <ModeTab id="resolved"   label="Resolved"   count={tabCounts.resolved}   color="#34d399" active={activeTab === 'resolved'}   onClick={() => setActiveTab('resolved')} />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value as SignalPriority | '')}
              className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg px-3 py-1.5 text-[12px] text-[#3D4451] outline-none"
            >
              <option value="">All priorities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5A6475]" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search signals..."
                className="bg-[#FAF7F2] border border-[#EBE5FF] rounded-lg pl-8 pr-3 py-1.5 text-[12px] text-[#3D4451] placeholder:text-[#5A6475] outline-none focus:border-[#A8C4FF] transition-colors w-44"
              />
            </div>
          </div>
        </div>

        {/* SIGNAL FEED */}
        <div className="relative">
          <AnimatePresence>
            {showCreate && (
              <CreatePanel
                tenantId={tenantId}
                onClose={() => setShowCreate(false)}
                onCreated={() => load(true)}
              />
            )}
          </AnimatePresence>

          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filtered.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center py-20 gap-3"
                >
                  <Cpu size={24} className="text-[#96989B]" />
                  <p className="text-[13px] text-[#5A6475]">
                    {activeTab === 'resolved'
                      ? 'No resolved signals yet'
                      : 'No signals in this category'}
                  </p>
                </motion.div>
              ) : (
                filtered.map(signal => (
                  <SignalCard
                    key={signal.id}
                    signal={signal}
                    tenantId={tenantId}
                    userId={userId}
                    onResolve={handleResolve}
                    onDismiss={handleDismiss}
                    onApprove={handleApprove}
                    onReject={handleReject}
                  />
                ))
              )}
            </AnimatePresence>
          </div>
        </div>

      </div>
    </div>
  );
}
