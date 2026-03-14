'use client';

// =============================================================================
// Automations — 8 AI-powered clinic workflows
// EWC design system · toggle + expand · channels display
// =============================================================================

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown, Play, Pause, Clock,
  CheckCircle2, XCircle, AlertCircle,
  PhoneOff, CreditCard, RotateCcw,
  BookOpen, Bell, CalendarCheck, Heart,
  MessageCircle, Phone, MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import { getStaffProfile, getCurrentUser, type StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import {
  getAutomationRuns, getAutomationStats, getAutomationCommunications,
  type AutomationRun, type AutomationCommunication,
} from '@/lib/actions/automations';
import { AUTOMATION_REGISTRY, type AutomationConfig, type AutomationCategory } from '@/lib/automations/registry';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUT    = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const GOLD   = '#D8A600';
const TEAL   = '#00A693';

// =============================================================================
// ICON MAP
// =============================================================================

const ICON_MAP: Record<string, LucideIcon> = {
  Clock, PhoneOff, CreditCard, RotateCcw,
  BookOpen, AlertCircle, Bell, CalendarCheck, Heart,
};

// Channel icon + color map
const CHANNEL_META: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  WhatsApp: { icon: MessageCircle, color: '#059669', bg: '#05966912' },
  SMS:      { icon: MessageSquare, color: GOLD,      bg: `${GOLD}12`  },
  Voice:    { icon: Phone,         color: BLUE,      bg: `${BLUE}10`  },
};

// =============================================================================
// TYPES
// =============================================================================

type FilterTab = AutomationCategory | 'all' | 'active';

// =============================================================================
// CONSTANTS
// =============================================================================

const CATEGORY_META: Record<AutomationCategory, { label: string; color: string }> = {
  patient_care: { label: 'Patient Care', color: TEAL },
  revenue:      { label: 'Revenue',      color: GOLD },
};

const STATUS_CONFIG = {
  success: { icon: CheckCircle2, color: '#059669', label: 'Completed' },
  partial: { icon: AlertCircle,  color: GOLD,      label: 'Partial'   },
  failed:  { icon: XCircle,      color: '#DC2626', label: 'Failed'    },
};

// =============================================================================
// HELPERS
// =============================================================================

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// =============================================================================
// CHANNEL PILLS
// =============================================================================

function ChannelPills({ channels }: { channels: string[] }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {channels.map(ch => {
        const meta = CHANNEL_META[ch];
        if (!meta) return null;
        const Icon = meta.icon;
        return (
          <span
            key={ch}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
            style={{ backgroundColor: meta.bg, color: meta.color }}
          >
            <Icon size={9} />
            {ch}
          </span>
        );
      })}
    </div>
  );
}

// =============================================================================
// AUTOMATION ROW
// =============================================================================

function AutomationRow({
  automation,
  lastRun,
}: {
  automation: AutomationConfig;
  lastRun?: AutomationRun;
}) {
  const [expanded, setExpanded] = useState(false);
  const [active,   setActive]   = useState(automation.is_active);

  const Icon    = ICON_MAP[automation.icon] ?? Clock;
  const catMeta = CATEGORY_META[automation.category];

  return (
    <div
      className="border rounded-2xl overflow-hidden transition-all"
      style={{ backgroundColor: BG, borderColor: BORDER }}
    >
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4">

        {/* Icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${catMeta.color}10` }}
        >
          <Icon size={15} style={{ color: catMeta.color }} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 mb-0.5">
            <p className="text-[13px] font-medium" style={{ color: NAVY }}>{automation.name}</p>
            <span
              className="text-[9px] font-semibold uppercase tracking-[0.12em] px-1.5 py-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: `${catMeta.color}10`, color: catMeta.color }}
            >
              {catMeta.label}
            </span>
            {lastRun && (() => {
              const cfg = STATUS_CONFIG[lastRun.status];
              const StatusIcon = cfg.icon;
              return (
                <div className="flex items-center gap-1 ml-auto flex-shrink-0">
                  <StatusIcon size={11} style={{ color: cfg.color }} />
                  <span className="text-[10px]" style={{ color: cfg.color }}>{relativeTime(lastRun.started_at)}</span>
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-3">
            <p className="text-[11px]" style={{ color: TER }}>{automation.trigger_description}</p>
            <ChannelPills channels={automation.channels} />
          </div>
        </div>

        {/* Toggle + expand */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setActive(v => !v)}
            className="w-10 h-5 rounded-full relative transition-colors"
            style={{ backgroundColor: active ? BLUE : '#D4E2FF' }}
            aria-label={active ? 'Pause automation' : 'Enable automation'}
          >
            <div
              className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
              style={{
                backgroundColor: BG,
                left: active ? 22 : 2,
                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              }}
            />
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1 rounded-lg transition-colors"
            style={{ color: MUT }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = NAVY)}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = MUT)}
            aria-label="Expand details"
          >
            <ChevronDown
              size={14}
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}
            />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5" style={{ borderTop: `1px solid ${BORDER}` }}>
              <p className="text-[12px] leading-relaxed mt-4 mb-4" style={{ color: SEC }}>
                {automation.description}
              </p>

              {/* Channels detail */}
              <div className="flex items-center gap-3 mb-4">
                <span className="text-[10px] uppercase tracking-[0.14em] font-medium" style={{ color: MUT }}>
                  Channels
                </span>
                <ChannelPills channels={automation.channels} />
              </div>

              {lastRun && (
                <div
                  className="p-3 rounded-xl text-[11px] mb-4"
                  style={{ backgroundColor: `${BLUE}05`, border: `1px solid ${BORDER}` }}
                >
                  <p className="font-medium mb-0.5" style={{ color: NAVY }}>Last run</p>
                  <p style={{ color: TER }}>{lastRun.summary}</p>
                  <p className="mt-1" style={{ color: MUT }}>
                    {lastRun.actions_fired} action{lastRun.actions_fired !== 1 ? 's' : ''} fired · {relativeTime(lastRun.started_at)}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setActive(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-colors"
                  style={{
                    backgroundColor: active ? 'rgba(220,38,38,0.07)' : `${BLUE}0d`,
                    borderColor:     active ? 'rgba(220,38,38,0.22)' : `${BLUE}28`,
                    color:           active ? '#DC2626' : BLUE,
                  }}
                >
                  {active ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Enable</>}
                </button>
                <button
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] border transition-colors"
                  style={{ backgroundColor: 'transparent', borderColor: BORDER, color: SEC }}
                >
                  <Play size={11} /> Run now
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AutomationsPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const urlUserId    = searchParams.get('userId');

  const [userId,  setUserId]  = useState<string | null>(urlUserId);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [runs,    setRuns]    = useState<AutomationRun[]>([]);
  const [stats,   setStats]   = useState<{ active: number; total: number; ran_today: number } | null>(null);
  const [filter,  setFilter]  = useState<FilterTab>('all');
  const [comms,   setComms]   = useState<AutomationCommunication[]>([]);
  const [commChannel, setCommChannel] = useState<'all' | 'WhatsApp' | 'SMS' | 'Voice'>('all');
  const [commLimit,   setCommLimit]   = useState(10);

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);

      const [profileRes, runsRes, statsRes, commsRes] = await Promise.all([
        getStaffProfile('clinic', uid),
        getAutomationRuns(),
        getAutomationStats(),
        getAutomationCommunications(),
      ]);

      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      if (runsRes.success && runsRes.runs) setRuns(runsRes.runs);
      if (commsRes.success && commsRes.communications) setComms(commsRes.communications);
      if (statsRes.success && statsRes.stats) setStats({
        active:    statsRes.stats.active_count,
        total:     AUTOMATION_REGISTRY.length,
        ran_today: statsRes.stats.runs_today,
      });
      setLoading(false);
    })();
  }, [urlUserId, router]);

  if (loading || !profile) return <OrbLoader />;

  const brandColor = profile.brandColor || BLUE;

  const filtered: AutomationConfig[] = (() => {
    if (filter === 'all')    return AUTOMATION_REGISTRY;
    if (filter === 'active') return AUTOMATION_REGISTRY.filter(a => a.is_active);
    return AUTOMATION_REGISTRY.filter(a => a.category === filter);
  })();

  const TABS: { id: FilterTab; label: string; count?: number }[] = [
    { id: 'all',          label: 'All',          count: AUTOMATION_REGISTRY.length },
    { id: 'active',       label: 'Active',       count: AUTOMATION_REGISTRY.filter(a => a.is_active).length },
    { id: 'patient_care', label: 'Patient Care', count: AUTOMATION_REGISTRY.filter(a => a.category === 'patient_care').length },
    { id: 'revenue',      label: 'Revenue',      count: AUTOMATION_REGISTRY.filter(a => a.category === 'revenue').length },
  ];

  return (
    <div className="min-h-screen nav-offset" style={{ backgroundColor: BG }}>
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Automations" />

      <main className="px-8 py-10 max-w-[1000px]">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between mb-10">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] mb-2" style={{ color: MUT }}>Intelligence</p>
            <h1 className="text-[28px] font-semibold tracking-tight mb-1.5" style={{ color: NAVY }}>Automations</h1>
            <p className="text-[13px]" style={{ color: TER }}>
              AI-powered workflows running across your clinic — patient care, retention, and revenue.
            </p>
          </div>

          {/* Stats */}
          {stats && (
            <div className="flex items-center gap-6 flex-shrink-0 mt-1">
              {[
                { label: 'Active',    value: stats.active,    color: BLUE },
                { label: 'Total',     value: stats.total,     color: NAVY },
                { label: 'Ran today', value: stats.ran_today, color: TER  },
              ].map(s => (
                <div key={s.label} className="text-right">
                  <p className="text-[22px] font-semibold leading-none" style={{ color: s.color }}>{s.value}</p>
                  <p className="text-[10px] uppercase tracking-[0.12em] mt-0.5" style={{ color: MUT }}>{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Filter tabs */}
        <div
          className="flex items-center gap-1 mb-6"
          style={{ borderBottom: `1px solid ${BORDER}` }}
        >
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className="relative flex items-center gap-2 px-4 py-3 text-[13px] transition-colors"
              style={{
                color:      filter === tab.id ? NAVY : TER,
                fontWeight: filter === tab.id ? 600 : 400,
              }}
            >
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: filter === tab.id ? `${BLUE}12` : BORDER,
                    color:           filter === tab.id ? BLUE : MUT,
                  }}
                >
                  {tab.count}
                </span>
              )}
              {filter === tab.id && (
                <motion.div
                  layoutId="auto-tab-underline"
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ backgroundColor: BLUE }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Automation list */}
        <motion.div layout className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filtered.map((automation, i) => {
              const lastRun = runs.find(r => r.automation_id === automation.id);
              return (
                <motion.div
                  key={automation.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <AutomationRow automation={automation} lastRun={lastRun} />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>

        {/* ── COMMUNICATION LOG ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-12"
        >
          {/* Section header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-0.5" style={{ color: MUT }}>
                Automation Output
              </p>
              <h2 className="text-[16px] font-semibold" style={{ color: NAVY }}>Communication</h2>
            </div>

            {/* Channel filter chips */}
            <div className="flex items-center gap-1.5">
              {(['all', 'WhatsApp', 'SMS', 'Voice'] as const).map(ch => {
                const meta = ch === 'all' ? null : CHANNEL_META[ch];
                const isActive = commChannel === ch;
                return (
                  <button
                    key={ch}
                    onClick={() => setCommChannel(ch)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium border transition-all"
                    style={{
                      backgroundColor: isActive ? (meta ? meta.bg : `${BLUE}10`) : 'transparent',
                      borderColor:     isActive ? (meta ? meta.color + '50' : `${BLUE}40`) : BORDER,
                      color:           isActive ? (meta ? meta.color : BLUE) : MUT,
                    }}
                  >
                    {meta && (() => { const Icon = meta.icon; return <Icon size={10} />; })()}
                    {ch === 'all' ? 'All channels' : ch}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Communication list */}
          {(() => {
            const filtered_comms = comms
              .filter(c => commChannel === 'all' || c.channel === commChannel)
              .slice(0, commLimit);

            const STATUS_COMM: Record<string, { color: string; bg: string; label: string }> = {
              delivered: { color: '#059669', bg: '#05966912', label: 'Delivered' },
              sent:      { color: BLUE,      bg: `${BLUE}10`,  label: 'Sent'      },
              pending:   { color: GOLD,      bg: `${GOLD}12`,  label: 'Pending'   },
              failed:    { color: '#DC2626', bg: '#DC262612', label: 'Failed'    },
            };

            return (
              <div
                className="rounded-2xl border overflow-hidden"
                style={{ borderColor: BORDER }}
              >
                {filtered_comms.length === 0 ? (
                  <div className="px-6 py-10 text-center" style={{ backgroundColor: BG }}>
                    <p className="text-[13px]" style={{ color: TER }}>No messages sent yet through automations.</p>
                  </div>
                ) : (
                  <>
                    {/* Table header */}
                    <div
                      className="grid gap-4 px-5 py-2.5 text-[9px] uppercase tracking-[0.14em] font-semibold"
                      style={{
                        color: MUT,
                        backgroundColor: `${BORDER}50`,
                        borderBottom: `1px solid ${BORDER}`,
                        gridTemplateColumns: '1fr 160px 100px 80px 80px',
                      }}
                    >
                      <span>Patient / Message</span>
                      <span>Automation</span>
                      <span>Channel</span>
                      <span>Status</span>
                      <span className="text-right">Time</span>
                    </div>

                    <div style={{ backgroundColor: BG }}>
                      <AnimatePresence mode="popLayout">
                        {filtered_comms.map((c, i) => {
                          const chMeta    = CHANNEL_META[c.channel];
                          const ChanIcon  = chMeta?.icon ?? MessageCircle;
                          const st        = STATUS_COMM[c.status] ?? STATUS_COMM.sent;
                          const autoMeta  = CATEGORY_META[
                            AUTOMATION_REGISTRY.find(a => a.id === c.automation_id)?.category ?? 'patient_care'
                          ];
                          return (
                            <motion.div
                              key={c.id}
                              layout
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ delay: i * 0.02 }}
                              className="grid gap-4 px-5 py-3.5 items-center"
                              style={{
                                gridTemplateColumns: '1fr 160px 100px 80px 80px',
                                borderBottom: i < filtered_comms.length - 1 ? `1px solid ${BORDER}` : 'none',
                              }}
                            >
                              {/* Patient + message */}
                              <div className="min-w-0">
                                <p className="text-[12px] font-medium mb-0.5" style={{ color: NAVY }}>
                                  {c.patient_name}
                                </p>
                                <p
                                  className="text-[11px] leading-relaxed"
                                  style={{ color: TER, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                >
                                  {c.message}
                                </p>
                              </div>

                              {/* Automation name */}
                              <div className="min-w-0">
                                <span
                                  className="text-[10px] font-medium px-2 py-0.5 rounded-full truncate block max-w-fit"
                                  style={{ backgroundColor: `${autoMeta.color}10`, color: autoMeta.color }}
                                >
                                  {c.automation_name}
                                </span>
                              </div>

                              {/* Channel */}
                              <div>
                                <span
                                  className="flex items-center gap-1 text-[10px] font-medium w-fit"
                                  style={{ color: chMeta?.color ?? MUT }}
                                >
                                  <ChanIcon size={10} />
                                  {c.channel}
                                </span>
                              </div>

                              {/* Status */}
                              <div>
                                <span
                                  className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                                  style={{ backgroundColor: st.bg, color: st.color }}
                                >
                                  {st.label}
                                </span>
                              </div>

                              {/* Time */}
                              <div className="text-right">
                                <p className="text-[10px]" style={{ color: MUT }}>{relativeTime(c.sent_at)}</p>
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>

                    {/* Load more */}
                    {comms.filter(c => commChannel === 'all' || c.channel === commChannel).length > commLimit && (
                      <div
                        className="px-5 py-3 flex justify-center"
                        style={{ borderTop: `1px solid ${BORDER}`, backgroundColor: `${BORDER}30` }}
                      >
                        <button
                          onClick={() => setCommLimit(l => l + 10)}
                          className="text-[11px] font-medium px-4 py-1.5 rounded-lg border transition-colors"
                          style={{ borderColor: BORDER, color: SEC, backgroundColor: BG }}
                        >
                          Load more
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </motion.div>

        {/* Recent run history */}
        {runs.length > 0 && filter === 'all' && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-10"
          >
            <p className="text-[10px] uppercase tracking-[0.18em] font-medium mb-4" style={{ color: MUT }}>
              Recent Activity
            </p>
            <div className="space-y-2">
              {runs.slice(0, 5).map(run => {
                const cfg = STATUS_CONFIG[run.status];
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={run.id}
                    className="flex items-start gap-4 px-5 py-4 rounded-2xl border"
                    style={{ backgroundColor: BG, borderColor: BORDER }}
                  >
                    <StatusIcon size={15} style={{ color: cfg.color, flexShrink: 0, marginTop: 1 }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-medium" style={{ color: NAVY }}>{run.automation_name}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: TER }}>{run.summary}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[10px]" style={{ color: MUT }}>{relativeTime(run.started_at)}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: cfg.color }}>{run.actions_fired} actions</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
