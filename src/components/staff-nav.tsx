'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Bot, Mic, LogOut, BarChart2,
  ChevronLeft, Brain, BookOpen, Zap, Link2, Settings, ShieldCheck, Users2, Users,
} from 'lucide-react';
import type { StaffProfile } from '@/lib/actions/staff-onboarding';

const NAV_EXPANDED  = 240;
const NAV_COLLAPSED = 60;

// ── Nav colour system ─────────────────────────────────────────────────────────
const BG_TOP    = '#0F1E5C';   // rich navy top
const BG_BTM    = '#090F30';   // deep midnight bottom
const DIVIDER   = 'rgba(255,255,255,0.06)';
const SECTION   = 'rgba(255,255,255,0.18)';
const INACTIVE  = 'rgba(255,255,255,0.36)';
const HOVER_BG  = 'rgba(255,255,255,0.05)';
const ACTIVE_BG = 'rgba(91,138,255,0.14)';
const ACCENT    = '#6B96FF';   // lighter blue — readable on dark bg
const ACTIVE_TXT = 'rgba(255,255,255,0.92)';

type NavItem    = { label: string; href: string; icon: React.ElementType };
type NavSection = { title: string; items: NavItem[] };

export function StaffNav({
  profile, userId, tenantId, brandColor, currentPath,
}: {
  profile: StaffProfile;
  userId: string;
  tenantId?: string;
  brandColor: string;
  currentPath: string;
}) {
  const router   = useRouter();
  const tid      = tenantId || '';
  const p        = (path: string) => `${path}?userId=${userId}${tid ? `&tenantId=${tid}` : ''}`;
  const [collapsed, setCollapsed] = useState(false);
  const [mounted,   setMounted]   = useState(false);

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
        { label: 'Dashboard',     href: p('/staff/dashboard'),   icon: LayoutDashboard },
        { label: 'Patients',      href: p('/staff/patients'),    icon: Users },
        { label: 'Staff KPIs',    href: p('/staff/kpis'),        icon: BarChart2 },
        { label: 'Teams',         href: p('/staff/teams'),       icon: Users2 },
        { label: 'Compliance',    href: p('/staff/compliance'),  icon: ShieldCheck },
        { label: 'Knowledge Base',href: p('/staff/knowledge'),   icon: BookOpen },
      ],
    },
    {
      title: 'Intelligence',
      items: [
        { label: 'Receptionist', href: p('/staff/voice'),        icon: Mic },
        { label: 'Agents',       href: p('/staff/agents'),       icon: Bot },
        { label: 'Automations',  href: p('/staff/automations'),  icon: Zap },
        { label: 'Guardrails',   href: p('/staff/judgement'),    icon: Brain },
        { label: 'Integrations', href: p('/staff/integrations'), icon: Link2 },
      ],
    },
  ];

  const initials = `${profile.firstName.charAt(0)}${profile.lastName.charAt(0)}`;

  return (
    <motion.aside
      className="fixed top-0 left-0 h-screen flex flex-col z-50 select-none overflow-hidden"
      animate={{ width: collapsed ? NAV_COLLAPSED : NAV_EXPANDED }}
      transition={{ type: 'spring', stiffness: 340, damping: 34 }}
      style={{
        background: `linear-gradient(180deg, ${BG_TOP} 0%, ${BG_BTM} 100%)`,
        borderRight: `1px solid ${DIVIDER}`,
      }}
    >

      {/* ── Brand text ── */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{
              padding: '18px 18px 14px',
              borderBottom: `1px solid ${DIVIDER}`,
              flexShrink: 0,
            }}
          >
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em', color: 'rgba(255,255,255,0.88)', lineHeight: 1.2 }}>
              Edgbaston Wellness
            </p>
            <p style={{ fontSize: 8, color: 'rgba(107,150,255,0.65)', letterSpacing: '0.20em', textTransform: 'uppercase', marginTop: 3 }}>
              Operational Intelligence
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Nav ── */}
      <nav
        className="flex-1 overflow-y-auto scrollbar-none"
        style={{ padding: collapsed ? '12px 8px' : '12px 10px' }}
      >
        {sections.map((section, si) => (
          <div key={section.title} style={{ marginBottom: si < sections.length - 1 ? 6 : 0 }}>

            <AnimatePresence>
              {!collapsed && (
                <motion.p
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.24em',
                    textTransform: 'uppercase', color: SECTION,
                    padding: '4px 10px 6px', whiteSpace: 'nowrap',
                  }}
                >
                  {section.title}
                </motion.p>
              )}
            </AnimatePresence>

            {section.items.map(item => {
              const isActive = currentPath === item.label || currentPath === item.href.split('?')[0];
              return (
                <NavBtn
                  key={item.label}
                  item={item}
                  isActive={isActive}
                  collapsed={collapsed}
                  onClick={() => router.push(item.href)}
                />
              );
            })}

            {!collapsed && si < sections.length - 1 && (
              <div style={{ height: 1, background: DIVIDER, margin: '8px 10px 10px' }} />
            )}
          </div>
        ))}
      </nav>

      {/* ── Bottom ── */}
      <div style={{ borderTop: `1px solid ${DIVIDER}`, padding: collapsed ? '12px 8px 10px' : '12px 10px 10px' }}>

        {/* Settings */}
        <NavBtn
          item={{ label: 'Settings', href: p('/staff/settings'), icon: Settings }}
          isActive={currentPath === 'Settings'}
          collapsed={collapsed}
          onClick={() => router.push(p('/staff/settings'))}
        />

        {/* User row */}
        <div
          className="flex items-center mt-2 rounded-xl"
          style={{
            padding: collapsed ? '9px 0' : '9px 10px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: collapsed ? 0 : 10,
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${DIVIDER}`,
          }}
        >
          {/* Avatar */}
          <div style={{
            width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(107,150,255,0.18)',
            border: '1px solid rgba(107,150,255,0.30)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: ACCENT, letterSpacing: '-0.01em' }}>{initials}</span>
          </div>

          <AnimatePresence>
            {!collapsed && (
              <motion.div
                className="flex-1 min-w-0 flex items-center justify-between"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <div className="min-w-0">
                  <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.80)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 120 }}>
                    {profile.firstName} {profile.lastName}
                  </p>
                  <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap', marginTop: 1.5 }}>
                    {profile.jobTitle || 'Staff'}
                  </p>
                </div>
                <button
                  onClick={() => router.push('/login')}
                  style={{
                    flexShrink: 0, background: 'none', border: 'none',
                    cursor: 'pointer', color: 'rgba(255,255,255,0.22)',
                    padding: '3px', borderRadius: 6, display: 'flex',
                    transition: 'color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.22)')}
                  title="Sign out"
                >
                  <LogOut size={12} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={toggle}
          className="w-full mt-2 flex items-center justify-center rounded-xl transition-all"
          style={{ height: 28, color: 'rgba(255,255,255,0.16)', background: 'none', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)'; (e.currentTarget as HTMLButtonElement).style.background = HOVER_BG; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.16)'; (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <motion.div animate={{ rotate: collapsed ? 180 : 0 }} transition={{ type: 'spring', stiffness: 300, damping: 25 }}>
            <ChevronLeft size={13} />
          </motion.div>
        </button>
      </div>

    </motion.aside>
  );
}

// ── NavBtn ────────────────────────────────────────────────────────────────────
function NavBtn({
  item, isActive, collapsed, onClick, badge,
}: {
  item: NavItem; isActive: boolean; collapsed: boolean;
  onClick: () => void; badge?: number;
}) {
  const Icon = item.icon;
  const [tip, setTip] = useState(false);

  return (
    <div className="relative" style={{ marginBottom: 1 }}>
      <button
        onClick={onClick}
        className="w-full flex items-center rounded-xl transition-all text-left"
        style={{
          padding: collapsed ? '9px 0' : '7.5px 10px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          gap: collapsed ? 0 : 10,
          background: isActive ? ACTIVE_BG : 'transparent',
          color: isActive ? ACTIVE_TXT : INACTIVE,
          fontWeight: isActive ? 500 : 400,
          fontSize: 12.5,
          borderLeft: !collapsed && isActive ? `2px solid ${ACCENT}` : '2px solid transparent',
          border: 'none',
          cursor: 'pointer',
        }}
        onMouseEnter={e => {
          if (!isActive) {
            (e.currentTarget as HTMLButtonElement).style.background = HOVER_BG;
            (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.62)';
          }
          if (collapsed) setTip(true);
        }}
        onMouseLeave={e => {
          if (!isActive) {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = INACTIVE;
          }
          setTip(false);
        }}
      >
        <div className="relative flex-shrink-0" style={{ color: isActive ? ACCENT : 'inherit' }}>
          <Icon size={collapsed ? 16 : 14} />
          {badge != null && badge > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full text-[8px] font-bold"
              style={{ minWidth: 14, height: 14, padding: '0 3px', background: '#DC2626', color: '#fff' }}
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

      {/* Tooltip */}
      <AnimatePresence>
        {collapsed && tip && (
          <motion.div
            className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 rounded-lg text-[11px] whitespace-nowrap z-[60] pointer-events-none"
            style={{
              background: BG_TOP, color: 'rgba(255,255,255,0.85)',
              border: `1px solid rgba(107,150,255,0.20)`,
              boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
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
