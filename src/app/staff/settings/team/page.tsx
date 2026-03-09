'use client';

// =============================================================================
// /staff/settings/team — Team Access
// Light EWC design system. Admin-only. List, create, edit, suspend, reset.
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, Plus, Search, MoreVertical, ShieldCheck, Shield,
  UserX, UserCheck, KeyRound, Pencil, X, Check, Loader2,
  ChevronDown, Eye,
} from 'lucide-react';
import {
  listUsers, listRoles, createUser, updateUser,
  setUserStatus, resetUserPassword,
  type UserRow, type RoleRow,
} from '@/lib/actions/users';
import {
  getStaffProfile, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';

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

// =============================================================================
// ROLE CONFIG
// =============================================================================

const ROLE_CONFIG: Record<string, { bg: string; border: string; text: string }> = {
  admin:        { bg: 'rgba(220,38,38,0.07)',  border: 'rgba(220,38,38,0.20)',  text: '#DC2626' },
  manager:      { bg: 'rgba(124,58,237,0.07)', border: 'rgba(124,58,237,0.20)', text: '#7C3AED' },
  practitioner: { bg: 'rgba(0,88,230,0.07)',   border: 'rgba(0,88,230,0.20)',   text: '#0058E6' },
  receptionist: { bg: 'rgba(0,166,147,0.07)',  border: 'rgba(0,166,147,0.20)',  text: '#00A693' },
  viewer:       { bg: 'rgba(90,100,117,0.07)', border: 'rgba(90,100,117,0.20)', text: '#5A6475' },
};

const STATUS_LABEL: Record<string, string> = {
  active:      'Active',
  invited:     'Invited',
  suspended:   'Suspended',
  deactivated: 'Deactivated',
};

function roleConfig(slug: string) {
  return ROLE_CONFIG[slug] ?? { bg: 'rgba(90,100,117,0.07)', border: 'rgba(90,100,117,0.20)', text: '#5A6475' };
}

function initials(u: UserRow) {
  return `${u.first_name.charAt(0)}${u.last_name.charAt(0)}`.toUpperCase();
}

function timeSince(ts: string | null): string {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// =============================================================================
// INPUT COMPONENT
// =============================================================================

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.14em] font-medium mb-1.5"
        style={{ color: MUT }}>{label}
        {hint && <span className="ml-1 normal-case font-normal" style={{ color: BORDER }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value, onChange, placeholder, type = 'text', autoFocus, required, className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoFocus?: boolean;
  required?: boolean;
  className?: string;
}) {
  return (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)}
      placeholder={placeholder} autoFocus={autoFocus} required={required}
      className={`w-full h-[38px] rounded-lg border px-3 text-[13px] bg-transparent outline-none transition-colors ${className ?? ''}`}
      style={{ borderColor: BORDER, color: NAVY }}
      onFocus={e => (e.target.style.borderColor = '#A8C4FF')}
      onBlur={e  => (e.target.style.borderColor = BORDER)}
    />
  );
}

// =============================================================================
// CREATE / EDIT USER MODAL
// =============================================================================

function UserModal({
  user, roles, onClose, onSaved,
}: {
  user: UserRow | null;
  roles: RoleRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;

  const [firstName, setFirstName] = useState(user?.first_name ?? '');
  const [lastName,  setLastName]  = useState(user?.last_name  ?? '');
  const [email,     setEmail]     = useState(user?.email      ?? '');
  const [jobTitle,  setJobTitle]  = useState(user?.job_title  ?? '');
  const [roleId,    setRoleId]    = useState(user?.role?.id   ?? roles[0]?.id ?? '');
  const [isAdmin,   setIsAdmin]   = useState(user?.is_admin   ?? false);
  const [tempPw,    setTempPw]    = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const selectedRole = roles.find(r => r.id === roleId);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (isEdit) {
      const res = await updateUser(user.id, {
        first_name: firstName,
        last_name:  lastName,
        job_title:  jobTitle,
        role_id:    roleId,
        is_admin:   isAdmin,
      });
      if (res.success) { onSaved(); }
      else { setError(res.error ?? 'Update failed.'); setLoading(false); }
    } else {
      const emailVal = email.trim() ||
        `${firstName.trim().toLowerCase()}@edgbastonwellness.co.uk`;
      const res = await createUser({
        first_name: firstName,
        last_name:  lastName,
        email:      emailVal,
        job_title:  jobTitle,
        role_id:    roleId,
        is_admin:   isAdmin,
        temp_password: tempPw || 'Welcome2026!',
      });
      if (res.success) { onSaved(); }
      else { setError(res.error ?? 'Create failed.'); setLoading(false); }
    }
  }, [isEdit, user, firstName, lastName, email, jobTitle, roleId, isAdmin, tempPw, onSaved]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(24,29,35,0.5)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-[440px] rounded-2xl border overflow-hidden"
        style={{ background: BG, borderColor: BORDER }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: BORDER }}>
          <div>
            <h2 className="text-[15px] font-semibold" style={{ color: NAVY }}>
              {isEdit ? 'Edit team member' : 'Add team member'}
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: TER }}>
              {isEdit ? `${user.display_name || user.email}` : 'Creates account with temp password'}
            </p>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: MUT }}
            onMouseEnter={e => (e.currentTarget.style.color = SEC)}
            onMouseLeave={e => (e.currentTarget.style.color = MUT)}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First name">
              <TextInput value={firstName} onChange={setFirstName} required autoFocus />
            </Field>
            <Field label="Last name">
              <TextInput value={lastName} onChange={setLastName} required />
            </Field>
          </div>

          {/* Email (create only) */}
          {!isEdit && (
            <Field label="Email" hint={`(leave blank → ${firstName.toLowerCase() || 'firstname'}@edgbastonwellness.co.uk)`}>
              <TextInput
                type="email" value={email} onChange={setEmail}
                placeholder={firstName ? `${firstName.toLowerCase()}@edgbastonwellness.co.uk` : 'firstname@edgbastonwellness.co.uk'}
              />
            </Field>
          )}

          {/* Job title */}
          <Field label="Job title">
            <TextInput value={jobTitle} onChange={setJobTitle} placeholder="e.g. Aesthetic Practitioner" />
          </Field>

          {/* Role */}
          <Field label="Base role">
            <div className="relative">
              <select
                value={roleId} onChange={e => setRoleId(e.target.value)} required
                className="w-full h-[38px] rounded-lg border px-3 pr-8 text-[13px] bg-transparent outline-none appearance-none cursor-pointer"
                style={{ borderColor: BORDER, color: NAVY, background: BG }}
                onFocus={e => (e.target.style.borderColor = '#A8C4FF')}
                onBlur={e  => (e.target.style.borderColor = BORDER)}
              >
                {roles.map(r => (
                  <option key={r.id} value={r.id} style={{ background: BG, color: NAVY }}>
                    {r.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: MUT }} />
            </div>
            {selectedRole && (
              <p className="text-[11px] mt-1.5" style={{ color: TER }}>
                {selectedRole.slug === 'admin' && 'Full system control — all pages and settings'}
                {selectedRole.slug === 'manager' && 'All operational access, no system settings'}
                {selectedRole.slug === 'practitioner' && 'Patients, compliance, department signals'}
                {selectedRole.slug === 'receptionist' && 'Patients, signals, voice receptionist'}
                {selectedRole.slug === 'viewer' && 'Read-only access to dashboard and signals'}
              </p>
            )}
          </Field>

          {/* Admin privilege toggle */}
          {selectedRole?.slug !== 'admin' && (
            <button
              type="button"
              onClick={() => setIsAdmin(!isAdmin)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors"
              style={{
                borderColor: isAdmin ? 'rgba(220,38,38,0.30)' : BORDER,
                background: isAdmin ? 'rgba(220,38,38,0.05)' : 'transparent',
              }}
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={14} style={{ color: isAdmin ? '#DC2626' : MUT }} />
                <span className="text-[13px]" style={{ color: isAdmin ? '#DC2626' : SEC }}>
                  Admin privilege
                </span>
              </div>
              <p className="text-[11px]" style={{ color: MUT }}>
                {isAdmin ? 'Enabled — full system access' : 'Disabled'}
              </p>
            </button>
          )}

          {/* Temp password (create only) */}
          {!isEdit && (
            <Field label="Temp password" hint="(leave blank → Welcome2026!)">
              <TextInput
                type="text" value={tempPw} onChange={setTempPw}
                placeholder="Welcome2026!"
                className="font-mono"
              />
              <p className="text-[11px] mt-1.5" style={{ color: TER }}>
                User must change this on first login.
              </p>
            </Field>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[12px] pl-1" style={{ color: '#DC2626' }}>{error}</motion.p>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-[38px] rounded-lg border text-[13px] transition-colors"
              style={{ borderColor: BORDER, color: TER }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#A8C4FF')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = BORDER)}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-[38px] rounded-lg text-[13px] font-semibold flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
              style={{ backgroundColor: `${BLUE}12`, border: `1px solid ${BLUE}30`, color: NAVY }}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : (
                <>{isEdit ? 'Save changes' : 'Create account'}</>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// =============================================================================
// RESET PASSWORD MODAL
// =============================================================================

function ResetPasswordModal({
  user, onClose, onSaved,
}: {
  user: UserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pw,      setPw]      = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pw || pw.length < 8) { setError('Minimum 8 characters.'); return; }
    setLoading(true);
    const res = await resetUserPassword(user.id, pw);
    if (res.success) onSaved();
    else { setError(res.error ?? 'Failed.'); setLoading(false); }
  }, [user.id, pw, onSaved]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(24,29,35,0.5)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.15 }}
        className="w-full max-w-[380px] rounded-2xl border p-6"
        style={{ background: BG, borderColor: BORDER }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(216,166,0,0.08)', border: '1px solid rgba(216,166,0,0.25)' }}>
            <KeyRound size={14} style={{ color: '#D8A600' }} />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold" style={{ color: NAVY }}>Reset password</h3>
            <p className="text-[11px]" style={{ color: TER }}>
              {user.display_name || user.email}
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="New temp password">
            <TextInput
              type="text" value={pw} onChange={setPw}
              placeholder="min. 8 characters" autoFocus
              className="font-mono"
            />
            <p className="text-[11px] mt-1.5" style={{ color: TER }}>
              User will be forced to change this on next login.
            </p>
          </Field>
          {error && <p className="text-[12px]" style={{ color: '#DC2626' }}>{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-[36px] rounded-lg border text-[13px]"
              style={{ borderColor: BORDER, color: TER }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-[36px] rounded-lg text-[13px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-40"
              style={{ backgroundColor: `${BLUE}12`, border: `1px solid ${BLUE}30`, color: NAVY }}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : 'Reset password'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// =============================================================================
// USER ACTIONS MENU
// =============================================================================

function ActionsMenu({
  user, onEdit, onReset, onStatusChange, onClose,
}: {
  user: UserRow;
  onEdit: () => void;
  onReset: () => void;
  onStatusChange: (s: 'active' | 'suspended' | 'deactivated') => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-8 z-30 w-[180px] rounded-xl border py-1 shadow-lg"
      style={{ background: BG, borderColor: BORDER }}>
      <button onClick={() => { onEdit(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors"
        style={{ color: SEC }}
        onMouseEnter={e => (e.currentTarget.style.background = `${BORDER}50`)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <Pencil size={13} style={{ color: MUT }} /> Edit details
      </button>
      <button onClick={() => { onReset(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors"
        style={{ color: '#D8A600' }}
        onMouseEnter={e => (e.currentTarget.style.background = `${BORDER}50`)}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <KeyRound size={13} /> Reset password
      </button>
      <div className="my-1 border-t" style={{ borderColor: BORDER }} />
      {user.status === 'active' ? (
        <button onClick={() => { onStatusChange('suspended'); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors"
          style={{ color: '#DC2626' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <UserX size={13} /> Suspend access
        </button>
      ) : (
        <button onClick={() => { onStatusChange('active'); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors"
          style={{ color: '#059669' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(5,150,105,0.04)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <UserCheck size={13} /> Reactivate
        </button>
      )}
    </div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function TeamPage() {
  const searchParams = useSearchParams();
  const userId       = searchParams.get('userId') ?? '';

  const [profile,    setProfile]    = useState<StaffProfile | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [users,      setUsers]      = useState<UserRow[]>([]);
  const [roles,      setRoles]      = useState<RoleRow[]>([]);
  const [tableLoad,  setTableLoad]  = useState(false);
  const [search,     setSearch]     = useState('');
  const [filterRole, setFilterRole] = useState('all');

  // Modals
  const [editUser,   setEditUser]   = useState<UserRow | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [resetUser,  setResetUser]  = useState<UserRow | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [toast,      setToast]      = useState('');

  const brandColor = profile?.brandColor || BLUE;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const load = useCallback(async () => {
    setTableLoad(true);
    const [usersData, rolesData] = await Promise.all([listUsers(), listRoles()]);
    setUsers(usersData);
    setRoles(rolesData);
    setTableLoad(false);
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const profileRes = await getStaffProfile('clinic', userId);
      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      await load();
      setLoading(false);
    })();
  }, [userId, load]);

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    const nameMatch = !q ||
      u.first_name.toLowerCase().includes(q) ||
      u.last_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.job_title ?? '').toLowerCase().includes(q);
    const roleMatch = filterRole === 'all' || u.role?.slug === filterRole;
    return nameMatch && roleMatch;
  });

  const handleStatusChange = useCallback(async (
    user: UserRow,
    status: 'active' | 'suspended' | 'deactivated',
  ) => {
    const res = await setUserStatus(user.id, status);
    if (res.success) {
      showToast(`${user.first_name} ${status === 'active' ? 'reactivated' : 'suspended'}`);
      load();
    }
  }, [load, showToast]);

  if (loading || !profile) return <OrbLoader />;

  return (
    <div className="min-h-screen" style={{ backgroundColor: BG, paddingLeft: 'var(--nav-w, 240px)' }}>
      <StaffNav profile={profile} userId={userId} brandColor={brandColor} currentPath="Team" />

      <main className="max-w-[1100px] mx-auto px-8 py-10">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between mb-8">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] font-semibold mb-2" style={{ color: MUT }}>
              Settings
            </p>
            <h1 className="text-[28px] font-black tracking-[-0.03em]" style={{ color: NAVY }}>Team Access</h1>
            <p className="text-[13px] mt-1" style={{ color: TER }}>
              {users.length} staff account{users.length !== 1 ? 's' : ''} · default temp password: <span className="font-mono">Welcome2026!</span>
            </p>
          </div>
          <motion.button
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
            onClick={() => { setEditUser(null); setIsCreating(true); }}
            className="flex items-center gap-2 px-4 h-[38px] rounded-xl text-[13px] font-semibold transition-opacity hover:opacity-75"
            style={{ backgroundColor: `${BLUE}10`, border: `1px solid ${BLUE}28`, color: NAVY }}>
            <Plus size={14} /> Add member
          </motion.button>
        </motion.div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-[300px]">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: MUT }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full h-[36px] pl-8 pr-3 rounded-lg border bg-transparent text-[13px] outline-none transition-colors"
              style={{ borderColor: BORDER, color: NAVY }}
              onFocus={e => (e.target.style.borderColor = '#A8C4FF')}
              onBlur={e  => (e.target.style.borderColor = BORDER)}
            />
          </div>
          <div className="flex items-center gap-2">
            {['all', ...roles.map(r => r.slug)].map(slug => {
              const active = filterRole === slug;
              const rc = roleConfig(slug);
              return (
                <button key={slug} onClick={() => setFilterRole(slug)}
                  className="px-3 h-[28px] rounded-full text-[11px] font-medium transition-all capitalize"
                  style={{
                    background: active ? rc.bg : 'transparent',
                    color: active ? rc.text : MUT,
                    border: `1px solid ${active ? rc.border : BORDER}`,
                  }}>
                  {slug === 'all' ? 'All roles' : slug}
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="rounded-xl border overflow-hidden"
          style={{ borderColor: BORDER }}>

          {/* Table header */}
          <div className="grid px-5 py-3 border-b"
            style={{
              gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 40px',
              borderColor: BORDER,
              backgroundColor: `${BLUE}04`,
            }}>
            {['Name', 'Email', 'Role', 'Status', 'Last login', ''].map(h => (
              <span key={h} className="text-[10px] uppercase tracking-[0.16em] font-semibold"
                style={{ color: MUT }}>{h}</span>
            ))}
          </div>

          {tableLoad ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={18} className="animate-spin" style={{ color: MUT }} />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[13px]" style={{ color: MUT }}>
                {search ? 'No users match your search' : 'No users found'}
              </p>
            </div>
          ) : (
            <div>
              {filtered.map((u, i) => {
                const rc = u.role ? roleConfig(u.role.slug) : null;
                return (
                  <motion.div
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="grid items-center px-5 py-3.5 border-b relative"
                    style={{
                      gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 40px',
                      borderColor: BORDER,
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = `${BLUE}03`)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold"
                        style={{ backgroundColor: `${BLUE}10`, color: BLUE }}>
                        {initials(u)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-medium truncate" style={{ color: NAVY }}>
                            {u.display_name || `${u.first_name} ${u.last_name}`}
                          </p>
                          {u.is_admin && (
                            <ShieldCheck size={11} style={{ color: '#DC2626', flexShrink: 0 }} />
                          )}
                          {u.must_change_password && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                              style={{ background: 'rgba(216,166,0,0.10)', color: '#D8A600', border: '1px solid rgba(216,166,0,0.20)' }}>
                              TEMP PW
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] truncate" style={{ color: MUT }}>
                          {u.job_title ?? '—'}
                        </p>
                      </div>
                    </div>

                    {/* Email */}
                    <p className="text-[12px] truncate" style={{ color: TER }}>
                      {u.email}
                    </p>

                    {/* Role badge */}
                    <div>
                      {u.role && rc ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize"
                          style={{ background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text }}>
                          {u.role.slug === 'viewer' && <Eye size={10} />}
                          {u.is_admin && u.role.slug !== 'admin' && <Shield size={10} />}
                          {u.role.name}
                        </span>
                      ) : (
                        <span className="text-[12px]" style={{ color: MUT }}>—</span>
                      )}
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          background: u.status === 'active' ? '#059669'
                            : u.status === 'suspended' ? '#DC2626'
                            : MUT,
                        }} />
                      <span className="text-[12px]" style={{ color: u.status === 'active' ? '#059669' : TER }}>
                        {STATUS_LABEL[u.status] ?? u.status}
                      </span>
                    </div>

                    {/* Last login */}
                    <p className="text-[12px]" style={{ color: MUT }}>
                      {timeSince(u.last_login_at)}
                    </p>

                    {/* Actions menu */}
                    <div className="relative flex justify-end">
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === u.id ? null : u.id); }}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: MUT }}
                        onMouseEnter={e => (e.currentTarget.style.color = SEC)}
                        onMouseLeave={e => (e.currentTarget.style.color = MUT)}>
                        <MoreVertical size={14} />
                      </button>
                      <AnimatePresence>
                        {openMenuId === u.id && (
                          <motion.div key="menu"
                            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.1 }}>
                            <ActionsMenu
                              user={u}
                              onEdit={() => { setEditUser(u); setIsCreating(false); }}
                              onReset={() => setResetUser(u)}
                              onStatusChange={s => handleStatusChange(u, s)}
                              onClose={() => setOpenMenuId(null)}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Role legend */}
        {roles.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            className="mt-5 flex flex-wrap items-center gap-3">
            <p className="text-[11px]" style={{ color: MUT }}>Roles:</p>
            {roles.map(r => {
              const rc = roleConfig(r.slug);
              return (
                <div key={r.id} className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize"
                    style={{ background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text }}>
                    {r.name}
                  </span>
                  <span className="text-[10px]" style={{ color: MUT }}>L{r.permission_level}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={11} style={{ color: '#DC2626' }} />
              <span className="text-[10px]" style={{ color: MUT }}>= admin privilege</span>
            </div>
          </motion.div>
        )}

      </main>

      {/* Click outside to close menu */}
      {openMenuId && (
        <div className="fixed inset-0 z-20" onClick={() => setOpenMenuId(null)} />
      )}

      {/* Modals */}
      <AnimatePresence>
        {(isCreating || editUser !== null) && (
          <UserModal
            key="user-modal"
            user={isCreating ? null : editUser}
            roles={roles}
            onClose={() => { setEditUser(null); setIsCreating(false); }}
            onSaved={() => {
              const msg = isCreating ? 'Account created' : 'Changes saved';
              setEditUser(null);
              setIsCreating(false);
              showToast(msg);
              load();
            }}
          />
        )}
        {resetUser && (
          <ResetPasswordModal
            key="reset-modal"
            user={resetUser}
            onClose={() => setResetUser(null)}
            onSaved={() => {
              setResetUser(null);
              showToast(`Password reset for ${resetUser.first_name}`);
              load();
            }}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl z-50"
            style={{ background: BG, border: `1px solid ${BORDER}`, boxShadow: '0 4px 24px rgba(0,88,230,0.08)' }}>
            <Check size={13} style={{ color: '#059669' }} />
            <span className="text-[13px]" style={{ color: NAVY }}>{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
