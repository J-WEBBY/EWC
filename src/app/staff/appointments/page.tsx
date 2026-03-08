'use client';

// =============================================================================
// Appointments v2 — Sophisticated redesign
// Tabs: Today | Upcoming | Past | Requests (Komal)
// NEW: Practitioner filter chips, inline status actions, DNA risk detection,
//      overdue alerts, EWC intelligence strip, enhanced detail panel,
//      patient visit history, status change with optimistic update.
// REMOVED: Sync Now, Fix Data buttons (data management via /staff/integrations)
// =============================================================================

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, Mail, User, Calendar, Clock, Check, X,
  RefreshCw, AlertCircle, Search, CheckCircle2,
  ExternalLink, ChevronRight, TrendingUp, UserX,
  ArrowUpRight, Activity, Shield, Zap, MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StaffNav } from '@/components/staff-nav';
import { getCurrentUser, getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getPendingBookings,
  getUpcomingAppointments,
  getPastAppointments,
  getAppointmentStats,
  getPractitioners,
  confirmPendingBooking,
  dismissPendingBooking,
  getClinikoConnectionStatus,
  updateAppointmentStatus,
  type PendingBooking,
  type PractitionerRow,
  type AppointmentRow,
  type AppointmentStatus,
} from '@/lib/actions/appointments';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG      = '#FAF7F2';
const NAVY    = '#1A1035';
const SEC     = '#524D66';
const TER     = '#6E6688';
const MUTED   = '#8B84A0';
const BORDER  = '#EBE5FF';
const ACCENT  = '#0058E6';
const GREEN   = '#059669';
const RED     = '#DC2626';
const GOLD    = '#D8A600';
const ORANGE  = '#EA580C';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  booked:         { label: 'Booked',    color: ACCENT,  bg: `${ACCENT}14`  },
  arrived:        { label: 'Arrived',   color: GREEN,   bg: `${GREEN}14`   },
  cancelled:      { label: 'Cancelled', color: MUTED,   bg: `${MUTED}14`   },
  did_not_arrive: { label: 'DNA',       color: RED,     bg: `${RED}12`     },
  pending:        { label: 'Pending',   color: GOLD,    bg: `${GOLD}12`    },
};

const REFERRAL_LABELS: Record<string, string> = {
  online:                'Found online',
  client_referral:       'Client referral',
  practitioner_referral: 'GP referral',
  social_media:          'Social media',
  walk_in:               'Walked past',
  returning:             'Returning patient',
  other:                 'Other',
};

// =============================================================================
// HELPERS
// =============================================================================

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtDateFull(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function inits(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

type Tab = 'today' | 'upcoming' | 'past' | 'requests';

// =============================================================================
// APPOINTMENT ROW
// =============================================================================

function ApptRow({
  appt, selected, onClick, isOverdue, dnaCount, onStatusChange, statusChangingId,
}: {
  appt: AppointmentRow;
  selected: boolean;
  onClick: () => void;
  isOverdue: boolean;
  dnaCount: number;
  onStatusChange: (id: string, status: 'arrived' | 'cancelled') => void;
  statusChangingId: string | null;
}) {
  const cfg = STATUS_CFG[appt.status] ?? STATUS_CFG.booked;
  const [hovered, setHovered] = useState(false);
  const isChanging = statusChangingId === appt.id;
  const canAct = appt.status === 'booked' || appt.status === 'pending';

  return (
    <motion.div
      layout
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      style={{
        padding: '11px 20px',
        cursor: 'pointer',
        borderBottom: `1px solid ${BORDER}`,
        background: selected ? `${ACCENT}08` : isOverdue ? `${ORANGE}05` : 'transparent',
        borderLeft: `3px solid ${selected ? ACCENT : isOverdue ? ORANGE : 'transparent'}`,
        transition: 'all 0.12s',
      }}
    >
      {/* Time + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {isOverdue && (
            <motion.div
              animate={{ opacity: [1, 0.2, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              style={{ width: 6, height: 6, borderRadius: 3, background: ORANGE, flexShrink: 0 }}
            />
          )}
          <span style={{ fontSize: 13, fontWeight: 800, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>
            {fmtTime(appt.starts_at)}
          </span>
          <span style={{ fontSize: 10, color: TER }}>{fmtDate(appt.starts_at)}</span>
          {dnaCount >= 2 && (
            <span title={`${dnaCount} previous no-shows`} style={{
              fontSize: 9, fontWeight: 700, color: RED,
              background: `${RED}10`, border: `1px solid ${RED}25`,
              padding: '1px 5px', borderRadius: 4, letterSpacing: '0.05em',
            }}>
              DNA ×{dnaCount}
            </span>
          )}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 600, color: cfg.color,
          background: cfg.bg, padding: '2px 8px', borderRadius: 20,
          border: `1px solid ${cfg.color}28`,
        }}>
          {cfg.label}
        </span>
      </div>

      {/* Patient + treatment */}
      <div style={{ fontSize: 13, fontWeight: 700, color: appt.patient_name === 'Patient' ? TER : NAVY, marginBottom: 2 }}>
        {appt.patient_name}
      </div>
      <div style={{ fontSize: 11, color: SEC, marginBottom: 5 }}>{appt.appointment_type}</div>

      {/* Practitioner + duration + hover actions */}
      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: MUTED, alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: appt.practitioner_color, display: 'inline-block' }} />
          {appt.practitioner_name}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={9} />{appt.duration_minutes}min
        </span>

        <AnimatePresence>
          {hovered && canAct && !isChanging && (
            <motion.div
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 4 }}
              style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={e => { e.stopPropagation(); onStatusChange(appt.id, 'arrived'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                  border: `1px solid ${GREEN}40`, background: `${GREEN}12`, color: GREEN, cursor: 'pointer',
                }}
              >
                <Check size={9} />Arrived
              </button>
              <button
                onClick={e => { e.stopPropagation(); onStatusChange(appt.id, 'cancelled'); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  padding: '2px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                  border: `1px solid ${RED}35`, background: `${RED}08`, color: RED, cursor: 'pointer',
                }}
              >
                <UserX size={9} />Cancel
              </button>
            </motion.div>
          )}
          {isChanging && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginLeft: 'auto' }}>
              <RefreshCw size={11} style={{ color: ACCENT, animation: 'spin 0.8s linear infinite' }} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// =============================================================================
// APPOINTMENT DETAIL PANEL
// =============================================================================

function ApptDetail({
  appt, dnaCount, visitCount, onClose, onStatusChange, statusChangingId,
}: {
  appt: AppointmentRow | null;
  dnaCount: number;
  visitCount: number;
  onClose: () => void;
  onStatusChange: (id: string, status: 'arrived' | 'cancelled') => void;
  statusChangingId: string | null;
}) {
  if (!appt) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: MUTED, gap: 12 }}>
        <Calendar size={32} style={{ opacity: 0.2 }} />
        <p style={{ fontSize: 13, color: MUTED }}>Select an appointment to view details</p>
        <p style={{ fontSize: 11, color: MUTED, opacity: 0.6 }}>Or hover a row to quickly mark arrived / DNA</p>
      </div>
    );
  }

  const cfg = STATUS_CFG[appt.status] ?? STATUS_CFG.booked;
  const isToday = new Date(appt.starts_at).toDateString() === new Date().toDateString();
  const minsLate = Math.floor((Date.now() - new Date(appt.starts_at).getTime()) / 60000);
  const isOverdue = isToday && appt.status === 'booked' && minsLate > 15;
  const isChanging = statusChangingId === appt.id;
  const canAct = appt.status === 'booked' || appt.status === 'pending';

  return (
    <motion.div
      key={appt.id}
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 23,
            background: `${appt.practitioner_color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, color: appt.practitioner_color,
          }}>
            {inits(appt.patient_name)}
          </div>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em' }}>
              {appt.patient_name}
            </div>
            <div style={{ fontSize: 12, color: TER, marginTop: 2 }}>{appt.appointment_type}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: cfg.color,
            background: cfg.bg, padding: '4px 12px', borderRadius: 20,
            border: `1px solid ${cfg.color}30`,
          }}>
            {cfg.label}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4 }}>
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Overdue alert */}
      {isOverdue && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 10,
            background: `${ORANGE}0e`, border: `1px solid ${ORANGE}40`,
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            style={{ width: 7, height: 7, borderRadius: 4, background: ORANGE, flexShrink: 0 }}
          />
          <span style={{ fontSize: 12, fontWeight: 600, color: ORANGE }}>
            {minsLate}min since scheduled — update status below
          </span>
        </motion.div>
      )}

      {/* Patient intelligence strip */}
      {appt.patient_db_id && (visitCount > 0 || dnaCount > 0) && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18,
          padding: '10px 14px', borderRadius: 10,
          background: `${ACCENT}06`, border: `1px solid ${BORDER}`,
        }}>
          {visitCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={11} style={{ color: ACCENT }} />
              <span style={{ fontSize: 11, color: SEC }}>
                <strong style={{ color: NAVY, fontWeight: 700 }}>{visitCount}</strong> visits on record
              </span>
            </div>
          )}
          {dnaCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserX size={11} style={{ color: dnaCount >= 3 ? RED : dnaCount >= 2 ? ORANGE : MUTED }} />
              <span style={{ fontSize: 11, color: dnaCount >= 3 ? RED : dnaCount >= 2 ? ORANGE : SEC, fontWeight: dnaCount >= 2 ? 600 : 400 }}>
                {dnaCount} no-show{dnaCount > 1 ? 's' : ''}
                {dnaCount >= 3 ? ' — high risk, consider calling ahead' : dnaCount >= 2 ? ' — consider reminder call' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Date / Time */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        marginBottom: 18, padding: 16,
        background: `${ACCENT}06`, borderRadius: 12, border: `1px solid ${BORDER}`,
      }}>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: MUTED, marginBottom: 4 }}>Date</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{fmtDateFull(appt.starts_at)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: MUTED, marginBottom: 4 }}>Time</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
            {fmtTime(appt.starts_at)}{appt.ends_at ? ` — ${fmtTime(appt.ends_at)}` : ''}
            <span style={{ fontSize: 11, fontWeight: 400, color: TER, marginLeft: 8 }}>{appt.duration_minutes}min</span>
          </div>
        </div>
      </div>

      {/* Practitioner */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Practitioner</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: `${appt.practitioner_color}08`, borderRadius: 10, border: `1px solid ${appt.practitioner_color}20` }}>
          <div style={{ width: 30, height: 30, borderRadius: 15, background: `${appt.practitioner_color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: appt.practitioner_color }}>
            {inits(appt.practitioner_name)}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{appt.practitioner_name}</span>
        </div>
      </div>

      {/* Contact */}
      {(appt.patient_phone || appt.patient_email) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Contact</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {appt.patient_phone && (
              <a href={`tel:${appt.patient_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, textDecoration: 'none', color: ACCENT, fontSize: 13 }}>
                <Phone size={13} />{appt.patient_phone}
              </a>
            )}
            {appt.patient_email && (
              <a href={`mailto:${appt.patient_email}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, textDecoration: 'none', color: ACCENT, fontSize: 13 }}>
                <Mail size={13} />{appt.patient_email}
              </a>
            )}
          </div>
        </div>
      )}

      {/* Notes */}
      {appt.notes && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Notes</div>
          <div style={{ fontSize: 12, color: SEC, lineHeight: 1.7, padding: '10px 14px', background: `${BORDER}40`, borderRadius: 8 }}>
            {appt.notes}
          </div>
        </div>
      )}

      {/* Status actions */}
      {canAct && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>
            Update Status {isChanging && <span style={{ color: ACCENT, marginLeft: 6, fontWeight: 500, textTransform: 'none', fontSize: 10 }}>Saving…</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              disabled={isChanging}
              onClick={() => onStatusChange(appt.id, 'arrived')}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: isChanging ? 'not-allowed' : 'pointer',
                border: `1px solid ${GREEN}40`, background: `${GREEN}0e`, color: GREEN, opacity: isChanging ? 0.5 : 1,
              }}
            >
              <Check size={12} />Mark Arrived
            </button>
            <button
              disabled={isChanging}
              onClick={() => onStatusChange(appt.id, 'cancelled')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '9px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: isChanging ? 'not-allowed' : 'pointer',
                border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, opacity: isChanging ? 0.5 : 1,
              }}
            >
              <X size={12} />Cancel
            </button>
          </div>
        </div>
      )}

      {/* View patient */}
      {appt.patient_db_id && (
        <Link
          href={`/staff/patients/${appt.patient_db_id}`}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
            borderRadius: 8, fontSize: 13, border: `1px solid ${ACCENT}40`,
            background: `${ACCENT}10`, color: NAVY, textDecoration: 'none',
            fontWeight: 600, justifyContent: 'center',
          }}
        >
          <User size={13} />View Patient Record<ArrowUpRight size={12} />
        </Link>
      )}
    </motion.div>
  );
}

// =============================================================================
// PENDING ROW
// =============================================================================

function PendingRow({ booking, selected, onClick }: { booking: PendingBooking; selected: boolean; onClick: () => void }) {
  return (
    <motion.div layout onClick={onClick} style={{
      padding: '12px 20px', cursor: 'pointer',
      borderBottom: `1px solid ${BORDER}`,
      background: selected ? `${ACCENT}08` : 'transparent',
      borderLeft: `3px solid ${selected ? ACCENT : 'transparent'}`,
      transition: 'all 0.12s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{booking.patient_name}</div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {/* Via Komal badge */}
          <span style={{
            fontSize: 9, fontWeight: 700, color: ACCENT,
            background: `${ACCENT}10`, border: `1px solid ${ACCENT}25`,
            padding: '1px 6px', borderRadius: 4, letterSpacing: '0.06em',
          }}>
            KOMAL
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: GOLD, background: `${GOLD}12`, padding: '2px 8px', borderRadius: 20, border: `1px solid ${GOLD}30` }}>
            Pending
          </span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: SEC, marginBottom: 3 }}>{booking.treatment_interest ?? 'No treatment specified'}</div>
      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: MUTED, alignItems: 'center' }}>
        {booking.preferred_date && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Calendar size={9} />{booking.preferred_date}
          </span>
        )}
        {booking.referral_source && (
          <span style={{
            fontSize: 9, color: TER, background: `${BORDER}80`, padding: '1px 6px', borderRadius: 4,
          }}>
            {REFERRAL_LABELS[booking.referral_source] ?? booking.referral_source}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>{relTime(booking.created_at)}</span>
      </div>
    </motion.div>
  );
}

// =============================================================================
// PENDING DETAIL
// =============================================================================

function PendingDetail({ booking, onConfirm, onDismiss }: {
  booking: PendingBooking | null;
  onConfirm: (id: string) => void;
  onDismiss: (id: string, brId: string | null) => void;
}) {
  if (!booking) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: MUTED, gap: 12 }}>
        <MessageSquare size={32} style={{ opacity: 0.2 }} />
        <p style={{ fontSize: 13, color: MUTED }}>Select a request to review</p>
        <p style={{ fontSize: 11, color: MUTED, opacity: 0.6 }}>Requests captured by Komal during phone calls</p>
      </div>
    );
  }

  return (
    <motion.div key={booking.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
      style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 46, height: 46, borderRadius: 23, background: `${ACCENT}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700, color: ACCENT }}>
          {inits(booking.patient_name)}
        </div>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, color: NAVY }}>{booking.patient_name}</div>
          <div style={{ fontSize: 12, color: TER, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Received {relTime(booking.created_at)}</span>
            <span style={{
              fontSize: 9, fontWeight: 700, color: ACCENT,
              background: `${ACCENT}10`, border: `1px solid ${ACCENT}25`,
              padding: '1px 6px', borderRadius: 4,
            }}>VIA KOMAL</span>
          </div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: GOLD, background: `${GOLD}12`, padding: '4px 12px', borderRadius: 20, border: `1px solid ${GOLD}30` }}>
          Pending
        </span>
      </div>

      {/* Treatment + preference */}
      {booking.treatment_interest && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Treatment Interest</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{booking.treatment_interest}</div>
        </div>
      )}

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        marginBottom: 16, padding: 14,
        background: `${ACCENT}06`, borderRadius: 10, border: `1px solid ${BORDER}`,
      }}>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 600, color: MUTED, marginBottom: 4 }}>Preferred Date</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{booking.preferred_date ?? 'Flexible'}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 600, color: MUTED, marginBottom: 4 }}>Preferred Time</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{booking.preferred_time ?? 'Flexible'}</div>
        </div>
        {booking.preferred_practitioner && (
          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.18em', fontWeight: 600, color: MUTED, marginBottom: 4 }}>Requested Practitioner</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{booking.preferred_practitioner}</div>
          </div>
        )}
      </div>

      {/* Contact */}
      {(booking.patient_phone || booking.patient_email) && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Contact</div>
          {booking.patient_phone && (
            <a href={`tel:${booking.patient_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, textDecoration: 'none', color: ACCENT, fontSize: 13, marginBottom: 5 }}>
              <Phone size={13} />{booking.patient_phone}
            </a>
          )}
          {booking.patient_email && (
            <a href={`mailto:${booking.patient_email}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, textDecoration: 'none', color: ACCENT, fontSize: 13 }}>
              <Mail size={13} />{booking.patient_email}
            </a>
          )}
        </div>
      )}

      {/* Referral */}
      {booking.referral_source && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>How They Found Us</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={12} style={{ color: ACCENT }} />
            <span style={{ fontSize: 13, color: SEC, fontWeight: 500 }}>{REFERRAL_LABELS[booking.referral_source] ?? booking.referral_source}</span>
          </div>
        </div>
      )}

      {/* Call notes */}
      {booking.notes && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Call Notes (Komal)</div>
          <div style={{ fontSize: 12, color: SEC, lineHeight: 1.7, padding: '10px 14px', background: `${BORDER}40`, borderRadius: 8, borderLeft: `3px solid ${ACCENT}30` }}>
            {booking.notes}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => onDismiss(booking.id, booking.booking_request_id)}
          style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <X size={13} />Dismiss
        </button>
        <button
          onClick={() => onConfirm(booking.id)}
          style={{ flex: 2, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
        >
          <Check size={13} />Confirm Booking
        </button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// CONFIRM DIALOG
// =============================================================================

function ConfirmDialog({ booking, practitioners, onConfirm, onClose, saving }: {
  booking: PendingBooking;
  practitioners: PractitionerRow[];
  onConfirm: (p: { confirmedDate: string; confirmedTime: string; practitionerClinikoId?: string }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]       = useState(today);
  const [time, setTime]       = useState('09:00');
  const [practId, setPractId] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(26,16,53,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        style={{ background: BG, borderRadius: 16, padding: 32, width: 480, maxWidth: '90vw', border: `1px solid ${BORDER}`, boxShadow: '0 20px 60px rgba(26,16,53,0.16)' }}>
        <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 6 }}>Confirm Appointment</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 20 }}>
          {booking.patient_name} — {booking.treatment_interest ?? 'Appointment'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Date', type: 'date', value: date, set: setDate },
            { label: 'Time', type: 'time', value: time, set: setTime },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.2em' }}>{f.label}</div>
              <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, fontSize: 13, color: NAVY, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          ))}
          {practitioners.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Practitioner</div>
              <select value={practId} onChange={e => setPractId(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, background: BG, fontSize: 13, color: NAVY, outline: 'none', boxSizing: 'border-box' }}>
                <option value="">{booking.preferred_practitioner ? `${booking.preferred_practitioner} (requested)` : 'Any available'}</option>
                {practitioners.map(p => <option key={p.cliniko_id} value={p.cliniko_id}>{p.name}</option>)}
              </select>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600 }}>
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ confirmedDate: date, confirmedTime: time, practitionerClinikoId: practId || undefined })}
            disabled={saving || !date}
            style={{ flex: 2, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY, cursor: saving || !date ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: saving || !date ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
            {saving ? 'Confirming…' : 'Confirm & Book'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

interface Stats { total: number; today: number; thisWeek: number; thisMonth: number; upcoming: number }

export default function AppointmentsPage() {
  const router = useRouter();
  const [profile, setProfile]           = useState<StaffProfile | null>(null);
  const [userId, setUserId]             = useState('');
  const [stats, setStats]               = useState<Stats>({ total: 0, today: 0, thisWeek: 0, thisMonth: 0, upcoming: 0 });
  const [todayAppts, setTodayAppts]     = useState<AppointmentRow[]>([]);
  const [upcoming, setUpcoming]         = useState<AppointmentRow[]>([]);
  const [past, setPast]                 = useState<AppointmentRow[]>([]);
  const [pendingBookings, setPending]   = useState<PendingBooking[]>([]);
  const [practitioners, setPractitioners] = useState<PractitionerRow[]>([]);
  const [selectedAppt, setSelectedAppt] = useState<AppointmentRow | null>(null);
  const [selectedPending, setSelectedP] = useState<PendingBooking | null>(null);
  const [tab, setTab]                   = useState<Tab>('upcoming');
  const [search, setSearch]             = useState('');
  const [filterPract, setFilterPract]   = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [statusChangingId, setStatusChangingId] = useState<string | null>(null);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);
  const [clinikoStatus, setClinikoStatus] = useState<{ connected: boolean; lastSync: string | null; totalSynced: number } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Computed intelligence ──────────────────────────────────────────────────

  /** Map of patient_db_id → DNA count (from full appointment history) */
  const dnaMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    [...past, ...upcoming].forEach(a => {
      if (a.status === 'did_not_arrive' && a.patient_db_id) {
        map[a.patient_db_id] = (map[a.patient_db_id] || 0) + 1;
      }
    });
    return map;
  }, [past, upcoming]);

  /** Map of patient_db_id → total visit count */
  const visitMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    [...past, ...upcoming].forEach(a => {
      if (a.patient_db_id) {
        map[a.patient_db_id] = (map[a.patient_db_id] || 0) + 1;
      }
    });
    return map;
  }, [past, upcoming]);

  /** Today's appointments that started >15min ago and are still 'booked' */
  const overdueIds = useMemo(() => {
    const threshold = Date.now() - 15 * 60 * 1000;
    return new Set(
      todayAppts
        .filter(a => a.status === 'booked' && new Date(a.starts_at).getTime() < threshold)
        .map(a => a.id)
    );
  }, [todayAppts]);

  /** DNA rate from past 30 days */
  const dnaRate = useMemo(() => {
    if (past.length === 0) return 0;
    return Math.round((past.filter(a => a.status === 'did_not_arrive').length / past.length) * 100);
  }, [past]);

  /** High-risk patients today (≥2 previous DNAs) */
  const highDnaToday = useMemo(() =>
    todayAppts.filter(a => a.patient_db_id && (dnaMap[a.patient_db_id] ?? 0) >= 2).length,
    [todayAppts, dnaMap]
  );

  // ── Data loading ───────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const [statsS, upS, pastS, pendS, practS, statusS] = await Promise.allSettled([
      getAppointmentStats(),
      getUpcomingAppointments(60),
      getPastAppointments(30),
      getPendingBookings(),
      getPractitioners(),
      getClinikoConnectionStatus(),
    ]);

    const statsRes  = statsS.status  === 'fulfilled' ? statsS.value  : { total: 0, today: 0, thisWeek: 0, thisMonth: 0, upcoming: 0 };
    const upRes     = upS.status     === 'fulfilled' ? upS.value     : { appointments: [], total: 0, hasReal: false };
    const pastRes   = pastS.status   === 'fulfilled' ? pastS.value   : { appointments: [], total: 0 };
    const pendRes   = pendS.status   === 'fulfilled' ? pendS.value   : { bookings: [], isDemo: false };
    const practRes  = practS.status  === 'fulfilled' ? practS.value  : [];
    const statusRes = statusS.status === 'fulfilled' ? statusS.value : { connected: false, lastSync: null, totalSynced: 0 };

    setClinikoStatus(statusRes);
    setStats(statsRes);
    setUpcoming(upRes.appointments);
    setPast(pastRes.appointments);
    setPending(pendRes.bookings);
    setPractitioners(practRes);
    setTodayAppts(upRes.appointments.filter(a => a.starts_at >= todayStart && a.starts_at < todayEnd));
    setLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      const { userId: uid } = await getCurrentUser();
      const safeUid = uid || '';
      setUserId(safeUid);
      const profRes = await getStaffProfile('clinic', safeUid);
      if (profRes.success && profRes.data) setProfile(profRes.data.profile);
      await loadData();
    })();
  }, [router, loadData]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleStatusChange = useCallback(async (id: string, newStatus: 'arrived' | 'cancelled') => {
    setStatusChangingId(id);
    try {
      const res = await updateAppointmentStatus(id, newStatus);
      if (res.success) {
        const cfg = STATUS_CFG[newStatus];
        showToast(`Marked as ${cfg?.label ?? newStatus}`);
        // Optimistic update across all lists
        const updater = (list: AppointmentRow[]) =>
          list.map(a => a.id === id ? { ...a, status: newStatus } : a);
        setTodayAppts(updater);
        setUpcoming(updater);
        setPast(updater);
        setSelectedAppt(prev => prev?.id === id ? { ...prev, status: newStatus } : prev);
      } else {
        showToast('Status update failed', false);
      }
    } catch (err) { showToast(String(err), false); }
    finally { setStatusChangingId(null); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConfirm(params: { confirmedDate: string; confirmedTime: string; practitionerClinikoId?: string }) {
    if (!confirmTarget) return;
    setSaving(true);
    const booking = pendingBookings.find(b => b.id === confirmTarget);
    try {
      const result = await confirmPendingBooking(
        confirmTarget, booking?.booking_request_id ?? null,
        { confirmed_date: params.confirmedDate, confirmed_time: params.confirmedTime, practitioner_cliniko_id: params.practitionerClinikoId },
      );
      showToast(result.success ? 'Booking confirmed' : (result.error ?? 'Confirm failed'), result.success);
    } catch (err) { showToast(String(err), false); }
    finally { setSaving(false); setConfirmTarget(null); setSelectedP(null); await loadData(); }
  }

  async function handleDismiss(signalId: string, bookingRequestId: string | null) {
    await dismissPendingBooking(signalId, bookingRequestId);
    showToast('Request dismissed');
    setSelectedP(null);
    await loadData();
  }

  // ── Filter helpers ──────────────────────────────────────────────────────────

  const filterAppts = useCallback((list: AppointmentRow[]) => {
    let result = filterPract ? list.filter(a => a.practitioner_name === filterPract) : list;
    const q = search.toLowerCase();
    return !q ? result : result.filter(a =>
      [a.patient_name, a.appointment_type, a.practitioner_name].some(v => v?.toLowerCase().includes(q))
    );
  }, [filterPract, search]);

  const filterPending = (list: PendingBooking[]) => {
    const q = search.toLowerCase();
    return !q ? list : list.filter(b =>
      [b.patient_name, b.treatment_interest, b.patient_phone].some(v => v?.toLowerCase().includes(q))
    );
  };

  const currentList     = tab === 'today' ? filterAppts(todayAppts) : tab === 'upcoming' ? filterAppts(upcoming) : tab === 'past' ? filterAppts(past) : filterPending(pendingBookings);
  const pendingCount    = pendingBookings.length;
  const confirmBooking  = pendingBookings.find(b => b.id === confirmTarget) ?? null;
  const overdueCount    = overdueIds.size;

  if (!profile) return null;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'today',    label: 'Today',    count: stats.today     },
    { key: 'upcoming', label: 'Upcoming', count: stats.upcoming  },
    { key: 'past',     label: 'Past 30d'                         },
    { key: 'requests', label: 'Requests', count: pendingCount || undefined },
  ];

  // Unique practitioners in current view for filter chips
  const practsInView = useMemo(() => {
    const seen = new Set<string>();
    const list: PractitionerRow[] = [];
    practitioners.forEach(p => {
      if (!seen.has(p.name)) { seen.add(p.name); list.push(p); }
    });
    return list;
  }, [practitioners]);

  return (
    <div style={{ minHeight: '100vh', background: BG, paddingLeft: 'var(--nav-w,240px)' }}>
      <StaffNav profile={profile} userId={userId} brandColor={ACCENT} currentPath="Appointments" />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ position: 'fixed', top: 20, right: 20, zIndex: 100, background: toast.ok ? '#ECFDF5' : '#FFF1F2', border: `1px solid ${toast.ok ? '#A7F3D0' : '#FECDD3'}`, color: toast.ok ? GREEN : RED, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm dialog */}
      <AnimatePresence>
        {confirmTarget && confirmBooking && (
          <ConfirmDialog booking={confirmBooking} practitioners={practitioners} onConfirm={handleConfirm} onClose={() => setConfirmTarget(null)} saving={saving} />
        )}
      </AnimatePresence>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 32px' }}>

        {/* ── Header ── */}
        <div style={{ paddingTop: 40, paddingBottom: 20, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>
            Edgbaston Wellness Clinic
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: NAVY, margin: 0, lineHeight: 1 }}>Appointments</h1>
              <p style={{ fontSize: 13, color: TER, marginTop: 6, marginBottom: 0 }}>
                {stats.total.toLocaleString()} appointments synced
                {clinikoStatus?.lastSync && ` · last sync ${relTime(clinikoStatus.lastSync)}`}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Cliniko not connected */}
              {clinikoStatus && !clinikoStatus.connected && (
                <Link href="/staff/integrations" style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 20,
                  background: '#FFF1F2', border: '1px solid #FECDD3',
                  color: RED, fontSize: 11, fontWeight: 600, textDecoration: 'none',
                }}>
                  <AlertCircle size={11} />Cliniko not connected
                </Link>
              )}
              {/* Pending badge */}
              {pendingCount > 0 && (
                <button onClick={() => setTab('requests')} style={{
                  padding: '6px 14px', borderRadius: 20, background: `${GOLD}12`,
                  border: `1px solid ${GOLD}30`, color: GOLD, fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
                }}>
                  <AlertCircle size={12} />{pendingCount} pending from Komal
                </button>
              )}
              <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600 }}>
                <RefreshCw size={12} />Refresh
              </button>
              <Link href={`/staff/calendar?userId=${userId}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY, textDecoration: 'none', fontWeight: 600 }}>
                <Calendar size={12} />Calendar<ExternalLink size={10} />
              </Link>
            </div>
          </div>
        </div>

        {/* ── Intelligence strip ── */}
        <AnimatePresence>
          {!loading && (overdueCount > 0 || highDnaToday > 0 || pendingCount > 0) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{ display: 'flex', gap: 8, padding: '10px 0', borderBottom: `1px solid ${BORDER}`, flexWrap: 'wrap' }}
            >
              {overdueCount > 0 && (
                <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 20, background: `${ORANGE}0e`, border: `1px solid ${ORANGE}35`, color: ORANGE, fontSize: 11, fontWeight: 600 }}>
                  <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1.4, repeat: Infinity }}
                    style={{ width: 6, height: 6, borderRadius: 3, background: ORANGE }} />
                  {overdueCount} appointment{overdueCount > 1 ? 's' : ''} may need status update
                </motion.div>
              )}
              {highDnaToday > 0 && (
                <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 20, background: `${RED}08`, border: `1px solid ${RED}25`, color: RED, fontSize: 11, fontWeight: 600 }}>
                  <UserX size={11} />
                  {highDnaToday} high DNA-risk patient{highDnaToday > 1 ? 's' : ''} today
                </motion.div>
              )}
              {pendingCount > 0 && (
                <motion.div initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 12px', borderRadius: 20, background: `${GOLD}0e`, border: `1px solid ${GOLD}30`, color: GOLD, fontSize: 11, fontWeight: 600 }}>
                  <MessageSquare size={11} />
                  {pendingCount} Komal booking{pendingCount > 1 ? 's' : ''} awaiting confirmation
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Stats strip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 1, background: BORDER, borderBottom: `1px solid ${BORDER}` }}>
          {[
            { label: 'Total Synced',  value: stats.total.toLocaleString(), icon: <TrendingUp size={14} />,   hl: false,             color: NAVY  },
            { label: 'Today',         value: stats.today,                   icon: <Calendar size={14} />,     hl: stats.today > 0,   color: ACCENT },
            { label: 'This Week',     value: stats.thisWeek,                icon: <Activity size={14} />,     hl: false,             color: NAVY  },
            { label: 'This Month',    value: stats.thisMonth,               icon: <Shield size={14} />,       hl: false,             color: NAVY  },
            { label: 'Upcoming',      value: stats.upcoming,                icon: <ChevronRight size={14} />, hl: false,             color: NAVY  },
            { label: 'DNA Rate 30d',  value: `${dnaRate}%`,                 icon: <UserX size={14} />,        hl: dnaRate > 15,      color: dnaRate > 15 ? RED : dnaRate > 8 ? ORANGE : GREEN },
          ].map(s => (
            <div key={s.label} style={{ background: BG, padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <span style={{ color: s.hl ? s.color : MUTED }}>{s.icon}</span>
                <span style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.04em', color: s.hl ? s.color : NAVY }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Split layout ── */}
        <div style={{ display: 'flex', height: 'calc(100vh - 295px)', borderTop: `1px solid ${BORDER}` }}>

          {/* Left: list */}
          <div style={{ width: 420, flexShrink: 0, borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Tabs + search */}
            <div style={{ padding: '12px 16px 8px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
                {TABS.map(({ key, label, count }) => (
                  <button key={key} onClick={() => { setTab(key); setSelectedAppt(null); setSelectedP(null); setSearch(''); setFilterPract(null); }}
                    style={{ padding: '5px 11px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: tab === key ? `${ACCENT}18` : 'transparent', color: tab === key ? NAVY : MUTED, border: tab === key ? `1px solid ${ACCENT}40` : '1px solid transparent' }}>
                    {label}{count !== undefined && count > 0 ? ` (${count})` : ''}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search patient, treatment, practitioner…"
                  style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', fontSize: 12, color: NAVY, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Practitioner filter chips */}
            {tab !== 'requests' && practsInView.length > 1 && (
              <div style={{ padding: '8px 16px', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
                <button
                  onClick={() => setFilterPract(null)}
                  style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filterPract === null ? ACCENT : BORDER}`, background: filterPract === null ? `${ACCENT}14` : 'transparent', color: filterPract === null ? ACCENT : MUTED }}>
                  All
                </button>
                {practsInView.map(p => (
                  <button key={p.name} onClick={() => setFilterPract(p.name === filterPract ? null : p.name)}
                    style={{ padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, border: `1px solid ${filterPract === p.name ? p.color : BORDER}`, background: filterPract === p.name ? `${p.color}14` : 'transparent', color: filterPract === p.name ? p.color : MUTED }}>
                    <span style={{ width: 5, height: 5, borderRadius: 3, background: p.color, display: 'inline-block' }} />
                    {p.name.split(' ')[0]}
                  </button>
                ))}
              </div>
            )}

            {/* List */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: MUTED, fontSize: 13 }}>
                  <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                  Loading appointments…
                  <style>{`@keyframes spin { to { transform: rotate(360deg); }}`}</style>
                </div>
              ) : currentList.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <Calendar size={28} style={{ color: BORDER, margin: '0 auto 12px', display: 'block' }} />
                  <div style={{ fontSize: 13, color: MUTED }}>
                    {tab === 'today'    && 'No appointments today'}
                    {tab === 'upcoming' && 'No upcoming appointments'}
                    {tab === 'past'     && 'No past appointments in the last 30 days'}
                    {tab === 'requests' && 'No pending booking requests'}
                  </div>
                  {filterPract && (
                    <button onClick={() => setFilterPract(null)} style={{ marginTop: 10, fontSize: 11, color: ACCENT, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                      Clear practitioner filter
                    </button>
                  )}
                </div>
              ) : (
                <AnimatePresence>
                  {tab === 'requests'
                    ? (currentList as PendingBooking[]).map(b => (
                        <PendingRow key={b.id} booking={b} selected={selectedPending?.id === b.id} onClick={() => { setSelectedP(b); setSelectedAppt(null); }} />
                      ))
                    : (currentList as AppointmentRow[]).map(a => (
                        <ApptRow
                          key={a.id}
                          appt={a}
                          selected={selectedAppt?.id === a.id}
                          isOverdue={overdueIds.has(a.id)}
                          dnaCount={a.patient_db_id ? (dnaMap[a.patient_db_id] ?? 0) : 0}
                          onStatusChange={handleStatusChange}
                          statusChangingId={statusChangingId}
                          onClick={() => { setSelectedAppt(a); setSelectedP(null); }}
                        />
                      ))
                  }
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Right: detail */}
          <AnimatePresence mode="wait">
            {tab === 'requests'
              ? (
                <PendingDetail
                  key="pending"
                  booking={selectedPending}
                  onConfirm={id => setConfirmTarget(id)}
                  onDismiss={handleDismiss}
                />
              )
              : (
                <ApptDetail
                  key="appt"
                  appt={selectedAppt}
                  dnaCount={selectedAppt?.patient_db_id ? (dnaMap[selectedAppt.patient_db_id] ?? 0) : 0}
                  visitCount={selectedAppt?.patient_db_id ? (visitMap[selectedAppt.patient_db_id] ?? 0) : 0}
                  onClose={() => setSelectedAppt(null)}
                  onStatusChange={handleStatusChange}
                  statusChangingId={statusChangingId}
                />
              )
            }
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
