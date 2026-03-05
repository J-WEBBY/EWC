'use client';

// =============================================================================
// Corporate Accounts — B2B client management, employer wellness packages
// =============================================================================

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { getCorporateAccounts, generateAccountBrief, logCorporateNote } from '@/lib/actions/corporate';
import type { CorporateAccount, CorporateStats, AccountStatus } from '@/lib/actions/corporate';
import { getStaffProfile, getLatestTenantAndUser } from '@/lib/actions/staff-onboarding';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

const ACCENT = '#D97706';

const STATUS_STYLE: Record<CorporateAccount['status'], { bg: string; border: string; text: string; label: string }> = {
  active:       { bg: 'rgba(5,150,105,0.07)',   border: 'rgba(5,150,105,0.25)',  text: '#059669', label: 'Active' },
  negotiating:  { bg: 'rgba(37,99,235,0.07)',   border: 'rgba(37,99,235,0.25)', text: '#2563EB', label: 'Negotiating' },
  renewal_due:  { bg: 'rgba(217,119,6,0.08)',   border: 'rgba(217,119,6,0.30)', text: '#D97706', label: 'Renewal Due' },
  at_risk:      { bg: 'rgba(220,38,38,0.07)',   border: 'rgba(220,38,38,0.25)', text: '#DC2626', label: 'At Risk' },
  lapsed:       { bg: 'rgba(110,102,136,0.06)', border: '#EBE5FF',              text: '#8B84A0', label: 'Lapsed' },
};

const TIER_LABEL: Record<CorporateAccount['package_tier'], string> = {
  essential: 'Essential', premium: 'Premium', bespoke: 'Bespoke',
};

const FALLBACK: StaffProfile = {
  userId: '', firstName: 'Staff', lastName: '', email: '',
  jobTitle: null, departmentName: null, departmentId: null,
  roleName: null, isAdmin: false, isOwner: false,
  companyName: 'Edgbaston Wellness Clinic',
  aiName: 'Aria', brandColor: '#D97706', logoUrl: null,
  industry: null, reportsTo: null, teamSize: 0,
};

function fmtCurrency(n: number) { return '£' + n.toLocaleString('en-GB'); }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
function daysUntil(d: string) { return Math.round((new Date(d).getTime() - Date.now()) / 86400000); }

function UtilBar({ pct, status }: { pct: number; status: CorporateAccount['status'] }) {
  const color = status === 'at_risk' ? '#DC2626' : pct >= 70 ? '#059669' : pct >= 40 ? '#D97706' : '#2563EB';
  return (
    <div style={{ height: 4, background: 'rgba(138,108,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
    </div>
  );
}

function AccountCard({ account, tenantId, accentColor }: { account: CorporateAccount; tenantId: string; accentColor: string }) {
  const [expanded, setExpanded] = useState(false);
  const [brief, setBrief] = useState(account.ai_account_brief);
  const [loadingBrief, setLoadingBrief] = useState(false);
  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const ss = STATUS_STYLE[account.status];
  const days = daysUntil(account.contract_end);

  async function handleGenerateBrief() {
    setLoadingBrief(true);
    const res = await generateAccountBrief(tenantId, account.id);
    if (res.success && res.data) setBrief(res.data.brief);
    setLoadingBrief(false);
  }

  async function handleSaveNote() {
    if (!note.trim()) return;
    setSavingNote(true);
    await logCorporateNote(tenantId, account.id, note);
    setNote('');
    setSavingNote(false);
  }

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} style={{ borderBottom: '1px solid #EBE5FF' }}>
      <div onClick={() => setExpanded(e => !e)} style={{ padding: '16px 0', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 100px 1fr 90px', gap: 12, alignItems: 'center', cursor: 'pointer' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#1A1035', margin: 0 }}>{account.company_name}</p>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: accentColor + '12', color: accentColor }}>{TIER_LABEL[account.package_tier]}</span>
          </div>
          <p style={{ fontSize: 10, color: '#8B84A0', margin: 0 }}>{account.industry} · {account.employee_count} employees · {account.primary_contact.name}</p>
        </div>
        <div>
          <p style={{ fontSize: 18, fontWeight: 900, color: '#1A1035', letterSpacing: '-0.03em', margin: 0 }}>{fmtCurrency(account.annual_value)}</p>
          <p style={{ fontSize: 10, color: '#8B84A0', margin: 0 }}>ARR</p>
        </div>
        <div>
          <UtilBar pct={account.utilisation_pct} status={account.status} />
          <p style={{ fontSize: 10, color: '#6E6688', marginTop: 4 }}>{account.utilisation_pct}% utilised · {account.treatments_ytd} treatments YTD</p>
        </div>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: days < 30 ? '#DC2626' : days < 90 ? '#D97706' : '#1A1035', margin: 0 }}>
            {days < 0 ? 'EXPIRED' : days + 'd'}
          </p>
          <p style={{ fontSize: 10, color: '#8B84A0', margin: 0 }}>{fmtDate(account.contract_end)}</p>
        </div>
        <div>
          {account.outstanding_invoice && (
            <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626' }}>{fmtCurrency(account.outstanding_invoice)} overdue</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: ss.bg, border: '1px solid ' + ss.border, color: ss.text }}>{ss.label}</span>
          <svg width={12} height={12} viewBox="0 0 12 12" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: '#8B84A0' }}>
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth={1.5} fill="none" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <AnimatePresence>
        {expanded && (
          <motion.div key="exp" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <div style={{ paddingBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
              <div style={{ border: '1px solid #EBE5FF', borderRadius: 14, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8B84A0' }}>AI Account Brief</span>
                  <button onClick={handleGenerateBrief} disabled={loadingBrief} style={{ fontSize: 10, fontWeight: 700, color: accentColor, background: 'transparent', border: 'none', cursor: 'pointer', opacity: loadingBrief ? 0.5 : 1 }}>
                    {loadingBrief ? 'Generating...' : 'Refresh AI'}
                  </button>
                </div>
                <p style={{ fontSize: 12, color: '#524D66', lineHeight: 1.65 }}>{brief ?? 'Click Refresh AI to generate brief.'}</p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ border: '1px solid #EBE5FF', borderRadius: 14, padding: '14px 16px' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8B84A0', marginBottom: 8 }}>Primary Contact</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#1A1035' }}>{account.primary_contact.name} — {account.primary_contact.title}</p>
                  <p style={{ fontSize: 11, color: '#524D66' }}>{account.primary_contact.email}</p>
                  {account.primary_contact.phone && <p style={{ fontSize: 11, color: '#524D66' }}>{account.primary_contact.phone}</p>}
                </div>
                <div style={{ border: '1px solid #EBE5FF', borderRadius: 14, padding: '14px 16px' }}>
                  <p style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#8B84A0', marginBottom: 8 }}>Log Note</p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={note} onChange={e => setNote(e.target.value)} placeholder="Add account note..."
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #EBE5FF', background: '#FAF7F2', fontSize: 11, color: '#1A1035', outline: 'none' }} />
                    <button onClick={handleSaveNote} disabled={savingNote || !note.trim()} style={{ padding: '7px 12px', borderRadius: 8, background: accentColor, color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: savingNote || !note.trim() ? 0.5 : 1 }}>
                      {savingNote ? '...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// PIPELINE FUNNEL
// =============================================================================

function PipelineFunnel({ accounts, accentColor }: { accounts: CorporateAccount[]; accentColor: string }) {
  const stages: { key: AccountStatus; label: string; color: string }[] = [
    { key: 'negotiating',  label: 'Negotiating',  color: '#2563EB' },
    { key: 'active',       label: 'Active',        color: '#059669' },
    { key: 'renewal_due',  label: 'Renewal Due',   color: '#D97706' },
    { key: 'at_risk',      label: 'At Risk',       color: '#DC2626' },
    { key: 'lapsed',       label: 'Lapsed',        color: '#6B7280' },
  ];
  const totalArr = accounts.reduce((s, a) => s + a.annual_value, 0) || 1;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #EBE5FF' }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: '#8B84A0' }}>B2B Pipeline</p>
        <p className="text-[15px] font-bold" style={{ color: '#1A1035' }}>Account Stage Distribution</p>
      </div>
      <div className="p-5 space-y-3">
        {stages.map(s => {
          const accs = accounts.filter(a => a.status === s.key);
          const stageArr = accs.reduce((sum, a) => sum + a.annual_value, 0);
          const pct = Math.round((stageArr / totalArr) * 100);
          return (
            <div key={s.key}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                  <p className="text-[11px] font-medium" style={{ color: '#1A1035' }}>{s.label}</p>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${s.color}12`, color: s.color }}>{accs.length}</span>
                </div>
                <div className="flex items-center gap-3">
                  <p className="text-[11px] font-semibold" style={{ color: '#524D66' }}>£{stageArr.toLocaleString('en-GB')}</p>
                  <p className="text-[10px] w-8 text-right" style={{ color: '#8B84A0' }}>{pct}%</p>
                </div>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(138,108,255,0.07)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: s.color }}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                />
              </div>
            </div>
          );
        })}
        <div className="pt-3 mt-1 grid grid-cols-3 gap-3" style={{ borderTop: '1px solid #EBE5FF' }}>
          {[
            { label: 'Total Pipeline', value: '£' + accounts.reduce((s, a) => s + a.annual_value, 0).toLocaleString('en-GB'), color: '#1A1035' },
            { label: 'Avg Utilisation', value: accounts.length > 0 ? Math.round(accounts.reduce((s, a) => s + a.utilisation_pct, 0) / accounts.length) + '%' : '—', color: accentColor },
            { label: 'Total Accounts', value: String(accounts.length), color: '#524D66' },
          ].map(k => (
            <div key={k.label} className="text-center px-3 py-2 rounded-xl" style={{ backgroundColor: `${k.color}06`, border: `1px solid ${k.color}18` }}>
              <p className="text-[16px] font-black" style={{ color: k.color }}>{k.value}</p>
              <p className="text-[8px] mt-0.5" style={{ color: '#8B84A0' }}>{k.label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// RENEWAL CALENDAR
// =============================================================================

function RenewalCalendar({ accounts }: { accounts: CorporateAccount[] }) {
  const upcoming = [...accounts]
    .filter(a => a.status !== 'lapsed')
    .sort((a, b) => new Date(a.contract_end).getTime() - new Date(b.contract_end).getTime())
    .slice(0, 6);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
      <div className="px-5 py-4" style={{ borderBottom: '1px solid #EBE5FF' }}>
        <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: '#8B84A0' }}>Renewals</p>
        <p className="text-[15px] font-bold" style={{ color: '#1A1035' }}>Renewal Calendar</p>
      </div>
      <div className="p-2">
        {upcoming.length === 0 ? (
          <p className="px-3 py-4 text-[12px] text-center" style={{ color: '#8B84A0' }}>No upcoming renewals</p>
        ) : (
          upcoming.map(a => {
            const days = Math.round((new Date(a.contract_end).getTime() - Date.now()) / 86400000);
            const urgColor = days < 0 ? '#DC2626' : days <= 30 ? '#DC2626' : days <= 90 ? '#D97706' : '#059669';
            const urgBg = days <= 30 ? 'rgba(220,38,38,0.05)' : days <= 90 ? 'rgba(217,119,6,0.04)' : 'transparent';
            return (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                style={{ backgroundColor: urgBg }}>
                <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${urgColor}12`, border: `1px solid ${urgColor}25` }}>
                  <p className="text-[13px] font-black leading-none" style={{ color: urgColor }}>{Math.abs(days)}</p>
                  <p className="text-[7px] font-semibold uppercase" style={{ color: urgColor }}>
                    {days < 0 ? 'OVD' : 'days'}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold truncate" style={{ color: '#1A1035' }}>{a.company_name}</p>
                  <p className="text-[10px]" style={{ color: '#8B84A0' }}>
                    {fmtDate(a.contract_end)} · £{a.annual_value.toLocaleString('en-GB')} ARR
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: STATUS_STYLE[a.status].bg, color: STATUS_STYLE[a.status].text }}>
                    {STATUS_STYLE[a.status].label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// =============================================================================
// OUTSTANDING INVOICES
// =============================================================================

function InvoicePanel({ accounts, accentColor }: { accounts: CorporateAccount[]; accentColor: string }) {
  const withInvoice = accounts.filter(a => a.outstanding_invoice && a.outstanding_invoice > 0);
  const totalOutstanding = withInvoice.reduce((s, a) => s + (a.outstanding_invoice ?? 0), 0);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid #EBE5FF' }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #EBE5FF' }}>
        <div>
          <p className="text-[8px] uppercase tracking-[0.28em] font-semibold mb-0.5" style={{ color: '#8B84A0' }}>Finance</p>
          <p className="text-[15px] font-bold" style={{ color: '#1A1035' }}>Outstanding Invoices</p>
        </div>
        {totalOutstanding > 0 && (
          <div className="text-right">
            <p className="text-[18px] font-black" style={{ color: '#DC2626' }}>£{totalOutstanding.toLocaleString('en-GB')}</p>
            <p className="text-[9px]" style={{ color: '#8B84A0' }}>total overdue</p>
          </div>
        )}
      </div>
      <div className="p-2">
        {withInvoice.length === 0 ? (
          <div className="px-3 py-4 text-center">
            <p className="text-[12px]" style={{ color: '#059669' }}>All accounts up to date</p>
          </div>
        ) : (
          withInvoice.map(a => (
            <div key={a.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl"
              style={{ backgroundColor: 'rgba(220,38,38,0.03)' }}>
              <div>
                <p className="text-[12px] font-semibold" style={{ color: '#1A1035' }}>{a.company_name}</p>
                <p className="text-[10px]" style={{ color: '#8B84A0' }}>{a.primary_contact.name} · {a.primary_contact.email}</p>
              </div>
              <p className="text-[14px] font-black" style={{ color: '#DC2626' }}>£{(a.outstanding_invoice ?? 0).toLocaleString('en-GB')}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function CorporatePage() {
  const params = useSearchParams();
  const userId = params.get('userId') ?? '';

  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [accounts, setAccounts] = useState<CorporateAccount[]>([]);
  const [stats, setStats] = useState<CorporateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [tenantId] = useState('clinic');
  const [view, setView] = useState<'accounts' | 'pipeline'>('accounts');

  const load = useCallback(async () => {
    setLoading(true);
    const [, profileRes, corpRes] = await Promise.all([
      getLatestTenantAndUser(),
      getStaffProfile('clinic', userId),
      getCorporateAccounts('clinic'),
    ]);
    setProfile(profileRes.success && profileRes.data ? profileRes.data.profile : FALLBACK);
    if (corpRes.success && corpRes.data) {
      setAccounts(corpRes.data.accounts);
      setStats(corpRes.data.stats);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const filtered = filterStatus === 'all' ? accounts : accounts.filter(a => a.status === filterStatus);
  const accentColor = profile?.brandColor ?? ACCENT;

  if (loading) return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAF7F2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '2px solid #EBE5FF', borderTopColor: ACCENT, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#FAF7F2' }}>
      {profile && <StaffNav profile={profile} userId={userId} brandColor={accentColor} currentPath="Corporate" />}
      <main style={{ paddingLeft: 240, minHeight: '100vh' }}>
        <div style={{ padding: '40px 40px 0', borderBottom: '1px solid #EBE5FF' }}>
          <div style={{ paddingBottom: 24 }}>
            <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.28em', color: '#8B84A0', marginBottom: 6 }}>Growth</p>
            <h1 style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.035em', color: '#1A1035', lineHeight: 1 }}>Corporate Accounts</h1>
            <p style={{ fontSize: 13, color: '#524D66', marginTop: 6 }}>B2B employer wellness packages — AI account briefs, renewal pipeline, utilisation tracking</p>
          </div>
          {/* View tabs */}
          <div style={{ display: 'flex', gap: 0, marginTop: 4 }}>
            {[{ key: 'accounts' as const, label: `Accounts (${accounts.length})` }, { key: 'pipeline' as const, label: 'Pipeline & Renewals' }].map(t => (
              <button key={t.key} onClick={() => setView(t.key)} style={{
                padding: '10px 20px', border: 'none', background: 'transparent', fontSize: 11, fontWeight: 700,
                cursor: 'pointer', color: view === t.key ? accentColor : '#8B84A0',
                borderBottom: `2px solid ${view === t.key ? accentColor : 'transparent'}`, transition: 'all 0.2s',
              }}>{t.label}</button>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        {stats && (
          <div style={{ display: 'flex', borderBottom: '1px solid #EBE5FF' }}>
            {[
              { label: 'Total ARR',       value: fmtCurrency(stats.total_arr),     color: '#1A1035' },
              { label: 'Active',          value: String(stats.active_accounts),    color: '#059669' },
              { label: 'Renewals <30d',   value: String(stats.renewal_due_30d),    color: '#D97706' },
              { label: 'At-Risk Value',   value: fmtCurrency(stats.at_risk_value), color: '#DC2626' },
              { label: 'Avg Utilisation', value: stats.avg_utilisation + '%',      color: '#2563EB' },
            ].map((m, i) => (
              <div key={m.label} style={{ flex: 1, padding: '18px 20px', borderRight: i < 4 ? '1px solid #EBE5FF' : 'none' }}>
                <p style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#8B84A0', margin: 0 }}>{m.label}</p>
                <p style={{ fontSize: 22, fontWeight: 900, color: m.color, letterSpacing: '-0.03em', margin: 0 }}>{m.value}</p>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {view === 'pipeline' ? (
            <motion.div key="pipeline" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ padding: '24px 40px 40px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                <PipelineFunnel accounts={accounts} accentColor={accentColor} />
                <RenewalCalendar accounts={accounts} />
              </div>
              <InvoicePanel accounts={accounts} accentColor={accentColor} />
            </motion.div>
          ) : (
            <motion.div key="accounts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* Filter pills */}
              <div style={{ padding: '16px 40px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['all', 'active', 'renewal_due', 'at_risk', 'negotiating', 'lapsed'].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)} style={{
                    padding: '5px 12px', borderRadius: 20,
                    border: '1px solid ' + (filterStatus === s ? accentColor : '#EBE5FF'),
                    background: filterStatus === s ? accentColor + '12' : 'transparent',
                    color: filterStatus === s ? accentColor : '#8B84A0',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
                  }}>{s === 'all' ? 'All (' + accounts.length + ')' : s.replace(/_/g, ' ')}</button>
                ))}
              </div>
              <div style={{ padding: '16px 40px 0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 100px 1fr 90px', gap: 12, paddingBottom: 10, borderBottom: '2px solid #EBE5FF' }}>
                  {['Company', 'ARR', 'Utilisation', 'Contract', 'Invoice', 'Status'].map(h => (
                    <span key={h} style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.25em', color: '#8B84A0' }}>{h}</span>
                  ))}
                </div>
              </div>
              <div style={{ padding: '0 40px 40px' }}>
                <AnimatePresence>
                  {filtered.map(account => (
                    <AccountCard key={account.id} account={account} tenantId={tenantId} accentColor={accentColor} />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
