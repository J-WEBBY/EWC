'use client';

// =============================================================================
// Signals Page — Operational alerts and activity feed
// =============================================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, CheckCircle, XCircle, ChevronRight } from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getSignalFeed, getSignalStats, getPendingSignals,
  approveSignal, rejectSignal, resolveSignal, dismissSignal,
  type SignalEntry, type SignalStats,
} from '@/lib/actions/signals';

// =============================================================================
// TOKENS
// =============================================================================
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
const PURPLE = '#7C3AED';

// =============================================================================
// HELPERS
// =============================================================================

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function priorityBorderColor(priority: string): string {
  if (priority === 'critical') return RED;
  if (priority === 'high')     return ORANGE;
  if (priority === 'medium')   return BLUE;
  return MUTED;
}

function priorityPillStyle(priority: string): React.CSSProperties {
  const color = priorityBorderColor(priority);
  return {
    background: color + '18',
    border:     `1px solid ${color}40`,
    color,
    padding:    '1px 7px',
    borderRadius: 999,
    fontSize:   9,
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    flexShrink: 0,
  };
}

function statusPillStyle(status: string): React.CSSProperties {
  let color = MUTED;
  if (status === 'new')               color = ORANGE;
  if (status === 'in_progress')       color = BLUE;
  if (status === 'resolved')          color = GREEN;
  if (status === 'pending_approval')  color = PURPLE;
  return {
    background:   color + '18',
    border:       `1px solid ${color}40`,
    color,
    padding:      '1px 7px',
    borderRadius: 999,
    fontSize:     9,
    fontWeight:   600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    flexShrink:   0,
  };
}

function sourcePillStyle(source: string): React.CSSProperties {
  let color = MUTED;
  if (source === 'agent')       color = BLUE;
  if (source === 'automation')  color = PURPLE;
  if (source === 'user')        color = GREEN;
  if (source === 'integration') color = GOLD;
  return {
    background:   color + '12',
    border:       `1px solid ${color}30`,
    color,
    padding:      '1px 6px',
    borderRadius: 999,
    fontSize:     8,
    fontWeight:   600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    flexShrink:   0,
  };
}

function statusLabel(status: string): string {
  if (status === 'new')               return 'New';
  if (status === 'in_progress')       return 'In progress';
  if (status === 'resolved')          return 'Resolved';
  if (status === 'pending_approval')  return 'Pending approval';
  if (status === 'archived')          return 'Archived';
  return status;
}

type FilterTab = 'all' | 'calls' | 'automations' | 'compliance' | 'tasks';

function filterSignals(signals: SignalEntry[], tab: FilterTab): SignalEntry[] {
  if (tab === 'all')         return signals;
  if (tab === 'calls')       return signals.filter(s => s.category === 'communications' || (s.data as Record<string, unknown>)?.type === 'call');
  if (tab === 'automations') return signals.filter(s => s.source === 'automation');
  if (tab === 'compliance')  return signals.filter(s => s.category === 'governance');
  if (tab === 'tasks')       return signals.filter(s => s.category === 'operations' && s.source === 'user');
  return signals;
}

// =============================================================================
// STAT CARD
// =============================================================================
function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl px-5 py-4" style={{ border: `1px solid ${BORDER}` }}>
      <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUTED }}>{label}</p>
      <p className="text-[32px] font-black tracking-[-0.04em] leading-none" style={{ color }}>{value}</p>
    </div>
  );
}

// =============================================================================
// SIGNAL CARD
// =============================================================================
function SignalCard({
  signal,
  userId,
  onAction,
}: {
  signal: SignalEntry;
  userId: string;
  onAction: () => void;
}) {
  const [hover, setHover]   = useState(false);
  const [acting, setActing] = useState(false);

  const isPending = signal.status === 'pending_approval';
  const isActive  = signal.status !== 'resolved' && signal.status !== 'archived';
  const borderColor = priorityBorderColor(signal.priority);

  const handleResolve = async () => {
    setActing(true);
    await resolveSignal('clinic', signal.id, 'Resolved via signals page', userId || 'user');
    onAction();
    setActing(false);
  };

  const handleDismiss = async () => {
    setActing(true);
    await dismissSignal('clinic', signal.id, 'Dismissed via signals page');
    onAction();
    setActing(false);
  };

  const handleApprove = async () => {
    setActing(true);
    await approveSignal('clinic', signal.id);
    onAction();
    setActing(false);
  };

  const handleReject = async () => {
    setActing(true);
    await rejectSignal('clinic', signal.id);
    onAction();
    setActing(false);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-stretch transition-all"
      style={{ borderBottom: `1px solid ${BORDER}` }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      {/* Left priority border */}
      <div className="w-[3px] flex-shrink-0 rounded-l-sm" style={{ background: borderColor }} />
      <div
        className="flex-1 px-5 py-3.5"
        style={{ background: hover ? borderColor + '08' : 'transparent' }}>
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {/* Badges row */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span style={priorityPillStyle(signal.priority)}>{signal.priority}</span>
              <span style={sourcePillStyle(signal.source)}>{signal.source}</span>
              <span style={statusPillStyle(signal.status)}>{statusLabel(signal.status)}</span>
            </div>
            {/* Title */}
            <p className="text-[12px] font-semibold leading-snug mb-0.5" style={{ color: NAVY }}>
              {signal.title}
            </p>
            {/* Description */}
            {signal.description && (
              <p className="text-[11px] line-clamp-2 leading-relaxed" style={{ color: TER }}>
                {signal.description}
              </p>
            )}
            {/* Meta row */}
            <div className="flex items-center gap-3 mt-1.5 flex-wrap">
              <span className="text-[9px]" style={{ color: MUTED }}>{timeAgo(signal.created_at)}</span>
              {signal.category && (
                <span className="text-[9px]" style={{ color: MUTED }}>{signal.category}</span>
              )}
              {signal.tags?.length > 0 && (
                <span className="text-[9px]" style={{ color: MUTED }}>{signal.tags.slice(0, 2).join(', ')}</span>
              )}
            </div>
          </div>

          {/* Action buttons — hover reveal */}
          <AnimatePresence>
            {hover && isActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
                {isPending ? (
                  <>
                    <button
                      onClick={handleApprove}
                      disabled={acting}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold transition-all"
                      style={{ background: GREEN + '18', color: GREEN, border: `1px solid ${GREEN}40` }}>
                      <CheckCircle size={9} /> Approve
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={acting}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold transition-all"
                      style={{ background: RED + '18', color: RED, border: `1px solid ${RED}40` }}>
                      <XCircle size={9} /> Reject
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleResolve}
                      disabled={acting}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold transition-all"
                      style={{ background: GREEN + '18', color: GREEN, border: `1px solid ${GREEN}40` }}>
                      <CheckCircle size={9} /> Resolve
                    </button>
                    <button
                      onClick={handleDismiss}
                      disabled={acting}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-semibold transition-all"
                      style={{ background: BORDER, color: SEC, border: `1px solid ${BORDER}` }}>
                      <XCircle size={9} /> Dismiss
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================
export default function SignalsPage() {
  const [userId,     setUserId]     = useState<string | null>(null);
  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [brandColor, setBrandColor] = useState(BLUE);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [signals,  setSignals]  = useState<SignalEntry[]>([]);
  const [stats,    setStats]    = useState<SignalStats | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data load ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async (uid: string, showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    const [feedRes, statsRes] = await Promise.allSettled([
      getSignalFeed('clinic'),
      getSignalStats('clinic'),
    ]);
    if (feedRes.status === 'fulfilled' && feedRes.value.success && feedRes.value.signals) {
      setSignals(feedRes.value.signals);
    }
    if (statsRes.status === 'fulfilled' && statsRes.value.success && statsRes.value.stats) {
      setStats(statsRes.value.stats);
    }
    if (showRefresh) setRefreshing(false);
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const cu  = await getCurrentUser();
      const uid = cu?.userId ?? null;
      setUserId(uid);
      if (uid) {
        const [pRes] = await Promise.allSettled([getStaffProfile('clinic', uid)]);
        if (pRes.status === 'fulfilled' && pRes.value.success && pRes.value.data) {
          setProfile(pRes.value.data.profile);
          if (pRes.value.data.profile.brandColor) setBrandColor(pRes.value.data.profile.brandColor);
        }
        await loadData(uid);
      }
      setLoading(false);
    })();
  }, [loadData]);

  // ── Auto-refresh every 30 seconds ─────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    intervalRef.current = setInterval(() => loadData(userId), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [userId, loadData]);

  // ── Filtered signals ───────────────────────────────────────────────────────
  const filtered = filterSignals(signals, activeTab);
  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',         label: 'All' },
    { key: 'calls',       label: 'Calls' },
    { key: 'automations', label: 'Automations' },
    { key: 'compliance',  label: 'Compliance' },
    { key: 'tasks',       label: 'Tasks' },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <OrbLoader />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {profile && (
        <StaffNav profile={profile} userId={userId ?? ''} brandColor={brandColor} currentPath="Signals" />
      )}

      <div className="pl-[240px]">

        {/* PAGE HEADER */}
        <div className="px-8 pt-8 pb-6 flex items-end justify-between"
          style={{ borderBottom: `1px solid ${BORDER}` }}>
          <div>
            <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-1" style={{ color: MUTED }}>
              Signals &middot; {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <h1 className="text-[38px] font-black tracking-[-0.035em]" style={{ color: NAVY }}>
              Signals
            </h1>
            <p className="text-[13px] mt-0.5" style={{ color: TER }}>
              Operational alerts and activity feed
            </p>
          </div>
          <button
            onClick={() => userId && loadData(userId, true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-semibold transition-all"
            style={{
              border: `1px solid ${BORDER}`,
              color: refreshing ? MUTED : SEC,
              opacity: refreshing ? 0.7 : 1,
            }}>
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="px-8 py-6">
          {/* STATS STRIP */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <StatCard label="Active signals"    value={stats?.total_active          ?? 0} color={BLUE}   />
            <StatCard label="Critical"          value={stats?.critical_count        ?? 0} color={RED}    />
            <StatCard label="Pending approval"  value={stats?.pending_approval_count ?? 0} color={ORANGE} />
            <StatCard label="Resolved today"    value={stats?.resolved_today        ?? 0} color={GREEN}  />
          </div>

          {/* FILTER TABS */}
          <div className="flex items-center gap-1 mb-5">
            {tabs.map(tab => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="px-3.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all"
                  style={{
                    background: active ? BLUE : 'transparent',
                    color:      active ? '#fff' : TER,
                    border:     active ? `1px solid ${BLUE}` : `1px solid ${BORDER}`,
                  }}>
                  {tab.label}
                  {tab.key !== 'all' && (
                    <span className="ml-1.5 text-[9px] opacity-70">
                      {filterSignals(signals, tab.key).length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* SIGNAL LIST */}
          <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${BORDER}` }}>
            {filtered.length === 0 && (
              <div className="px-6 py-16 text-center">
                <p className="text-[13px] font-semibold" style={{ color: MUTED }}>No signals</p>
                <p className="text-[11px] mt-1" style={{ color: BORDER }}>
                  {activeTab === 'all'
                    ? 'No signals have been generated yet'
                    : `No ${activeTab} signals found`}
                </p>
              </div>
            )}

            <AnimatePresence>
              {filtered.map(signal => (
                <SignalCard
                  key={signal.id}
                  signal={signal}
                  userId={userId ?? ''}
                  onAction={() => userId && loadData(userId, false)}
                />
              ))}
            </AnimatePresence>

            {filtered.length > 0 && (
              <div className="px-5 py-3 flex items-center justify-between"
                style={{ borderTop: `1px solid ${BORDER}` }}>
                <p className="text-[10px]" style={{ color: MUTED }}>
                  {filtered.length} signal{filtered.length !== 1 ? 's' : ''}
                  {activeTab !== 'all' ? ` in ${activeTab}` : ''}
                </p>
                <p className="text-[9px]" style={{ color: MUTED }}>
                  Auto-refreshes every 30s
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
