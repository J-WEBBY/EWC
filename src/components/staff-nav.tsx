'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
  Activity,
  Users,
  Link2,
  Bot,
  Mic,
  Zap,
  UserCircle,
  LogOut,
  BarChart2,
  Shield,
  FileText,
} from 'lucide-react';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

type NavSection = {
  title: string;
  items: NavItem[];
};

export function StaffNav({
  profile,
  userId,
  brandColor,
  currentPath,
}: {
  profile: StaffProfile;
  userId: string;
  brandColor: string;
  currentPath: string;
}) {
  const router = useRouter();
  const c = brandColor || '#8A6CFF';

  const sections: NavSection[] = [
    {
      title: 'Operations',
      items: [
        { label: 'Dashboard', href: `/staff/dashboard?userId=${userId}`, icon: LayoutDashboard },
        { label: 'KPIs',      href: `/staff/kpis?userId=${userId}`,      icon: BarChart2 },
        { label: 'Signals',   href: `/staff/signals?userId=${userId}`,   icon: Activity },
        { label: 'Patients',  href: `/staff/patients?userId=${userId}`,  icon: Users },
        { label: 'Bridge',    href: `/staff/bridge?userId=${userId}`,    icon: Link2 },
      ],
    },
    {
      title: 'Intelligence',
      items: [
        { label: 'Agents',       href: `/staff/agents?userId=${userId}`,      icon: Bot },
        { label: 'Voice',        href: `/staff/voice?userId=${userId}`,       icon: Mic },
        { label: 'Automations',  href: `/staff/automations?userId=${userId}`, icon: Zap },
      ],
    },
    {
      title: 'Governance',
      items: [
        { label: 'Compliance', href: `/staff/compliance?userId=${userId}`, icon: Shield },
        { label: 'Reports',    href: `/staff/reports?userId=${userId}`,    icon: FileText },
      ],
    },
  ];

  const bottomItems: NavItem[] = [
    { label: 'Account', href: `/staff/account?userId=${userId}`, icon: UserCircle },
  ];

  return (
    <aside
      className="fixed top-0 left-0 h-screen w-[240px] flex flex-col z-50 select-none"
      style={{ backgroundColor: '#080517', borderRight: '1px solid rgba(138,108,255,0.10)' }}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 h-[64px] flex-shrink-0" style={{ borderBottom: '1px solid rgba(138,108,255,0.08)' }}>
        <motion.div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: c, boxShadow: `0 0 8px ${c}80` }}
          animate={{ opacity: [0.5, 1, 0.5], scale: [0.85, 1.15, 0.85] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div>
          <p className="text-[14px] font-semibold leading-tight" style={{ color: '#EBF0FF' }}>EWC</p>
          <p className="text-[10px] leading-tight" style={{ color: 'rgba(235,240,255,0.30)' }}>Operational Intelligence</p>
        </div>
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 scrollbar-none">
        {sections.map((section) => (
          <div key={section.title} className="mb-5">
            <p
              className="px-3 mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em]"
              style={{ color: 'rgba(235,240,255,0.22)' }}
            >
              {section.title}
            </p>
            {section.items.map((item) => (
              <NavButton
                key={item.label}
                item={item}
                isActive={currentPath === item.label}
                brandColor={c}
                onClick={() => router.push(item.href)}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom items */}
      <div className="px-3 pb-3" style={{ borderTop: '1px solid rgba(138,108,255,0.08)' }}>
        <div className="pt-3">
          {bottomItems.map((item) => (
            <NavButton
              key={item.label}
              item={item}
              isActive={currentPath === item.label}
              brandColor={c}
              onClick={() => router.push(item.href)}
            />
          ))}
        </div>

        {/* User profile */}
        <div
          className="mt-2 flex items-center gap-3 px-3 py-2.5 rounded-xl"
          style={{ backgroundColor: 'rgba(138,108,255,0.06)' }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
            style={{ backgroundColor: `${c}22`, color: c }}
          >
            {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium truncate" style={{ color: 'rgba(235,240,255,0.80)' }}>
              {profile.firstName} {profile.lastName}
            </p>
            <p className="text-[10px] truncate" style={{ color: 'rgba(235,240,255,0.30)' }}>
              {profile.jobTitle || 'Staff'}
            </p>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="flex-shrink-0 p-1 rounded-lg transition-colors"
            style={{ color: 'rgba(235,240,255,0.25)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(235,240,255,0.55)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(235,240,255,0.25)')}
            title="Sign out"
          >
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavButton({
  item,
  isActive,
  brandColor,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  brandColor: string;
  onClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl mb-0.5 text-[13px] transition-all text-left"
      style={{
        color: isActive ? '#A98DFF' : 'rgba(235,240,255,0.38)',
        backgroundColor: isActive ? `rgba(138,108,255,0.10)` : 'transparent',
        fontWeight: isActive ? 500 : 400,
        borderLeft: isActive ? `2px solid ${brandColor}` : '2px solid transparent',
        paddingLeft: isActive ? '10px' : '10px',
      }}
      onMouseEnter={e => {
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(235,240,255,0.70)';
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(138,108,255,0.05)';
      }}
      onMouseLeave={e => {
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.color = 'rgba(235,240,255,0.38)';
        if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
      }}
    >
      <Icon size={15} className="flex-shrink-0" />
      <span>{item.label}</span>
    </button>
  );
}
