'use client';

// =============================================================================
// /staff/settings/team — Team Management
// Admin-only page. List, create, edit, suspend, reset password for staff.
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

// =============================================================================
// CONSTANTS
// =============================================================================

const ROLE_COLORS: Record<string, string> = {
  admin:        'rgba(239,68,68,0.12)',
  manager:      'rgba(168,85,247,0.12)',
  practitioner: 'rgba(59,130,246,0.12)',
  receptionist: 'rgba(34,197,94,0.12)',
  viewer:       'rgba(255,255,255,0.06)',
};
const ROLE_TEXT: Record<string, string> = {
  admin:        'rgba(239,68,68,0.9)',
  manager:      'rgba(168,85,247,0.9)',
  practitioner: 'rgba(99,160,255,0.9)',
  receptionist: 'rgba(74,222,128,0.9)',
  viewer:       'rgba(255,255,255,0.4)',
};

const STATUS_LABEL: Record<string, string> = {
  active:      'Active',
  invited:     'Invited',
  suspended:   'Suspended',
  deactivated: 'Deactivated',
};

function roleColor(slug: string) { return ROLE_COLORS[slug] ?? 'rgba(255,255,255,0.06)'; }
function roleText(slug: string)  { return ROLE_TEXT[slug]   ?? 'rgba(255,255,255,0.4)'; }

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
// CREATE / EDIT USER MODAL
// =============================================================================

function UserModal({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: UserRow | null;   // null = create mode
  roles: RoleRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;

  const [firstName,   setFirstName]   = useState(user?.first_name ?? '');
  const [lastName,    setLastName]    = useState(user?.last_name  ?? '');
  const [email,       setEmail]       = useState(user?.email      ?? '');
  const [jobTitle,    setJobTitle]    = useState(user?.job_title  ?? '');
  const [roleId,      setRoleId]      = useState(user?.role?.id   ?? roles[0]?.id ?? '');
  const [isAdmin,     setIsAdmin]     = useState(user?.is_admin   ?? false);
  const [tempPw,      setTempPw]      = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

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
      // Build email from first name if blank
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
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="w-full max-w-[440px] rounded-2xl border overflow-hidden"
        style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div>
            <h2 className="text-[15px] font-semibold text-white">
              {isEdit ? 'Edit team member' : 'Add team member'}
            </h2>
            <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {isEdit ? `${user.display_name || user.email}` : 'Creates account with temp password'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors"
            style={{ color: 'rgba(255,255,255,0.3)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          {/* Name row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] mb-1.5"
                style={{ color: 'rgba(255,255,255,0.3)' }}>First name</label>
              <input
                value={firstName} onChange={e => setFirstName(e.target.value)} required
                className="w-full h-[38px] rounded-lg border px-3 text-[13px] text-white bg-transparent outline-none transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.3)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] mb-1.5"
                style={{ color: 'rgba(255,255,255,0.3)' }}>Last name</label>
              <input
                value={lastName} onChange={e => setLastName(e.target.value)} required
                className="w-full h-[38px] rounded-lg border px-3 text-[13px] text-white bg-transparent outline-none transition-colors"
                style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.3)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
            </div>
          </div>

          {/* Email (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] mb-1.5"
                style={{ color: 'rgba(255,255,255,0.3)' }}>
                Email
                <span className="ml-1 normal-case" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  (leave blank → firstname@edgbastonwellness.co.uk)
                </span>
              </label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={firstName ? `${firstName.toLowerCase()}@edgbastonwellness.co.uk` : 'firstname@edgbastonwellness.co.uk'}
                className="w-full h-[38px] rounded-lg border px-3 text-[13px] text-white bg-transparent outline-none transition-colors placeholder:text-white/20"
                style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.3)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
            </div>
          )}

          {/* Job title */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] mb-1.5"
              style={{ color: 'rgba(255,255,255,0.3)' }}>Job title</label>
            <input
              value={jobTitle} onChange={e => setJobTitle(e.target.value)}
              placeholder="e.g. Aesthetic Practitioner"
              className="w-full h-[38px] rounded-lg border px-3 text-[13px] text-white bg-transparent outline-none transition-colors placeholder:text-white/20"
              style={{ borderColor: 'rgba(255,255,255,0.1)' }}
              onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.3)')}
              onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] mb-1.5"
              style={{ color: 'rgba(255,255,255,0.3)' }}>Base role</label>
            <div className="relative">
              <select
                value={roleId} onChange={e => setRoleId(e.target.value)} required
                className="w-full h-[38px] rounded-lg border px-3 pr-8 text-[13px] text-white bg-transparent outline-none appearance-none cursor-pointer"
                style={{ borderColor: 'rgba(255,255,255,0.1)', background: '#0a0a0a' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.3)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              >
                {roles.map(r => (
                  <option key={r.id} value={r.id} style={{ background: '#0a0a0a' }}>
                    {r.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'rgba(255,255,255,0.3)' }} />
            </div>
            {selectedRole && (
              <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.25)' }}>
                {selectedRole.slug === 'admin' && 'Full system control — all pages and settings'}
                {selectedRole.slug === 'manager' && 'All operational access, no system settings'}
                {selectedRole.slug === 'practitioner' && 'Patients, compliance, department signals'}
                {selectedRole.slug === 'receptionist' && 'Patients, signals, voice receptionist'}
                {selectedRole.slug === 'viewer' && 'Read-only access to dashboard and signals'}
              </p>
            )}
          </div>

          {/* Admin privilege toggle (only for non-admin roles) */}
          {selectedRole?.slug !== 'admin' && (
            <button
              type="button"
              onClick={() => setIsAdmin(!isAdmin)}
              className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors"
              style={{
                borderColor: isAdmin ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.08)',
                background: isAdmin ? 'rgba(239,68,68,0.06)' : 'transparent',
              }}
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck size={14} style={{ color: isAdmin ? 'rgba(239,68,68,0.8)' : 'rgba(255,255,255,0.25)' }} />
                <span className="text-[13px]" style={{ color: isAdmin ? 'rgba(239,68,68,0.9)' : 'rgba(255,255,255,0.5)' }}>
                  Admin privilege
                </span>
              </div>
              <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                {isAdmin ? 'Enabled — full system access' : 'Disabled'}
              </p>
            </button>
          )}

          {/* Temp password (create only) */}
          {!isEdit && (
            <div>
              <label className="block text-[11px] uppercase tracking-[0.14em] mb-1.5"
                style={{ color: 'rgba(255,255,255,0.3)' }}>
                Temp password
                <span className="ml-1 normal-case" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  (leave blank → Welcome2026!)
                </span>
              </label>
              <input
                type="text" value={tempPw} onChange={e => setTempPw(e.target.value)}
                placeholder="Welcome2026!"
                className="w-full h-[38px] rounded-lg border px-3 text-[13px] text-white bg-transparent outline-none transition-colors placeholder:text-white/20 font-mono"
                style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.3)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
              <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.2)' }}>
                User must change this on first login.
              </p>
            </div>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-[12px] text-red-400 pl-1">{error}</motion.p>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-[38px] rounded-lg border text-[13px] transition-colors"
              style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-[38px] rounded-lg text-[13px] font-medium text-black flex items-center justify-center gap-2 transition-opacity disabled:opacity-40"
              style={{ background: '#ffffff' }}>
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
  user,
  onClose,
  onSaved,
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
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.15 }}
        className="w-full max-w-[380px] rounded-2xl border p-6"
        style={{ background: '#0a0a0a', borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,165,0,0.1)', border: '1px solid rgba(255,165,0,0.2)' }}>
            <KeyRound size={14} style={{ color: 'rgba(255,165,0,0.8)' }} />
          </div>
          <div>
            <h3 className="text-[14px] font-semibold text-white">Reset password</h3>
            <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
              {user.display_name || user.email}
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-[11px] uppercase tracking-[0.14em] mb-1.5"
              style={{ color: 'rgba(255,255,255,0.3)' }}>New temp password</label>
            <input
              type="text" value={pw} onChange={e => setPw(e.target.value)}
              autoFocus placeholder="min. 8 characters"
              className="w-full h-[38px] rounded-lg border px-3 text-[13px] text-white bg-transparent outline-none font-mono placeholder:text-white/20"
              style={{ borderColor: 'rgba(255,255,255,0.1)' }}
              onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.3)')}
              onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.1)')}
            />
            <p className="text-[11px] mt-1.5" style={{ color: 'rgba(255,255,255,0.2)' }}>
              User will be forced to change this on next login.
            </p>
          </div>
          {error && <p className="text-[12px] text-red-400">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-[36px] rounded-lg border text-[13px]"
              style={{ borderColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 h-[36px] rounded-lg text-[13px] font-medium text-black flex items-center justify-center gap-1.5 disabled:opacity-40"
              style={{ background: '#ffffff' }}>
              {loading ? <Loader2 size={13} className="animate-spin" /> : 'Reset'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// =============================================================================
// USER ROW ACTIONS MENU
// =============================================================================

function ActionsMenu({
  user,
  onEdit,
  onReset,
  onStatusChange,
  onClose,
}: {
  user: UserRow;
  onEdit: () => void;
  onReset: () => void;
  onStatusChange: (s: 'active' | 'suspended' | 'deactivated') => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute right-0 top-8 z-30 w-[180px] rounded-xl border py-1 shadow-2xl"
      style={{ background: '#111', borderColor: 'rgba(255,255,255,0.1)' }}>
      <button onClick={() => { onEdit(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors"
        style={{ color: 'rgba(255,255,255,0.7)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <Pencil size={13} /> Edit details
      </button>
      <button onClick={() => { onReset(); onClose(); }}
        className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors"
        style={{ color: 'rgba(255,165,0,0.8)' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
        <KeyRound size={13} /> Reset password
      </button>
      <div className="my-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />
      {user.status === 'active' ? (
        <button onClick={() => { onStatusChange('suspended'); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors"
          style={{ color: 'rgba(239,68,68,0.8)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <UserX size={13} /> Suspend access
        </button>
      ) : (
        <button onClick={() => { onStatusChange('active'); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors"
          style={{ color: 'rgba(34,197,94,0.8)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
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

  const [profile,   setProfile]   = useState<StaffProfile | null>(null);
  const [users,     setUsers]     = useState<UserRow[]>([]);
  const [roles,     setRoles]     = useState<RoleRow[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [filterRole, setFilterRole] = useState('all');

  // Modals
  const [editUser,       setEditUser]       = useState<UserRow | null>(null);
  const [isCreating,     setIsCreating]     = useState(false);
  const [resetUser,      setResetUser]      = useState<UserRow | null>(null);
  const [openMenuId,     setOpenMenuId]     = useState<string | null>(null);
  const [toast,          setToast]          = useState('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [usersData, rolesData] = await Promise.all([listUsers(), listRoles()]);
    setUsers(usersData);
    setRoles(rolesData);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const profileRes = await getStaffProfile('clinic', userId);
      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
    })();
    load();
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

  const brandColor = profile?.brandColor ?? '#ffffff';

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#000' }}>
        <Loader2 size={18} className="animate-spin" style={{ color: 'rgba(255,255,255,0.3)' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: '#000000' }}>
      <StaffNav
        profile={profile}
        userId={userId}
        brandColor={brandColor}
        currentPath="/staff/settings/team"
      />

      <main className="ml-[240px] min-h-screen">
        <div className="max-w-[1100px] mx-auto px-8 py-8">

          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <Users size={16} style={{ color: 'rgba(255,255,255,0.4)' }} />
                <h1 className="text-[11px] uppercase tracking-[0.18em] font-medium"
                  style={{ color: 'rgba(255,255,255,0.25)' }}>
                  Settings · Team
                </h1>
              </div>
              <h2 className="text-[22px] font-bold tracking-tight text-white">
                Team access
              </h2>
              <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.35)' }}>
                {users.length} staff account{users.length !== 1 ? 's' : ''} · temp password: <span className="font-mono">Welcome2026!</span>
              </p>
            </div>
            <button
              onClick={() => { setEditUser(null); setIsCreating(true); }}
              className="flex items-center gap-2 px-4 h-[38px] rounded-xl text-[13px] font-medium text-black transition-opacity"
              style={{ background: brandColor }}>
              <Plus size={14} /> Add member
            </button>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-[300px]">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'rgba(255,255,255,0.25)' }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full h-[36px] pl-8 pr-3 rounded-lg border bg-transparent text-[13px] text-white outline-none placeholder:text-white/20"
                style={{ borderColor: 'rgba(255,255,255,0.08)' }}
                onFocus={e => (e.target.style.borderColor = 'rgba(255,255,255,0.2)')}
                onBlur={e  => (e.target.style.borderColor = 'rgba(255,255,255,0.08)')}
              />
            </div>
            {/* Role filter chips */}
            <div className="flex items-center gap-2">
              {['all', ...roles.map(r => r.slug)].map(slug => (
                <button key={slug} onClick={() => setFilterRole(slug)}
                  className="px-3 h-[28px] rounded-full text-[11px] font-medium transition-all capitalize"
                  style={{
                    background: filterRole === slug
                      ? (slug === 'all' ? 'rgba(255,255,255,0.15)' : roleColor(slug))
                      : 'rgba(255,255,255,0.04)',
                    color: filterRole === slug
                      ? (slug === 'all' ? 'rgba(255,255,255,0.9)' : roleText(slug))
                      : 'rgba(255,255,255,0.3)',
                    border: '1px solid',
                    borderColor: filterRole === slug ? 'transparent' : 'rgba(255,255,255,0.06)',
                  }}>
                  {slug === 'all' ? 'All roles' : slug}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border overflow-hidden"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}>

            {/* Table header */}
            <div className="grid px-5 py-3 border-b"
              style={{
                gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 40px',
                borderColor: 'rgba(255,255,255,0.04)',
                background: 'rgba(255,255,255,0.02)',
              }}>
              {['Name', 'Email', 'Role', 'Status', 'Last login', ''].map(h => (
                <span key={h} className="text-[11px] uppercase tracking-[0.14em] font-medium"
                  style={{ color: 'rgba(255,255,255,0.2)' }}>{h}</span>
              ))}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={18} className="animate-spin" style={{ color: 'rgba(255,255,255,0.2)' }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-[13px]" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  {search ? 'No users match your search' : 'No users found'}
                </p>
              </div>
            ) : (
              <div>
                {filtered.map((u, i) => (
                  <motion.div
                    key={u.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.02 }}
                    className="grid items-center px-5 py-3.5 border-b relative"
                    style={{
                      gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr 40px',
                      borderColor: 'rgba(255,255,255,0.04)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.015)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* Name */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold text-white"
                        style={{ background: 'rgba(255,255,255,0.08)' }}>
                        {initials(u)}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[13px] font-medium text-white truncate">
                            {u.display_name || `${u.first_name} ${u.last_name}`}
                          </p>
                          {u.is_admin && (
                            <ShieldCheck size={11} style={{ color: 'rgba(239,68,68,0.7)', flexShrink: 0 }} />
                          )}
                          {u.must_change_password && (
                            <span className="text-[9px] px-1 rounded"
                              style={{ background: 'rgba(255,165,0,0.12)', color: 'rgba(255,165,0,0.7)' }}>
                              TEMP PW
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] truncate" style={{ color: 'rgba(255,255,255,0.25)' }}>
                          {u.job_title ?? '—'}
                        </p>
                      </div>
                    </div>

                    {/* Email */}
                    <p className="text-[12px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {u.email}
                    </p>

                    {/* Role badge */}
                    <div>
                      {u.role ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium capitalize"
                          style={{
                            background: roleColor(u.role.slug),
                            color: roleText(u.role.slug),
                          }}>
                          {u.role.slug === 'viewer' && <Eye size={10} />}
                          {u.is_admin && u.role.slug !== 'admin' && <Shield size={10} />}
                          {u.role.name}
                        </span>
                      ) : (
                        <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>
                      )}
                    </div>

                    {/* Status */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                        style={{
                          background: u.status === 'active' ? '#22c55e'
                            : u.status === 'suspended' ? '#ef4444'
                            : 'rgba(255,255,255,0.2)',
                        }} />
                      <span className="text-[12px]"
                        style={{ color: u.status === 'active' ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}>
                        {STATUS_LABEL[u.status] ?? u.status}
                      </span>
                    </div>

                    {/* Last login */}
                    <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {timeSince(u.last_login_at)}
                    </p>

                    {/* Actions menu */}
                    <div className="relative flex justify-end">
                      <button
                        onClick={e => { e.stopPropagation(); setOpenMenuId(openMenuId === u.id ? null : u.id); }}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'rgba(255,255,255,0.25)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}>
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
                ))}
              </div>
            )}
          </div>

          {/* Role legend */}
          <div className="mt-6 flex flex-wrap gap-3">
            <p className="text-[11px] self-center" style={{ color: 'rgba(255,255,255,0.2)' }}>
              Roles:
            </p>
            {roles.map(r => (
              <div key={r.id} className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium capitalize"
                  style={{ background: roleColor(r.slug), color: roleText(r.slug) }}>
                  {r.name}
                </span>
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
                  L{r.permission_level}
                </span>
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <ShieldCheck size={11} style={{ color: 'rgba(239,68,68,0.7)' }} />
              <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.2)' }}>= admin privilege</span>
            </div>
          </div>

        </div>
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
            style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}>
            <Check size={13} style={{ color: '#22c55e' }} />
            <span className="text-[13px] text-white">{toast}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
