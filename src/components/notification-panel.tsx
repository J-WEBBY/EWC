'use client';

// =============================================================================
// NotificationPanel — personal alert overlay
// Opened by the bell icon on the dashboard.
// Shows: signals needing human action, personal compliance due/overdue,
//        unread signals since last visit.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Radio, CheckCircle2, Clock, AlertCircle, ChevronRight, CalendarCheck, Zap, Phone, MessageCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getPendingSignals, getSignalFeed, getActivityNotifications, type SignalEntry, type PendingSignal, type BookingNotification, type AutomationNotification } from '@/lib/actions/signals';
import { getMyComplianceItems, type ComplianceItem } from '@/lib/actions/kpi-goals';

const BG     = '#FAF7F2';
const NAVY   = '#181D23';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#EBE5FF';
const BLUE   = '#0058E6';
const GREEN  = '#059669';
const ORANGE = '#EA580C';
const RED    = '#DC2626';

function relTime(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface NotifPanelProps {
  userId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationPanel({ userId, isOpen, onClose }: NotifPanelProps) {
  const router = useRouter();
  const [pendingSignals,  setPendingSignals]  = useState<PendingSignal[]>([]);
  const [unreadSignals,   setUnreadSignals]   = useState<SignalEntry[]>([]);
  const [complianceItems, setComplianceItems] = useState<ComplianceItem[]>([]);
  const [bookings,        setBookings]        = useState<BookingNotification[]>([]);
  const [automations,     setAutomations]     = useState<AutomationNotification[]>([]);
  const [loading,         setLoading]         = useState(false);

  const LAST_READ_KEY = `ewc_notif_read_${userId}`;

  const load = useCallback(async () => {
    if (!userId || !isOpen) return;
    setLoading(true);
    const lastRead = localStorage.getItem(LAST_READ_KEY) ?? new Date(0).toISOString();

    const [pendRes, feedRes, compRes, activityRes] = await Promise.allSettled([
      getPendingSignals('clinic'),
      getSignalFeed('clinic'),
      getMyComplianceItems(userId),
      getActivityNotifications(),
    ]);

    if (pendRes.status === 'fulfilled' && pendRes.value.success)
      setPendingSignals(pendRes.value.signals ?? []);

    if (feedRes.status === 'fulfilled' && feedRes.value.success) {
      const unread = (feedRes.value.signals ?? []).filter(
        s => s.created_at > lastRead && s.response_mode === 'human_only'
      );
      setUnreadSignals(unread);
    }

    if (compRes.status === 'fulfilled') {
      const urgent = compRes.value.filter(
        c => c.status === 'overdue' || c.status === 'expired' || c.status === 'due_soon'
      );
      setComplianceItems(urgent);
    }

    if (activityRes.status === 'fulfilled') {
      setBookings(activityRes.value.bookings);
      setAutomations(activityRes.value.automations);
    }

    setLoading(false);
  }, [userId, isOpen, LAST_READ_KEY]);

  useEffect(() => { load(); }, [load]);

  // Mark all read on close
  const handleClose = () => {
    localStorage.setItem(LAST_READ_KEY, new Date().toISOString());
    onClose();
  };

  const totalCount = pendingSignals.length + unreadSignals.length + complianceItems.length + bookings.length;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40" style={{ background: 'rgba(24,29,35,0.25)' }}
            onClick={handleClose} />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', stiffness: 340, damping: 32 }}
            className="fixed right-4 top-4 bottom-4 z-50 flex flex-col rounded-2xl overflow-hidden"
            style={{ width: 380, background: BG, border: `1px solid ${BORDER}`, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>

            {/* Header */}
            <div className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: `1px solid ${BORDER}` }}>
              <div>
                <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: MUTED }}>Personal</p>
                <h3 className="text-[16px] font-black tracking-[-0.02em]" style={{ color: NAVY }}>Notifications</h3>
              </div>
              <div className="flex items-center gap-2">
                {totalCount > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: RED + '14', color: RED, border: `1px solid ${RED}28` }}>
                    {totalCount} new
                  </span>
                )}
                <button onClick={handleClose}
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.04)', border: `1px solid ${BORDER}` }}>
                  <X size={13} style={{ color: TER }} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="flex gap-1.5">
                    {[0, 1, 2].map(i => (
                      <motion.div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: BLUE }}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                    ))}
                  </div>
                </div>
              ) : totalCount === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <CheckCircle2 size={28} style={{ color: GREEN }} />
                  <p className="text-[13px] font-semibold" style={{ color: TER }}>All clear</p>
                  <p className="text-[11px] text-center" style={{ color: MUTED }}>No pending actions or alerts for you right now</p>
                </div>
              ) : (
                <div className="py-2">

                  {/* Needs Your Action */}
                  {pendingSignals.length > 0 && (
                    <section>
                      <div className="px-5 py-3">
                        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                          Needs Your Action · {pendingSignals.length}
                        </p>
                      </div>
                      {pendingSignals.map((s, i) => (
                        <div key={s.id}
                          className="w-full text-left px-5 py-3.5 flex items-start gap-3"
                          style={{
                            borderTop: i === 0 ? `1px solid ${BORDER}` : 'none',
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                          >
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: ORANGE + '14', border: `1px solid ${ORANGE}28` }}>
                            <AlertCircle size={14} style={{ color: ORANGE }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold leading-snug" style={{ color: NAVY }}>{s.title}</p>
                            <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: TER }}>{s.description}</p>
                            <p className="text-[9px] mt-1 font-semibold" style={{ color: ORANGE }}>Pending approval · {relTime(s.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </section>
                  )}

                  {/* New Human-Only Signals */}
                  {unreadSignals.length > 0 && (
                    <section>
                      <div className="px-5 py-3">
                        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                          Unread Signals · {unreadSignals.length}
                        </p>
                      </div>
                      {unreadSignals.map((s, i) => (
                        <div key={s.id}
                          className="w-full text-left px-5 py-3.5 flex items-start gap-3"
                          style={{
                            borderTop: i === 0 ? `1px solid ${BORDER}` : 'none',
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                          >
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: BLUE + '14', border: `1px solid ${BLUE}28` }}>
                            <Radio size={14} style={{ color: BLUE }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold leading-snug" style={{ color: NAVY }}>{s.title}</p>
                            <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: TER }}>{s.description}</p>
                            <p className="text-[9px] mt-1" style={{ color: MUTED }}>{relTime(s.created_at)}</p>
                          </div>
                        </div>
                      ))}
                    </section>
                  )}

                  {/* Bookings — from Aria WhatsApp / Komal Voice */}
                  {bookings.length > 0 && (
                    <section>
                      <div className="px-5 py-3">
                        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                          New Bookings · {bookings.length}
                        </p>
                      </div>
                      {bookings.map((b, i) => {
                        const isKomal    = b.source === 'komal';
                        const accent     = isKomal ? '#7C3AED' : '#00A693';
                        const BookIcon   = isKomal ? Phone : MessageCircle;
                        return (
                          <button key={b.id}
                            onClick={() => { router.push(isKomal ? `/staff/voice?userId=${userId}` : `/staff/automations?userId=${userId}`); handleClose(); }}
                            className="w-full text-left px-5 py-3.5 flex items-start gap-3 transition-all"
                            style={{
                              borderTop:    i === 0 ? `1px solid ${BORDER}` : 'none',
                              borderBottom: `1px solid ${BORDER}`,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = accent + '06')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                              style={{ background: accent + '14', border: `1px solid ${accent}28` }}>
                              <BookIcon size={14} style={{ color: accent }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold leading-snug" style={{ color: NAVY }}>{b.title}</p>
                              <p className="text-[10px] mt-0.5 line-clamp-1" style={{ color: TER }}>{b.description}</p>
                              <p className="text-[9px] mt-1 font-semibold" style={{ color: accent }}>
                                {isKomal ? 'Komal voice' : 'WhatsApp / SMS'} · {relTime(b.created_at)}
                              </p>
                            </div>
                            <ChevronRight size={12} style={{ color: MUTED, flexShrink: 0, marginTop: 4 }} />
                          </button>
                        );
                      })}
                    </section>
                  )}

                  {/* Automation Activity — ran in last 6h */}
                  {automations.length > 0 && (
                    <section>
                      <div className="px-5 py-3">
                        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                          Automation Activity · last 6h
                        </p>
                      </div>
                      {automations.map((a, i) => (
                        <button key={a.automation_id}
                          onClick={() => { router.push(`/staff/automations?userId=${userId}`); handleClose(); }}
                          className="w-full text-left px-5 py-3.5 flex items-start gap-3 transition-all"
                          style={{
                            borderTop:    i === 0 ? `1px solid ${BORDER}` : 'none',
                            borderBottom: `1px solid ${BORDER}`,
                          }}
                          onMouseEnter={e => (e.currentTarget.style.background = BLUE + '06')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                            style={{ background: BLUE + '14', border: `1px solid ${BLUE}28` }}>
                            <Zap size={14} style={{ color: BLUE }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] font-semibold leading-snug" style={{ color: NAVY }}>{a.automation_name}</p>
                            <p className="text-[10px] mt-0.5" style={{ color: TER }}>
                              {a.count} message{a.count !== 1 ? 's' : ''} sent via {a.channel}
                            </p>
                            <p className="text-[9px] mt-1" style={{ color: MUTED }}>{relTime(a.last_sent_at)}</p>
                          </div>
                          <CalendarCheck size={12} style={{ color: BLUE, flexShrink: 0, marginTop: 4 }} />
                        </button>
                      ))}
                    </section>
                  )}

                  {/* Compliance Due */}
                  {complianceItems.length > 0 && (
                    <section>
                      <div className="px-5 py-3">
                        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold" style={{ color: MUTED }}>
                          Compliance · {complianceItems.length}
                        </p>
                      </div>
                      {complianceItems.map((c, i) => {
                        const isOverdue = c.status === 'overdue' || c.status === 'expired';
                        return (
                          <button key={c.id} onClick={() => { router.push(`/staff/kpis?userId=${userId}`); handleClose(); }}
                            className="w-full text-left px-5 py-3.5 flex items-start gap-3 transition-all"
                            style={{
                              borderTop: i === 0 ? `1px solid ${BORDER}` : 'none',
                              borderBottom: `1px solid ${BORDER}`,
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = (isOverdue ? RED : ORANGE) + '06')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                              style={{ background: (isOverdue ? RED : ORANGE) + '14', border: `1px solid ${(isOverdue ? RED : ORANGE)}28` }}>
                              {isOverdue
                                ? <AlertCircle size={14} style={{ color: RED }} />
                                : <Clock size={14} style={{ color: ORANGE }} />
                              }
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-semibold leading-snug" style={{ color: NAVY }}>{c.title}</p>
                              <p className="text-[10px] mt-0.5 capitalize" style={{ color: TER }}>{c.category.replace(/_/g, ' ')}</p>
                              <p className="text-[9px] mt-1 font-semibold"
                                style={{ color: isOverdue ? RED : ORANGE }}>
                                {isOverdue ? 'Overdue' : 'Due soon'}
                                {c.due_date ? ` · ${new Date(c.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              {c.is_cqc_critical && (
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: RED + '14', color: RED }}>CQC</span>
                              )}
                              <ChevronRight size={12} style={{ color: MUTED, marginTop: 4 }} />
                            </div>
                          </button>
                        );
                      })}
                    </section>
                  )}

                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3" style={{ borderTop: `1px solid ${BORDER}` }}>
              <p className="text-[10px]" style={{ color: MUTED }}>Updates every 30s</p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Utility: compute notification count for bell badge (can be called before panel loads)
export function useNotifCount(userId: string): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const run = async () => {
      const [pendRes, compRes, activityRes] = await Promise.allSettled([
        getPendingSignals('clinic'),
        getMyComplianceItems(userId),
        getActivityNotifications(),
      ]);
      let n = 0;
      if (pendRes.status === 'fulfilled' && pendRes.value.success)
        n += (pendRes.value.signals ?? []).length;
      if (compRes.status === 'fulfilled')
        n += compRes.value.filter(c => c.status === 'overdue' || c.status === 'expired' || c.status === 'due_soon').length;
      if (activityRes.status === 'fulfilled')
        n += activityRes.value.bookings.length;
      setCount(n);
    };
    run();
    const t = setInterval(run, 30_000);
    return () => clearInterval(t);
  }, [userId]);

  return count;
}
