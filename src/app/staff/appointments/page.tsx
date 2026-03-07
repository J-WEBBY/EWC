'use client';

// =============================================================================
// Appointments — Full management page
// Tabs: Today | Upcoming | Past | Requests (Komal)
// All data from cliniko_appointments local cache + booking_requests.
// Single 'use server' module: appointments.ts only.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, Mail, User, Calendar, Clock, Check, X,
  RefreshCw, AlertCircle, Search, CheckCircle2,
  ExternalLink, ChevronRight, TrendingUp,
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
  type PendingBooking,
  type PractitionerRow,
  type AppointmentRow,
} from '@/lib/actions/appointments';

// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG     = '#FAF7F2';
const NAVY   = '#1A1035';
const SEC    = '#3D4451';
const TER    = '#5A6475';
const MUTED  = '#96989B';
const BORDER = '#EBE5FF';
const ACCENT = '#0058E6';

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  booked:         { label: 'Booked',       color: ACCENT   },
  arrived:        { label: 'Arrived',      color: '#059669' },
  cancelled:      { label: 'Cancelled',    color: '#6B7280' },
  did_not_arrive: { label: 'DNA',          color: '#DC2626' },
  pending:        { label: 'Pending',      color: '#D8A600' },
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
// APPOINTMENT DETAIL PANEL (right side)
// =============================================================================

function ApptDetail({ appt, onClose }: { appt: AppointmentRow | null; onClose: () => void }) {
  if (!appt) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: MUTED, gap: 12 }}>
        <Calendar size={32} style={{ opacity: 0.25 }} />
        <span style={{ fontSize: 13 }}>Select an appointment to view details</span>
      </div>
    );
  }

  const cfg = STATUS_CFG[appt.status] ?? STATUS_CFG.booked;

  return (
    <motion.div
      key={appt.id}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 24,
            background: `${appt.practitioner_color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: appt.practitioner_color,
          }}>
            {inits(appt.patient_name)}
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em' }}>
              {appt.patient_name}
            </div>
            <div style={{ fontSize: 12, color: TER, marginTop: 2 }}>{appt.appointment_type}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontSize: 11, fontWeight: 600, color: cfg.color,
            background: `${cfg.color}14`, padding: '4px 12px', borderRadius: 20,
            border: `1px solid ${cfg.color}30`,
          }}>
            {cfg.label}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4 }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Date / Time */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        marginBottom: 24, padding: 16,
        background: `${ACCENT}06`, borderRadius: 12, border: `1px solid ${BORDER}`,
      }}>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: MUTED, marginBottom: 4 }}>Date</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{fmtDateFull(appt.starts_at)}</div>
        </div>
        <div>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', fontWeight: 600, color: MUTED, marginBottom: 4 }}>Time</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>
            {fmtTime(appt.starts_at)}{appt.ends_at ? ` — ${fmtTime(appt.ends_at)}` : ''}
            <span style={{ fontSize: 12, fontWeight: 400, color: TER, marginLeft: 8 }}>{appt.duration_minutes}min</span>
          </div>
        </div>
      </div>

      {/* Practitioner */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 10 }}>Practitioner</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: `${appt.practitioner_color}08`, borderRadius: 10, border: `1px solid ${appt.practitioner_color}20` }}>
          <div style={{ width: 32, height: 32, borderRadius: 16, background: `${appt.practitioner_color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: appt.practitioner_color }}>
            {inits(appt.practitioner_name)}
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{appt.practitioner_name}</span>
        </div>
      </div>

      {/* Contact */}
      {(appt.patient_phone || appt.patient_email) && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 10 }}>Contact</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 10 }}>Notes</div>
          <div style={{ fontSize: 12, color: SEC, lineHeight: 1.7, padding: '10px 14px', background: `${BORDER}40`, borderRadius: 8 }}>
            {appt.notes}
          </div>
        </div>
      )}

      {/* View patient */}
      {appt.patient_db_id && (
        <Link
          href={`/staff/patients/${appt.patient_db_id}`}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 8, fontSize: 13, border: `1px solid ${ACCENT}40`, background: `${ACCENT}10`, color: NAVY, textDecoration: 'none', fontWeight: 600, justifyContent: 'center' }}
        >
          <User size={13} />View Patient Record<ChevronRight size={13} />
        </Link>
      )}
    </motion.div>
  );
}

// =============================================================================
// PENDING BOOKING DETAIL
// =============================================================================

function PendingDetail({ booking, onConfirm, onDismiss }: {
  booking: PendingBooking | null;
  onConfirm: (id: string) => void;
  onDismiss: (id: string, brId: string | null) => void;
}) {
  if (!booking) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: MUTED, gap: 12 }}>
        <AlertCircle size={32} style={{ opacity: 0.25 }} />
        <span style={{ fontSize: 13 }}>Select a request to review</span>
      </div>
    );
  }

  return (
    <motion.div
      key={booking.id}
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      style={{ flex: 1, overflow: 'auto', padding: '28px 32px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <div style={{ width: 48, height: 48, borderRadius: 24, background: `${ACCENT}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: ACCENT }}>
          {inits(booking.patient_name)}
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>{booking.patient_name}</div>
          <div style={{ fontSize: 12, color: TER, marginTop: 2 }}>Received {relTime(booking.created_at)}</div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: '#D8A600', background: '#FFFBEB', padding: '4px 12px', borderRadius: 20 }}>Pending</span>
      </div>

      {booking.treatment_interest && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Treatment Interest</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>{booking.treatment_interest}</div>
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Appointment Preference</div>
        <div style={{ fontSize: 13, color: SEC }}>{booking.preferred_date ?? 'Flexible'}{booking.preferred_time ? ` · ${booking.preferred_time}` : ''}</div>
        {booking.preferred_practitioner && <div style={{ fontSize: 12, color: TER, marginTop: 4 }}>Requested: {booking.preferred_practitioner}</div>}
      </div>

      {(booking.patient_phone || booking.patient_email) && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Contact</div>
          {booking.patient_phone && (
            <a href={`tel:${booking.patient_phone}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: `1px solid ${BORDER}`, textDecoration: 'none', color: ACCENT, fontSize: 13, marginBottom: 6 }}>
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

      {booking.referral_source && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Referral</div>
          <div style={{ fontSize: 13, color: SEC }}>{REFERRAL_LABELS[booking.referral_source] ?? booking.referral_source}</div>
        </div>
      )}

      {booking.notes && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Call Notes</div>
          <div style={{ fontSize: 12, color: SEC, lineHeight: 1.7, padding: '10px 14px', background: `${BORDER}40`, borderRadius: 8 }}>{booking.notes}</div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button onClick={() => onDismiss(booking.id, booking.booking_request_id)} style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <X size={13} />Dismiss
        </button>
        <button onClick={() => onConfirm(booking.id)} style={{ flex: 2, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
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
  const [date, setDate]     = useState(today);
  const [time, setTime]     = useState('09:00');
  const [practId, setPractId] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(24,29,35,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        style={{ background: BG, borderRadius: 16, padding: 32, width: 480, maxWidth: '90vw', border: `1px solid ${BORDER}`, boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
        <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 6 }}>Confirm Appointment</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 20 }}>{booking.patient_name} — {booking.treatment_interest ?? 'Appointment'}</div>
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
          <button onClick={onClose} disabled={saving} style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
          <button onClick={() => onConfirm({ confirmedDate: date, confirmedTime: time, practitionerClinikoId: practId || undefined })} disabled={saving || !date}
            style={{ flex: 2, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY, cursor: saving || !date ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: saving || !date ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Confirming...' : 'Confirm'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// APPOINTMENT ROW (list item)
// =============================================================================

function ApptRow({ appt, selected, onClick }: { appt: AppointmentRow; selected: boolean; onClick: () => void }) {
  const cfg  = STATUS_CFG[appt.status] ?? STATUS_CFG.booked;
  const isPast = new Date(appt.starts_at) < new Date();

  return (
    <motion.div layout onClick={onClick} style={{
      padding: '12px 20px', cursor: 'pointer',
      borderBottom: `1px solid ${BORDER}`,
      background: selected ? `${ACCENT}0a` : 'transparent',
      borderLeft: `3px solid ${selected ? ACCENT : 'transparent'}`,
      opacity: isPast && appt.status === 'cancelled' ? 0.55 : 1,
      transition: 'all 0.12s',
    }}>
      {/* Time + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: NAVY, fontVariantNumeric: 'tabular-nums' }}>
            {fmtTime(appt.starts_at)}
          </span>
          <span style={{ fontSize: 10, color: TER }}>{fmtDate(appt.starts_at)}</span>
        </div>
        <span style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: `${cfg.color}12`, padding: '2px 8px', borderRadius: 20, border: `1px solid ${cfg.color}25` }}>
          {cfg.label}
        </span>
      </div>
      {/* Patient + type */}
      <div style={{ fontSize: 13, fontWeight: 700, color: appt.patient_name === 'Patient' ? TER : NAVY, marginBottom: 2 }}>
        {appt.patient_name}
      </div>
      <div style={{ fontSize: 11, color: SEC, marginBottom: 4 }}>{appt.appointment_type}</div>
      {/* Practitioner + duration */}
      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: MUTED, alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: 3, background: appt.practitioner_color, display: 'inline-block' }} />
          {appt.practitioner_name}
        </span>
        <span><Clock size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /> {appt.duration_minutes}min</span>
      </div>
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
      background: selected ? `${ACCENT}0a` : 'transparent',
      borderLeft: `3px solid ${selected ? ACCENT : 'transparent'}`,
      transition: 'all 0.12s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{booking.patient_name}</div>
        <span style={{ fontSize: 10, fontWeight: 600, color: '#D8A600', background: '#FFFBEB', padding: '2px 8px', borderRadius: 20 }}>Pending</span>
      </div>
      <div style={{ fontSize: 11, color: SEC, marginBottom: 3 }}>{booking.treatment_interest ?? 'No treatment specified'}</div>
      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: MUTED }}>
        {booking.preferred_date && <span><Calendar size={9} style={{ display: 'inline', verticalAlign: 'middle' }} /> {booking.preferred_date}</span>}
        <span style={{ marginLeft: 'auto' }}>{relTime(booking.created_at)}</span>
      </div>
    </motion.div>
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
  const [loading, setLoading]           = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [syncing, setSyncing]           = useState(false);
  const [syncMsg, setSyncMsg]           = useState<string | null>(null);
  const [backfilling, setBackfilling]   = useState(false);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);
  const [clinikoStatus, setClinikoStatus] = useState<{ connected: boolean; lastSync: string | null; totalSynced: number } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

      const [statsRes, upRes, pastRes, pendRes, practRes, statusRes] = await Promise.all([
        getAppointmentStats(),
        getUpcomingAppointments(60),
        getPastAppointments(30),
        getPendingBookings(),
        getPractitioners(),
        getClinikoConnectionStatus(),
      ]);
      setClinikoStatus(statusRes);

      setStats(statsRes);
      setUpcoming(upRes.appointments);
      setPast(pastRes.appointments);
      setPending(pendRes.bookings);
      setPractitioners(practRes);

      // Today = upcoming appointments that start today
      const todayList = upRes.appointments.filter(a => a.starts_at >= todayStart && a.starts_at < todayEnd);
      setTodayAppts(todayList);
    } catch (err) {
      console.error('[appointments] loadData error:', err);
    } finally {
      setLoading(false);
    }
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

  async function handleBackfill() {
    setBackfilling(true);
    try {
      const r = await fetch('/api/cliniko/backfill', { method: 'POST' });
      const res = await r.json() as { updated?: number; skipped?: number; error?: string; message?: string };
      if (r.ok && res.updated !== undefined) {
        showToast(`Backfill complete — ${res.updated} appointments fixed`);
        await loadData();
      } else {
        showToast(res.error ?? 'Backfill failed', false);
      }
    } catch (err) { showToast(String(err), false); }
    finally { setBackfilling(false); }
  }

  async function handleSyncCliniko() {
    setSyncing(true); setSyncMsg(null);
    try {
      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 65_000);
      const r     = await fetch('/api/cliniko/sync-now', { method: 'POST', signal: ctrl.signal });
      clearTimeout(timer);
      const res = await r.json() as { success: boolean; appointments?: number; error?: string };
      if (res.success) {
        setSyncMsg(`Synced — ${res.appointments ?? 0} appointments updated`);
        await loadData();
      } else {
        setSyncMsg(res.error ?? 'Sync failed');
      }
    } catch (err) { setSyncMsg(String(err)); }
    finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 6000);
    }
  }

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
    finally {
      setSaving(false); setConfirmTarget(null); setSelectedP(null);
      await loadData();
    }
  }

  async function handleDismiss(signalId: string, bookingRequestId: string | null) {
    await dismissPendingBooking(signalId, bookingRequestId);
    showToast('Booking dismissed');
    setSelectedP(null);
    await loadData();
  }

  // Filter helpers
  const filterAppts = (list: AppointmentRow[]) => {
    const q = search.toLowerCase();
    return !q ? list : list.filter(a =>
      [a.patient_name, a.appointment_type, a.practitioner_name].some(v => v?.toLowerCase().includes(q))
    );
  };
  const filterPending = (list: PendingBooking[]) => {
    const q = search.toLowerCase();
    return !q ? list : list.filter(b =>
      [b.patient_name, b.treatment_interest, b.patient_phone].some(v => v?.toLowerCase().includes(q))
    );
  };

  const currentList   = tab === 'today' ? filterAppts(todayAppts) : tab === 'upcoming' ? filterAppts(upcoming) : tab === 'past' ? filterAppts(past) : filterPending(pendingBookings);
  const pendingCount  = pendingBookings.length;
  const confirmBooking = pendingBookings.find(b => b.id === confirmTarget) ?? null;

  if (!profile) return null;

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'today',    label: 'Today',    count: stats.today     },
    { key: 'upcoming', label: 'Upcoming', count: stats.upcoming  },
    { key: 'past',     label: 'Past 30d'                         },
    { key: 'requests', label: 'Requests', count: pendingCount || undefined },
  ];

  return (
    <div style={{ minHeight: '100vh', background: BG, paddingLeft: 'var(--nav-w,240px)' }}>
      <StaffNav profile={profile} userId={userId} brandColor={ACCENT} currentPath="/staff/appointments" />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ position: 'fixed', top: 20, right: 20, zIndex: 100, background: toast.ok ? '#ECFDF5' : '#FFF1F2', border: `1px solid ${toast.ok ? '#A7F3D0' : '#FECDD3'}`, color: toast.ok ? '#059669' : '#DC2626', padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
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
        <div style={{ paddingTop: 40, paddingBottom: 24, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>
            Edgbaston Wellness Clinic
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: NAVY, margin: 0, lineHeight: 1 }}>Appointments</h1>
              <p style={{ fontSize: 13, color: TER, marginTop: 6, marginBottom: 0 }}>
                Cliniko appointments · {stats.total.toLocaleString()} total synced
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Cliniko connection status banner */}
              {clinikoStatus && !clinikoStatus.connected && (
                <Link href="/staff/integrations" style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 12px', borderRadius: 20,
                  background: '#FFF1F2', border: '1px solid #FECDD3',
                  color: '#DC2626', fontSize: 11, fontWeight: 600, textDecoration: 'none',
                }}>
                  <AlertCircle size={11} />Cliniko not connected — Go to Integrations
                </Link>
              )}
              {clinikoStatus?.connected && clinikoStatus.totalSynced === 0 && (
                <span style={{ fontSize: 11, fontWeight: 600, color: '#D8A600', background: '#FFFBEB', padding: '5px 12px', borderRadius: 20, border: '1px solid #FDE68A' }}>
                  Connected — run sync to populate data
                </span>
              )}
              {pendingCount > 0 && (
                <div style={{ padding: '6px 14px', borderRadius: 20, background: '#FFFBEB', border: '1px solid #FDE68A', color: '#D8A600', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={12} />{pendingCount} pending
                </div>
              )}
              {syncMsg && <span style={{ fontSize: 11, fontWeight: 600, color: syncMsg.startsWith('Synced') ? '#059669' : '#DC2626' }}>{syncMsg}</span>}
              {clinikoStatus?.connected && (
                <button onClick={handleBackfill} disabled={backfilling}
                  title="Fixes appointments with missing patient names / treatment types by extracting from stored raw data"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: backfilling ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: backfilling ? 0.6 : 1 }}>
                  <RefreshCw size={12} style={{ animation: backfilling ? 'spin 1s linear infinite' : 'none' }} />
                  {backfilling ? 'Fixing…' : 'Fix Data'}
                </button>
              )}
              <button onClick={handleSyncCliniko} disabled={syncing}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, border: `1px solid ${ACCENT}40`, background: `${ACCENT}12`, color: NAVY, cursor: syncing ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: syncing ? 0.6 : 1 }}>
                <RefreshCw size={12} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                {syncing ? 'Syncing…' : 'Sync Now'}
              </button>
              <button onClick={loadData}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600 }}>
                <RefreshCw size={12} />Refresh
              </button>
              <Link href={`/staff/calendar?userId=${userId}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY, textDecoration: 'none', fontWeight: 600 }}>
                <Calendar size={12} />Calendar<ExternalLink size={10} />
              </Link>
            </div>
          </div>
        </div>

        {/* ── Stats strip ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 1, background: BORDER, borderBottom: `1px solid ${BORDER}` }}>
          {[
            { label: 'Total Synced',  value: stats.total.toLocaleString(), icon: <TrendingUp size={14} />,  highlight: false },
            { label: 'Today',         value: stats.today,                   icon: <Calendar size={14} />,    highlight: stats.today > 0 },
            { label: 'This Week',     value: stats.thisWeek,                icon: <Clock size={14} />,       highlight: false },
            { label: 'This Month',    value: stats.thisMonth,               icon: <Calendar size={14} />,    highlight: false },
            { label: 'Upcoming',      value: stats.upcoming,                icon: <ChevronRight size={14} />,highlight: false },
          ].map(s => (
            <div key={s.label} style={{ background: BG, padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ color: s.highlight ? ACCENT : MUTED }}>{s.icon}</span>
                <span style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: s.highlight ? ACCENT : NAVY }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Split layout ── */}
        <div style={{ display: 'flex', height: 'calc(100vh - 280px)', borderTop: `1px solid ${BORDER}` }}>

          {/* Left: list */}
          <div style={{ width: 400, flexShrink: 0, borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Tabs */}
            <div style={{ padding: '12px 16px 8px', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', gap: 3, marginBottom: 10 }}>
                {TABS.map(({ key, label, count }) => (
                  <button key={key} onClick={() => { setTab(key); setSelectedAppt(null); setSelectedP(null); setSearch(''); }}
                    style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: tab === key ? `${ACCENT}18` : 'transparent', color: tab === key ? NAVY : MUTED, border: tab === key ? `1px solid ${ACCENT}40` : '1px solid transparent' }}>
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

            {/* List */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: MUTED, fontSize: 13 }}>
                  <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                  Loading appointments…
                </div>
              ) : currentList.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <Calendar size={28} style={{ color: BORDER, margin: '0 auto 12px', display: 'block' }} />
                  <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>
                    {tab === 'today'    && 'No appointments today'}
                    {tab === 'upcoming' && 'No upcoming appointments'}
                    {tab === 'past'     && 'No past appointments in the last 30 days'}
                    {tab === 'requests' && 'No pending booking requests'}
                  </div>
                  {(tab === 'today' || tab === 'upcoming') && clinikoStatus?.connected && (
                    <button
                      onClick={handleSyncCliniko}
                      disabled={syncing}
                      style={{ marginTop: 8, fontSize: 11, color: syncing ? MUTED : ACCENT, background: 'none', border: 'none', cursor: syncing ? 'not-allowed' : 'pointer', textDecoration: 'underline', opacity: syncing ? 0.5 : 1 }}>
                      {syncing ? 'Syncing…' : 'Sync from Cliniko'}
                    </button>
                  )}
                  {(tab === 'today' || tab === 'upcoming') && clinikoStatus && !clinikoStatus.connected && (
                    <Link href="/staff/integrations" style={{ marginTop: 8, fontSize: 11, color: ACCENT, display: 'inline-block', textDecoration: 'underline' }}>
                      Connect Cliniko in Integrations
                    </Link>
                  )}
                </div>
              ) : (
                <AnimatePresence>
                  {tab === 'requests'
                    ? (currentList as PendingBooking[]).map(b => (
                        <PendingRow key={b.id} booking={b} selected={selectedPending?.id === b.id} onClick={() => { setSelectedP(b); setSelectedAppt(null); }} />
                      ))
                    : (currentList as AppointmentRow[]).map(a => (
                        <ApptRow key={a.id} appt={a} selected={selectedAppt?.id === a.id} onClick={() => { setSelectedAppt(a); setSelectedP(null); }} />
                      ))
                  }
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Right: detail */}
          <AnimatePresence mode="wait">
            {tab === 'requests'
              ? <PendingDetail key="pending" booking={selectedPending} onConfirm={id => setConfirmTarget(id)} onDismiss={handleDismiss} />
              : <ApptDetail key="appt" appt={selectedAppt} onClose={() => setSelectedAppt(null)} />
            }
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
