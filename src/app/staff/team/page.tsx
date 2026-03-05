'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, ClipboardList, Link as LinkIcon, Heart, Star,
  Send, Loader2, CheckCircle2, ChevronDown, Pin,
  Users, MessageSquare, Briefcase, Stethoscope, LayoutGrid,
  ThumbsUp, Video, Plus, Clock, X, Sparkles,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import {
  getTeamPosts, createTeamPost, getTeamRoster, getTeamSpaceStats, likeTeamPost,
  type TeamPost, type TeamMember, type TeamSpace, type PostCategory, type TeamSpaceStats,
} from '@/lib/actions/team-spaces';
import { getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';

const FALLBACK: StaffProfile = {
  userId: '', firstName: '—', lastName: '', email: '', jobTitle: null,
  departmentName: null, departmentId: null, roleName: null, isAdmin: false,
  isOwner: false, companyName: '', aiName: 'Aria', brandColor: '#8A6CFF',
  logoUrl: null, industry: null, reportsTo: null, teamSize: 0,
};

// =============================================================================
// CONSTANTS
// =============================================================================

const SPACE_CONFIG: Record<TeamSpace, { label: string; icon: React.ElementType; color: string }> = {
  all_staff:  { label: 'All Staff',  icon: LayoutGrid,    color: '#7C3AED' },
  reception:  { label: 'Reception',  icon: MessageSquare, color: '#0D9488' },
  clinical:   { label: 'Clinical',   icon: Stethoscope,   color: '#3B82F6' },
  management: { label: 'Management', icon: Briefcase,      color: '#D97706' },
};

const CATEGORY_CONFIG: Record<PostCategory, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  announcement: { label: 'Announcement', color: '#f97316', bg: 'rgba(249,115,22,0.07)',  icon: Megaphone },
  handover:     { label: 'Handover',     color: '#3b82f6', bg: 'rgba(59,130,246,0.07)',  icon: ClipboardList },
  task:         { label: 'Task',         color: '#7C3AED', bg: 'rgba(124,58,237,0.07)',  icon: CheckCircle2 },
  resource:     { label: 'Resource',     color: '#0D9488', bg: 'rgba(13,148,136,0.07)',  icon: LinkIcon },
  kudos:        { label: 'Kudos',        color: '#EC4899', bg: 'rgba(236,72,153,0.07)',  icon: Star },
  update:       { label: 'Update',       color: '#8B84A0', bg: 'rgba(139,132,160,0.06)', icon: MessageSquare },
};

const STATUS_DOT: Record<string, string> = {
  online:  '#059669',
  away:    '#D97706',
  offline: '#D5CCFF',
};

// =============================================================================
// HELPERS
// =============================================================================

function fmtTime(iso: string): string {
  const ms  = Date.now() - new Date(iso).getTime();
  const m   = Math.floor(ms / 60000);
  const h   = Math.floor(m / 60);
  const day = Math.floor(h / 24);
  if (m  <  2) return 'just now';
  if (m  < 60) return `${m}m ago`;
  if (h  < 24) return `${h}h ago`;
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getInitials(name: string) { return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2); }

function getColor(name: string): string {
  const palette = ['#7C3AED','#3B82F6','#0D9488','#D97706','#EC4899','#059669'];
  let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % palette.length;
  return palette[h];
}

function parseBody(body: string) { return body.split('\n').filter(Boolean); }

// =============================================================================
// POST CARD
// =============================================================================

function PostCard({ post, onLike }: { post: TeamPost & { liked?: boolean }; onLike: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const catCfg  = CATEGORY_CONFIG[post.category];
  const CatIcon = catCfg.icon;
  const lines   = parseBody(post.body);
  const preview = lines[0] ?? '';
  const hasMore = lines.length > 1 || post.body.length > 180;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${catCfg.color}22`, backgroundColor: catCfg.bg }}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
              style={{ backgroundColor: `${getColor(post.author_name)}14`, color: getColor(post.author_name), border: `1px solid ${getColor(post.author_name)}30` }}>
              {getInitials(post.author_name)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] font-semibold" style={{ color: '#1A1035' }}>{post.author_name}</p>
                {post.author_role && <p className="text-[10px]" style={{ color: '#8B84A0' }}>{post.author_role}</p>}
              </div>
              <p className="text-[9px] mt-0.5" style={{ color: '#8B84A0' }}>{fmtTime(post.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg"
              style={{ backgroundColor: `${catCfg.color}12`, border: `1px solid ${catCfg.color}25` }}>
              <CatIcon className="w-2.5 h-2.5" style={{ color: catCfg.color }} />
              <span className="text-[8px] font-semibold uppercase tracking-[0.10em]" style={{ color: catCfg.color }}>{catCfg.label}</span>
            </div>
            {post.pinned && <Pin className="w-3 h-3" style={{ color: '#8B84A0' }} />}
          </div>
        </div>

        {post.title && <p className="mt-3 text-[13px] font-semibold" style={{ color: '#1A1035' }}>{post.title}</p>}

        <div className="mt-2">
          {expanded ? (
            <div className="space-y-1">
              {lines.map((line, i) => <p key={i} className="text-[11px] leading-relaxed" style={{ color: '#524D66' }}>{line}</p>)}
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed" style={{ color: '#524D66' }}>
              {preview.length > 180 ? preview.slice(0, 180) + '…' : preview}
            </p>
          )}
          {hasMore && (
            <button onClick={() => setExpanded(e => !e)}
              className="mt-1.5 text-[10px] font-medium flex items-center gap-1" style={{ color: '#8B84A0' }}>
              <ChevronDown className="w-3 h-3" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>

        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.map(tag => (
              <span key={tag} className="text-[8px] px-2 py-0.5 rounded-md font-medium"
                style={{ backgroundColor: 'rgba(138,108,255,0.08)', color: '#6E6688', border: '1px solid #EBE5FF' }}>
                #{tag}
              </span>
            ))}
          </div>
        )}

        {post.category === 'task' && post.metadata.task_due && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl"
            style={{ backgroundColor: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)' }}>
            <CheckCircle2 className="w-3 h-3" style={{ color: '#7C3AED' }} />
            <p className="text-[10px]" style={{ color: '#524D66' }}>
              Due: <span style={{ color: '#7C3AED' }}>{String(post.metadata.task_due)}</span>
              {post.metadata.assignee && <> · {String(post.metadata.assignee)}</>}
            </p>
          </div>
        )}

        <div className="mt-3 pt-3 flex items-center gap-3" style={{ borderTop: '1px solid #EBE5FF' }}>
          <button onClick={() => onLike(post.id)}
            className="flex items-center gap-1.5 text-[10px] transition-colors"
            style={{ color: post.liked ? '#EC4899' : '#8B84A0' }}
            onMouseEnter={e => { if (!post.liked) e.currentTarget.style.color = '#6E6688'; }}
            onMouseLeave={e => { if (!post.liked) e.currentTarget.style.color = '#8B84A0'; }}>
            <ThumbsUp className="w-3 h-3" />
            {post.likes + (post.liked ? 1 : 0)}
          </button>
          <span className="text-[9px]" style={{ color: '#8B84A0' }}>{SPACE_CONFIG[post.space].label}</span>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MEETING MODE
// =============================================================================

interface AgendaItem  { id: string; text: string; done: boolean }
interface ActionItem  { id: string; text: string; assignee: string; due: string }

function MeetingMode({ members, profile, onEnd }: {
  members: TeamMember[];
  profile: StaffProfile | null;
  onEnd: (summary: string) => void;
}) {
  const [agenda,        setAgenda]        = useState<AgendaItem[]>([{ id: '1', text: 'CQC prep review', done: false }]);
  const [actions,       setActions]       = useState<ActionItem[]>([]);
  const [notes,         setNotes]         = useState('');
  const [agendaInput,   setAgendaInput]   = useState('');
  const [actionInput,   setActionInput]   = useState({ text: '', assignee: '', due: '' });
  const [elapsed,       setElapsed]       = useState(0);
  const [generating,    setGenerating]    = useState(false);
  const startRef = useRef(Date.now());

  // Stopwatch
  useEffect(() => {
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 1000);
    return () => clearInterval(interval);
  }, []);

  const fmtElapsed = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  function addAgenda() {
    if (!agendaInput.trim()) return;
    setAgenda(prev => [...prev, { id: Date.now().toString(), text: agendaInput.trim(), done: false }]);
    setAgendaInput('');
  }

  function toggleAgenda(id: string) {
    setAgenda(prev => prev.map(a => a.id === id ? { ...a, done: !a.done } : a));
  }

  function addAction() {
    if (!actionInput.text.trim()) return;
    setActions(prev => [...prev, { id: Date.now().toString(), ...actionInput }]);
    setActionInput({ text: '', assignee: '', due: '' });
  }

  async function endMeeting() {
    setGenerating(true);
    const doneItems  = agenda.filter(a => a.done).map(a => `- ${a.text}`).join('\n');
    const openItems  = agenda.filter(a => !a.done).map(a => `- ${a.text}`).join('\n');
    const actionList = actions.map(a => `- ${a.text}${a.assignee ? ` (${a.assignee})` : ''}${a.due ? ` — due ${a.due}` : ''}`).join('\n');
    const summary = `Meeting lasted ${fmtElapsed(elapsed)}.

Agenda covered:\n${doneItems || 'None marked as done'}

Open items:\n${openItems || 'None'}

Notes:\n${notes || 'No notes taken'}

Action items:\n${actionList || 'None recorded'}`;
    setGenerating(false);
    onEnd(summary);
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Meeting header */}
      <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #EBE5FF', backgroundColor: 'rgba(124,58,237,0.04)' }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <p className="text-[13px] font-bold" style={{ color: '#1A1035' }}>Live Meeting</p>
          <div className="px-2 py-0.5 rounded-md font-mono text-[11px]" style={{ backgroundColor: 'rgba(124,58,237,0.10)', color: '#7C3AED' }}>
            {fmtElapsed(elapsed)}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {members.filter(m => m.status !== 'offline').slice(0, 4).map(m => (
              <div key={m.id} className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold"
                style={{ backgroundColor: `${m.color}18`, color: m.color, border: `1px solid ${m.color}30` }}>
                {getInitials(m.full_name)}
              </div>
            ))}
            <p className="text-[10px] ml-1" style={{ color: '#6E6688' }}>{members.filter(m => m.status !== 'offline').length} present</p>
          </div>
          <button onClick={endMeeting} disabled={generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold transition-all"
            style={{ backgroundColor: 'rgba(220,38,38,0.10)', border: '1px solid rgba(220,38,38,0.25)', color: '#DC2626' }}>
            {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            End &amp; Publish
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 grid grid-cols-[1fr_1fr] gap-6">
        {/* Agenda */}
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-3" style={{ color: '#8B84A0' }}>Agenda</p>
          <div className="space-y-2 mb-3">
            {agenda.map(item => (
              <div key={item.id} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                style={{ border: '1px solid #EBE5FF', backgroundColor: item.done ? 'rgba(5,150,105,0.05)' : 'transparent' }}
                onClick={() => toggleAgenda(item.id)}>
                <div className="w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: item.done ? '#059669' : '#D5CCFF', backgroundColor: item.done ? 'rgba(5,150,105,0.12)' : 'transparent' }}>
                  {item.done && <CheckCircle2 className="w-3 h-3" style={{ color: '#059669' }} />}
                </div>
                <p className="text-[11px]" style={{ color: item.done ? '#8B84A0' : '#1A1035', textDecoration: item.done ? 'line-through' : 'none' }}>{item.text}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="flex-1 px-3 py-2 rounded-xl text-[11px] focus:outline-none"
              style={{ border: '1px solid #EBE5FF', backgroundColor: 'white', color: '#1A1035' }}
              placeholder="Add agenda item…"
              value={agendaInput}
              onChange={e => setAgendaInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addAgenda(); }}
            />
            <button onClick={addAgenda} className="px-3 py-2 rounded-xl text-[10px] font-semibold"
              style={{ backgroundColor: 'rgba(124,58,237,0.10)', color: '#7C3AED', border: '1px solid #D5CCFF' }}>
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Notes */}
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-3" style={{ color: '#8B84A0' }}>Meeting Notes</p>
          <textarea className="w-full px-3 py-2.5 rounded-xl text-[11px] leading-relaxed resize-none focus:outline-none"
            style={{ border: '1px solid #EBE5FF', backgroundColor: 'white', color: '#1A1035', height: '140px' }}
            placeholder="Type notes here…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
          />
        </div>

        {/* Action items — full width */}
        <div className="col-span-2">
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-3" style={{ color: '#8B84A0' }}>Action Items</p>
          <div className="space-y-2 mb-3">
            {actions.map(a => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ border: '1px solid #EBE5FF' }}>
                <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: '#7C3AED' }} />
                <p className="text-[11px] flex-1" style={{ color: '#1A1035' }}>{a.text}</p>
                {a.assignee && <span className="text-[10px] px-2 py-0.5 rounded-lg" style={{ backgroundColor: 'rgba(124,58,237,0.08)', color: '#7C3AED' }}>{a.assignee}</span>}
                {a.due && <span className="flex items-center gap-1 text-[10px]" style={{ color: '#8B84A0' }}><Clock className="w-2.5 h-2.5" />{a.due}</span>}
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="flex-1 px-3 py-2 rounded-xl text-[11px] focus:outline-none"
              style={{ border: '1px solid #EBE5FF', backgroundColor: 'white', color: '#1A1035' }}
              placeholder="Action item…"
              value={actionInput.text}
              onChange={e => setActionInput(a => ({ ...a, text: e.target.value }))}
            />
            <input className="w-28 px-3 py-2 rounded-xl text-[11px] focus:outline-none"
              style={{ border: '1px solid #EBE5FF', backgroundColor: 'white', color: '#1A1035' }}
              placeholder="Assignee"
              value={actionInput.assignee}
              onChange={e => setActionInput(a => ({ ...a, assignee: e.target.value }))}
            />
            <input className="w-24 px-3 py-2 rounded-xl text-[11px] focus:outline-none"
              style={{ border: '1px solid #EBE5FF', backgroundColor: 'white', color: '#1A1035' }}
              placeholder="Due date"
              value={actionInput.due}
              onChange={e => setActionInput(a => ({ ...a, due: e.target.value }))}
            />
            <button onClick={addAction} className="px-3 py-2 rounded-xl text-[10px] font-semibold"
              style={{ backgroundColor: 'rgba(124,58,237,0.10)', color: '#7C3AED', border: '1px solid #D5CCFF' }}>
              <Plus className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

type CenterView = 'feed' | 'meeting';

export default function TeamPage() {
  const searchParams = useSearchParams();
  const userId       = searchParams.get('userId') ?? '';

  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState('#8A6CFF');

  const [activeSpace, setActiveSpace]   = useState<TeamSpace | 'all'>('all');
  const [posts,       setPosts]         = useState<(TeamPost & { liked?: boolean })[]>([]);
  const [members,     setMembers]       = useState<TeamMember[]>([]);
  const [stats,       setStats]         = useState<TeamSpaceStats | null>(null);
  const [loading,     setLoading]       = useState(true);
  const [likedIds,    setLikedIds]      = useState<Set<string>>(new Set());
  const [centerView,  setCenterView]    = useState<CenterView>('feed');

  const [compose, setCompose] = useState({ body: '', category: 'update' as PostCategory, title: '' });
  const [posting,  setPosting]  = useState(false);
  const [postDone, setPostDone] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!userId) return;
    getStaffProfile('clinic', userId).then(r => {
      if (r.success && r.data?.profile) { setProfile(r.data.profile); setBrandColor(r.data.profile.brandColor ?? '#8A6CFF'); }
    });
    Promise.all([getTeamRoster(), getTeamSpaceStats()]).then(([m, s]) => { setMembers(m); setStats(s); });
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    getTeamPosts(activeSpace as TeamSpace).then(data => {
      setPosts(data.map(p => ({ ...p, liked: false })));
      setLoading(false);
    });
  }, [activeSpace]);

  const pinnedPosts  = useMemo(() => posts.filter(p => p.pinned),  [posts]);
  const regularPosts = useMemo(() => posts.filter(p => !p.pinned), [posts]);
  const onlineCount  = members.filter(m => m.status === 'online').length;

  async function handlePost() {
    if (!compose.body.trim() || posting) return;
    setPosting(true);
    const res = await createTeamPost({
      space:       activeSpace === 'all' ? 'all_staff' : activeSpace,
      category:    compose.category,
      title:       compose.title.trim() || undefined,
      body:        compose.body.trim(),
      author_name: profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff',
      author_role: profile?.roleName ?? null,
    });
    if (res.success) {
      const newPost: TeamPost & { liked: boolean } = {
        id:          res.id ?? `local-${Date.now()}`,
        space:       activeSpace === 'all' ? 'all_staff' : activeSpace,
        category:    compose.category,
        title:       compose.title.trim() || null,
        body:        compose.body.trim(),
        tags:        [],
        author_name: profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff',
        author_role: profile?.roleName ?? null,
        likes: 0, pinned: false, metadata: {},
        created_at:  new Date().toISOString(),
        liked: false,
      };
      setPosts(prev => [newPost, ...prev]);
      setCompose({ body: '', category: 'update', title: '' });
      setPostDone(true);
      setTimeout(() => setPostDone(false), 2500);
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

  function handleMeetingEnd(summary: string) {
    // Publish meeting summary as a post
    setCenterView('feed');
    const meetPost: TeamPost & { liked: boolean } = {
      id: `meeting-${Date.now()}`,
      space:       activeSpace === 'all' ? 'all_staff' : activeSpace,
      category:    'resource',
      title:       `Meeting Summary — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
      body:        summary,
      tags:        ['meeting', 'minutes'],
      author_name: profile ? `${profile.firstName} ${profile.lastName}`.trim() : 'Staff',
      author_role: profile?.roleName ?? null,
      likes: 0, pinned: false, metadata: { meeting: true },
      created_at: new Date().toISOString(),
      liked: false,
    };
    setPosts(prev => [meetPost, ...prev]);
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#FAF7F2', paddingLeft: 'var(--nav-w, 240px)' }}>
      <StaffNav profile={profile ?? FALLBACK} userId={userId} brandColor={brandColor} currentPath="Team" />

      {/* ===== LEFT: SPACES + ROSTER ===== */}
      <div className="w-[220px] flex-shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid #EBE5FF' }}>

        {/* Spaces */}
        <div className="p-4" style={{ borderBottom: '1px solid #EBE5FF' }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-3" style={{ color: '#8B84A0' }}>Spaces</p>
          <button onClick={() => setActiveSpace('all')}
            className="w-full text-left px-3 py-2.5 rounded-xl mb-1 flex items-center gap-2.5 transition-all"
            style={{
              backgroundColor: activeSpace === 'all' ? 'rgba(124,58,237,0.08)' : 'transparent',
              borderLeft:      activeSpace === 'all' ? '2px solid #7C3AED' : '2px solid transparent',
            }}>
            <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0" style={{ color: activeSpace === 'all' ? '#7C3AED' : '#8B84A0' }} />
            <span className="text-[12px] font-medium flex-1" style={{ color: activeSpace === 'all' ? '#1A1035' : '#524D66' }}>All Spaces</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(138,108,255,0.08)', color: '#8B84A0' }}>{posts.length}</span>
          </button>

          {(Object.entries(SPACE_CONFIG) as [TeamSpace, typeof SPACE_CONFIG[TeamSpace]][]).map(([key, cfg]) => {
            const Icon = cfg.icon;
            const isActive = activeSpace === key;
            return (
              <button key={key} onClick={() => setActiveSpace(key)}
                className="w-full text-left px-3 py-2 rounded-xl mb-0.5 flex items-center gap-2.5 transition-all"
                style={{
                  backgroundColor: isActive ? `${cfg.color}0c` : 'transparent',
                  borderLeft:      isActive ? `2px solid ${cfg.color}` : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(138,108,255,0.04)'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}>
                <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? cfg.color : '#8B84A0' }} />
                <span className="text-[12px] flex-1" style={{ color: isActive ? '#1A1035' : '#524D66' }}>{cfg.label}</span>
                {stats && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: isActive ? `${cfg.color}12` : 'rgba(138,108,255,0.06)', color: isActive ? cfg.color : '#8B84A0' }}>
                    {stats[key]}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Team Roster */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: '#8B84A0' }}>Team</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(5,150,105,0.10)', color: '#059669', border: '1px solid rgba(5,150,105,0.20)' }}>
              {onlineCount} online
            </span>
          </div>
          <div className="space-y-1">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl" style={{ backgroundColor: 'rgba(138,108,255,0.04)' }}>
                <div className="relative flex-shrink-0">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold"
                    style={{ backgroundColor: `${m.color}14`, color: m.color }}>
                    {getInitials(m.full_name)}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border"
                    style={{ backgroundColor: STATUS_DOT[m.status], borderColor: '#FAF7F2' }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium truncate" style={{ color: '#1A1035' }}>{m.full_name}</p>
                  <p className="text-[9px] truncate" style={{ color: '#8B84A0' }}>{m.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== CENTER: FEED or MEETING ===== */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid #EBE5FF' }}>

        {/* Header with view tabs */}
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid #EBE5FF' }}>
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: '#8B84A0' }}>Team Spaces</p>
            <p className="text-[20px] font-black tracking-tight" style={{ color: '#1A1035' }}>
              {activeSpace === 'all' ? 'All Spaces' : SPACE_CONFIG[activeSpace as TeamSpace].label}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex gap-1 p-1 rounded-xl" style={{ backgroundColor: 'rgba(138,108,255,0.06)', border: '1px solid #EBE5FF' }}>
              <button onClick={() => setCenterView('feed')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                style={{ backgroundColor: centerView === 'feed' ? 'rgba(138,108,255,0.12)' : 'transparent', color: centerView === 'feed' ? '#6D28D9' : '#8B84A0' }}>
                <MessageSquare className="w-3 h-3" /> Feed
              </button>
              <button onClick={() => setCenterView('meeting')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                style={{ backgroundColor: centerView === 'meeting' ? 'rgba(220,38,38,0.10)' : 'transparent', color: centerView === 'meeting' ? '#DC2626' : '#8B84A0' }}>
                <Video className="w-3 h-3" />
                {centerView === 'meeting' ? 'In Meeting' : 'Start Meeting'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-3.5 h-3.5" style={{ color: '#8B84A0' }} />
              <p className="text-[11px]" style={{ color: '#6E6688' }}>{members.length} members · {onlineCount} online</p>
            </div>
          </div>
        </div>

        {/* Meeting mode */}
        {centerView === 'meeting' ? (
          <MeetingMode members={members} profile={profile} onEnd={handleMeetingEnd} />
        ) : (
          <>
            {/* Compose */}
            <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #EBE5FF' }}>
              <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF', backgroundColor: 'white' }}>
                <input
                  className="w-full px-4 pt-3.5 pb-0 text-[12px] font-semibold bg-transparent focus:outline-none"
                  style={{ color: '#1A1035', borderBottom: '1px solid #EBE5FF' }}
                  placeholder="Title (optional)…"
                  value={compose.title}
                  onChange={e => setCompose(c => ({ ...c, title: e.target.value }))}
                />
                <textarea
                  className="w-full px-4 py-3 text-[12px] bg-transparent resize-none focus:outline-none"
                  style={{ color: '#524D66', minHeight: '60px' }}
                  placeholder={`Post to ${activeSpace === 'all' ? 'All Spaces' : SPACE_CONFIG[activeSpace as TeamSpace]?.label ?? 'Team'}…`}
                  value={compose.body}
                  onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost(); }}
                />
                <div className="px-4 pb-3 flex items-center justify-between">
                  <div className="flex gap-1.5">
                    {(['update', 'announcement', 'handover', 'task', 'resource', 'kudos'] as PostCategory[]).map(cat => {
                      const cfg = CATEGORY_CONFIG[cat];
                      return (
                        <button key={cat} onClick={() => setCompose(c => ({ ...c, category: cat }))}
                          className="text-[8px] px-2 py-0.5 rounded-md font-semibold uppercase tracking-[0.08em] transition-all"
                          style={{
                            backgroundColor: compose.category === cat ? `${cfg.color}12` : 'transparent',
                            color:           compose.category === cat ? cfg.color : '#8B84A0',
                            border:          compose.category === cat ? `1px solid ${cfg.color}30` : '1px solid transparent',
                          }}>
                          {cfg.label}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={handlePost} disabled={!compose.body.trim() || posting}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold transition-all"
                    style={{
                      backgroundColor: postDone ? 'rgba(5,150,105,0.10)' : (compose.body.trim() ? 'rgba(138,108,255,0.10)' : 'transparent'),
                      color:           postDone ? '#059669' : (compose.body.trim() ? '#6D28D9' : '#8B84A0'),
                      border:          postDone ? '1px solid rgba(5,150,105,0.25)' : (compose.body.trim() ? '1px solid #D5CCFF' : '1px solid #EBE5FF'),
                    }}>
                    <AnimatePresence mode="wait">
                      {postDone  ? <motion.span key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Posted</motion.span>
                      : posting  ? <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Posting…</motion.span>
                      :            <motion.span key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Send className="w-3 h-3" /> Post</motion.span>}
                    </AnimatePresence>
                  </button>
                </div>
              </div>
            </div>

            {/* Feed */}
            {loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: '#8B84A0' }} />
              </div>
            ) : (
              <div ref={feedRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {pinnedPosts.length > 0 && (
                  <>
                    <div className="flex items-center gap-2">
                      <Pin className="w-2.5 h-2.5" style={{ color: '#8B84A0' }} />
                      <p className="text-[8px] uppercase tracking-[0.14em] font-semibold" style={{ color: '#8B84A0' }}>Pinned</p>
                    </div>
                    {pinnedPosts.map(p => <PostCard key={p.id} post={p} onLike={handleLike} />)}
                    <div className="h-px" style={{ backgroundColor: '#EBE5FF' }} />
                    <p className="text-[8px] uppercase tracking-[0.14em] font-semibold" style={{ color: '#8B84A0' }}>Recent</p>
                  </>
                )}
                <AnimatePresence>
                  {regularPosts.map(p => <PostCard key={p.id} post={p} onLike={handleLike} />)}
                </AnimatePresence>
                <div className="h-6" />
              </div>
            )}
          </>
        )}
      </div>

      {/* ===== RIGHT: AT A GLANCE ===== */}
      <div className="w-[248px] flex-shrink-0 flex flex-col overflow-hidden">
        <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #EBE5FF' }}>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: '#8B84A0' }}>At a Glance</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* AI Team Pulse */}
          <div className="px-3 py-3 rounded-xl" style={{ backgroundColor: 'rgba(124,58,237,0.05)', border: '1px solid #D5CCFF' }}>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Sparkles className="w-3 h-3" style={{ color: '#7C3AED' }} />
              <p className="text-[8px] uppercase tracking-[0.14em] font-semibold" style={{ color: '#7C3AED' }}>Team Pulse</p>
            </div>
            <p className="text-[10px] leading-relaxed" style={{ color: '#524D66' }}>
              {onlineCount} staff online. {pinnedPosts.length > 0 ? `${pinnedPosts.length} pinned item${pinnedPosts.length > 1 ? 's' : ''} need attention.` : 'No urgent pinned items.'} {posts.filter(p => p.category === 'task').length} open tasks in the feed.
            </p>
          </div>

          {/* Activity */}
          <div>
            <p className="text-[8px] uppercase tracking-[0.14em] font-semibold mb-3" style={{ color: '#8B84A0' }}>Activity Today</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Posts',   value: posts.filter(p => { const d = new Date(p.created_at); return d.toDateString() === new Date().toDateString(); }).length.toString(), color: '#7C3AED' },
                { label: 'Online',  value: onlineCount.toString(), color: '#059669' },
                { label: 'Pinned',  value: pinnedPosts.length.toString(), color: '#D97706' },
                { label: 'Tasks',   value: posts.filter(p => p.category === 'task').length.toString(), color: '#7C3AED' },
              ].map(({ label, value, color }) => (
                <div key={label} className="px-3 py-2.5 rounded-xl" style={{ border: '1px solid #EBE5FF' }}>
                  <p className="text-[18px] font-black tracking-tight" style={{ color }}>{value}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: '#8B84A0' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Kudos */}
          <div>
            <p className="text-[8px] uppercase tracking-[0.14em] font-semibold mb-3" style={{ color: '#8B84A0' }}>Recognition</p>
            {posts.filter(p => p.category === 'kudos').length === 0 ? (
              <p className="text-[10px]" style={{ color: '#8B84A0' }}>No kudos yet — be the first!</p>
            ) : posts.filter(p => p.category === 'kudos').slice(0, 2).map(p => (
              <div key={p.id} className="mb-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.15)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Heart className="w-2.5 h-2.5" style={{ color: '#EC4899' }} />
                  <p className="text-[9px] font-semibold" style={{ color: '#EC4899' }}>KUDOS</p>
                  <p className="text-[9px]" style={{ color: '#8B84A0' }}>from {p.author_name.split(' ')[0]}</p>
                </div>
                <p className="text-[10px] line-clamp-2 leading-relaxed" style={{ color: '#524D66' }}>{p.body}</p>
              </div>
            ))}
          </div>

          {/* Open tasks */}
          <div>
            <p className="text-[8px] uppercase tracking-[0.14em] font-semibold mb-3" style={{ color: '#8B84A0' }}>Open Tasks</p>
            {posts.filter(p => p.category === 'task').length === 0 ? (
              <p className="text-[10px]" style={{ color: '#8B84A0' }}>No open tasks</p>
            ) : posts.filter(p => p.category === 'task').slice(0, 3).map(p => (
              <div key={p.id} className="mb-2 flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.15)' }}>
                <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: '#7C3AED' }} />
                <div>
                  <p className="text-[10px] font-medium line-clamp-1" style={{ color: '#1A1035' }}>{p.title ?? p.body.slice(0, 40)}</p>
                  {p.metadata.task_due && <p className="text-[9px] mt-0.5" style={{ color: '#7C3AED' }}>{String(p.metadata.task_due)}</p>}
                </div>
              </div>
            ))}
          </div>

          {/* Latest Handover */}
          <div>
            <p className="text-[8px] uppercase tracking-[0.14em] font-semibold mb-3" style={{ color: '#8B84A0' }}>Latest Handover</p>
            {posts.filter(p => p.category === 'handover').slice(0, 1).map(p => (
              <div key={p.id} className="px-3 py-3 rounded-xl" style={{ backgroundColor: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.15)' }}>
                <p className="text-[9px] font-semibold mb-1" style={{ color: '#3B82F6' }}>{p.author_name} · {fmtTime(p.created_at)}</p>
                <p className="text-[10px] leading-relaxed line-clamp-3" style={{ color: '#524D66' }}>{p.body}</p>
              </div>
            ))}
          </div>

          {/* Resources */}
          {posts.filter(p => p.category === 'resource').length > 0 && (
            <div>
              <p className="text-[8px] uppercase tracking-[0.14em] font-semibold mb-3" style={{ color: '#8B84A0' }}>Resources</p>
              {posts.filter(p => p.category === 'resource').slice(0, 3).map(p => (
                <div key={p.id} className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(13,148,136,0.05)', border: '1px solid rgba(13,148,136,0.15)' }}>
                  <LinkIcon className="w-3 h-3 flex-shrink-0" style={{ color: '#0D9488' }} />
                  <p className="text-[10px] truncate" style={{ color: '#1A1035' }}>{p.title ?? p.body.slice(0, 40)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
