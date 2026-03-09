'use client';

// =============================================================================
// Appointments v3 — Full-view refactor
// Layout: compact stats header + full-width list/detail split
// NEW: + New Appointment modal (comprehensive), table-style rows,
//      wider list panel, practitioner filter, intelligence alerts
// =============================================================================

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Phone, Mail, User, Calendar, Clock, Check, X,
  RefreshCw, AlertCircle, Search, CheckCircle2,
  ExternalLink, UserX, Activity, MessageSquare,
  Plus, ChevronDown, Zap, ArrowUpRight, TrendingUp,
  Pencil, Trash2,
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
  getAppointmentTypes,
  confirmPendingBooking,
  dismissPendingBooking,
  deleteAppointment,
  updateAppointment,
  getClinikoConnectionStatus,
  updateAppointmentStatus,
  createManualAppointment,
  type PendingBooking,
  type PractitionerRow,
  type AppointmentRow,
  type AppointmentTypeRow,
} from '@/lib/actions/appointments';
import OrbLoader from '@/components/orb-loader';

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
const RED    = '#DC2626';
const GOLD   = '#D8A600';
const ORANGE = '#EA580C';

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  booked:         { label: 'Booked',    color: ACCENT,  bg: `${ACCENT}14` },
  arrived:        { label: 'Arrived',   color: GREEN,   bg: `${GREEN}14`  },
  cancelled:      { label: 'Cancelled', color: MUTED,   bg: `${MUTED}18`  },
  did_not_arrive: { label: 'DNA',       color: RED,     bg: `${RED}12`    },
  pending:        { label: 'Pending',   color: GOLD,    bg: `${GOLD}12`   },
};

const SOURCE_LABELS: Record<string, string> = {
  walk_in:  'Walk-in',
  phone:    'Phone',
  online:   'Online',
  referral: 'Referral',
  manual:   'Staff',
  komal:    'Komal',
  cliniko:  'Cliniko',
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
// APPOINTMENT TABLE ROW
// =============================================================================

function ApptRow({
  appt, selected, onClick, isOverdue, dnaCount, onStatusChange, statusChangingId,
}: {
  appt: AppointmentRow;
  selected: boolean;
  onClick: () => void;
  isOverdue: boolean;
  dnaCount: number;
  onStatusChange: (id: string, s: 'arrived' | 'cancelled') => void;
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
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '0 20px',
        height: 58,
        cursor: 'pointer',
        borderBottom: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${selected ? ACCENT : isOverdue ? ORANGE : 'transparent'}`,
        background: selected ? `${ACCENT}08` : isOverdue ? `${ORANGE}04` : hovered ? `${ACCENT}04` : 'transparent',
        transition: 'all 0.1s',
        flexShrink: 0,
      }}
    >
      {/* Time + date */}
      <div style={{ width: 96, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {isOverdue && (
            <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1.4, repeat: Infinity }}
              style={{ width: 5, height: 5, borderRadius: 3, background: ORANGE, flexShrink: 0 }} />
          )}
          <span style={{ fontSize: 13, fontWeight: 800, color: isOverdue ? ORANGE : NAVY, fontVariantNumeric: 'tabular-nums' }}>
            {fmtTime(appt.starts_at)}
          </span>
        </div>
        <div style={{ fontSize: 10, color: TER, marginTop: 1 }}>{fmtDate(appt.starts_at)}</div>
      </div>

      {/* Patient */}
      <div style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {appt.patient_name}
          </span>
          {appt.is_new_lead && (
            <span style={{ fontSize: 8, fontWeight: 700, color: ACCENT, background: `${ACCENT}12`, border: `1px solid ${ACCENT}25`, padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
              NEW
            </span>
          )}
          {dnaCount >= 2 && (
            <span title={`${dnaCount} no-shows`} style={{ fontSize: 8, fontWeight: 700, color: RED, background: `${RED}10`, border: `1px solid ${RED}25`, padding: '1px 5px', borderRadius: 4, flexShrink: 0 }}>
              DNA×{dnaCount}
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: TER, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {appt.appointment_type}
        </div>
      </div>

      {/* Practitioner */}
      <div style={{ width: 130, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 7, height: 7, borderRadius: 4, background: appt.practitioner_color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: SEC, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {appt.practitioner_name.split(' ').slice(-1)[0]}
        </span>
      </div>

      {/* Duration */}
      <div style={{ width: 52, flexShrink: 0, fontSize: 11, color: MUTED, display: 'flex', alignItems: 'center', gap: 3 }}>
        <Clock size={10} />{appt.duration_minutes}m
      </div>

      {/* Status / hover actions */}
      <div style={{ width: 110, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
        <AnimatePresence mode="wait">
          {hovered && canAct && !isChanging ? (
            <motion.div key="actions" initial={{ opacity: 0, x: 4 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 4 }}
              style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
              <button onClick={e => { e.stopPropagation(); onStatusChange(appt.id, 'arrived'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700, border: `1px solid ${GREEN}40`, background: `${GREEN}10`, color: GREEN, cursor: 'pointer' }}>
                <Check size={9} />Arrived
              </button>
              <button onClick={e => { e.stopPropagation(); onStatusChange(appt.id, 'cancelled'); }}
                style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 7px', borderRadius: 5, fontSize: 10, fontWeight: 600, border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, cursor: 'pointer' }}>
                <X size={9} />
              </button>
            </motion.div>
          ) : isChanging ? (
            <motion.div key="spinning" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <RefreshCw size={12} style={{ color: ACCENT, animation: 'spin 0.8s linear infinite' }} />
            </motion.div>
          ) : (
            <motion.span key="badge" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ fontSize: 10, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '2px 9px', borderRadius: 20, border: `1px solid ${cfg.color}28` }}>
              {cfg.label}
            </motion.span>
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
  appt, dnaCount, visitCount, onClose, onStatusChange, statusChangingId, onEdit, onDelete,
}: {
  appt: AppointmentRow | null;
  dnaCount: number;
  visitCount: number;
  onClose: () => void;
  onStatusChange: (id: string, s: 'arrived' | 'cancelled') => void;
  statusChangingId: string | null;
  onEdit: (appt: AppointmentRow) => void;
  onDelete: (appt: AppointmentRow) => void;
}) {
  if (!appt) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: MUTED }}>
      <Calendar size={36} style={{ opacity: 0.15 }} />
      <p style={{ fontSize: 13, color: MUTED }}>Select an appointment to view details</p>
      <p style={{ fontSize: 11, color: MUTED, opacity: 0.6 }}>Hover a row to quickly mark arrived or cancel</p>
    </div>
  );

  const cfg = STATUS_CFG[appt.status] ?? STATUS_CFG.booked;
  const isToday = new Date(appt.starts_at).toDateString() === new Date().toDateString();
  const minsLate = Math.floor((Date.now() - new Date(appt.starts_at).getTime()) / 60000);
  const isOverdue = isToday && appt.status === 'booked' && minsLate > 15;
  const isChanging = statusChangingId === appt.id;
  const canAct = appt.status === 'booked' || appt.status === 'pending';

  return (
    <motion.div key={appt.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
      style={{ height: '100%', overflow: 'auto', padding: '28px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 24,
            background: `${appt.practitioner_color}18`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: appt.practitioner_color,
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
          <span style={{ fontSize: 11, fontWeight: 600, color: cfg.color, background: cfg.bg, padding: '4px 12px', borderRadius: 20, border: `1px solid ${cfg.color}30` }}>
            {cfg.label}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4 }}>
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Overdue alert */}
      {isOverdue && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: `${ORANGE}0e`, border: `1px solid ${ORANGE}40`, display: 'flex', alignItems: 'center', gap: 8 }}>
          <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.4, repeat: Infinity }}
            style={{ width: 7, height: 7, borderRadius: 4, background: ORANGE, flexShrink: 0 }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: ORANGE }}>{minsLate}min since scheduled — update status below</span>
        </motion.div>
      )}

      {/* Patient intelligence */}
      {appt.patient_db_id && (visitCount > 0 || dnaCount > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 18, padding: '10px 14px', borderRadius: 10, background: `${ACCENT}06`, border: `1px solid ${BORDER}` }}>
          {visitCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Activity size={11} style={{ color: ACCENT }} />
              <span style={{ fontSize: 11, color: SEC }}><strong style={{ color: NAVY, fontWeight: 700 }}>{visitCount}</strong> visits on record</span>
            </div>
          )}
          {dnaCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserX size={11} style={{ color: dnaCount >= 3 ? RED : dnaCount >= 2 ? ORANGE : MUTED }} />
              <span style={{ fontSize: 11, color: dnaCount >= 3 ? RED : dnaCount >= 2 ? ORANGE : SEC, fontWeight: dnaCount >= 2 ? 600 : 400 }}>
                {dnaCount} no-show{dnaCount > 1 ? 's' : ''}
                {dnaCount >= 3 ? ' — high risk' : dnaCount >= 2 ? ' — consider reminder call' : ''}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Date / Time */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18, padding: 16, background: `${ACCENT}05`, borderRadius: 12, border: `1px solid ${BORDER}` }}>
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
          <div style={{ fontSize: 12, color: SEC, lineHeight: 1.7, padding: '10px 14px', background: `${BORDER}50`, borderRadius: 8 }}>
            {appt.notes}
          </div>
        </div>
      )}

      {/* Status actions */}
      {canAct && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>
            Update Status {isChanging && <span style={{ color: ACCENT, marginLeft: 6, fontWeight: 400, textTransform: 'none', fontSize: 10 }}>Saving…</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={isChanging} onClick={() => onStatusChange(appt.id, 'arrived')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 0', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: isChanging ? 'not-allowed' : 'pointer', border: `1px solid ${GREEN}40`, background: `${GREEN}0e`, color: GREEN, opacity: isChanging ? 0.5 : 1 }}>
              <Check size={12} />Mark Arrived
            </button>
            <button disabled={isChanging} onClick={() => onStatusChange(appt.id, 'cancelled')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: isChanging ? 'not-allowed' : 'pointer', border: `1px solid ${BORDER}`, background: 'transparent', color: MUTED, opacity: isChanging ? 0.5 : 1 }}>
              <X size={12} />Cancel
            </button>
          </div>
        </div>
      )}

      {/* View patient + Edit/Delete actions */}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {appt.patient_db_id && (
          <Link href={`/staff/patients/${appt.patient_db_id}`}
            style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${ACCENT}35`, background: `${ACCENT}0c`, color: NAVY, textDecoration: 'none', fontWeight: 600, justifyContent: 'center' }}>
            <User size={13} />Patient Record<ArrowUpRight size={12} />
          </Link>
        )}
        <button onClick={() => onEdit(appt)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 14px', borderRadius: 8, fontSize: 12, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600 }}>
          <Pencil size={12} />Edit
        </button>
        <button onClick={() => onDelete(appt)}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '10px 14px', borderRadius: 8, fontSize: 12, border: `1px solid ${RED}30`, background: `${RED}08`, color: RED, cursor: 'pointer', fontWeight: 600 }}>
          <Trash2 size={12} />Delete
        </button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// DELETE CONFIRM MODAL
// =============================================================================

function DeleteConfirmModal({ appt, onConfirm, onClose, deleting }: {
  appt: AppointmentRow;
  onConfirm: () => void;
  onClose: () => void;
  deleting: boolean;
}) {
  const [input, setInput] = useState('');
  const confirmName = appt.patient_name.trim();
  const matches = input.trim().toLowerCase() === confirmName.toLowerCase();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(24,29,35,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        style={{ background: BG, borderRadius: 16, padding: 32, width: 440, maxWidth: '90vw', border: `1px solid ${RED}30`, boxShadow: '0 24px 64px rgba(24,29,35,0.16)' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: `${RED}10`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Trash2 size={18} style={{ color: RED }} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 4 }}>Delete Appointment</div>
            <div style={{ fontSize: 13, color: TER, lineHeight: 1.5 }}>
              This will remove the appointment from EWC and archive it in Cliniko. This cannot be undone.
            </div>
          </div>
        </div>

        <div style={{ padding: '12px 14px', borderRadius: 10, background: `${RED}06`, border: `1px solid ${RED}18`, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{appt.patient_name}</div>
          <div style={{ fontSize: 11, color: TER, marginTop: 2 }}>{appt.appointment_type} · {new Date(appt.starts_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} at {fmtTime(appt.starts_at)}</div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.18em' }}>
            Type <strong style={{ color: NAVY }}>{confirmName}</strong> to confirm
          </div>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={confirmName}
            autoFocus
            style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: `1px solid ${matches && input ? RED : BORDER}`, background: BG, fontSize: 13, color: NAVY, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} disabled={deleting}
            style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600 }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={!matches || deleting}
            style={{ flex: 2, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${RED}40`, background: `${RED}12`, color: RED, cursor: !matches || deleting ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: !matches || deleting ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {deleting ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {deleting ? 'Deleting…' : 'Delete Appointment'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// =============================================================================
// EDIT APPOINTMENT MODAL
// =============================================================================

function EditApptModal({ appt, practitioners, apptTypes, onClose, onSaved }: {
  appt: AppointmentRow;
  practitioners: PractitionerRow[];
  apptTypes: AppointmentTypeRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [typeName, setTypeName]   = useState(appt.appointment_type);
  const [typeId, setTypeId]       = useState('');
  const [date, setDate]           = useState(appt.starts_at.split('T')[0]);
  const [time, setTime]           = useState(new Date(appt.starts_at).toTimeString().slice(0, 5));
  const [duration, setDuration]   = useState(appt.duration_minutes);
  const [practId, setPractId]     = useState('');
  const [notes, setNotes]         = useState(appt.notes ?? '');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: `1px solid ${BORDER}`, background: BG, fontSize: 13,
    color: NAVY, outline: 'none', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, color: MUTED, fontWeight: 600, marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: '0.2em', display: 'block',
  };

  async function handleSave() {
    setSaving(true); setError('');
    const startsAt = new Date(`${date}T${time}:00`).toISOString();
    const endsAt   = new Date(new Date(startsAt).getTime() + duration * 60000).toISOString();
    const res = await updateAppointment(appt.id, {
      appointmentTypeName: typeName || undefined,
      startsAt, endsAt, durationMinutes: duration,
      notes: notes || undefined,
      practitionerClinikoId: practId || undefined,
    });
    setSaving(false);
    if (res.success) onSaved();
    else setError(res.error ?? 'Update failed');
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(24,29,35,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        style={{ background: BG, borderRadius: 20, padding: 32, width: 520, maxWidth: '90vw', border: `1px solid ${BORDER}`, boxShadow: '0 24px 64px rgba(24,29,35,0.14)' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 4 }}>Edit Appointment</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>{appt.patient_name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED }}><X size={17} /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={labelStyle}>Treatment Type</span>
            <div style={{ position: 'relative' }}>
              <select value={typeId} onChange={e => { setTypeId(e.target.value); const t = apptTypes.find(a => (a.cliniko_id ?? a.id) === e.target.value); if (t) { setTypeName(t.name); setDuration(t.duration_minutes); } }}
                style={{ ...inputStyle, appearance: 'none', paddingRight: 32 }}>
                <option value="">{typeName} (current)</option>
                {apptTypes.map(t => <option key={t.cliniko_id ?? t.id} value={t.cliniko_id ?? t.id}>{t.name}</option>)}
              </select>
              <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED, pointerEvents: 'none' }} />
            </div>
          </div>
          <div>
            <span style={labelStyle}>Date</span>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>Time</span>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} step={900} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>Duration (min)</span>
            <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={5} max={480} step={5} style={inputStyle} />
          </div>
          <div>
            <span style={labelStyle}>Practitioner</span>
            <div style={{ position: 'relative' }}>
              <select value={practId} onChange={e => setPractId(e.target.value)} style={{ ...inputStyle, appearance: 'none', paddingRight: 32 }}>
                <option value="">{appt.practitioner_name} (current)</option>
                {practitioners.map(p => <option key={p.cliniko_id} value={p.cliniko_id}>{p.name}</option>)}
              </select>
              <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED, pointerEvents: 'none' }} />
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <span style={labelStyle}>Notes</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 14, padding: '9px 12px', borderRadius: 8, background: `${RED}08`, border: `1px solid ${RED}25`, color: RED, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={12} />{error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 2, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Check size={13} />}
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </motion.div>
    </div>
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
      borderLeft: `3px solid ${selected ? ACCENT : 'transparent'}`,
      background: selected ? `${ACCENT}08` : 'transparent',
      transition: 'all 0.1s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{booking.patient_name}</span>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 700, color: ACCENT, background: `${ACCENT}10`, border: `1px solid ${ACCENT}25`, padding: '1px 6px', borderRadius: 4 }}>KOMAL</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: GOLD, background: `${GOLD}12`, padding: '2px 8px', borderRadius: 20, border: `1px solid ${GOLD}30` }}>Pending</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: SEC, marginBottom: 3 }}>{booking.treatment_interest ?? 'No treatment specified'}</div>
      <div style={{ display: 'flex', gap: 10, fontSize: 10, color: MUTED, alignItems: 'center' }}>
        {booking.preferred_date && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Calendar size={9} />{booking.preferred_date}</span>}
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
  if (!booking) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: MUTED }}>
      <MessageSquare size={36} style={{ opacity: 0.15 }} />
      <p style={{ fontSize: 13, color: MUTED }}>Select a request to review</p>
      <p style={{ fontSize: 11, color: MUTED, opacity: 0.6 }}>Booking requests captured by Komal</p>
    </div>
  );

  return (
    <motion.div key={booking.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }}
      style={{ height: '100%', overflow: 'auto', padding: '28px 32px' }}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div style={{ width: 48, height: 48, borderRadius: 24, background: `${ACCENT}14`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: ACCENT }}>
          {inits(booking.patient_name)}
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, color: NAVY }}>{booking.patient_name}</div>
          <div style={{ fontSize: 12, color: TER, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Received {relTime(booking.created_at)}</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: ACCENT, background: `${ACCENT}10`, border: `1px solid ${ACCENT}25`, padding: '1px 6px', borderRadius: 4 }}>VIA KOMAL</span>
          </div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: GOLD, background: `${GOLD}12`, padding: '4px 12px', borderRadius: 20, border: `1px solid ${GOLD}30` }}>Pending</span>
      </div>

      {booking.treatment_interest && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Treatment Interest</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{booking.treatment_interest}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16, padding: 14, background: `${ACCENT}06`, borderRadius: 10, border: `1px solid ${BORDER}` }}>
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

      {booking.referral_source && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>How They Found Us</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Zap size={12} style={{ color: ACCENT }} />
            <span style={{ fontSize: 13, color: SEC, fontWeight: 500 }}>
              {SOURCE_LABELS[booking.referral_source] ?? booking.referral_source}
            </span>
          </div>
        </div>
      )}

      {booking.notes && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 8 }}>Komal Call Notes</div>
          <div style={{ fontSize: 12, color: SEC, lineHeight: 1.7, padding: '10px 14px', background: `${BORDER}50`, borderRadius: 8, borderLeft: `3px solid ${ACCENT}30` }}>
            {booking.notes}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => onDismiss(booking.id, booking.booking_request_id)}
          style={{ flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <X size={13} />Dismiss
        </button>
        <button onClick={() => onConfirm(booking.id)}
          style={{ flex: 2, padding: '10px 0', borderRadius: 8, fontSize: 13, border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Check size={13} />Confirm Booking
        </button>
      </div>
    </motion.div>
  );
}

// =============================================================================
// CONFIRM DIALOG (for pending booking confirmation)
// =============================================================================

function ConfirmDialog({ booking, practitioners, onConfirm, onClose, saving }: {
  booking: PendingBooking;
  practitioners: PractitionerRow[];
  onConfirm: (p: { confirmedDate: string; confirmedTime: string; practitionerClinikoId?: string }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const today = new Date().toISOString().split('T')[0];
  const [date, setDate]       = useState(booking.preferred_date ?? today);
  const [time, setTime]       = useState(booking.preferred_time ?? '09:00');
  const [practId, setPractId] = useState('');

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: `1px solid ${BORDER}`, background: BG, fontSize: 13,
    color: NAVY, outline: 'none', boxSizing: 'border-box',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(24,29,35,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }}
        style={{ background: BG, borderRadius: 16, padding: 32, width: 500, maxWidth: '90vw', border: `1px solid ${BORDER}`, boxShadow: '0 24px 64px rgba(24,29,35,0.14)' }}>

        <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 6 }}>Confirm Appointment</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 20 }}>
          {booking.patient_name} — {booking.treatment_interest ?? 'Appointment'}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          {[
            { label: 'Date', type: 'date', value: date, set: setDate },
            { label: 'Time', type: 'time', value: time, set: setTime },
          ].map(f => (
            <div key={f.label}>
              <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.2em' }}>{f.label}</div>
              <input type={f.type} value={f.value} onChange={e => f.set(e.target.value)} style={inputStyle} />
            </div>
          ))}
        </div>

        {practitioners.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.2em' }}>Practitioner</div>
            <select value={practId} onChange={e => setPractId(e.target.value)} style={inputStyle}>
              <option value="">{booking.preferred_practitioner ? `${booking.preferred_practitioner} (requested)` : 'Any available'}</option>
              {practitioners.map(p => <option key={p.cliniko_id} value={p.cliniko_id}>{p.name}</option>)}
            </select>
          </div>
        )}

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
// NEW APPOINTMENT MODAL
// =============================================================================

const SOURCES = ['walk_in', 'phone', 'online', 'referral'] as const;

function NewApptModal({ practitioners, apptTypes, onClose, onSaved }: {
  practitioners: PractitionerRow[];
  apptTypes: AppointmentTypeRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().split('T')[0];

  const [patientType, setPatientType] = useState<'existing' | 'new'>('existing');
  const [existingName, setExistingName] = useState('');
  const [existingPhone, setExistingPhone] = useState('');
  const [newFirst, setNewFirst]   = useState('');
  const [newLast, setNewLast]     = useState('');
  const [newPhone, setNewPhone]   = useState('');
  const [newEmail, setNewEmail]   = useState('');
  const [typeId, setTypeId]       = useState(apptTypes[0]?.cliniko_id ?? '');
  const [typeName, setTypeName]   = useState(apptTypes[0]?.name ?? '');
  const [duration, setDuration]   = useState(apptTypes[0]?.duration_minutes ?? 30);
  const [date, setDate]           = useState(today);
  const [time, setTime]           = useState('09:00');
  const [practId, setPractId]     = useState(practitioners[0]?.cliniko_id ?? '');
  const [practName, setPractName] = useState(practitioners[0]?.name ?? '');
  const [source, setSource]       = useState<typeof SOURCES[number]>('walk_in');
  const [referralDetail, setReferralDetail] = useState('');
  const [notes, setNotes]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  function handleTypeChange(cid: string) {
    setTypeId(cid);
    const t = apptTypes.find(a => a.cliniko_id === cid);
    if (t) { setTypeName(t.name); setDuration(t.duration_minutes); }
  }
  function handlePractChange(cid: string) {
    setPractId(cid);
    const p = practitioners.find(pr => pr.cliniko_id === cid);
    if (p) setPractName(p.name);
  }

  async function handleSave() {
    const name = patientType === 'existing' ? existingName.trim() : `${newFirst} ${newLast}`.trim();
    if (!name) { setError('Patient name is required.'); return; }
    if (!date)  { setError('Date is required.'); return; }
    if (!typeName) { setError('Treatment type is required.'); return; }
    setError('');
    setSaving(true);
    const res = await createManualAppointment({
      patientType,
      existingPatientName:   patientType === 'existing' ? existingName : undefined,
      newFirstName:          patientType === 'new' ? newFirst : undefined,
      newLastName:           patientType === 'new' ? newLast  : undefined,
      newPhone:              patientType === 'new' ? newPhone  : undefined,
      newEmail:              patientType === 'new' ? newEmail  : undefined,
      appointmentTypeName:   typeName,
      appointmentTypeClinikoId: typeId || undefined,
      durationMinutes:       duration,
      date,
      time,
      practitionerName:      practName,
      practitionerClinikoId: practId || undefined,
      notes:                 notes || undefined,
      source,
      referralDetail:        source === 'referral' ? referralDetail : undefined,
    });
    setSaving(false);
    if (res.success) { onSaved(); }
    else { setError(res.error ?? 'Failed to create appointment.'); }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 8,
    border: `1px solid ${BORDER}`, background: BG, fontSize: 13,
    color: NAVY, outline: 'none', boxSizing: 'border-box',
  };
  const label: React.CSSProperties = {
    fontSize: 10, color: MUTED, fontWeight: 600, marginBottom: 6,
    textTransform: 'uppercase', letterSpacing: '0.2em', display: 'block',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(24,29,35,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto', padding: 24 }}>
      <motion.div initial={{ opacity: 0, scale: 0.97, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
        style={{ background: BG, borderRadius: 20, padding: 36, width: 660, maxWidth: '100%', border: `1px solid ${BORDER}`, boxShadow: '0 24px 80px rgba(24,29,35,0.16)', position: 'relative' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 4 }}>New Appointment</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, letterSpacing: '-0.02em' }}>Log an Appointment</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 4 }}><X size={18} /></button>
        </div>

        {/* ── SECTION 1: Patient ── */}
        <div style={{ marginBottom: 24, padding: 20, borderRadius: 12, border: `1px solid ${BORDER}`, background: `${ACCENT}03` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={13} style={{ color: ACCENT }} />Patient
          </div>

          {/* Toggle */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            {(['existing', 'new'] as const).map(t => (
              <button key={t} onClick={() => setPatientType(t)}
                style={{ padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${patientType === t ? ACCENT : BORDER}`, background: patientType === t ? `${ACCENT}14` : 'transparent', color: patientType === t ? NAVY : MUTED }}>
                {t === 'existing' ? 'Existing patient' : 'New patient'}
              </button>
            ))}
          </div>

          {patientType === 'existing' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <span style={label}>Patient Name</span>
                <input value={existingName} onChange={e => setExistingName(e.target.value)} placeholder="Full name" style={inputStyle} />
              </div>
              <div>
                <span style={label}>Phone (optional)</span>
                <input value={existingPhone} onChange={e => setExistingPhone(e.target.value)} placeholder="+44 7700 900000" style={inputStyle} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <span style={label}>First Name</span>
                <input value={newFirst} onChange={e => setNewFirst(e.target.value)} placeholder="First" style={inputStyle} />
              </div>
              <div>
                <span style={label}>Last Name</span>
                <input value={newLast} onChange={e => setNewLast(e.target.value)} placeholder="Last" style={inputStyle} />
              </div>
              <div>
                <span style={label}>Phone</span>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="+44 7700 900000" style={inputStyle} />
              </div>
              <div>
                <span style={label}>Email</span>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="patient@example.com" style={inputStyle} />
              </div>
            </div>
          )}
        </div>

        {/* ── SECTION 2: Appointment ── */}
        <div style={{ marginBottom: 24, padding: 20, borderRadius: 12, border: `1px solid ${BORDER}`, background: `${ACCENT}03` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Calendar size={13} style={{ color: ACCENT }} />Appointment Details
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={label}>Treatment Type</span>
              <div style={{ position: 'relative' }}>
                <select value={typeId} onChange={e => handleTypeChange(e.target.value)} style={{ ...inputStyle, appearance: 'none', paddingRight: 32 }}>
                  {apptTypes.length === 0 && <option value="">No types loaded</option>}
                  {apptTypes.map(t => <option key={t.cliniko_id ?? t.id} value={t.cliniko_id ?? t.id}>{t.name}{t.category ? ` · ${t.category}` : ''}</option>)}
                </select>
                <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED, pointerEvents: 'none' }} />
              </div>
            </div>
            <div>
              <span style={label}>Date</span>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} min={today} style={inputStyle} />
            </div>
            <div>
              <span style={label}>Time</span>
              <input type="time" value={time} onChange={e => setTime(e.target.value)} step={900} style={inputStyle} />
            </div>
            <div>
              <span style={label}>Duration (minutes)</span>
              <input type="number" value={duration} onChange={e => setDuration(Number(e.target.value))} min={5} max={480} step={5} style={inputStyle} />
            </div>
            <div>
              <span style={label}>Practitioner</span>
              <div style={{ position: 'relative' }}>
                <select value={practId} onChange={e => handlePractChange(e.target.value)} style={{ ...inputStyle, appearance: 'none', paddingRight: 32 }}>
                  <option value="">Select practitioner</option>
                  {practitioners.map(p => <option key={p.cliniko_id} value={p.cliniko_id}>{p.name}</option>)}
                </select>
                <ChevronDown size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED, pointerEvents: 'none' }} />
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION 3: Details ── */}
        <div style={{ marginBottom: 24, padding: 20, borderRadius: 12, border: `1px solid ${BORDER}`, background: `${ACCENT}03` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: NAVY, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Zap size={13} style={{ color: ACCENT }} />Additional Details
          </div>

          <div style={{ marginBottom: 12 }}>
            <span style={label}>Source</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SOURCES.map(s => (
                <button key={s} onClick={() => setSource(s)}
                  style={{ padding: '5px 14px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${source === s ? ACCENT : BORDER}`, background: source === s ? `${ACCENT}14` : 'transparent', color: source === s ? NAVY : MUTED }}>
                  {SOURCE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {source === 'referral' && (
            <div style={{ marginBottom: 12 }}>
              <span style={label}>Referred by</span>
              <input value={referralDetail} onChange={e => setReferralDetail(e.target.value)} placeholder="e.g. Dr Smith / patient name" style={inputStyle} />
            </div>
          )}

          <div>
            <span style={label}>Notes / Special Requirements</span>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Allergies, contraindications, special requirements…"
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, background: `${RED}08`, border: `1px solid ${RED}25`, color: RED, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertCircle size={13} />{error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} disabled={saving}
            style={{ flex: 1, padding: '11px 0', borderRadius: 9, fontSize: 13, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600 }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ flex: 3, padding: '11px 0', borderRadius: 9, fontSize: 13, border: `1px solid ${ACCENT}40`, background: `${ACCENT}18`, color: NAVY, cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, opacity: saving ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {saving ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
            {saving ? 'Booking…' : 'Book Appointment'}
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
  const [apptTypes, setApptTypes]       = useState<AppointmentTypeRow[]>([]);
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
  const [showNewAppt, setShowNewAppt]   = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AppointmentRow | null>(null);
  const [deleting, setDeleting]         = useState(false);
  const [editTarget, setEditTarget]     = useState<AppointmentRow | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Intelligence ──────────────────────────────────────────────────────────

  const dnaMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    [...past, ...upcoming].forEach(a => {
      if (a.status === 'did_not_arrive' && a.patient_db_id)
        map[a.patient_db_id] = (map[a.patient_db_id] || 0) + 1;
    });
    return map;
  }, [past, upcoming]);

  const visitMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    [...past, ...upcoming].forEach(a => {
      if (a.patient_db_id) map[a.patient_db_id] = (map[a.patient_db_id] || 0) + 1;
    });
    return map;
  }, [past, upcoming]);

  const overdueIds = useMemo(() => {
    const threshold = Date.now() - 15 * 60 * 1000;
    return new Set(todayAppts.filter(a => a.status === 'booked' && new Date(a.starts_at).getTime() < threshold).map(a => a.id));
  }, [todayAppts]);

  const dnaRate = useMemo(() =>
    past.length === 0 ? 0 : Math.round((past.filter(a => a.status === 'did_not_arrive').length / past.length) * 100),
  [past]);

  const highDnaToday = useMemo(() =>
    todayAppts.filter(a => a.patient_db_id && (dnaMap[a.patient_db_id] ?? 0) >= 2).length,
  [todayAppts, dnaMap]);

  // ── Data load ─────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    const now      = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();

    const [statsS, upS, pastS, pendS, practS, statusS, typesS] = await Promise.allSettled([
      getAppointmentStats(),
      getUpcomingAppointments(60),
      getPastAppointments(30),
      getPendingBookings(),
      getPractitioners(),
      getClinikoConnectionStatus(),
      getAppointmentTypes(),
    ]);

    const statsRes  = statsS.status  === 'fulfilled' ? statsS.value  : { total: 0, today: 0, thisWeek: 0, thisMonth: 0, upcoming: 0 };
    const upRes     = upS.status     === 'fulfilled' ? upS.value     : { appointments: [], total: 0, hasReal: false };
    const pastRes   = pastS.status   === 'fulfilled' ? pastS.value   : { appointments: [], total: 0 };
    const pendRes   = pendS.status   === 'fulfilled' ? pendS.value   : { bookings: [], isDemo: false };
    const practRes  = practS.status  === 'fulfilled' ? practS.value  : [];
    const statusRes = statusS.status === 'fulfilled' ? statusS.value : { connected: false, lastSync: null, totalSynced: 0 };
    const typesRes  = typesS.status  === 'fulfilled' ? typesS.value  : [];

    setClinikoStatus(statusRes);
    setStats(statsRes);
    setUpcoming(upRes.appointments);
    setPast(pastRes.appointments);
    setPending(pendRes.bookings);
    setPractitioners(practRes);
    setApptTypes(typesRes);
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

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleStatusChange = useCallback(async (id: string, newStatus: 'arrived' | 'cancelled') => {
    setStatusChangingId(id);
    try {
      const res = await updateAppointmentStatus(id, newStatus);
      if (res.success) {
        const cfg = STATUS_CFG[newStatus];
        showToast(`Marked as ${cfg?.label ?? newStatus}`);
        const updater = (list: AppointmentRow[]) => list.map(a => a.id === id ? { ...a, status: newStatus } : a);
        setTodayAppts(updater); setUpcoming(updater); setPast(updater);
        setSelectedAppt(prev => prev?.id === id ? { ...prev, status: newStatus } : prev);
      } else { showToast('Status update failed', false); }
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

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteAppointment(deleteTarget.id);
      if (res.success) {
        showToast('Appointment deleted');
        setDeleteTarget(null);
        setSelectedAppt(null);
        await loadData();
      } else {
        showToast(res.error ?? 'Delete failed', false);
      }
    } catch (err) { showToast(String(err), false); }
    finally { setDeleting(false); }
  }

  // Window focus → refresh data
  useEffect(() => {
    const onFocus = () => { loadData(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadData]);

  // 30-second background poll (quiet — no loading spinner)
  useEffect(() => {
    intervalRef.current = setInterval(() => loadData(), 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [loadData]);

  // ── Filters ───────────────────────────────────────────────────────────────

  const filterAppts = useCallback((list: AppointmentRow[]) => {
    const result = filterPract ? list.filter(a => a.practitioner_name === filterPract) : list;
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

  const currentList    = tab === 'today' ? filterAppts(todayAppts) : tab === 'upcoming' ? filterAppts(upcoming) : tab === 'past' ? filterAppts(past) : filterPending(pendingBookings);
  const pendingCount   = pendingBookings.length;
  const overdueCount   = overdueIds.size;
  const confirmBooking = pendingBookings.find(b => b.id === confirmTarget) ?? null;

  const practsInView = useMemo(() => {
    const seen = new Set<string>(); const list: PractitionerRow[] = [];
    practitioners.forEach(p => { if (!seen.has(p.name)) { seen.add(p.name); list.push(p); } });
    return list;
  }, [practitioners]);

  const TABS: { key: Tab; label: string; count?: number }[] = [
    { key: 'today',    label: 'Today',    count: stats.today     },
    { key: 'upcoming', label: 'Upcoming', count: stats.upcoming  },
    { key: 'past',     label: 'Past 30d'                         },
    { key: 'requests', label: 'Requests', count: pendingCount || undefined },
  ];

  if (!profile) return <OrbLoader />;

  return (
    <div style={{ minHeight: '100vh', background: BG, paddingLeft: 'var(--nav-w,240px)' }}>
      <StaffNav profile={profile} userId={userId} brandColor={ACCENT} currentPath="Appointments" />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            style={{ position: 'fixed', top: 20, right: 20, zIndex: 100, background: toast.ok ? '#ECFDF5' : '#FFF1F2', border: `1px solid ${toast.ok ? '#A7F3D0' : '#FECDD3'}`, color: toast.ok ? GREEN : RED, padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}{toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirm pending booking */}
      <AnimatePresence>
        {confirmTarget && confirmBooking && (
          <ConfirmDialog booking={confirmBooking} practitioners={practitioners} onConfirm={handleConfirm} onClose={() => setConfirmTarget(null)} saving={saving} />
        )}
      </AnimatePresence>

      {/* New Appointment Modal */}
      <AnimatePresence>
        {showNewAppt && (
          <NewApptModal
            practitioners={practitioners}
            apptTypes={apptTypes}
            onClose={() => setShowNewAppt(false)}
            onSaved={async () => { setShowNewAppt(false); showToast('Appointment booked'); await loadData(); }}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirm Modal */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteConfirmModal
            appt={deleteTarget}
            onConfirm={handleDeleteConfirm}
            onClose={() => setDeleteTarget(null)}
            deleting={deleting}
          />
        )}
      </AnimatePresence>

      {/* Edit Appointment Modal */}
      <AnimatePresence>
        {editTarget && (
          <EditApptModal
            appt={editTarget}
            practitioners={practitioners}
            apptTypes={apptTypes}
            onClose={() => setEditTarget(null)}
            onSaved={async () => { setEditTarget(null); showToast('Appointment updated'); await loadData(); }}
          />
        )}
      </AnimatePresence>

      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {/* ── HEADER ── */}
        <div style={{ padding: '28px 32px 0', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.28em', fontWeight: 600, color: MUTED, marginBottom: 6 }}>Edgbaston Wellness Clinic</div>
              <h1 style={{ fontSize: 34, fontWeight: 900, letterSpacing: '-0.035em', color: NAVY, margin: 0, lineHeight: 1 }}>Appointments</h1>
              <p style={{ fontSize: 13, color: TER, marginTop: 5, marginBottom: 0 }}>
                {stats.total.toLocaleString()} appointments synced
                {clinikoStatus?.lastSync && ` · last sync ${relTime(clinikoStatus.lastSync)}`}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {clinikoStatus && !clinikoStatus.connected && (
                <Link href="/staff/integrations" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, background: `${RED}08`, border: `1px solid ${RED}25`, color: RED, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>
                  <AlertCircle size={11} />Cliniko not connected
                </Link>
              )}
              {pendingCount > 0 && (
                <button onClick={() => setTab('requests')} style={{ padding: '6px 14px', borderRadius: 20, background: `${GOLD}12`, border: `1px solid ${GOLD}30`, color: GOLD, fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <AlertCircle size={12} />{pendingCount} pending from Komal
                </button>
              )}
              <button onClick={loadData} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, cursor: 'pointer', fontWeight: 600 }}>
                <RefreshCw size={12} />Refresh
              </button>
              <Link href={`/staff/calendar?userId=${userId}`}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, fontSize: 12, border: `1px solid ${BORDER}`, background: 'transparent', color: SEC, textDecoration: 'none', fontWeight: 600 }}>
                <Calendar size={12} />Calendar<ExternalLink size={10} />
              </Link>
              <button onClick={() => setShowNewAppt(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 9, fontSize: 13, border: `1px solid ${ACCENT}40`, background: `${ACCENT}16`, color: NAVY, cursor: 'pointer', fontWeight: 700 }}>
                <Plus size={14} />New Appointment
              </button>
            </div>
          </div>

          {/* Compact stats row */}
          <div style={{ display: 'flex', gap: 0, borderTop: `1px solid ${BORDER}` }}>
            {[
              { label: 'Total', value: stats.total.toLocaleString(), icon: <TrendingUp size={11} />, color: NAVY },
              { label: 'Today', value: stats.today, icon: <Calendar size={11} />, color: stats.today > 0 ? ACCENT : NAVY },
              { label: 'This Week', value: stats.thisWeek, icon: <Activity size={11} />, color: NAVY },
              { label: 'This Month', value: stats.thisMonth, icon: <Clock size={11} />, color: NAVY },
              { label: 'Upcoming', value: stats.upcoming, icon: <ChevronDown size={11} />, color: NAVY },
              { label: 'DNA Rate 30d', value: `${dnaRate}%`, icon: <UserX size={11} />, color: dnaRate > 15 ? RED : dnaRate > 8 ? ORANGE : GREEN },
            ].map((s, i) => (
              <div key={s.label} style={{ flex: 1, padding: '10px 16px', borderLeft: i > 0 ? `1px solid ${BORDER}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                  <span style={{ color: s.color, opacity: 0.6 }}>{s.icon}</span>
                  <span style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.24em', fontWeight: 600, color: MUTED }}>{s.label}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Intelligence alerts */}
        <AnimatePresence>
          {!loading && (overdueCount > 0 || highDnaToday > 0 || pendingCount > 0) && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              style={{ display: 'flex', gap: 8, padding: '8px 32px', borderBottom: `1px solid ${BORDER}`, background: BG, flexWrap: 'wrap', flexShrink: 0 }}>
              {overdueCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 12px', borderRadius: 20, background: `${ORANGE}0e`, border: `1px solid ${ORANGE}35`, color: ORANGE, fontSize: 11, fontWeight: 600 }}>
                  <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1.4, repeat: Infinity }} style={{ width: 6, height: 6, borderRadius: 3, background: ORANGE }} />
                  {overdueCount} appointment{overdueCount > 1 ? 's' : ''} may need status update
                </div>
              )}
              {highDnaToday > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 12px', borderRadius: 20, background: `${RED}08`, border: `1px solid ${RED}25`, color: RED, fontSize: 11, fontWeight: 600 }}>
                  <UserX size={11} />{highDnaToday} high DNA-risk patient{highDnaToday > 1 ? 's' : ''} today
                </div>
              )}
              {pendingCount > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 12px', borderRadius: 20, background: `${GOLD}0e`, border: `1px solid ${GOLD}30`, color: GOLD, fontSize: 11, fontWeight: 600 }}>
                  <MessageSquare size={11} />{pendingCount} Komal booking{pendingCount > 1 ? 's' : ''} awaiting confirmation
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── BODY: TABS + SPLIT ── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

          {/* ─ Left: List panel ─ */}
          <div style={{ width: '52%', minWidth: 400, borderRight: `1px solid ${BORDER}`, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Tabs + search */}
            <div style={{ padding: '12px 20px 8px', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 3, marginBottom: 10, alignItems: 'center' }}>
                {TABS.map(({ key, label, count }) => (
                  <button key={key} onClick={() => { setTab(key); setSelectedAppt(null); setSelectedP(null); setSearch(''); setFilterPract(null); }}
                    style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer', background: tab === key ? `${ACCENT}18` : 'transparent', color: tab === key ? NAVY : MUTED, border: tab === key ? `1px solid ${ACCENT}40` : '1px solid transparent' }}>
                    {label}{count !== undefined && count > 0 ? ` (${count})` : ''}
                  </button>
                ))}
                <div style={{ flex: 1 }} />
                {tab === 'requests' && pendingCount > 0 && (
                  <span style={{ fontSize: 10, color: GOLD, fontWeight: 600 }}>{pendingCount} awaiting</span>
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: MUTED }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search patient, treatment, practitioner…"
                  style={{ width: '100%', padding: '7px 10px 7px 28px', borderRadius: 8, border: `1px solid ${BORDER}`, background: 'transparent', fontSize: 12, color: NAVY, outline: 'none', boxSizing: 'border-box' }} />
              </div>
            </div>

            {/* Practitioner filter */}
            {tab !== 'requests' && practsInView.length > 1 && (
              <div style={{ padding: '7px 20px', borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
                <button onClick={() => setFilterPract(null)}
                  style={{ padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: 'pointer', border: `1px solid ${filterPract === null ? ACCENT : BORDER}`, background: filterPract === null ? `${ACCENT}14` : 'transparent', color: filterPract === null ? ACCENT : MUTED }}>All</button>
                {practsInView.map(p => (
                  <button key={p.name} onClick={() => setFilterPract(p.name === filterPract ? null : p.name)}
                    style={{ padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, border: `1px solid ${filterPract === p.name ? p.color : BORDER}`, background: filterPract === p.name ? `${p.color}14` : 'transparent', color: filterPract === p.name ? p.color : MUTED }}>
                    <span style={{ width: 5, height: 5, borderRadius: 3, background: p.color, display: 'inline-block' }} />
                    {p.name.split(' ').slice(-1)[0]}
                  </button>
                ))}
              </div>
            )}

            {/* Column headers (appointment tabs only) */}
            {tab !== 'requests' && (
              <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', height: 30, borderBottom: `1px solid ${BORDER}`, flexShrink: 0, background: `${BORDER}30` }}>
                <div style={{ width: 96, flexShrink: 0, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, fontWeight: 600 }}>Time</div>
                <div style={{ flex: 1, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, fontWeight: 600 }}>Patient / Treatment</div>
                <div style={{ width: 130, flexShrink: 0, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, fontWeight: 600 }}>Practitioner</div>
                <div style={{ width: 52, flexShrink: 0, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, fontWeight: 600 }}>Dur.</div>
                <div style={{ width: 110, flexShrink: 0, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: MUTED, fontWeight: 600, textAlign: 'right' }}>Status</div>
              </div>
            )}

            {/* List */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading ? (
                <div style={{ padding: 40, textAlign: 'center', color: MUTED, fontSize: 13 }}>
                  <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block', opacity: 0.4 }} />
                  Loading appointments…
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
                      Clear filter
                    </button>
                  )}
                </div>
              ) : tab === 'requests' ? (
                (currentList as PendingBooking[]).map(b => (
                  <PendingRow key={b.id} booking={b} selected={selectedPending?.id === b.id}
                    onClick={() => { setSelectedP(b); setSelectedAppt(null); }} />
                ))
              ) : (
                (currentList as AppointmentRow[]).map(a => (
                  <ApptRow
                    key={a.id}
                    appt={a}
                    selected={selectedAppt?.id === a.id}
                    isOverdue={overdueIds.has(a.id)}
                    dnaCount={a.patient_db_id ? (dnaMap[a.patient_db_id] ?? 0) : 0}
                    statusChangingId={statusChangingId}
                    onClick={() => { setSelectedAppt(a); setSelectedP(null); }}
                    onStatusChange={handleStatusChange}
                  />
                ))
              )}
            </div>
          </div>

          {/* ─ Right: Detail panel ─ */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <AnimatePresence mode="wait">
              {tab === 'requests' ? (
                <PendingDetail
                  key={selectedPending?.id ?? 'empty-pending'}
                  booking={selectedPending}
                  onConfirm={id => setConfirmTarget(id)}
                  onDismiss={handleDismiss}
                />
              ) : (
                <ApptDetail
                  key={selectedAppt?.id ?? 'empty-appt'}
                  appt={selectedAppt}
                  dnaCount={selectedAppt?.patient_db_id ? (dnaMap[selectedAppt.patient_db_id] ?? 0) : 0}
                  visitCount={selectedAppt?.patient_db_id ? (visitMap[selectedAppt.patient_db_id] ?? 0) : 0}
                  onClose={() => setSelectedAppt(null)}
                  onStatusChange={handleStatusChange}
                  statusChangingId={statusChangingId}
                  onEdit={a => setEditTarget(a)}
                  onDelete={a => setDeleteTarget(a)}
                />
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
  );
}
