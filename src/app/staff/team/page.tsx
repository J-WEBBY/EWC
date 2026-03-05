'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone, ClipboardList, Link as LinkIcon, Heart, Star,
  Send, Loader2, CheckCircle2, ChevronDown, Pin,
  Users, MessageSquare, Briefcase, Stethoscope, LayoutGrid,
  ThumbsUp,
} from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import {
  getTeamPosts, createTeamPost, getTeamRoster, getTeamSpaceStats, likeTeamPost,
  type TeamPost, type TeamMember, type TeamSpace, type PostCategory, type TeamSpaceStats,
} from '@/lib/actions/team-spaces';
import { getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';

// =============================================================================
// CONSTANTS
// =============================================================================

const SPACE_CONFIG: Record<TeamSpace, { label: string; icon: React.ElementType; color: string }> = {
  all_staff:  { label: 'All Staff',  icon: LayoutGrid,   color: '#8b5cf6' },
  reception:  { label: 'Reception',  icon: MessageSquare, color: '#0D9488' },
  clinical:   { label: 'Clinical',   icon: Stethoscope,  color: '#3B82F6' },
  management: { label: 'Management', icon: Briefcase,    color: '#D97706' },
};

const CATEGORY_CONFIG: Record<PostCategory, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  announcement: { label: 'Announcement', color: '#f97316', bg: 'rgba(249,115,22,0.10)',  icon: Megaphone },
  handover:     { label: 'Handover',     color: '#3b82f6', bg: 'rgba(59,130,246,0.10)',  icon: ClipboardList },
  task:         { label: 'Task',         color: '#a855f7', bg: 'rgba(168,85,247,0.10)',  icon: CheckCircle2 },
  resource:     { label: 'Resource',     color: '#14b8a6', bg: 'rgba(20,184,166,0.10)',  icon: LinkIcon },
  kudos:        { label: 'Kudos',        color: '#ec4899', bg: 'rgba(236,72,153,0.10)',  icon: Star },
  update:       { label: 'Update',       color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', icon: MessageSquare },
};

const STATUS_DOT: Record<string, string> = {
  online: '#22c55e',
  away:   '#f59e0b',
  offline: 'rgba(255,255,255,0.15)',
};

// =============================================================================
// HELPERS
// =============================================================================

function fmtTime(iso: string): string {
  const ms  = Date.now() - new Date(iso).getTime();
  const m   = Math.floor(ms / 60000);
  const h   = Math.floor(m / 60);
  const day = Math.floor(h / 24);
  if (m < 2)   return 'just now';
  if (m < 60)  return `${m}m ago`;
  if (h < 24)  return `${h}h ago`;
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getColor(name: string): string {
  const palette = ['#8b5cf6', '#3b82f6', '#0D9488', '#D97706', '#ec4899', '#22c55e'];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % palette.length;
  return palette[h];
}

function parseBody(body: string) {
  // Convert newlines + numbered lists to structured output
  return body.split('\n').filter(Boolean);
}

// =============================================================================
// POST CARD
// =============================================================================

function PostCard({
  post, onLike,
}: { post: TeamPost & { liked?: boolean }; onLike: (id: string) => void }) {
  const [expanded, setExpanded]   = useState(false);
  const catCfg  = CATEGORY_CONFIG[post.category];
  const CatIcon = catCfg.icon;
  const lines   = parseBody(post.body);
  const preview = lines[0] ?? '';
  const hasMore = lines.length > 1 || post.body.length > 180;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${catCfg.color}20`, backgroundColor: catCfg.bg }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {/* Author avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
              style={{ backgroundColor: `${getColor(post.author_name)}20`, color: getColor(post.author_name), border: `1px solid ${getColor(post.author_name)}40` }}
            >
              {getInitials(post.author_name)}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <p className="text-[12px] font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{post.author_name}</p>
                {post.author_role && (
                  <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{post.author_role}</p>
                )}
              </div>
              <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.20)' }}>{fmtTime(post.created_at)}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Category badge */}
            <div
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg"
              style={{ backgroundColor: `${catCfg.color}18`, border: `1px solid ${catCfg.color}30` }}
            >
              <CatIcon className="w-2.5 h-2.5" style={{ color: catCfg.color }} />
              <span className="text-[8px] font-semibold uppercase tracking-[0.10em]" style={{ color: catCfg.color }}>
                {catCfg.label}
              </span>
            </div>
            {/* Pinned */}
            {post.pinned && <Pin className="w-3 h-3" style={{ color: 'rgba(255,255,255,0.25)' }} />}
          </div>
        </div>

        {/* Title */}
        {post.title && (
          <p className="mt-3 text-[13px] font-semibold" style={{ color: 'rgba(255,255,255,0.88)' }}>
            {post.title}
          </p>
        )}

        {/* Body */}
        <div className="mt-2">
          {expanded ? (
            <div className="space-y-1">
              {lines.map((line, i) => (
                <p key={i} className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.58)' }}>
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {preview.length > 180 ? preview.slice(0, 180) + '…' : preview}
            </p>
          )}
          {hasMore && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="mt-1.5 text-[10px] font-medium flex items-center gap-1"
              style={{ color: 'rgba(255,255,255,0.28)' }}
            >
              <ChevronDown className="w-3 h-3" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.tags.map(tag => (
              <span
                key={tag}
                className="text-[8px] px-2 py-0.5 rounded-md font-medium"
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.07)' }}
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Task metadata */}
        {post.category === 'task' && post.metadata.task_due && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.15)' }}>
            <CheckCircle2 className="w-3 h-3" style={{ color: '#a855f7' }} />
            <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Due: <span style={{ color: '#a855f7' }}>{String(post.metadata.task_due)}</span>
              {post.metadata.assignee && <> · {String(post.metadata.assignee)}</>}
            </p>
          </div>
        )}

        {/* Footer: likes */}
        <div className="mt-3 pt-3 flex items-center gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => onLike(post.id)}
            className="flex items-center gap-1.5 text-[10px] transition-colors"
            style={{ color: post.liked ? '#ec4899' : 'rgba(255,255,255,0.22)' }}
            onMouseEnter={e => { if (!post.liked) e.currentTarget.style.color = 'rgba(255,255,255,0.50)'; }}
            onMouseLeave={e => { if (!post.liked) e.currentTarget.style.color = 'rgba(255,255,255,0.22)'; }}
          >
            <ThumbsUp className="w-3 h-3" />
            {post.likes + (post.liked ? 1 : 0)}
          </button>
          <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.14)' }}>
            {SPACE_CONFIG[post.space].label}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function TeamPage() {
  const searchParams = useSearchParams();
  const userId       = searchParams.get('userId') ?? '';

  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState('#ffffff');

  const [activeSpace, setActiveSpace]   = useState<TeamSpace | 'all'>('all');
  const [posts,       setPosts]         = useState<(TeamPost & { liked?: boolean })[]>([]);
  const [members,     setMembers]       = useState<TeamMember[]>([]);
  const [stats,       setStats]         = useState<TeamSpaceStats | null>(null);
  const [loading,     setLoading]       = useState(true);
  const [likedIds,    setLikedIds]      = useState<Set<string>>(new Set());

  const [compose, setCompose] = useState({
    body:     '',
    category: 'update' as PostCategory,
    title:    '',
  });
  const [posting,  setPosting]  = useState(false);
  const [postDone, setPostDone] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);

  // Load data
  useEffect(() => {
    if (!userId) return;
    getStaffProfile('clinic', userId).then(r => {
      if (r.success && r.data?.profile) {
        setProfile(r.data.profile);
        setBrandColor(r.data.profile.brandColor ?? '#ffffff');
      }
    });
    Promise.all([getTeamRoster(), getTeamSpaceStats()]).then(([m, s]) => {
      setMembers(m);
      setStats(s);
    });
  }, [userId]);

  // Load posts when space changes
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
        likes:       0,
        pinned:      false,
        metadata:    {},
        created_at:  new Date().toISOString(),
        liked:       false,
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

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#000', paddingLeft: 'var(--nav-w, 240px)' }}>
      <StaffNav
        profile={profile ?? { userId: '', firstName: '—', lastName: '', email: '', jobTitle: null, departmentName: null, departmentId: null, roleName: null, isAdmin: false, isOwner: false, companyName: '', aiName: 'Aria', brandColor: '#ffffff', logoUrl: null, industry: null, reportsTo: null, teamSize: 0 }}
        userId={userId}
        brandColor={brandColor}
        currentPath="Team"
      />

      {/* =========== LEFT: SPACES + ROSTER =========== */}
      <div className="w-[220px] flex-shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Spaces */}
        <div className="p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[9px] uppercase tracking-[0.18em] font-medium mb-3" style={{ color: 'rgba(255,255,255,0.20)' }}>Spaces</p>
          {/* All Staff (special) */}
          <button
            onClick={() => setActiveSpace('all')}
            className="w-full text-left px-3 py-2.5 rounded-xl mb-1 flex items-center gap-2.5 transition-all"
            style={{
              backgroundColor: activeSpace === 'all' ? 'rgba(255,255,255,0.08)' : 'transparent',
              borderLeft: activeSpace === 'all' ? '2px solid rgba(255,255,255,0.30)' : '2px solid transparent',
            }}
          >
            <LayoutGrid className="w-3.5 h-3.5 flex-shrink-0" style={{ color: activeSpace === 'all' ? '#fff' : 'rgba(255,255,255,0.30)' }} />
            <span className="text-[12px] font-medium flex-1" style={{ color: activeSpace === 'all' ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.40)' }}>All Spaces</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)' }}>
              {posts.length}
            </span>
          </button>

          {(Object.entries(SPACE_CONFIG) as [TeamSpace, typeof SPACE_CONFIG[TeamSpace]][]).map(([key, cfg]) => {
            const Icon    = cfg.icon;
            const isActive = activeSpace === key;
            return (
              <button
                key={key}
                onClick={() => setActiveSpace(key)}
                className="w-full text-left px-3 py-2 rounded-xl mb-0.5 flex items-center gap-2.5 transition-all"
                style={{
                  backgroundColor: isActive ? `${cfg.color}14` : 'transparent',
                  borderLeft: isActive ? `2px solid ${cfg.color}` : '2px solid transparent',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: isActive ? cfg.color : 'rgba(255,255,255,0.25)' }} />
                <span className="text-[12px] flex-1" style={{ color: isActive ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.38)' }}>
                  {cfg.label}
                </span>
                {stats && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: isActive ? `${cfg.color}20` : 'rgba(255,255,255,0.04)', color: isActive ? cfg.color : 'rgba(255,255,255,0.20)' }}>
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
            <p className="text-[9px] uppercase tracking-[0.18em] font-medium" style={{ color: 'rgba(255,255,255,0.20)' }}>Team</p>
            <span className="text-[9px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(34,197,94,0.10)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.20)' }}>
              {onlineCount} online
            </span>
          </div>

          <div className="space-y-1">
            {members.map(m => (
              <div key={m.id} className="flex items-center gap-2.5 px-2 py-2 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                <div className="relative flex-shrink-0">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold"
                    style={{ backgroundColor: `${m.color}20`, color: m.color }}
                  >
                    {getInitials(m.full_name)}
                  </div>
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border"
                    style={{ backgroundColor: STATUS_DOT[m.status], borderColor: '#000' }}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.65)' }}>{m.full_name}</p>
                  <p className="text-[9px] truncate" style={{ color: 'rgba(255,255,255,0.22)' }}>{m.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* =========== CENTER: FEED =========== */}
      <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}>

        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div>
            <p className="text-[9px] uppercase tracking-[0.18em] font-medium mb-0.5" style={{ color: 'rgba(255,255,255,0.20)' }}>Team Spaces</p>
            <p className="text-[20px] font-black tracking-tight" style={{ color: 'rgba(255,255,255,0.88)' }}>
              {activeSpace === 'all' ? 'All Spaces' : SPACE_CONFIG[activeSpace as TeamSpace].label}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5" style={{ color: 'rgba(255,255,255,0.20)' }} />
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.28)' }}>{members.length} members · {onlineCount} online</p>
          </div>
        </div>

        {/* Compose */}
        <div className="px-6 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
            {/* Title (optional) */}
            <input
              className="w-full px-4 pt-3.5 pb-0 text-[12px] font-semibold bg-transparent focus:outline-none"
              style={{ color: 'rgba(255,255,255,0.70)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
              placeholder="Title (optional)…"
              value={compose.title}
              onChange={e => setCompose(c => ({ ...c, title: e.target.value }))}
            />
            <textarea
              className="w-full px-4 py-3 text-[12px] bg-transparent resize-none focus:outline-none"
              style={{ color: 'rgba(255,255,255,0.65)', minHeight: '60px' }}
              placeholder={`Post to ${activeSpace === 'all' ? 'All Spaces' : SPACE_CONFIG[activeSpace as TeamSpace]?.label ?? 'Team'}…`}
              value={compose.body}
              onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost(); }}
            />
            <div className="px-4 pb-3 flex items-center justify-between">
              {/* Category */}
              <div className="flex gap-1.5">
                {(['update', 'announcement', 'handover', 'task', 'resource', 'kudos'] as PostCategory[]).map(cat => {
                  const cfg = CATEGORY_CONFIG[cat];
                  return (
                    <button
                      key={cat}
                      onClick={() => setCompose(c => ({ ...c, category: cat }))}
                      className="text-[8px] px-2 py-0.5 rounded-md font-semibold uppercase tracking-[0.08em] transition-all"
                      style={{
                        backgroundColor: compose.category === cat ? `${cfg.color}20` : 'transparent',
                        color:           compose.category === cat ? cfg.color : 'rgba(255,255,255,0.22)',
                        border:          compose.category === cat ? `1px solid ${cfg.color}40` : '1px solid transparent',
                      }}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>

              {/* Send */}
              <button
                onClick={handlePost}
                disabled={!compose.body.trim() || posting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-semibold transition-all"
                style={{
                  backgroundColor: postDone ? 'rgba(34,197,94,0.12)' : (compose.body.trim() ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.03)'),
                  color:           postDone ? '#22c55e' : (compose.body.trim() ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.20)'),
                  border:          postDone ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.10)',
                }}
              >
                <AnimatePresence mode="wait">
                  {postDone  ? <motion.span key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Posted</motion.span>
                  : posting  ? <motion.span key="spin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Posting…</motion.span>
                  : <motion.span key="send" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1"><Send className="w-3 h-3" /> Post</motion.span>}
                </AnimatePresence>
              </button>
            </div>
          </div>
        </div>

        {/* Feed */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'rgba(255,255,255,0.15)' }} />
          </div>
        ) : (
          <div ref={feedRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {/* Pinned */}
            {pinnedPosts.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <Pin className="w-2.5 h-2.5" style={{ color: 'rgba(255,255,255,0.20)' }} />
                  <p className="text-[9px] uppercase tracking-[0.14em] font-medium" style={{ color: 'rgba(255,255,255,0.20)' }}>Pinned</p>
                </div>
                {pinnedPosts.map(p => <PostCard key={p.id} post={p} onLike={handleLike} />)}
                <div className="h-px" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }} />
                <p className="text-[9px] uppercase tracking-[0.14em] font-medium" style={{ color: 'rgba(255,255,255,0.18)' }}>Recent</p>
              </>
            )}
            {/* Regular */}
            <AnimatePresence>
              {regularPosts.map(p => <PostCard key={p.id} post={p} onLike={handleLike} />)}
            </AnimatePresence>
            <div className="h-6" />
          </div>
        )}
      </div>

      {/* =========== RIGHT: QUICK ACTIONS + RESOURCES =========== */}
      <div className="w-[248px] flex-shrink-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-4 flex-shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <p className="text-[9px] uppercase tracking-[0.18em] font-medium" style={{ color: 'rgba(255,255,255,0.20)' }}>At a Glance</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Today's Stats */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] font-medium mb-3" style={{ color: 'rgba(255,255,255,0.18)' }}>Activity Today</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Posts', value: posts.filter(p => { const d = new Date(p.created_at); const now = new Date(); return d.toDateString() === now.toDateString(); }).length.toString(), color: '#8b5cf6' },
                { label: 'Online', value: onlineCount.toString(), color: '#22c55e' },
                { label: 'Pinned', value: pinnedPosts.length.toString(), color: '#f97316' },
                { label: 'Tasks', value: posts.filter(p => p.category === 'task').length.toString(), color: '#a855f7' },
              ].map(({ label, value, color }) => (
                <div key={label} className="px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p className="text-[18px] font-black tracking-tight" style={{ color }}>{value}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.22)' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Kudos stream */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] font-medium mb-3" style={{ color: 'rgba(255,255,255,0.18)' }}>Recognition</p>
            {posts.filter(p => p.category === 'kudos').length === 0 ? (
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>No kudos yet — be the first!</p>
            ) : (
              posts.filter(p => p.category === 'kudos').slice(0, 2).map(p => (
                <div key={p.id} className="mb-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(236,72,153,0.06)', border: '1px solid rgba(236,72,153,0.12)' }}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <Heart className="w-2.5 h-2.5" style={{ color: '#ec4899' }} />
                    <p className="text-[9px] font-semibold" style={{ color: '#ec4899' }}>KUDOS</p>
                    <p className="text-[9px]" style={{ color: 'rgba(255,255,255,0.20)' }}>from {p.author_name.split(' ')[0]}</p>
                  </div>
                  <p className="text-[10px] line-clamp-2 leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{p.body}</p>
                </div>
              ))
            )}
          </div>

          {/* Open tasks */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] font-medium mb-3" style={{ color: 'rgba(255,255,255,0.18)' }}>Open Tasks</p>
            {posts.filter(p => p.category === 'task').length === 0 ? (
              <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>No open tasks</p>
            ) : (
              posts.filter(p => p.category === 'task').slice(0, 3).map(p => (
                <div key={p.id} className="mb-2 flex items-start gap-2 px-3 py-2.5 rounded-xl" style={{ backgroundColor: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.12)' }}>
                  <CheckCircle2 className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: '#a855f7' }} />
                  <div>
                    <p className="text-[10px] font-medium line-clamp-1" style={{ color: 'rgba(255,255,255,0.65)' }}>{p.title ?? p.body.slice(0, 40)}</p>
                    {p.metadata.task_due && <p className="text-[9px] mt-0.5" style={{ color: '#a855f7' }}>{String(p.metadata.task_due)}</p>}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Handovers */}
          <div>
            <p className="text-[9px] uppercase tracking-[0.14em] font-medium mb-3" style={{ color: 'rgba(255,255,255,0.18)' }}>Latest Handover</p>
            {posts.filter(p => p.category === 'handover').slice(0, 1).map(p => (
              <div key={p.id} className="px-3 py-3 rounded-xl" style={{ backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)' }}>
                <p className="text-[9px] font-semibold mb-1" style={{ color: '#3b82f6' }}>
                  {p.author_name} · {fmtTime(p.created_at)}
                </p>
                <p className="text-[10px] leading-relaxed line-clamp-3" style={{ color: 'rgba(255,255,255,0.45)' }}>{p.body}</p>
              </div>
            ))}
          </div>

          {/* Resources */}
          {posts.filter(p => p.category === 'resource').length > 0 && (
            <div>
              <p className="text-[9px] uppercase tracking-[0.14em] font-medium mb-3" style={{ color: 'rgba(255,255,255,0.18)' }}>Resources</p>
              {posts.filter(p => p.category === 'resource').slice(0, 3).map(p => (
                <div key={p.id} className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(20,184,166,0.06)', border: '1px solid rgba(20,184,166,0.12)' }}>
                  <LinkIcon className="w-3 h-3 flex-shrink-0" style={{ color: '#14b8a6' }} />
                  <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.55)' }}>{p.title ?? p.body.slice(0, 40)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
