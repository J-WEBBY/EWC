'use client';

// =============================================================================
// Appointments — Booking Request Management
// Booking requests captured by Komal (voice) flow into this page for staff
// review and confirmation. Staff confirm → system → Cliniko (immediate write).
// Connected to Calendar (shows confirmed appointments) and Patient pages.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, Mail, User, Calendar, Clock, Tag, Check, X,
  RefreshCw, ChevronRight, Mic, AlertCircle, Info,
  ExternalLink, Search, Filter, CheckCircle2, Circle,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StaffNav } from '@/components/staff-nav';
import { getCurrentUser, getStaffProfile, type StaffProfile } from '@/lib/actions/staff-onboarding';
import {
  getBookingRequests, confirmBookingRequest, dismissBookingRequest,
  getPractitioners, type BookingRequest, type ClinikoPractitionerRow,
} from '@/lib/actions/booking-pipeline';
import {
  getUpcomingAppointments, type AppointmentRow,
} from '@/lib/actions/appointments';


// =============================================================================
// DESIGN TOKENS
// =============================================================================

const BG      = '#FAF7F2';
const NAVY    = '#1A1035';
const SEC     = '#3D4451';
const TER     = '#5A6475';
const MUTED   = '#96989B';
const BORDER  = '#EBE5FF';
const ACCENT  = '#0058E6';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pending:          { label: 'Pending',           color: '#D8A600', bg: '#FFFBEB' },
  confirmed:        { label: 'Confirmed',          color: '#059669', bg: '#ECFDF5' },
  synced_to_cliniko:{ label: 'Synced to Cliniko',  color: '#0284C7', bg: '#EFF6FF' },
  cancelled:        { label: 'Cancelled',           color: '#6B7280', bg: '#F9FAFB' },
  duplicate:        { label: 'Duplicate',           color: '#6B7280', bg: '#F9FAFB' },
  no_show:          { label: 'No Show',             color: '#DC2626', bg: '#FFF1F2' },
};

const REFERRAL_LABELS: Record<string, string> = {
  online:                  'Found online',
  client_referral:         'Client referral',
  practitioner_referral:   'GP/practitioner referral',
  social_media:            'Social media',
  walk_in:                 'Walked past',
  returning:               'Returning patient',
  other:                   'Other',
};

// =============================================================================
// HELPERS
// =============================================================================

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function initials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

type TabFilter = 'upcoming' | 'pending' | 'confirmed' | 'all';

// =============================================================================
// CONFIRM DIALOG
// =============================================================================

interface ConfirmDialogProps {
  booking: BookingRequest;
  practitioners: ClinikoPractitionerRow[];
  onConfirm: (params: { confirmedDate: string; confirmedTime: string; practitionerClinikoId?: string }) => void;
  onClose: () => void;
  saving: boolean;
}

function ConfirmDialog({ booking, practitioners, onConfirm, onClose, saving }: ConfirmDialogProps) {
  const [date, setDate]   = useState(booking.preferred_date_iso ?? '');
  const [time, setTime]   = useState(booking.preferred_time ?? '09:00');
  const [practId, setPractId] = useState('');

  // Normalise time to HH:MM if it's a natural string
  const normTime = time.match(/^\d{2}:\d{2}$/) ? time : '09:00';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 50,
      background: 'rgba(24,29,35,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        style={{
          background: BG, borderRadius: 16, padding: 32, width: 480, maxWidth: '90vw',
          border: `1px solid ${BORDER}`, boxShadow: '0 16px 48px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 6 }}>
            Confirm Appointment
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>
            {booking.caller_name} — {booking.service}
          </div>
          <div style={{ fontSize: 12, color: TER, marginTop: 4 }}>
            Requested: {booking.preferred_date}{booking.preferred_time ? ` · ${booking.preferred_time}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
              Confirmed Date
            </div>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, background: BG,
                fontSize: 13, color: NAVY, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
              Time
            </div>
            <input
              type="time"
              value={normTime}
              onChange={e => setTime(e.target.value)}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 8,
                border: `1px solid ${BORDER}`, background: BG,
                fontSize: 13, color: NAVY, outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {practitioners.length > 0 && (
            <div>
              <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.2em' }}>
                Practitioner
              </div>
              <select
                value={practId}
                onChange={e => setPractId(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8,
                  border: `1px solid ${BORDER}`, background: '#fff',
                  fontSize: 13, color: NAVY, outline: 'none',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">
                  {booking.preferred_practitioner
                    ? `${booking.preferred_practitioner} (requested)`
                    : 'Any available practitioner'}
                </option>
                {practitioners.map(p => (
                  <option key={p.cliniko_id} value={p.cliniko_id}>{p.full_name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            disabled={saving}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13,
              border: `1px solid ${BORDER}`, background: 'transparent',
              color: SEC, cursor: 'pointer', fontWeight: 600,
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ confirmedDate: date, confirmedTime: normTime, practitionerClinikoId: practId || undefined })}
            disabled={saving || !date}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 8, fontSize: 13,
              border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY,
              cursor: saving || !date ? 'not-allowed' : 'pointer',
              fontWeight: 700, opacity: saving || !date ? 0.5 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'Confirming...' : 'Confirm & Sync to Cliniko'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// BOOKING DETAIL PANEL
// =============================================================================

interface DetailPanelProps {
  booking: BookingRequest | null;
  practitioners: ClinikoPractitionerRow[];
  onConfirm: (id: string) => void;
  onDismiss: (id: string) => void;
}

function DetailPanel({ booking, practitioners, onConfirm, onDismiss }: DetailPanelProps) {
  if (!booking) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: MUTED, fontSize: 13, flexDirection: 'column', gap: 12,
      }}>
        <Circle size={32} style={{ opacity: 0.3 }} />
        <span>Select a booking to review</span>
      </div>
    );
  }

  const cfg = STATUS_CFG[booking.status] ?? STATUS_CFG.pending;
  const isPending = booking.status === 'pending';

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '24px 28px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 22, background: `${ACCENT}15`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 15, fontWeight: 700, color: ACCENT,
          }}>
            {initials(booking.caller_name)}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: NAVY }}>
              {booking.caller_name ?? 'Unknown caller'}
            </div>
            <div style={{ fontSize: 11, color: TER, marginTop: 2 }}>
              Received {relTime(booking.created_at)}
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: cfg.color,
              background: cfg.bg, padding: '4px 10px', borderRadius: 20,
            }}>
              {cfg.label}
            </span>
          </div>
        </div>
      </div>

      {/* Treatment */}
      <Section label="Treatment">
        <Row label="Service" value={booking.service ?? '—'} />
        {booking.service_detail && <Row label="Detail" value={booking.service_detail} />}
      </Section>

      {/* Appointment preference */}
      <Section label="Appointment Preference">
        <Row label="Preferred Date" value={booking.preferred_date ?? 'Flexible'} />
        {booking.preferred_time && <Row label="Preferred Time" value={booking.preferred_time} />}
        {booking.preferred_practitioner && <Row label="Practitioner" value={booking.preferred_practitioner} />}
      </Section>

      {/* Contact */}
      <Section label="Patient Contact">
        {booking.caller_phone && (
          <a href={`tel:${booking.caller_phone}`} style={{ textDecoration: 'none' }}>
            <Row label="Phone" value={booking.caller_phone} icon={<Phone size={12} />} clickable />
          </a>
        )}
        {booking.caller_email && (
          <a href={`mailto:${booking.caller_email}`} style={{ textDecoration: 'none' }}>
            <Row label="Email" value={booking.caller_email} icon={<Mail size={12} />} clickable />
          </a>
        )}
        {!booking.caller_phone && !booking.caller_email && (
          <div style={{ fontSize: 12, color: MUTED, fontStyle: 'italic' }}>No contact details on record</div>
        )}
        {booking.referral_source && (
          <Row label="Referral" value={
            REFERRAL_LABELS[booking.referral_source] ?? booking.referral_source
            + (booking.referral_name ? ` · ${booking.referral_name}` : '')
          } />
        )}
      </Section>

      {/* Notes */}
      {booking.call_notes && (
        <Section label="Call Notes">
          <div style={{ fontSize: 12, color: SEC, lineHeight: 1.6 }}>
            {booking.call_notes}
          </div>
        </Section>
      )}

      {/* Cliniko status */}
      {booking.cliniko_appointment_id && (
        <Section label="Cliniko">
          <Row label="Appointment ID" value={booking.cliniko_appointment_id} />
          {booking.confirmed_at && <Row label="Confirmed at" value={fmtDate(booking.confirmed_at)} />}
        </Section>
      )}
      {booking.cliniko_error && (
        <div style={{
          padding: 12, borderRadius: 8, background: '#FFF1F2',
          border: '1px solid #FECDD3', marginBottom: 16, fontSize: 12, color: '#DC2626',
          display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <AlertCircle size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          <span>{booking.cliniko_error}</span>
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            onClick={() => onDismiss(booking.id)}
            style={{
              flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13,
              border: `1px solid ${BORDER}`, background: 'transparent',
              color: SEC, cursor: 'pointer', fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <X size={13} />
            Dismiss
          </button>
          <button
            onClick={() => onConfirm(booking.id)}
            style={{
              flex: 2, padding: '10px 0', borderRadius: 8, fontSize: 13,
              border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY,
              cursor: 'pointer', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Check size={13} />
            Confirm &amp; Book
          </button>
        </div>
      )}

      {!isPending && booking.status === 'confirmed' && (
        <Link
          href={`/staff/calendar`}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', borderRadius: 8, fontSize: 13,
            border: `1px solid ${BORDER}`, color: SEC, textDecoration: 'none',
            fontWeight: 600, justifyContent: 'center',
          }}
        >
          <Calendar size={13} />
          View on Calendar
          <ExternalLink size={11} />
        </Link>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, icon, clickable }: { label: string; value: string; icon?: React.ReactNode; clickable?: boolean }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '6px 0', borderBottom: `1px solid ${BORDER}`,
    }}>
      <span style={{ fontSize: 11, color: MUTED, fontWeight: 500 }}>{label}</span>
      <span style={{
        fontSize: 12, color: clickable ? ACCENT : SEC, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        {icon}
        {value}
      </span>
    </div>
  );
}

// =============================================================================
// BOOKING LIST ITEM
// =============================================================================

// =============================================================================
// UPCOMING ITEM — Cliniko synced appointment row
// =============================================================================

const STATUS_COLOR: Record<string, string> = {
  booked:   ACCENT,
  arrived:  '#059669',
  pending:  '#EA580C',
};

function UpcomingItem({ appt }: { appt: AppointmentRow }) {
  const color = STATUS_COLOR[appt.status] ?? ACCENT;
  const date  = new Date(appt.starts_at);
  const dateStr = date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <motion.div
      layout
      style={{
        padding: '12px 20px',
        borderBottom: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${color}30`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{appt.patient_name}</div>
        <span style={{
          fontSize: 10, fontWeight: 600, color,
          background: `${color}12`, padding: '2px 8px', borderRadius: 20,
          border: `1px solid ${color}30`,
        }}>
          {appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
        </span>
      </div>
      <div style={{ fontSize: 12, color: SEC, fontWeight: 500, marginBottom: 4 }}>
        {appt.appointment_type}
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: MUTED }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Calendar size={10} />
          {dateStr}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Clock size={10} />
          {timeStr}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 'auto' }}>
          <User size={10} />
          {appt.practitioner_name}
        </span>
      </div>
    </motion.div>
  );
}

// =============================================================================
// BOOKING ITEM
// =============================================================================

function BookingItem({
  booking, selected, onClick,
}: {
  booking: BookingRequest;
  selected: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CFG[booking.status] ?? STATUS_CFG.pending;
  return (
    <motion.div
      layout
      onClick={onClick}
      style={{
        padding: '14px 20px', cursor: 'pointer',
        borderBottom: `1px solid ${BORDER}`,
        background: selected ? `${ACCENT}0d` : 'transparent',
        borderLeft: `3px solid ${selected ? ACCENT : 'transparent'}`,
        transition: 'all 0.15s',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
          {booking.caller_name ?? 'Unknown caller'}
        </div>
        <span style={{
          fontSize: 10, fontWeight: 600, color: cfg.color,
          background: cfg.bg, padding: '2px 8px', borderRadius: 20,
        }}>
          {cfg.label}
        </span>
      </div>
      <div style={{ fontSize: 12, color: SEC, marginBottom: 4, fontWeight: 500 }}>
        {booking.service ?? 'No treatment specified'}
        {booking.service_detail ? ` · ${booking.service_detail}` : ''}
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: MUTED }}>
        {booking.preferred_date && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Calendar size={10} />
            {booking.preferred_date}
          </span>
        )}
        {booking.caller_phone && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Phone size={10} />
            {booking.caller_phone}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>{relTime(booking.created_at)}</span>
      </div>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AppointmentsPage() {
  const router = useRouter();
  const [profile, setProfile]         = useState<StaffProfile | null>(null);
  const [userId, setUserId]           = useState('');
  const [bookings, setBookings]       = useState<BookingRequest[]>([]);
  const [upcoming, setUpcoming]       = useState<AppointmentRow[]>([]);
  const [practitioners, setPractitioners] = useState<ClinikoPractitionerRow[]>([]);
  const [selected, setSelected]       = useState<BookingRequest | null>(null);
  const [tab, setTab]                 = useState<TabFilter>('upcoming');
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(true);
  const [confirmTarget, setConfirmTarget] = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [syncMsg, setSyncMsg]         = useState<string | null>(null);
  const [toast, setToast]             = useState<{ msg: string; ok: boolean } | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    const [all, practs, upcomingRes] = await Promise.all([
      getBookingRequests(),
      getPractitioners(),
      getUpcomingAppointments(30),
    ]);
    setBookings(all);
    setPractitioners(practs);
    setUpcoming(upcomingRes.appointments);
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

  // Filter bookings
  const filtered = bookings.filter(b => {
    const matchTab =
      tab === 'all'       ? true :
      tab === 'pending'   ? b.status === 'pending' :
      tab === 'confirmed' ? ['confirmed', 'synced_to_cliniko'].includes(b.status) :
      true;
    const q = search.toLowerCase();
    const matchSearch = !q || [b.caller_name, b.service, b.caller_phone, b.caller_email]
      .some(v => v?.toLowerCase().includes(q));
    return matchTab && matchSearch;
  });

  const pendingCount = bookings.filter(b => b.status === 'pending').length;

  async function handleSyncCliniko() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 65_000);
      const r = await fetch('/api/cliniko/sync-now', { method: 'POST', signal: ctrl.signal });
      clearTimeout(timer);
      const res = await r.json() as { success: boolean; appointments?: number; error?: string };
      if (res.success) {
        setSyncMsg(`Synced — ${res.appointments ?? 0} appointment${(res.appointments ?? 0) !== 1 ? 's' : ''} updated`);
        await loadData();
        setTab('upcoming');
      } else {
        setSyncMsg(res.error ?? 'Sync failed — check Cliniko connection in Integrations');
      }
    } catch (err) {
      setSyncMsg(String(err));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 6000);
    }
  }

  async function handleConfirm(params: { confirmedDate: string; confirmedTime: string; practitionerClinikoId?: string }) {
    if (!confirmTarget) return;
    setSaving(true);
    try {
      const result = await confirmBookingRequest(confirmTarget, {
        confirmed_date:         params.confirmedDate,
        confirmed_time:         params.confirmedTime,
        practitioner_cliniko_id: params.practitionerClinikoId,
      });
      if (result.success) {
        showToast(result.cliniko_appointment_id
          ? `Booked in Cliniko — ID ${result.cliniko_appointment_id}`
          : 'Booking confirmed');
      } else {
        showToast(result.error ?? 'Confirm failed', false);
      }
    } catch (err) {
      showToast(String(err), false);
    } finally {
      setSaving(false);
      setConfirmTarget(null);
      setSelected(null);
      await loadData();
    }
  }

  async function handleDismiss(id: string) {
    await dismissBookingRequest(id, 'cancelled');
    showToast('Booking dismissed');
    setSelected(null);
    await loadData();
  }

  if (!profile) return null;

  return (
    <div style={{ minHeight: '100vh', background: BG, paddingLeft: 'var(--nav-w,240px)' }}>
      <StaffNav profile={profile} userId={userId} brandColor={ACCENT} currentPath="/staff/appointments" />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed', top: 20, right: 20, zIndex: 100,
              background: toast.ok ? '#ECFDF5' : '#FFF1F2',
              border: `1px solid ${toast.ok ? '#A7F3D0' : '#FECDD3'}`,
              color: toast.ok ? '#059669' : '#DC2626',
              padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm dialog */}
      <AnimatePresence>
        {confirmTarget && (
          <ConfirmDialog
            booking={bookings.find(b => b.id === confirmTarget)!}
            practitioners={practitioners}
            onConfirm={handleConfirm}
            onClose={() => setConfirmTarget(null)}
            saving={saving}
          />
        )}
      </AnimatePresence>

      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '0 32px' }}>

        {/* Header */}
        <div style={{ paddingTop: 40, paddingBottom: 28, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>
            Edgbaston Wellness Clinic
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: NAVY, margin: 0, lineHeight: 1 }}>
                Appointments
              </h1>
              <p style={{ fontSize: 13, color: TER, marginTop: 8, margin: 0 }}>
                Upcoming appointments from Cliniko · Pending booking requests from Komal
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {pendingCount > 0 && (
                <div style={{
                  padding: '6px 14px', borderRadius: 20, background: '#FFFBEB',
                  border: '1px solid #FDE68A', color: '#D8A600',
                  fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <AlertCircle size={12} />
                  {pendingCount} pending
                </div>
              )}
              {syncMsg && (
                <span style={{ fontSize: 11, fontWeight: 600, color: syncMsg.startsWith('Synced') ? '#059669' : '#DC2626' }}>
                  {syncMsg}
                </span>
              )}
              <button
                onClick={handleSyncCliniko}
                disabled={syncing}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, fontSize: 12,
                  border: `1px solid ${ACCENT}40`, background: `${ACCENT}12`, color: NAVY,
                  cursor: syncing ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: syncing ? 0.6 : 1,
                }}
              >
                <RefreshCw size={12} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
                {syncing ? 'Syncing…' : 'Sync from Cliniko'}
              </button>
              <button
                onClick={loadData}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, fontSize: 12,
                  border: `1px solid ${BORDER}`, background: 'transparent',
                  color: SEC, cursor: 'pointer', fontWeight: 600,
                }}
              >
                <RefreshCw size={12} />
                Refresh
              </button>
              <Link
                href={`/staff/calendar?userId=${userId}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 8, fontSize: 12,
                  border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY,
                  textDecoration: 'none', fontWeight: 600,
                }}
              >
                <Calendar size={12} />
                View Calendar
              </Link>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: BORDER, borderBottom: `1px solid ${BORDER}`, marginBottom: 0 }}>
          {[
            { label: 'Upcoming (30d)', value: upcoming.length },
            { label: 'Pending Requests', value: bookings.filter(b => b.status === 'pending').length },
            { label: 'Confirmed', value: bookings.filter(b => ['confirmed','synced_to_cliniko'].includes(b.status)).length },
            { label: 'In Cliniko', value: bookings.filter(b => b.status === 'synced_to_cliniko').length },
          ].map(s => (
            <div key={s.label} style={{ background: BG, padding: '16px 24px' }}>
              <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 4 }}>
                {s.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: NAVY }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {/* Main split layout */}
        <div style={{ display: 'flex', height: 'calc(100vh - 240px)', borderTop: `1px solid ${BORDER}` }}>

          {/* Left: list */}
          <div style={{ width: 380, flexShrink: 0, borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Tabs + search */}
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
                {([
                  { key: 'upcoming',  label: `Upcoming${upcoming.length > 0 ? ` (${upcoming.length})` : ''}` },
                  { key: 'pending',   label: `Pending${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
                  { key: 'confirmed', label: 'Confirmed' },
                  { key: 'all',       label: 'All Requests' },
                ] as { key: TabFilter; label: string }[]).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                      cursor: 'pointer',
                      background: tab === key ? `${ACCENT}18` : 'transparent',
                      color: tab === key ? NAVY : MUTED,
                      border: tab === key ? `1px solid ${ACCENT}40` : '1px solid transparent',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={tab === 'upcoming' ? 'Search patient, treatment…' : 'Search name, treatment, phone…'}
                  style={{
                    width: '100%', padding: '7px 10px 7px 28px', borderRadius: 8,
                    border: `1px solid ${BORDER}`, background: 'transparent',
                    fontSize: 12, color: NAVY, outline: 'none', boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>

            {/* List */}
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading ? (
                <div style={{ padding: 32, textAlign: 'center', color: MUTED, fontSize: 13 }}>
                  Loading…
                </div>
              ) : tab === 'upcoming' ? (
                (() => {
                  const q = search.toLowerCase();
                  const rows = upcoming.filter(a =>
                    !q || [a.patient_name, a.appointment_type, a.practitioner_name]
                      .some(v => v?.toLowerCase().includes(q))
                  );
                  return rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center' }}>
                      <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>
                        {upcoming.length === 0
                          ? 'No upcoming appointments in the next 30 days'
                          : 'No results match your search'}
                      </div>
                      {upcoming.length === 0 && (
                        <div style={{ fontSize: 11, color: MUTED }}>
                          Click &quot;Sync from Cliniko&quot; to load your appointments
                        </div>
                      )}
                    </div>
                  ) : (
                    <AnimatePresence>
                      {rows.map(a => <UpcomingItem key={a.id} appt={a} />)}
                    </AnimatePresence>
                  );
                })()
              ) : filtered.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: MUTED, fontSize: 13 }}>
                  {tab === 'pending' ? 'No pending bookings' : 'No bookings found'}
                </div>
              ) : (
                <AnimatePresence>
                  {filtered.map(b => (
                    <BookingItem
                      key={b.id}
                      booking={b}
                      selected={selected?.id === b.id}
                      onClick={() => setSelected(b)}
                    />
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Right: detail */}
          {tab === 'upcoming' ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: MUTED, fontSize: 13, textAlign: 'center', padding: 32 }}>
              <div>
                <Calendar size={28} style={{ color: BORDER, margin: '0 auto 12px' }} />
                <div style={{ fontWeight: 600, color: TER, marginBottom: 4 }}>Upcoming appointments from Cliniko</div>
                <div style={{ fontSize: 11 }}>Sync from Cliniko to refresh · Click Calendar to see month view</div>
              </div>
            </div>
          ) : (
            <DetailPanel
              booking={selected}
              practitioners={practitioners}
              onConfirm={(id) => setConfirmTarget(id)}
              onDismiss={handleDismiss}
            />
          )}
        </div>
      </div>
    </div>
  );
}
