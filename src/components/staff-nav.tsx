'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Bot,
  Mic,
  LogOut,
  BarChart2,
  ChevronLeft,
  Brain,
  BookOpen,
  Zap,
  Link2,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';

const NAV_EXPANDED = 240;
const NAV_COLLAPSED = 60;

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
  tenantId,
  brandColor,
  currentPath,
}: {
  profile: StaffProfile;
  userId: string;
  tenantId?: string;
  brandColor: string;
  currentPath: string;
}) {
  const router = useRouter();
  const c = brandColor || '#011440';
  const tid = tenantId || '';
  const tidParam = tid ? `&tenantId=${tid}` : '';
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load persisted collapse state and set CSS var on mount
  useEffect(() => {
    const stored = localStorage.getItem('ewc-nav-collapsed') === 'true';
    setCollapsed(stored);
    document.documentElement.style.setProperty('--nav-w', stored ? `${NAV_COLLAPSED}px` : `${NAV_EXPANDED}px`);
    setMounted(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('ewc-nav-collapsed', String(next));
    document.documentElement.style.setProperty('--nav-w', next ? `${NAV_COLLAPSED}px` : `${NAV_EXPANDED}px`);
  }

  const sections: NavSection[] = [
    {
      title: 'Operations',
      items: [
        { label: 'Dashboard',     href: `/staff/dashboard?userId=${userId}${tidParam}`,   icon: LayoutDashboard },
        { label: 'KPIs',          href: `/staff/kpis?userId=${userId}${tidParam}`,        icon: BarChart2 },
        { label: 'Compliance',    href: `/staff/compliance?userId=${userId}${tidParam}`,  icon: ShieldCheck },
        { label: 'Knowledge Base',href: `/staff/knowledge?userId=${userId}${tidParam}`,   icon: BookOpen },
      ],
    },
    {
      title: 'Intelligence',
      items: [
        { label: 'Receptionist',     href: `/staff/voice?userId=${userId}${tidParam}`,         icon: Mic },
        { label: 'Agents',           href: `/staff/agents?userId=${userId}${tidParam}`,        icon: Bot },
        { label: 'Automations',      href: `/staff/automations?userId=${userId}${tidParam}`,   icon: Zap },
        { label: 'Judgement Engine', href: `/staff/judgement?userId=${userId}${tidParam}`,     icon: Brain },
        { label: 'Integrations',     href: `/staff/integrations?userId=${userId}${tidParam}`,  icon: Link2 },
      ],
    },
  ];

  const bottomItems: NavItem[] = [
    { label: 'Settings', href: `/staff/settings?userId=${userId}${tidParam}`, icon: Settings },
  ];

  return (
    <motion.aside
      className="fixed top-0 left-0 h-screen flex flex-col z-50 select-none overflow-hidden"
      animate={{ width: collapsed ? NAV_COLLAPSED : NAV_EXPANDED }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      style={{ backgroundColor: '#011440', borderRight: '1px solid rgba(255,255,255,0.10)' }}
    >
      {/* Brand */}
      <div
        className="flex items-center h-[64px] flex-shrink-0 px-[18px]"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}
      >
        {/* Collapsed: show "E" monogram */}
        {collapsed ? (
          <div style={{
            width: 30, height: 30, borderRadius: 6, background: 'rgba(255,255,255,0.10)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em' }}>E</span>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            <p style={{ fontSize: 15, fontWeight: 800, color: '#ffffff', lineHeight: 1, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>EWC</p>
            <p style={{ fontSize: 9, color: 'rgba(216,166,0,0.85)', letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap', marginTop: 2 }}>Operational Intelligence</p>
          </motion.div>
        )}
      </div>

      {/* Nav sections */}
      <nav className="flex-1 overflow-y-auto py-4 scrollbar-none" style={{ padding: collapsed ? '16px 8px' : '16px 12px' }}>
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <AnimatePresence>
              {!collapsed && (
                <motion.p
                  className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.16em] whitespace-nowrap overflow-hidden px-3"
                  style={{ color: 'rgba(235,240,255,0.22)' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {section.title}
                </motion.p>
              )}
            </AnimatePresence>
            {section.items.map((item) => (
              <NavButton
                key={item.label}
                item={item}
                isActive={currentPath === item.label || currentPath === item.href.split('?')[0]}
                brandColor={c}
                collapsed={collapsed}
                onClick={() => router.push(item.href)}
                badge={undefined}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div style={{ padding: collapsed ? '0 8px 12px' : '0 12px 12px', borderTop: '1px solid rgba(255,255,255,0.10)' }}>
        <div className="pt-3">
          {bottomItems.map((item) => (
            <NavButton
              key={item.label}
              item={item}
              isActive={currentPath === item.label}
              brandColor={c}
              collapsed={collapsed}
              onClick={() => router.push(item.href)}
            />
          ))}
        </div>

        {/* User profile */}
        <div
          className="mt-2 flex items-center rounded-xl overflow-hidden"
          style={{
            backgroundColor: 'rgba(255,255,255,0.05)',
            padding: collapsed ? '10px 0' : '10px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: collapsed ? 0 : 12,
          }}
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold flex-shrink-0"
            style={{ backgroundColor: `${c}18`, color: c }}
          >
            {profile.firstName.charAt(0)}{profile.lastName.charAt(0)}
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                className="flex-1 min-w-0 flex items-center gap-1"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium truncate whitespace-nowrap" style={{ color: 'rgba(235,240,255,0.80)' }}>
                    {profile.firstName} {profile.lastName}
                  </p>
                  <p className="text-[10px] truncate whitespace-nowrap" style={{ color: 'rgba(235,240,255,0.30)' }}>
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className="w-full mt-2 flex items-center justify-center py-2 rounded-xl transition-all"
          style={{ color: 'rgba(235,240,255,0.18)' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(235,240,255,0.50)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.05)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(235,240,255,0.18)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <motion.div
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            <ChevronLeft size={14} />
          </motion.div>
        </button>
      </div>

    </motion.aside>
  );
}

function NavButton({
  item,
  isActive,
  brandColor,
  collapsed,
  onClick,
  badge,
}: {
  item: NavItem;
  isActive: boolean;
  brandColor: string;
  collapsed: boolean;
  onClick: () => void;
  badge?: number;
}) {
  const Icon = item.icon;
  const [tooltip, setTooltip] = useState(false);

  return (
    <div className="relative mb-0.5">
      <button
        onClick={onClick}
        className="w-full flex items-center rounded-xl transition-all text-left"
        style={{
          color: isActive ? '#80B1FF' : 'rgba(235,240,255,0.38)',
          backgroundColor: isActive ? 'rgba(0,88,230,0.10)' : 'transparent',
          fontWeight: isActive ? 500 : 400,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '9px 0' : '8px 10px',
          gap: collapsed ? 0 : 12,
          borderLeft: !collapsed && isActive ? `2px solid ${brandColor}` : '2px solid transparent',
          fontSize: '13px',
        }}
        onMouseEnter={e => {
          if (!isActive) {
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(235,240,255,0.70)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(0,88,230,0.05)';
          }
          if (collapsed) setTooltip(true);
        }}
        onMouseLeave={e => {
          if (!isActive) {
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(235,240,255,0.38)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }
          setTooltip(false);
        }}
      >
        <div className="relative flex-shrink-0">
          <Icon size={collapsed ? 17 : 15} />
          {badge != null && badge > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full text-[8px] font-bold leading-none"
              style={{
                minWidth: 14, height: 14, padding: '0 3px',
                backgroundColor: '#DC2626', color: '#fff',
              }}
            >
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.span
              className="whitespace-nowrap overflow-hidden flex-1"
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Tooltip (collapsed only) */}
      <AnimatePresence>
        {collapsed && tooltip && (
          <motion.div
            className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 rounded-lg text-[12px] whitespace-nowrap z-[60] pointer-events-none"
            style={{
              backgroundColor: '#181D23',
              color: '#EBF0FF',
              border: '1px solid rgba(0,88,230,0.20)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            }}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.12 }}
          >
            {item.label}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
