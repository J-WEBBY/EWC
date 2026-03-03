'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Users, PoundSterling, ChevronRight, ChevronDown,
  CheckCircle2, Clock, MessageSquare,
} from 'lucide-react';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// SIMULATED DATA
// =============================================================================

interface CorporateContact {
  name: string;
  title: string;
  email: string;
}

interface CorporateAccount {
  id: string;
  company: string;
  sector: string;
  employees: number;
  status: 'active' | 'onboarding' | 'lapsed';
  monthlySpend: string;
  treatments: string[];
  contractRenewal: string;
  contact: CorporateContact;
  notes: string;
}

const ACCOUNTS: CorporateAccount[] = [
  {
    id: 'ca1',
    company: 'Brindley Capital Partners',
    sector: 'Financial Services',
    employees: 45,
    status: 'active',
    monthlySpend: '£2,400',
    treatments: ['Executive Health Screening', 'IV Therapy', 'Botox'],
    contractRenewal: '2026-09-01',
    contact: { name: 'Helen Forsyth', title: 'Office Manager', email: 'h.forsyth@brindleycapital.co.uk' },
    notes: 'Premium account. Monthly IV therapy Fridays. Preferred treatment day: Thursdays.',
  },
  {
    id: 'ca2',
    company: 'Stratford Law Group',
    sector: 'Legal',
    employees: 62,
    status: 'active',
    monthlySpend: '£1,850',
    treatments: ['GP Consultations', 'Health Screening', 'Weight Management'],
    contractRenewal: '2026-07-15',
    contact: { name: 'Marcus Webb', title: 'HR Director', email: 'm.webb@stratfordlaw.co.uk' },
    notes: 'Annual health screening for senior partners. Quarterly wellness sessions.',
  },
  {
    id: 'ca3',
    company: 'Midland Tech Solutions',
    sector: 'Technology',
    employees: 120,
    status: 'onboarding',
    monthlySpend: '£3,100',
    treatments: ['Corporate Wellness Programme', 'Stress & Hormone Testing', 'IV Therapy'],
    contractRenewal: '2026-03-01',
    contact: { name: 'Priya Nair', title: 'People & Culture Lead', email: 'p.nair@midlandtech.co.uk' },
    notes: 'Largest account pipeline. Contract signed Feb 2026. First session scheduled March.',
  },
  {
    id: 'ca4',
    company: 'Henleys Property Group',
    sector: 'Real Estate',
    employees: 28,
    status: 'lapsed',
    monthlySpend: '£0',
    treatments: ['Aesthetic Treatments', 'Botox'],
    contractRenewal: '2026-02-01',
    contact: { name: 'Simon Henley', title: 'Director', email: 's.henley@henleysproperty.co.uk' },
    notes: 'Contract lapsed January 2026. Follow-up call required.',
  },
];

// =============================================================================
// HELPERS
// =============================================================================

const STATUS_STYLES: Record<CorporateAccount['status'], string> = {
  active:     'text-[#524D66] border-[#D5CCFF]',
  onboarding: 'text-[#fbbf24]/60 border-[#fbbf24]/[0.20]',
  lapsed:     'text-[#f87171]/50 border-[#f87171]/[0.20]',
};

const STATUS_LABELS: Record<CorporateAccount['status'], string> = {
  active: 'Active', onboarding: 'Onboarding', lapsed: 'Lapsed',
};

// =============================================================================
// ACCOUNT CARD
// =============================================================================

function AccountCard({
  account, expanded, onToggle, userId, router,
}: {
  account: CorporateAccount;
  expanded: boolean;
  onToggle: () => void;
  userId: string;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-[#EBE5FF] rounded-xl overflow-hidden"
    >
      <button onClick={onToggle} className="w-full flex items-center gap-4 p-5 text-left hover:bg-[#F0ECFF] transition-colors">
        <div className="w-10 h-10 rounded-xl bg-[#FAF7F2] border border-[#EBE5FF] flex items-center justify-center flex-shrink-0">
          <Building2 size={16} className="text-[#6E6688]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[14px] font-semibold text-[#1A1035]">{account.company}</span>
            <span className={`text-[10px] font-medium uppercase tracking-[0.1em] px-2 py-0.5 rounded-full border ${STATUS_STYLES[account.status]}`}>
              {STATUS_LABELS[account.status]}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[#6E6688]">{account.sector}</span>
            <span className="text-[12px] text-[#6E6688]">{account.employees} staff</span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-[14px] font-semibold text-[#1A1035]">{account.monthlySpend}</p>
          <p className="text-[11px] text-[#6E6688]">per month</p>
        </div>
        <ChevronDown size={13} className={`text-[#6E6688] flex-shrink-0 transition-transform ml-2 ${expanded ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 border-t border-[#EBE5FF]">
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-[#6E6688] mb-2">Contact</p>
                  <p className="text-[13px] text-[#524D66]">{account.contact.name}</p>
                  <p className="text-[11px] text-[#6E6688]">{account.contact.title}</p>
                  <p className="text-[11px] text-[#6E6688] mt-0.5">{account.contact.email}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-[#6E6688] mb-2">Contract Renewal</p>
                  <p className="text-[13px] text-[#524D66]">{account.contractRenewal}</p>
                  <p className="text-[10px] uppercase tracking-[0.15em] text-[#6E6688] mt-3 mb-2">Treatments</p>
                  <div className="flex flex-wrap gap-1">
                    {account.treatments.map(t => (
                      <span key={t} className="text-[10px] px-2 py-0.5 bg-[#FAF9F5] border border-[#EBE5FF] rounded-md text-[#6E6688]">{t}</span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <p className="text-[10px] uppercase tracking-[0.15em] text-[#6E6688] mb-1.5">Notes</p>
                <p className="text-[12px] text-[#6E6688] leading-relaxed">{account.notes}</p>
              </div>
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={() => router.push(`/staff/chat?userId=${userId}&context=corporate+${account.company}`)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[12px] bg-[#8A6CFF] text-[#1A1035] font-medium hover:bg-[#8A6CFF]/10 transition-colors"
                >
                  <MessageSquare size={12} />
                  Ask Aria about this account
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function CorporatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId]     = useState<string | null>(urlUserId);
  const [profile, setProfile]   = useState<StaffProfile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const brandColor = profile?.brandColor || '#8A6CFF';

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);
      const profileRes = await getStaffProfile('clinic', uid);
      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setLoading(false);
    })();
  }, [urlUserId, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen pl-[240px] bg-[#FAF7F2] flex items-center justify-center">
        <motion.div
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-[#F0EDE5]"
        />
      </div>
    );
  }

  const active     = ACCOUNTS.filter(a => a.status === 'active').length;
  const onboarding = ACCOUNTS.filter(a => a.status === 'onboarding').length;
  const totalRevenue = ACCOUNTS
    .filter(a => a.status === 'active')
    .reduce((s, a) => s + parseInt(a.monthlySpend.replace(/[£,]/g, '') || '0'), 0);

  return (
    <div className="min-h-screen pl-[240px]">
      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Corporate" />

      <div className="min-h-screen flex">
        <main className="flex-1 px-8 py-10 min-w-0">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] mb-2">Revenue Intelligence</p>
            <h1 className="text-[26px] font-semibold tracking-tight text-[#1A1035]">Corporate Accounts</h1>
            <p className="text-[13px] text-[#6E6688] mt-1">
              {active} active accounts · {onboarding} onboarding — simulated data (Cliniko integration pending).
            </p>
          </motion.div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-8">
            {[
              { label: 'Active Accounts',  value: active,           icon: CheckCircle2 },
              { label: 'Onboarding',       value: onboarding,       icon: Clock },
              { label: 'Monthly Revenue',  value: `£${totalRevenue.toLocaleString()}`, icon: PoundSterling},
              { label: 'Total Accounts',   value: ACCOUNTS.length,  icon: Building2 },
            ].map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="bg-white border border-[#EBE5FF] rounded-xl p-5 flex flex-col gap-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.15em] text-[#6E6688] font-medium">{c.label}</span>
                  <c.icon size={14} className="text-[#6E6688]" />
                </div>
                <p className="text-[28px] font-semibold tracking-tight text-[#1A1035] leading-none">{c.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Account list */}
          <div className="space-y-3">
            {ACCOUNTS.map(account => (
              <AccountCard
                key={account.id}
                account={account}
                expanded={expanded === account.id}
                onToggle={() => setExpanded(prev => prev === account.id ? null : account.id)}
                userId={userId!}
                router={router}
              />
            ))}
          </div>
        </main>

        {/* Sidebar */}
        <aside className="w-[240px] flex-shrink-0 px-6 py-10 border-l border-[#EBE5FF]">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h3 className="text-[11px] uppercase tracking-[0.18em] text-[#6E6688] font-medium mb-3">Quick Actions</h3>
            <div className="space-y-1">
              {[
                { label: 'KPIs & Revenue',  href: `/staff/kpis?userId=${userId}` },
                { label: 'Patients',        href: `/staff/patients?userId=${userId}` },
                { label: 'Ask Aria',        href: `/staff/chat?userId=${userId}` },
              ].map(a => (
                <button
                  key={a.label}
                  onClick={() => router.push(a.href)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[12px] text-[#6E6688] hover:text-[#524D66] hover:bg-[#FAF9F5] transition-all text-left"
                >
                  <Users size={12} className="flex-shrink-0" />
                  {a.label}
                  <ChevronRight size={11} className="ml-auto opacity-40" />
                </button>
              ))}
            </div>
          </motion.div>
        </aside>
      </div>
    </div>
  );
}
