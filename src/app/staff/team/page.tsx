'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, ClipboardList, Link as LinkIcon, Heart, Star,
  Send, Loader2, CheckCircle2, ChevronDown, Pin,
  Users, MessageSquare, Briefcase, Stethoscope, LayoutGrid,
  ThumbsUp, Video, Plus, Clock, X, Sparkles,
  Search, Hash, ChevronLeft, StopCircle, UserCheck, Mail,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import {
  getTeamPosts, createTeamPost, getTeamRoster, getTeamSpaceStats, likeTeamPost,
  type TeamPost, type TeamMember, type TeamSpace, type PostCategory, type TeamSpaceStats,
} from '@/lib/actions/team-spaces';
import { getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const ACCENT = '#0058E6';
const GREEN  = '#059669';
const GOLD   = '#D8A600';
const RED    = '#DC2626';
const PURPLE = '#7C3AED';
const TEAL   = '#00A693';

const FALLBACK: StaffProfile = {
  userId: '', firstName: '—', lastName: '', email: '', jobTitle: null,
  departmentName: null, departmentId: null, roleName: null, isAdmin: false,
  isOwner: false, companyName: '', aiName: 'Aria', brandColor: ACCENT,
  logoUrl: null, industry: null, reportsTo: null, teamSize: 0,
};

// =============================================================================
// CONSTANTS
// =============================================================================

const SPACE_CONFIG: Record<TeamSpace, { label: string; icon: React.ElementType; color: string }> = {
  all_staff:  { label: 'All Staff',  icon: LayoutGrid,    color: ACCENT   },
  reception:  { label: 'Reception',  icon: MessageSquare, color: TEAL     },
  clinical:   { label: 'Clinical',   icon: Stethoscope,   color: '#2563EB' },
  management: { label: 'Management', icon: Briefcase,      color: GOLD     },
};

const CATEGORY_CONFIG: Record<PostCategory, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  announcement: { label: 'Announcement', color: '#EA580C', bg: 'rgba(234,88,12,0.06)',   icon: Megaphone     },
  handover:     { label: 'Handover',     color: '#2563EB', bg: 'rgba(37,99,235,0.06)',   icon: ClipboardList },
  task:         { label: 'Task',         color: ACCENT,    bg: 'rgba(0,88,230,0.06)',    icon: CheckCircle2  },
  resource:     { label: 'Resource',     color: TEAL,      bg: 'rgba(0,166,147,0.06)',   icon: LinkIcon      },
  kudos:        { label: 'Kudos',        color: GOLD,      bg: 'rgba(216,166,0,0.06)',   icon: Star          },
  update:       { label: 'Update',       color: MUTED,     bg: 'rgba(150,152,155,0.05)', icon: MessageSquare },
};

const STATUS_COLOR: Record<string, string> = { online: GREEN, away: GOLD, offline: '#C5BAF0' };

// =============================================================================
// TYPES
// =============================================================================

interface DMMessage {
  id: string; senderId: string; senderName: string; body: string; sentAt: string;
}
interface DMConversation {
  memberId: string; memberName: string; memberColor: string; memberRole: string;
  messages: DMMessage[]; unread: number;
}
interface AgendaItem { id: string; text: string; done: boolean }
interface ActionItem { id: string; text: string; assignee: string; due: string; priority: 'high' | 'medium' | 'low' }
interface Attendee   { id: string; name: string; role: string; color: string; status: 'present' | 'absent' | 'invited' }
interface ActiveMeeting {
  title: string; startedAt: number;
  agenda: AgendaItem[]; actions: ActionItem[]; attendees: Attendee[];
  notes: string; aiNotes: string;
}

// =============================================================================
// HELPERS
// =============================================================================

function fmtTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
  if (m < 2)  return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function fmtElapsed(s: number): string {
  const h = Math.floor(s / 3600), min = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(min).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}
function getInitials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); }
function getColor(name: string): string {
  const p = [ACCENT, '#2563EB', TEAL, GOLD, RED, GREEN, PURPLE];
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % p.length;
  return p[h];
}
function parseBody(b: string) { return b.split('\n').filter(Boolean); }
function mAgo(m: number) { return new Date(Date.now() - m * 60000).toISOString(); }
function hAgo(h: number) { return new Date(Date.now() - h * 3600000).toISOString(); }
function dAgo(d: number) { return new Date(Date.now() - d * 86400000).toISOString(); }

// =============================================================================
// DEMO DMS
// =============================================================================

const DEMO_DMS: DMConversation[] = [
  {
    memberId: 'u-001', memberName: 'Dr S. Ganata', memberColor: ACCENT, memberRole: 'Medical Director', unread: 1,
    messages: [
      { id: 'm1', senderId: 'u-001', senderName: 'Dr S. Ganata', body: 'Can you ensure the CQC compliance checklist is updated before EOD today?', sentAt: hAgo(2) },
      { id: 'm2', senderId: 'me',    senderName: 'You',           body: 'On it — will have it done by 4pm.', sentAt: hAgo(1.5) },
      { id: 'm3', senderId: 'u-001', senderName: 'Dr S. Ganata', body: 'Thank you. Also confirm the updated Botox dilution protocol is saved in the clinical folder.', sentAt: mAgo(45) },
    ],
  },
  {
    memberId: 'u-002', memberName: 'Emma Clarke', memberColor: TEAL, memberRole: 'Senior Receptionist', unread: 0,
    messages: [
      { id: 'm4', senderId: 'u-002', senderName: 'Emma Clarke', body: 'Morning! 3 patients arrived early today — fitting them in now.', sentAt: hAgo(4) },
      { id: 'm5', senderId: 'me',    senderName: 'You',         body: 'Good to know, thanks Emma.', sentAt: hAgo(3.8) },
    ],
  },
  {
    memberId: 'u-004', memberName: 'James Mitchell', memberColor: '#2563EB', memberRole: 'Practice Manager', unread: 0,
    messages: [
      { id: 'm6', senderId: 'u-004', senderName: 'James Mitchell', body: 'February P&L filed. 111% of target — looking very strong.', sentAt: dAgo(1) },
    ],
  },
];

// =============================================================================
// AVATAR
// =============================================================================

function Avatar({ name, color, size = 32, status }: { name: string; color: string; size?: number; status?: string }) {
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <div className="w-full h-full rounded-full flex items-center justify-center font-bold"
        style={{ backgroundColor: `${color}16`, color, border: `1px solid ${color}28`, fontSize: size * 0.31 }}>
        {getInitials(name)}
      </div>
      {status && (
        <div className="absolute -bottom-0.5 -right-0.5 rounded-full border-2"
          style={{ width: size * 0.31, height: size * 0.31, backgroundColor: STATUS_COLOR[status] ?? STATUS_COLOR.offline, borderColor: BG }} />
      )}
    </div>
  );
}

// =============================================================================
// POST CARD
// =============================================================================

function PostCard({ post, onLike }: { post: TeamPost & { liked?: boolean }; onLike: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const catCfg = CATEGORY_CONFIG[post.category], CatIcon = catCfg.icon;
  const lines = parseBody(post.body), preview = lines[0] ?? '';
  const hasMore = lines.length > 1 || post.body.length > 200;
  const color = getColor(post.author_name);
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl" style={{ border: `1px solid ${BORDER}` }}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Avatar name={post.author_name} color={color} size={34} />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-semibold" style={{ color: NAVY }}>{post.author_name}</p>
                {post.author_role && <p className="text-[10px]" style={{ color: MUTED }}>{post.author_role}</p>}
              </div>
              <p className="text-[9px]" style={{ color: MUTED }}>{fmtTime(post.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg"
              style={{ backgroundColor: catCfg.bg, border: `1px solid ${catCfg.color}22` }}>
              <CatIcon className="w-2.5 h-2.5" style={{ color: catCfg.color }} />
              <span className="text-[8px] font-semibold uppercase tracking-[0.10em]" style={{ color: catCfg.color }}>{catCfg.label}</span>
            </div>
            {post.pinned && <Pin className="w-3 h-3" style={{ color: MUTED }} />}
          </div>
        </div>
        {post.title && <p className="mb-2 text-[14px] font-bold tracking-tight" style={{ color: NAVY }}>{post.title}</p>}
        <div>
          {expanded
            ? <div className="space-y-1">{lines.map((l, i) => <p key={i} className="text-[12px] leading-relaxed" style={{ color: SEC }}>{l}</p>)}</div>
            : <p className="text-[12px] leading-relaxed" style={{ color: SEC }}>{preview.length > 200 ? preview.slice(0,200)+'…' : preview}</p>}
          {hasMore && (
            <button onClick={() => setExpanded(e => !e)} className="mt-1.5 text-[10px] font-medium flex items-center gap-1" style={{ color: MUTED }}>
              <ChevronDown className="w-3 h-3" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.map(t => <span key={t} className="text-[8px] px-2 py-0.5 rounded-md font-medium" style={{ backgroundColor: `${ACCENT}08`, color: TER, border: `1px solid ${BORDER}` }}>#{t}</span>)}
          </div>
        )}
        {post.category === 'task' && post.metadata.task_due && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: `${ACCENT}06`, border: `1px solid ${ACCENT}20` }}>
            <Clock className="w-3 h-3 flex-shrink-0" style={{ color: ACCENT }} />
            <p className="text-[10px]" style={{ color: SEC }}>Due <span style={{ color: ACCENT, fontWeight: 600 }}>{String(post.metadata.task_due)}</span>{post.metadata.assignee && <> · {String(post.metadata.assignee)}</>}</p>
          </div>
        )}
        <div className="mt-4 pt-3 flex items-center gap-4" style={{ borderTop: `1px solid ${BORDER}` }}>
          <button onClick={() => onLike(post.id)} className="flex items-center gap-1.5 text-[10px] transition-colors" style={{ color: post.liked ? GOLD : MUTED }}>
            <ThumbsUp className="w-3 h-3" />{post.likes + (post.liked ? 1 : 0)}
          </button>
          <span className="text-[9px]" style={{ color: MUTED }}>{SPACE_CONFIG[post.space].label}</span>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// DM PANEL
// =============================================================================

function DMPanel({ conv, onSend, onBack }: { conv: DMConversation; onSend: (id: string, body: string) => void; onBack: () => void }) {
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conv.messages.length]);
  function send() { if (!input.trim()) return; onSend(conv.memberId, input.trim()); setInput(''); }
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-3.5 flex items-center gap-3 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <button onClick={onBack} className="p-1.5 rounded-lg transition-colors" style={{ color: MUTED }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = `${ACCENT}08`)}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
          <ChevronLeft size={14} />
        </button>
        <Avatar name={conv.memberName} color={conv.memberColor} size={32} />
        <div>
          <p className="text-[13px] font-semibold" style={{ color: NAVY }}>{conv.memberName}</p>
          <p className="text-[10px]" style={{ color: MUTED }}>{conv.memberRole}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        {conv.messages.map((msg, i) => {
          const isMe = msg.senderId === 'me';
          return (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
              className={`flex ${isMe ? 'justify-end' : 'justify-start'} gap-2`}>
              {!isMe && <Avatar name={msg.senderName} color={conv.memberColor} size={24} />}
              <div className="max-w-[72%]">
                <div className="px-3.5 py-2.5 text-[12px] leading-relaxed"
                  style={{
                    backgroundColor: isMe ? `${ACCENT}12` : '#FAF7F2',
                    border: `1px solid ${isMe ? ACCENT+'28' : BORDER}`, color: NAVY,
                    borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  }}>
                  {msg.body}
                </div>
                <p className={`text-[9px] mt-0.5 ${isMe ? 'text-right' : ''}`} style={{ color: MUTED }}>{fmtTime(msg.sentAt)}</p>
              </div>
            </motion.div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="px-5 py-3 flex-shrink-0" style={{ borderTop: `1px solid ${BORDER}` }}>
        <div className="flex gap-2 items-end">
          <textarea
            className="flex-1 px-3.5 py-2.5 rounded-xl text-[12px] resize-none focus:outline-none"
            style={{ border: `1px solid ${BORDER}`, backgroundColor: '#FAF7F2', color: NAVY, maxHeight: 80, minHeight: 42 }}
            placeholder={`Message ${conv.memberName.split(' ')[0]}…`}
            value={input} onChange={e => setInput(e.target.value)} rows={1}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button onClick={send} disabled={!input.trim()} className="flex-shrink-0 p-2.5 rounded-xl transition-all"
            style={{ backgroundColor: input.trim() ? `${ACCENT}12` : 'transparent', border: `1px solid ${input.trim() ? ACCENT+'35' : BORDER}`, color: input.trim() ? ACCENT : MUTED }}>
            <Send size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// DM LIST
// =============================================================================

function DMList({ conversations, onSelect }: { conversations: DMConversation[]; onSelect: (id: string) => void }) {
  const total = conversations.reduce((s, c) => s + c.unread, 0);
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUTED }}>Team Hub</p>
        <div className="flex items-center gap-2">
          <p className="text-[20px] font-black tracking-tight" style={{ color: NAVY }}>Messages</p>
          {total > 0 && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: `${RED}12`, color: RED, border: `1px solid ${RED}22` }}>{total}</span>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {conversations.map(conv => {
          const last = conv.messages[conv.messages.length - 1];
          return (
            <button key={conv.memberId} onClick={() => onSelect(conv.memberId)}
              className="w-full text-left px-3 py-3 rounded-xl transition-all flex items-center gap-3"
              style={{ border: '1px solid transparent' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${ACCENT}05`; (e.currentTarget as HTMLButtonElement).style.borderColor = BORDER; }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent'; }}>
              <Avatar name={conv.memberName} color={conv.memberColor} size={38} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-[13px] truncate" style={{ color: NAVY, fontWeight: conv.unread > 0 ? 700 : 500 }}>{conv.memberName}</p>
                  {last && <p className="text-[9px] flex-shrink-0 ml-2" style={{ color: MUTED }}>{fmtTime(last.sentAt)}</p>}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] truncate" style={{ color: conv.unread > 0 ? SEC : MUTED, fontWeight: conv.unread > 0 ? 500 : 400 }}>{last?.body ?? 'No messages yet'}</p>
                  {conv.unread > 0 && <span className="flex-shrink-0 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold px-1" style={{ backgroundColor: ACCENT, color: '#fff' }}>{conv.unread}</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// =============================================================================
// MEETING SETUP
// =============================================================================

function MeetingSetup({ members, onStart }: { members: TeamMember[]; onStart: (m: ActiveMeeting) => void }) {
  const [title,    setTitle]    = useState('');
  const [agenda,   setAgenda]   = useState<AgendaItem[]>([]);
  const [agInput,  setAgInput]  = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(members.filter(m => m.status !== 'offline').map(m => m.id)));

  function addAgenda() {
    if (!agInput.trim()) return;
    setAgenda(prev => [...prev, { id: Date.now().toString(), text: agInput.trim(), done: false }]);
    setAgInput('');
  }
  function start() {
    onStart({
      title: title.trim() || `Team Meeting — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      startedAt: Date.now(),
      agenda: agenda.length > 0 ? agenda : [{ id: '1', text: 'Opening remarks', done: false }],
      actions: [], notes: '', aiNotes: '',
      attendees: members.filter(m => selected.has(m.id)).map(m => ({ id: m.id, name: m.full_name, role: m.role, color: m.color, status: 'invited' as const })),
    });
  }
  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-5 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUTED }}>Meeting Room</p>
        <p className="text-[20px] font-black tracking-tight" style={{ color: NAVY }}>New Meeting</p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-xl space-y-6">
          {/* Title */}
          <div>
            <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-2" style={{ color: MUTED }}>Meeting Title</p>
            <input className="w-full px-4 py-3 rounded-xl text-[14px] font-semibold focus:outline-none"
              style={{ border: `1px solid ${BORDER}`, backgroundColor: '#FAF7F2', color: NAVY }}
              placeholder={`Team Meeting — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
              value={title} onChange={e => setTitle(e.target.value)} />
          </div>
          {/* Attendees */}
          <div>
            <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-2" style={{ color: MUTED }}>Attendees — {selected.size} selected</p>
            <div className="space-y-1.5">
              {members.map(m => {
                const checked = selected.has(m.id);
                return (
                  <button key={m.id}
                    onClick={() => setSelected(prev => { const s = new Set(prev); if (checked) s.delete(m.id); else s.add(m.id); return s; })}
                    className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all text-left"
                    style={{ border: `1px solid ${checked ? ACCENT+'30' : BORDER}`, backgroundColor: checked ? `${ACCENT}05` : 'transparent' }}>
                    <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: checked ? ACCENT : 'transparent', border: `1.5px solid ${checked ? ACCENT : BORDER}` }}>
                      {checked && <svg width="8" height="8" viewBox="0 0 8 8"><path d="M1 4l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                    </div>
                    <Avatar name={m.full_name} color={m.color} size={28} status={m.status} />
                    <div className="flex-1">
                      <p className="text-[12px] font-medium" style={{ color: NAVY }}>{m.full_name}</p>
                      <p className="text-[10px]" style={{ color: MUTED }}>{m.role}</p>
                    </div>
                    <span className="text-[9px] px-2 py-0.5 rounded-full capitalize"
                      style={{ backgroundColor: `${STATUS_COLOR[m.status]}14`, color: STATUS_COLOR[m.status] }}>
                      {m.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Agenda */}
          <div>
            <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-2" style={{ color: MUTED }}>Pre-set Agenda (optional)</p>
            <div className="space-y-1.5 mb-2">
              {agenda.map(item => (
                <div key={item.id} className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ border: `1px solid ${BORDER}` }}>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: ACCENT }} />
                  <p className="text-[11px] flex-1" style={{ color: SEC }}>{item.text}</p>
                  <button onClick={() => setAgenda(prev => prev.filter(a => a.id !== item.id))} style={{ color: MUTED }}><X size={10} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className="flex-1 px-3 py-2.5 rounded-xl text-[11px] focus:outline-none"
                style={{ border: `1px solid ${BORDER}`, backgroundColor: '#FAF7F2', color: NAVY }}
                placeholder="Add agenda item…" value={agInput} onChange={e => setAgInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addAgenda(); }} />
              <button onClick={addAgenda} className="px-3 py-2 rounded-xl"
                style={{ backgroundColor: `${ACCENT}10`, border: `1px solid ${ACCENT}30`, color: ACCENT }}>
                <Plus size={13} />
              </button>
            </div>
          </div>
          {/* Start */}
          <button onClick={start}
            className="w-full py-3.5 rounded-xl text-[13px] font-bold tracking-wide flex items-center justify-center gap-2.5"
            style={{ backgroundColor: `${ACCENT}10`, border: `1px solid ${ACCENT}35`, color: NAVY }}>
            <Video size={15} style={{ color: ACCENT }} /> Start Meeting
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MEETING LIVE
// =============================================================================

type MtgSubTab = 'agenda' | 'notes' | 'actions' | 'attendees';

function buildSummary(mtg: ActiveMeeting, elapsed: number): string {
  const present = mtg.attendees.filter(a => a.status === 'present').map(a => a.name).join(', ') || 'Not recorded';
  const covered = mtg.agenda.filter(a => a.done).map(a => `• ${a.text}`).join('\n') || '• None marked complete';
  const open    = mtg.agenda.filter(a => !a.done).map(a => `• ${a.text}`).join('\n');
  const acts    = mtg.actions.map(a => `• [${a.priority.toUpperCase()}] ${a.text}${a.assignee ? ` → ${a.assignee}` : ''}${a.due ? ` (due ${a.due})` : ''}`).join('\n') || '• None recorded';
  return `Meeting: ${mtg.title}\nDuration: ${fmtElapsed(elapsed)}\nAttendees: ${present}\n\nAgenda Completed:\n${covered}${open ? `\n\nOpen Items:\n${open}` : ''}\n\nNotes:\n${mtg.notes || 'No notes recorded'}\n\nAction Items:\n${acts}`;
}

function MeetingLive({ meeting, onEnd, onDM }: {
  meeting: ActiveMeeting;
  onEnd: (summary: string, mtg: ActiveMeeting) => void;
  onDM: (memberId: string, memberName: string, body: string) => void;
}) {
  const [mtg,       setMtg]      = useState<ActiveMeeting>(meeting);
  const [elapsed,   setElapsed]  = useState(0);
  const [agInput,   setAgInput]  = useState('');
  const [actionIn,  setActionIn] = useState({ text: '', assignee: '', due: '', priority: 'medium' as ActionItem['priority'] });
  const [subTab,    setSubTab]   = useState<MtgSubTab>('agenda');
  const [aiWorking, setAiWork]   = useState(false);
  const [ending,    setEnding]   = useState(false);
  const startRef = useRef(meeting.startedAt);

  useEffect(() => {
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(iv);
  }, []);

  const toggleAgenda = (id: string) => setMtg(m => ({ ...m, agenda: m.agenda.map(a => a.id === id ? { ...a, done: !a.done } : a) }));
  const addAgenda    = () => { if (!agInput.trim()) return; setMtg(m => ({ ...m, agenda: [...m.agenda, { id: Date.now().toString(), text: agInput.trim(), done: false }] })); setAgInput(''); };
  const addAction    = () => { if (!actionIn.text.trim()) return; setMtg(m => ({ ...m, actions: [...m.actions, { id: Date.now().toString(), ...actionIn }] })); setActionIn({ text: '', assignee: '', due: '', priority: 'medium' }); };
  const removeAction = (id: string) => setMtg(m => ({ ...m, actions: m.actions.filter(a => a.id !== id) }));
  const toggleAtt    = (id: string) => setMtg(m => ({ ...m, attendees: m.attendees.map(a => a.id === id ? { ...a, status: a.status === 'present' ? 'absent' : 'present' } : a) }));

  async function draftAINotes() {
    setAiWork(true);
    await new Promise(r => setTimeout(r, 1600));
    const present = mtg.attendees.filter(a => a.status === 'present').map(a => a.name).join(', ') || 'Not yet confirmed';
    const covered = mtg.agenda.filter(a => a.done).map(a => `• ${a.text}`).join('\n') || '• None marked complete yet';
    const open    = mtg.agenda.filter(a => !a.done).map(a => `• ${a.text}`).join('\n');
    const acts    = mtg.actions.length > 0 ? mtg.actions.map(a => `• [${a.priority.toUpperCase()}] ${a.text}${a.assignee ? ` → ${a.assignee}` : ''}${a.due ? ` (due ${a.due})` : ''}`).join('\n') : '• None recorded';
    const draft = [
      `AI Meeting Notes — ${mtg.title}`,
      `Date: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`,
      `Duration so far: ${fmtElapsed(elapsed)}`,
      `Attendees: ${present}`, ``,
      `Agenda Covered:`, covered, open ? `\nOpen Items:\n${open}` : '', ``,
      `Key Points:`, mtg.notes || '(no manual notes yet)', ``,
      `Action Items:`, acts, ``,
      `Next Steps:`,
      `• Distribute minutes to all attendees`,
      `• Follow up on outstanding action items`,
      `• Review progress at next meeting`,
    ].join('\n');
    setMtg(m => ({ ...m, aiNotes: draft }));
    setAiWork(false);
    setSubTab('notes');
  }

  async function endMeeting() {
    setEnding(true);
    await new Promise(r => setTimeout(r, 500));
    const final = { ...mtg };
    onEnd(final.aiNotes || buildSummary(final, elapsed), final);
  }

  const presentCount = mtg.attendees.filter(a => a.status === 'present').length;
  const doneCount    = mtg.agenda.filter(a => a.done).length;
  const progress     = mtg.agenda.length > 0 ? Math.round((doneCount / mtg.agenda.length) * 100) : 0;
  const SUBTABS: { key: MtgSubTab; label: string; badge?: string }[] = [
    { key: 'agenda',    label: 'Agenda',    badge: `${doneCount}/${mtg.agenda.length}` },
    { key: 'notes',     label: 'Notes',     badge: mtg.aiNotes ? 'AI' : undefined },
    { key: 'actions',   label: 'Actions',   badge: mtg.actions.length > 0 ? String(mtg.actions.length) : undefined },
    { key: 'attendees', label: 'Attendees', badge: `${presentCount}/${mtg.attendees.length}` },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}`, backgroundColor: 'rgba(0,88,230,0.02)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: RED }} />
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: RED }}>Live</p>
            </div>
            <div className="h-3 w-px" style={{ backgroundColor: BORDER }} />
            <p className="text-[14px] font-bold max-w-[240px] truncate" style={{ color: NAVY }}>{mtg.title}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-mono"
              style={{ backgroundColor: `${ACCENT}08`, border: `1px solid ${ACCENT}22`, color: ACCENT, fontSize: 12, fontWeight: 700 }}>
              <Clock size={10} /> {fmtElapsed(elapsed)}
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: BORDER }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${progress}%`, backgroundColor: progress === 100 ? GREEN : ACCENT }} />
              </div>
              <span className="text-[9px] font-medium" style={{ color: MUTED }}>{progress}%</span>
            </div>
            <button onClick={draftAINotes} disabled={aiWorking}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold"
              style={{ backgroundColor: `${PURPLE}08`, border: `1px solid ${PURPLE}22`, color: PURPLE }}>
              {aiWorking ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
              {aiWorking ? 'Drafting…' : 'AI Notes'}
            </button>
            <button onClick={endMeeting} disabled={ending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold"
              style={{ backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', color: RED }}>
              {ending ? <Loader2 size={10} className="animate-spin" /> : <StopCircle size={10} />}
              End & Publish
            </button>
          </div>
        </div>
        <div className="flex gap-0.5">
          {SUBTABS.map(t => (
            <button key={t.key} onClick={() => setSubTab(t.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium"
              style={{ backgroundColor: subTab === t.key ? `${ACCENT}10` : 'transparent', color: subTab === t.key ? ACCENT : MUTED }}>
              {t.label}
              {t.badge && <span className="px-1.5 py-0.5 rounded text-[8px] font-bold" style={{ backgroundColor: subTab === t.key ? `${ACCENT}18` : `${ACCENT}06`, color: subTab === t.key ? ACCENT : MUTED }}>{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <AnimatePresence mode="wait">

          {subTab === 'agenda' && (
            <motion.div key="ag" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="space-y-1.5 mb-4">
                {mtg.agenda.map(item => (
                  <button key={item.id} onClick={() => toggleAgenda(item.id)}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left"
                    style={{ border: `1px solid ${item.done ? GREEN+'28' : BORDER}`, backgroundColor: item.done ? `${GREEN}05` : 'transparent' }}>
                    <div className="rounded-full border flex items-center justify-center flex-shrink-0"
                      style={{ width: 18, height: 18, borderColor: item.done ? GREEN : BORDER, backgroundColor: item.done ? `${GREEN}12` : 'transparent' }}>
                      {item.done && <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1.5 4.5l2 2 4-4" stroke={GREEN} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                    </div>
                    <p className="text-[12px] flex-1" style={{ color: item.done ? MUTED : NAVY, textDecoration: item.done ? 'line-through' : 'none' }}>{item.text}</p>
                    {item.done && <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${GREEN}10`, color: GREEN }}>Done</span>}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="flex-1 px-3 py-2.5 rounded-xl text-[11px] focus:outline-none"
                  style={{ border: `1px solid ${BORDER}`, backgroundColor: '#FAF7F2', color: NAVY }}
                  placeholder="Add agenda item…" value={agInput} onChange={e => setAgInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addAgenda(); }} />
                <button onClick={addAgenda} className="px-3 py-2 rounded-xl" style={{ backgroundColor: `${ACCENT}10`, border: `1px solid ${ACCENT}30`, color: ACCENT }}><Plus size={13} /></button>
              </div>
            </motion.div>
          )}

          {subTab === 'notes' && (
            <motion.div key="notes" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[8px] uppercase tracking-[0.24em] font-semibold mb-2" style={{ color: MUTED }}>Manual Notes</p>
                  <textarea className="w-full px-4 py-3 rounded-xl text-[12px] leading-relaxed resize-none focus:outline-none"
                    style={{ border: `1px solid ${BORDER}`, backgroundColor: '#FAF7F2', color: NAVY, height: 300 }}
                    placeholder="Freeform meeting notes…" value={mtg.notes}
                    onChange={e => setMtg(m => ({ ...m, notes: e.target.value }))} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[8px] uppercase tracking-[0.24em] font-semibold" style={{ color: MUTED }}>AI Structured Notes</p>
                    <button onClick={draftAINotes} disabled={aiWorking} className="flex items-center gap-1 text-[9px] font-medium" style={{ color: aiWorking ? MUTED : PURPLE }}>
                      {aiWorking ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                      {aiWorking ? 'Drafting…' : mtg.aiNotes ? 'Regenerate' : 'Draft now'}
                    </button>
                  </div>
                  {mtg.aiNotes ? (
                    <div className="px-4 py-3 rounded-xl text-[11px] leading-relaxed overflow-y-auto whitespace-pre-wrap"
                      style={{ border: `1px solid ${PURPLE}22`, backgroundColor: `${PURPLE}04`, color: SEC, height: 300 }}>
                      {mtg.aiNotes}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-xl" style={{ border: `1px dashed ${BORDER}`, height: 300 }}>
                      <Sparkles size={18} style={{ color: MUTED, marginBottom: 8 }} />
                      <p className="text-[11px]" style={{ color: MUTED }}>Click AI Notes to draft</p>
                      <p className="text-[10px] mt-1" style={{ color: MUTED }}>structured meeting minutes</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {subTab === 'actions' && (
            <motion.div key="act" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {mtg.actions.length === 0 && (
                <div className="flex items-center justify-center py-10 rounded-xl mb-4" style={{ border: `1px dashed ${BORDER}` }}>
                  <p className="text-[11px]" style={{ color: MUTED }}>No action items yet</p>
                </div>
              )}
              <div className="space-y-1.5 mb-4">
                {mtg.actions.map(a => {
                  const pc = a.priority === 'high' ? RED : a.priority === 'medium' ? GOLD : MUTED;
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-3.5 py-3 rounded-xl" style={{ border: `1px solid ${BORDER}` }}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pc }} />
                      <p className="text-[12px] flex-1" style={{ color: NAVY }}>{a.text}</p>
                      {a.assignee && <span className="text-[9px] px-2 py-0.5 rounded-lg" style={{ backgroundColor: `${ACCENT}08`, color: ACCENT, border: `1px solid ${ACCENT}20` }}>{a.assignee}</span>}
                      {a.due && <span className="flex items-center gap-1 text-[9px]" style={{ color: MUTED }}><Clock size={9} />{a.due}</span>}
                      <button onClick={() => removeAction(a.id)} style={{ color: MUTED }}><X size={11} /></button>
                    </div>
                  );
                })}
              </div>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <input className="flex-1 px-3 py-2.5 rounded-xl text-[11px] focus:outline-none"
                    style={{ border: `1px solid ${BORDER}`, backgroundColor: '#FAF7F2', color: NAVY }}
                    placeholder="Action item…" value={actionIn.text} onChange={e => setActionIn(a => ({ ...a, text: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') addAction(); }} />
                  <select className="px-2 py-2 rounded-xl text-[10px] focus:outline-none"
                    style={{ border: `1px solid ${BORDER}`, backgroundColor: '#FAF7F2', color: NAVY, width: 80 }}
                    value={actionIn.priority} onChange={e => setActionIn(a => ({ ...a, priority: e.target.value as ActionItem['priority'] }))}>
                    <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <input className="flex-1 px-3 py-2 rounded-xl text-[11px] focus:outline-none"
                    style={{ border: `1px solid ${BORDER}`, backgroundColor: '#FAF7F2', color: NAVY }}
                    placeholder="Assign to…" value={actionIn.assignee} onChange={e => setActionIn(a => ({ ...a, assignee: e.target.value }))} />
                  <input className="w-28 px-3 py-2 rounded-xl text-[11px] focus:outline-none"
                    style={{ border: `1px solid ${BORDER}`, backgroundColor: '#FAF7F2', color: NAVY }}
                    placeholder="Due date" value={actionIn.due} onChange={e => setActionIn(a => ({ ...a, due: e.target.value }))} />
                  <button onClick={addAction} className="px-3 py-2 rounded-xl" style={{ backgroundColor: `${ACCENT}10`, border: `1px solid ${ACCENT}30`, color: ACCENT }}><Plus size={13} /></button>
                </div>
              </div>
            </motion.div>
          )}

          {subTab === 'attendees' && (
            <motion.div key="att" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="flex items-center justify-between mb-4">
                <p className="text-[11px]" style={{ color: MUTED }}>{presentCount} of {mtg.attendees.length} confirmed present</p>
                <button
                  onClick={() => mtg.attendees.filter(a => a.status === 'invited').forEach(a => onDM(a.id, a.name, `You have been invited to join: "${mtg.title}". Please join when ready.`))}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-medium"
                  style={{ backgroundColor: `${ACCENT}08`, border: `1px solid ${ACCENT}22`, color: ACCENT }}>
                  <Send size={10} /> Invite All via DM
                </button>
              </div>
              <div className="space-y-1.5">
                {mtg.attendees.map(a => (
                  <button key={a.id} onClick={() => toggleAtt(a.id)}
                    className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl text-left"
                    style={{ border: `1px solid ${a.status === 'present' ? GREEN+'28' : BORDER}`, backgroundColor: a.status === 'present' ? `${GREEN}05` : 'transparent' }}>
                    <Avatar name={a.name} color={a.color} size={32} />
                    <div className="flex-1">
                      <p className="text-[12px] font-medium" style={{ color: NAVY }}>{a.name}</p>
                      <p className="text-[10px]" style={{ color: MUTED }}>{a.role}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-medium"
                        style={{ backgroundColor: a.status === 'present' ? `${GREEN}12` : a.status === 'absent' ? `${RED}10` : `${GOLD}10`, color: a.status === 'present' ? GREEN : a.status === 'absent' ? RED : GOLD }}>
                        {a.status === 'present' ? 'Present' : a.status === 'absent' ? 'Absent' : 'Invited'}
                      </span>
                      {a.status !== 'present' && <UserCheck size={13} style={{ color: MUTED }} />}
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

// =============================================================================
// DIRECTORY
// =============================================================================

function Directory({ members, onDM }: { members: TeamMember[]; onDM: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const filtered = members.filter(m => m.full_name.toLowerCase().includes(search.toLowerCase()) || m.role.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUTED }}>Team Hub</p>
        <p className="text-[20px] font-black tracking-tight" style={{ color: NAVY }}>Directory</p>
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ border: `1px solid ${BORDER}`, backgroundColor: '#FAF7F2' }}>
          <Search size={12} style={{ color: MUTED }} />
          <input className="flex-1 text-[12px] bg-transparent focus:outline-none" style={{ color: NAVY }}
            placeholder="Search name or role…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((m, i) => (
            <motion.div key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className="p-4 rounded-2xl" style={{ border: `1px solid ${BORDER}` }}>
              <div className="flex items-start gap-3 mb-3">
                <Avatar name={m.full_name} color={m.color} size={40} status={m.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold truncate" style={{ color: NAVY }}>{m.full_name}</p>
                  <p className="text-[10px] truncate" style={{ color: TER }}>{m.role}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: STATUS_COLOR[m.status] }} />
                    <span className="text-[9px] capitalize" style={{ color: MUTED }}>{m.status}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => onDM(m.id)}
                  className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium"
                  style={{ backgroundColor: `${ACCENT}08`, border: `1px solid ${ACCENT}20`, color: ACCENT }}>
                  <MessageSquare size={9} /> DM
                </button>
                <button className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium"
                  style={{ backgroundColor: `${TEAL}06`, border: `1px solid ${TEAL}18`, color: TEAL }}>
                  <Mail size={9} /> Email
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

type CenterTab = 'feed' | 'messages' | 'meeting' | 'directory';
type MeetPhase = 'setup' | 'live';

export default function TeamPage() {
  const searchParams = useSearchParams();
  const userId       = searchParams.get('userId') ?? '';

  const [profile,     setProfile]     = useState<StaffProfile | null>(null);
  const [brandColor,  setBrandColor]  = useState(ACCENT);
  const [activeSpace, setActiveSpace] = useState<TeamSpace | 'all'>('all');
  const [posts,       setPosts]       = useState<(TeamPost & { liked?: boolean })[]>([]);
  const [members,     setMembers]     = useState<TeamMember[]>([]);
  const [stats,       setStats]       = useState<TeamSpaceStats | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [likedIds,    setLikedIds]    = useState<Set<string>>(new Set());
  const [centerTab,   setCenterTab]   = useState<CenterTab>('feed');
  const [meetPhase,   setMeetPhase]   = useState<MeetPhase>('setup');
  const [activeMtg,   setActiveMtg]   = useState<ActiveMeeting | null>(null);
  const [dms,         setDms]         = useState<DMConversation[]>(DEMO_DMS);
  const [openDM,      setOpenDM]      = useState<string | null>(null);
  const [compose,     setCompose]     = useState({ body: '', category: 'update' as PostCategory, title: '' });
  const [posting,     setPosting]     = useState(false);
  const [postDone,    setPostDone]    = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    getStaffProfile('clinic', userId).then(r => {
      if (r.success && r.data?.profile) { setProfile(r.data.profile); setBrandColor(r.data.profile.brandColor ?? ACCENT); }
    });
    Promise.all([getTeamRoster(), getTeamSpaceStats()]).then(([m, s]) => { setMembers(m); setStats(s); });
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    getTeamPosts(activeSpace as TeamSpace).then(data => { setPosts(data.map(p => ({ ...p, liked: false }))); setLoading(false); });
  }, [activeSpace]);

  const pinnedPosts  = useMemo(() => posts.filter(p => p.pinned),  [posts]);
  const regularPosts = useMemo(() => posts.filter(p => !p.pinned), [posts]);
  const onlineCount  = members.filter(m => m.status === 'online').length;
  const totalUnread  = dms.reduce((s, c) => s + c.unread, 0);

  async function handlePost() {
    if (!compose.body.trim() || posting) return;
    setPosting(true);
    const res = await createTeamPost({
      space: activeSpace === 'all' ? 'all_staff' : activeSpace,
      category: compose.category, title: compose.title.trim() || undefined, body: compose.body.trim(),
      author_name: profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff',
      author_role: profile?.roleName ?? null,
    });
    if (res.success) {
      setPosts(prev => [{
        id: res.id ?? `local-${Date.now()}`, space: activeSpace === 'all' ? 'all_staff' : activeSpace,
        category: compose.category, title: compose.title.trim() || null, body: compose.body.trim(), tags: [],
        author_name: profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff',
        author_role: profile?.roleName ?? null, likes: 0, pinned: false, metadata: {},
        created_at: new Date().toISOString(), liked: false,
      }, ...prev]);
      setCompose({ body: '', category: 'update', title: '' });
      setPostDone(true); setTimeout(() => setPostDone(false), 2500);
      feedRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setPosting(false);
  }

  function handleLike(id: string) {
    if (likedIds.has(id)) return;
    setLikedIds(prev => { const s = new Set(prev); s.add(id); return s; });
    setPosts(prev => prev.map(p => p.id === id ? { ...p, liked: true } : p));
    likeTeamPost(id);
  }

  function handleSendDM(memberId: string, body: string) {
    const sentAt = new Date().toISOString();
    setDms(prev => prev.map(c => c.memberId !== memberId ? c : {
      ...c, messages: [...c.messages, { id: `dm-${Date.now()}`, senderId: 'me', senderName: 'You', body, sentAt }],
    }));
  }

  function handleDMFromMeeting(memberId: string, memberName: string, body: string) {
    const sentAt = new Date().toISOString();
    setDms(prev => {
      const ex = prev.find(c => c.memberId === memberId);
      if (ex) return prev.map(c => c.memberId !== memberId ? c : { ...c, messages: [...c.messages, { id: `dm-${Date.now()}`, senderId: 'me', senderName: 'You', body, sentAt }] });
      return [...prev, { memberId, memberName, memberColor: getColor(memberName), memberRole: '', unread: 0, messages: [{ id: `dm-${Date.now()}`, senderId: 'me', senderName: 'You', body, sentAt }] }];
    });
  }

  function openDMFor(memberId: string) {
    setDms(prev => {
      const ex = prev.find(c => c.memberId === memberId);
      if (ex) return prev.map(c => c.memberId === memberId ? { ...c, unread: 0 } : c);
      const m = members.find(x => x.id === memberId);
      if (!m) return prev;
      return [...prev, { memberId, memberName: m.full_name, memberColor: m.color, memberRole: m.role, unread: 0, messages: [] }];
    });
    setOpenDM(memberId);
    setCenterTab('messages');
  }

  function handleMeetingStart(mtg: ActiveMeeting) { setActiveMtg(mtg); setMeetPhase('live'); }

  function handleMeetingEnd(summary: string, mtg: ActiveMeeting) {
    setMeetPhase('setup'); setActiveMtg(null);
    setPosts(prev => [{
      id: `meeting-${Date.now()}`, space: 'all_staff', category: 'resource',
      title: `Meeting Summary — ${mtg.title}`, body: summary, tags: ['meeting', 'minutes'],
      author_name: profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff',
      author_role: profile?.roleName ?? null, likes: 0, pinned: false, metadata: { meeting: 'true' },
      created_at: new Date().toISOString(), liked: false,
    }, ...prev]);
    setCenterTab('feed');
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: BG, paddingLeft: 'var(--nav-w, 240px)' }}>
      <StaffNav profile={profile ?? FALLBACK} userId={userId} brandColor={brandColor} currentPath="Team" />

      {/* ── LEFT PANEL ── */}
      <div className="flex-shrink-0 flex flex-col overflow-hidden" style={{ width: 220, borderRight: `1px solid ${BORDER}` }}>
        {/* Spaces */}
        <div className="p-4" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-3" style={{ color: MUTED }}>Spaces</p>
          <button onClick={() => setActiveSpace('all')}
            className="w-full text-left px-3 py-2.5 rounded-xl mb-1 flex items-center gap-2.5 transition-all"
            style={{ backgroundColor: activeSpace === 'all' ? `${ACCENT}08` : 'transparent', borderLeft: activeSpace === 'all' ? `2px solid ${ACCENT}` : '2px solid transparent' }}>
            <LayoutGrid size={13} style={{ color: activeSpace === 'all' ? ACCENT : MUTED }} />
            <span className="text-[12px] font-medium flex-1" style={{ color: activeSpace === 'all' ? NAVY : SEC }}>All Spaces</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${ACCENT}08`, color: MUTED }}>{posts.length}</span>
          </button>
          {(Object.entries(SPACE_CONFIG) as [TeamSpace, typeof SPACE_CONFIG[TeamSpace]][]).map(([key, cfg]) => {
            const Icon = cfg.icon; const isActive = activeSpace === key;
            return (
              <button key={key} onClick={() => setActiveSpace(key)}
                className="w-full text-left px-3 py-2 rounded-xl mb-0.5 flex items-center gap-2.5 transition-all"
                style={{ backgroundColor: isActive ? `${cfg.color}08` : 'transparent', borderLeft: isActive ? `2px solid ${cfg.color}` : '2px solid transparent' }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${ACCENT}04`; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}>
                <Icon size={13} style={{ color: isActive ? cfg.color : MUTED }} />
                <span className="text-[12px] flex-1" style={{ color: isActive ? NAVY : SEC }}>{cfg.label}</span>
                {stats && <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: isActive ? `${cfg.color}10` : `${ACCENT}06`, color: isActive ? cfg.color : MUTED }}>{stats[key]}</span>}
              </button>
            );
          })}
        </div>
        {/* Roster */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>Team</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${GREEN}10`, color: GREEN, border: `1px solid ${GREEN}22` }}>{onlineCount} online</span>
          </div>
          <div className="space-y-0.5">
            {members.map(m => (
              <button key={m.id} onClick={() => openDMFor(m.id)}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition-all group"
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${ACCENT}05`}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'}>
                <Avatar name={m.full_name} color={m.color} size={26} status={m.status} />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[10px] font-medium truncate" style={{ color: NAVY }}>{m.full_name}</p>
                  <p className="text-[9px] truncate" style={{ color: MUTED }}>{m.role}</p>
                </div>
                <MessageSquare size={11} className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" style={{ color: ACCENT }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── CENTER ── */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: `1px solid ${BORDER}` }}>
        {/* Tab bar */}
        <div className="px-4 flex items-center flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}`, height: 48 }}>
          {([
            { key: 'feed',      label: 'Feed',      Icon: Hash },
            { key: 'messages',  label: 'Messages',  Icon: MessageSquare, badge: totalUnread },
            { key: 'meeting',   label: 'Meeting',   Icon: Video,         live: meetPhase === 'live' },
            { key: 'directory', label: 'Directory', Icon: Users },
          ] as { key: CenterTab; label: string; Icon: React.ElementType; badge?: number; live?: boolean }[]).map(t => {
            const isActive = centerTab === t.key;
            return (
              <button key={t.key} onClick={() => setCenterTab(t.key)}
                className="flex items-center gap-1.5 px-4 h-full relative text-[11px] font-medium transition-colors"
                style={{ color: isActive ? NAVY : MUTED }}>
                <t.Icon size={12} style={{ color: isActive ? ACCENT : MUTED }} />
                {t.label}
                {(t.badge ?? 0) > 0 && <span className="min-w-[16px] h-4 rounded-full flex items-center justify-center text-[8px] font-bold px-1" style={{ backgroundColor: RED, color: '#fff' }}>{t.badge}</span>}
                {t.live && !isActive && <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: RED }} />}
                {isActive && <motion.div layoutId="team-tab-line" className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full" style={{ backgroundColor: ACCENT }} />}
              </button>
            );
          })}
          {meetPhase === 'live' && centerTab !== 'meeting' && (
            <button onClick={() => setCenterTab('meeting')}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold"
              style={{ backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.22)', color: RED }}>
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: RED }} />
              Meeting in progress
            </button>
          )}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">

            {centerTab === 'feed' && (
              <motion.div key="feed" className="flex flex-col h-full"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {/* Compose */}
                <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
                  <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}`, backgroundColor: '#FAF7F2' }}>
                    <input className="w-full px-4 pt-3.5 pb-0 text-[13px] font-semibold bg-transparent focus:outline-none"
                      style={{ color: NAVY, borderBottom: `1px solid ${BORDER}` }}
                      placeholder="Title (optional)…" value={compose.title} onChange={e => setCompose(c => ({ ...c, title: e.target.value }))} />
                    <textarea className="w-full px-4 py-3 text-[12px] bg-transparent resize-none focus:outline-none"
                      style={{ color: SEC, minHeight: '54px' }}
                      placeholder={`Post to ${activeSpace === 'all' ? 'All Spaces' : SPACE_CONFIG[activeSpace as TeamSpace]?.label ?? 'Team'}…`}
                      value={compose.body} onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost(); }} />
                    <div className="px-4 pb-3 flex items-center justify-between gap-2" style={{ borderTop: `1px solid ${BORDER}` }}>
                      <div className="flex gap-1 flex-wrap">
                        {(['update', 'announcement', 'handover', 'task', 'resource', 'kudos'] as PostCategory[]).map(cat => {
                          const cfg = CATEGORY_CONFIG[cat]; const isSel = compose.category === cat;
                          return (
                            <button key={cat} onClick={() => setCompose(c => ({ ...c, category: cat }))}
                              className="text-[8px] px-2 py-0.5 rounded-md font-semibold uppercase tracking-[0.08em]"
                              style={{ backgroundColor: isSel ? `${cfg.color}10` : 'transparent', color: isSel ? cfg.color : MUTED, border: isSel ? `1px solid ${cfg.color}28` : '1px solid transparent' }}>
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={handlePost} disabled={!compose.body.trim() || posting}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold flex-shrink-0"
                        style={{
                          backgroundColor: postDone ? `${GREEN}10` : compose.body.trim() ? `${ACCENT}10` : 'transparent',
                          color:           postDone ? GREEN       : compose.body.trim() ? ACCENT      : MUTED,
                          border:          postDone ? `1px solid ${GREEN}28` : compose.body.trim() ? `1px solid ${ACCENT}30` : `1px solid ${BORDER}`,
                        }}>
                        <AnimatePresence mode="wait">
                          {postDone ? <motion.span key="d" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><CheckCircle2 size={11} /> Posted</motion.span>
                          : posting  ? <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Posting…</motion.span>
                          :            <motion.span key="s" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Send size={11} /> Post</motion.span>}
                        </AnimatePresence>
                      </button>
                    </div>
                  </div>
                </div>
                {/* Feed */}
                {loading ? (
                  <div className="flex-1 flex items-center justify-center"><Loader2 size={18} className="animate-spin" style={{ color: MUTED }} /></div>
                ) : (
                  <div ref={feedRef} className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                    {pinnedPosts.length > 0 && (
                      <>
                        <div className="flex items-center gap-2">
                          <Pin size={10} style={{ color: MUTED }} />
                          <p className="text-[8px] uppercase tracking-[0.14em] font-semibold" style={{ color: MUTED }}>Pinned</p>
                        </div>
                        {pinnedPosts.map(p => <PostCard key={p.id} post={p} onLike={handleLike} />)}
                        <div className="h-px" style={{ backgroundColor: BORDER }} />
                        <p className="text-[8px] uppercase tracking-[0.14em] font-semibold" style={{ color: MUTED }}>Recent</p>
                      </>
                    )}
                    <AnimatePresence>{regularPosts.map(p => <PostCard key={p.id} post={p} onLike={handleLike} />)}</AnimatePresence>
                    <div className="h-8" />
                  </div>
                )}
              </motion.div>
            )}

            {centerTab === 'messages' && (
              <motion.div key="messages" className="h-full"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <AnimatePresence mode="wait">
                  {openDM ? (
                    <motion.div key={`dm-${openDM}`} className="h-full" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
                      {(() => {
                        const conv = dms.find(c => c.memberId === openDM);
                        return conv
                          ? <DMPanel conv={conv} onSend={handleSendDM} onBack={() => setOpenDM(null)} />
                          : <div className="flex items-center justify-center h-full"><p className="text-[11px]" style={{ color: MUTED }}>Conversation not found</p></div>;
                      })()}
                    </motion.div>
                  ) : (
                    <motion.div key="dmlist" className="h-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <DMList conversations={dms} onSelect={id => { setOpenDM(id); setDms(prev => prev.map(c => c.memberId === id ? { ...c, unread: 0 } : c)); }} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {centerTab === 'meeting' && (
              <motion.div key="meeting" className="h-full"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                {meetPhase === 'setup' || !activeMtg
                  ? <MeetingSetup members={members} onStart={handleMeetingStart} />
                  : <MeetingLive meeting={activeMtg} onEnd={handleMeetingEnd} onDM={handleDMFromMeeting} />}
              </motion.div>
            )}

            {centerTab === 'directory' && (
              <motion.div key="directory" className="h-full"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                <Directory members={members} onDM={openDMFor} />
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-shrink-0 flex flex-col overflow-hidden" style={{ width: 256 }}>
        <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: `1px solid ${BORDER}` }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>At a Glance</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Team Pulse */}
          <div className="px-3.5 py-3.5 rounded-xl" style={{ backgroundColor: `${ACCENT}05`, border: `1px solid ${ACCENT}18` }}>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles size={11} style={{ color: ACCENT }} />
              <p className="text-[8px] uppercase tracking-[0.14em] font-semibold" style={{ color: ACCENT }}>Team Pulse</p>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: SEC }}>
              {onlineCount} staff online.{' '}
              {pinnedPosts.length > 0 ? `${pinnedPosts.length} pinned item${pinnedPosts.length > 1 ? 's' : ''} require attention.` : 'No urgent pinned items.'}{' '}
              {posts.filter(p => p.category === 'task').length} open tasks in the feed.
            </p>
          </div>

          {/* Meeting in progress */}
          {meetPhase === 'live' && activeMtg && (
            <button onClick={() => setCenterTab('meeting')}
              className="w-full px-3.5 py-3 rounded-xl text-left"
              style={{ backgroundColor: 'rgba(220,38,38,0.05)', border: '1px solid rgba(220,38,38,0.18)' }}>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: RED }} />
                <p className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: RED }}>Live Meeting</p>
              </div>
              <p className="text-[11px] font-medium" style={{ color: NAVY }}>{activeMtg.title}</p>
              <p className="text-[9px] mt-0.5" style={{ color: MUTED }}>Click to rejoin</p>
            </button>
          )}

          {/* Activity */}
          <div>
            <p className="text-[8px] uppercase tracking-[0.14em] font-semibold mb-2.5" style={{ color: MUTED }}>Activity Today</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Posts',  value: posts.filter(p => new Date(p.created_at).toDateString() === new Date().toDateString()).length, color: ACCENT },
                { label: 'Online', value: onlineCount, color: GREEN },
                { label: 'Pinned', value: pinnedPosts.length, color: GOLD },
                { label: 'Tasks',  value: posts.filter(p => p.category === 'task').length, color: ACCENT },
              ].map(({ label, value, color }) => (
                <div key={label} className="px-3 py-2.5 rounded-xl" style={{ border: `1px solid ${BORDER}` }}>
                  <p className="text-[20px] font-black tracking-tight" style={{ color }}>{value}</p>
                  <p className="text-[9px]" style={{ color: MUTED }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Recognition */}
          <div>
            <p className="text-[8px] uppercase tracking-[0.14em] font-semibold mb-2.5" style={{ color: MUTED }}>Recognition</p>
            {posts.filter(p => p.category === 'kudos').length === 0
              ? <p className="text-[10px]" style={{ color: MUTED }}>No kudos yet — be the first</p>
              : posts.filter(p => p.category === 'kudos').slice(0, 2).map(p => (
                <div key={p.id} className="mb-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: `${GOLD}06`, border: `1px solid ${GOLD}20` }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Heart size={10} style={{ color: GOLD }} />
                    <p className="text-[9px] font-semibold" style={{ color: GOLD }}>KUDOS</p>
                    <p className="text-[9px]" style={{ color: MUTED }}>from {p.author_name.split(' ')[0]}</p>
                  </div>
                  <p className="text-[10px] line-clamp-2 leading-relaxed" style={{ color: SEC }}>{p.body}</p>
                </div>
              ))}
          </div>

          {/* Open Tasks */}
          <div>
            <p className="text-[8px] uppercase tracking-[0.14em] font-semibold mb-2.5" style={{ color: MUTED }}>Open Tasks</p>
            {posts.filter(p => p.category === 'task').slice(0, 3).map(p => (
              <div key={p.id} className="mb-2 flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: `${ACCENT}05`, border: `1px solid ${ACCENT}16` }}>
                <CheckCircle2 size={11} className="mt-0.5 flex-shrink-0" style={{ color: ACCENT }} />
                <div>
                  <p className="text-[10px] font-medium line-clamp-1" style={{ color: NAVY }}>{p.title ?? p.body.slice(0, 45)}</p>
                  {p.metadata.task_due && <p className="text-[9px]" style={{ color: ACCENT }}>{String(p.metadata.task_due)}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Latest Handover */}
          <div>
            <p className="text-[8px] uppercase tracking-[0.14em] font-semibold mb-2.5" style={{ color: MUTED }}>Latest Handover</p>
            {posts.filter(p => p.category === 'handover').slice(0, 1).map(p => (
              <div key={p.id} className="px-3 py-3 rounded-xl" style={{ backgroundColor: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.14)' }}>
                <p className="text-[9px] font-semibold mb-1" style={{ color: '#2563EB' }}>{p.author_name} · {fmtTime(p.created_at)}</p>
                <p className="text-[10px] leading-relaxed line-clamp-3" style={{ color: SEC }}>{p.body}</p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
