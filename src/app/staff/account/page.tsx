'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  Wifi, BookOpen, Shield, Phone, Building2,
  Package, Settings, Loader2, ArrowRight,
  CheckCircle2, Clock, type LucideIcon,
} from 'lucide-react';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import { getClinikoStatus } from '@/lib/actions/cliniko';
import { StaffNav } from '@/components/staff-nav';

// =============================================================================
// TYPES
// =============================================================================

interface AccountSection {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  status: 'active' | 'connected' | 'coming_soon' | 'configure';
  statusLabel?: string;
  badge?: string;
}

// =============================================================================
// SECTION CARD
// =============================================================================

function SectionCard({
  section, userId, brandColor,
}: {
  section: AccountSection;
  userId: string;
  brandColor: string;
}) {
  const router = useRouter();
  const Icon = section.icon;

  const statusConfig = {
    active:      { color: '#4ade80', label: section.statusLabel || 'Active' },
    connected:   { color: '#4ade80', label: section.statusLabel || 'Connected' },
    coming_soon: { color: '#96989B', label: 'Coming Soon' },
    configure:   { color: '#f59e0b', label: section.statusLabel || 'Configure' },
  }[section.status];

  const isAvailable = section.status !== 'coming_soon';

  return (
    <motion.div
      whileHover={isAvailable ? { y: -2 } : undefined}
      whileTap={isAvailable ? { scale: 0.99 } : undefined}
      onClick={isAvailable ? () => router.push(`${section.href}?userId=${userId}`) : undefined}
      className={`bg-white border border-[#D4E2FF] rounded-2xl p-6 flex flex-col gap-4 transition-all ${
        isAvailable
          ? 'cursor-pointer hover:bg-[#F8FAFF] hover:border-white/[0.12]'
          : 'opacity-50 cursor-default'
      }`}
    >
      {/* Icon + status */}
      <div className="flex items-start justify-between">
        <div className="w-11 h-11 rounded-xl bg-[#FAF9F5] flex items-center justify-center flex-shrink-0">
          <Icon size={20} className="text-[#3D4451]" />
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: statusConfig.color }} />
          <span className="text-[10px] uppercase tracking-wider" style={{ color: statusConfig.color }}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <h3 className="text-[14px] font-medium text-[#181D23]">{section.title}</h3>
          {section.badge && (
            <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#FAF9F5] text-[#5A6475]">
              {section.badge}
            </span>
          )}
        </div>
        <p className="text-[11px] text-[#5A6475] leading-relaxed">{section.description}</p>
      </div>

      {/* Footer */}
      {isAvailable && (
        <div className="flex items-center gap-1 text-[11px] text-[#5A6475] hover:text-[#3D4451] transition-colors">
          <span>Open</span>
          <ArrowRight size={11} />
        </div>
      )}
    </motion.div>
  );
}

// =============================================================================
// MAIN PAGE
// =============================================================================

export default function AccountPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlUserId = searchParams.get('userId');

  const [userId, setUserId] = useState<string | null>(urlUserId);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [clinikoConnected, setClinikoConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  const brandColor = profile?.brandColor || '#0058E6';

  useEffect(() => {
    (async () => {
      let uid = urlUserId;
      if (!uid) {
        const fb = await getCurrentUser();
        if (fb.success && fb.userId) uid = fb.userId;
      }
      if (!uid) { router.push('/login'); return; }
      setUserId(uid);

      const [profileRes, clinikoRes] = await Promise.all([
        getStaffProfile('clinic', uid),
        getClinikoStatus(),
      ]);

      if (profileRes.success && profileRes.data) setProfile(profileRes.data.profile);
      setClinikoConnected(clinikoRes.isConnected);
      setLoading(false);
    })();
  }, [urlUserId, router]);

  if (loading || !profile) {
    return (
      <div className="min-h-screen nav-offset bg-[#F8FAFF] flex items-center justify-center">
        <motion.div animate={{ opacity: [0.2, 0.5, 0.2] }} transition={{ duration: 1.8, repeat: Infinity }}
          className="w-1.5 h-1.5 rounded-full bg-[#F0EDE5]" />
      </div>
    );
  }

  const sections: AccountSection[] = [
    {
      title: 'Integrations',
      description: 'Connect Cliniko, Vapi.ai, Twilio, Stripe, and n8n to power the EWC intelligence platform',
      href: '/staff/integrations',
      icon: Wifi,
      status: clinikoConnected ? 'connected' : 'configure',
      statusLabel: clinikoConnected ? 'Cliniko Connected' : 'Cliniko Pending',
    },
    {
      title: 'Knowledge Base',
      description: 'Upload clinic protocols, treatment guides, CQC policies, and staff handbooks for AI reference',
      href: '/staff/knowledge-base',
      icon: BookOpen,
      status: 'active',
      badge: 'Week 1',
    },
    {
      title: 'Compliance',
      description: 'CQC 5-key-question tracker, equipment register, staff certifications, incident log, and inspection pack',
      href: '/staff/compliance',
      icon: Shield,
      status: 'active',
      badge: 'Week 1',
    },
    {
      title: 'Voice',
      description: 'Vapi.ai voice receptionist — inbound call handling, appointment booking, missed call recovery',
      href: '/staff/voice',
      icon: Phone,
      status: 'coming_soon',
      badge: 'Week 2',
    },
    {
      title: 'Corporate',
      description: 'Corporate client accounts, referral programme management, B2B invoicing, and partnership tracking',
      href: '/staff/corporate',
      icon: Building2,
      status: 'active',
      badge: 'Week 1',
    },
    {
      title: 'Inventory',
      description: 'Treatment supply tracking, equipment register, reorder alerts, and expiry date monitoring',
      href: '/staff/inventory',
      icon: Package,
      status: 'active',
      badge: 'Week 1',
    },
    {
      title: 'Settings',
      description: 'Clinic configuration, user accounts, branding, notification preferences, and API keys',
      href: '/staff/settings',
      icon: Settings,
      status: 'active',
    },
  ];

  return (
    <div className="min-h-screen nav-offset">
      {/* Neural grid background */}
      <svg className="fixed inset-0 w-full h-full opacity-[0.06] pointer-events-none z-0">
        <defs>
          <pattern id="acc-grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke={brandColor} strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#acc-grid)" />
      </svg>

      <StaffNav profile={profile} userId={userId!} brandColor={brandColor} currentPath="Account" />

      <div className="relative z-10 px-8 py-10">
        <div className="max-w-[1200px] mx-auto">

          {/* Header */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#5A6475] mb-2">Administration</p>
            <h1 className="text-[26px] font-semibold tracking-tight text-[#181D23]">Account</h1>
            <p className="text-[13px] text-[#5A6475] mt-1">{profile.companyName} · Configuration, integrations & settings</p>
          </motion.div>

          {/* Summary strip */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
            className="flex items-center gap-6 mb-8 px-5 py-3 bg-[#F0ECFF] border border-[#D4E2FF] rounded-xl">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={13} className="text-[#4ade80]" />
              <span className="text-[12px] text-[#5A6475]">
                {clinikoConnected ? 'Cliniko connected' : 'Cliniko not connected'}
              </span>
            </div>
            <div className="w-px h-4 bg-[#FAF9F5]" />
            <div className="flex items-center gap-2">
              <Clock size={13} className="text-[#5A6475]" />
              <span className="text-[12px] text-[#5A6475]">Week 2: Vapi, Twilio, Stripe, n8n</span>
            </div>
            <div className="ml-auto">
              <button
                onClick={() => router.push(`/staff/integrations?userId=${userId}`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] bg-[#0058E6] text-[#181D23] font-medium hover:bg-[#0058E6]/10 transition-colors"
              >
                <Wifi size={11} />
                Manage Integrations
              </button>
            </div>
          </motion.div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sections.map((section, i) => (
              <motion.div key={section.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.05 }}>
                <SectionCard section={section} userId={userId!} brandColor={brandColor} />
              </motion.div>
            ))}
          </div>

          {/* Footer note */}
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}
            className="text-center text-[11px] text-[#96989B] mt-12">
            {profile.companyName} · EWC Intelligence Platform · All configuration changes are logged to audit trail
          </motion.p>
        </div>
      </div>
    </div>
  );
}
