'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { StaffNav } from '@/components/staff-nav';
import OrbLoader from '@/components/orb-loader';
import {
  getStaffProfile, getCurrentUser, type StaffProfile,
} from '@/lib/actions/staff-onboarding';
import {
  getComplianceDashboard, getHRRecords,
  getTrainingMatrix,
  getEquipmentList,
  getMedicines,
  getCQCAudit,
  getGovernanceLog, getCalendarTasks,
  getActiveUsers,
  type ActiveUser, type HRRecord, type TrainingMatrixRow,
  type EquipmentItem, type MedicineItem, type CQCAnswer, type GovernanceEntry,
  type CalendarTask, type ComplianceDashboard,
} from '@/lib/actions/compliance';

import DashboardTab from './tabs/dashboard-tab';
import HRTrackerTab from './tabs/hr-tracker-tab';
import TrainingMatrixTab from './tabs/training-matrix-tab';
import EquipmentTab from './tabs/equipment-tab';
import MedicinesTab from './tabs/medicines-tab';
import CQCTab from './tabs/cqc-tab';
import GovernanceTab from './tabs/governance-tab';
import CalendarTab from './tabs/calendar-tab';

// ─── Design tokens ────────────────────────────────────────────────────────────
const BG     = '#F8FAFF';
const NAVY   = '#181D23';
const MUTED  = '#96989B';
const BORDER = '#D4E2FF';
const BLUE   = '#0058E6';
const RED    = '#DC2626';
const ORANGE = '#EA580C';

type Tab = 'dashboard' | 'hr' | 'training' | 'equipment' | 'medicines' | 'cqc' | 'governance' | 'calendar';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'dashboard',  label: 'Overview' },
  { key: 'hr',         label: 'HR Tracker' },
  { key: 'training',   label: 'Training' },
  { key: 'equipment',  label: 'Equipment' },
  { key: 'medicines',  label: 'Medicines' },
  { key: 'cqc',        label: 'CQC Audit' },
  { key: 'governance', label: 'Governance' },
  { key: 'calendar',   label: 'Calendar' },
];

function getTabBadge(
  key: Tab,
  data: {
    hrRecords: HRRecord[];
    matrix: TrainingMatrixRow[];
    equipment: EquipmentItem[];
    medicines: MedicineItem[];
    cqcAnswers: CQCAnswer[];
    govLog: GovernanceEntry[];
    calTasks: CalendarTask[];
    dashboard: ComplianceDashboard | null;
  }
): number | null {
  switch (key) {
    case 'hr':
      return (data.dashboard?.dbs_issues ?? 0) + (data.dashboard?.rtw_issues ?? 0) + (data.dashboard?.appraisals_overdue ?? 0) || null;
    case 'training':
      return data.dashboard?.training_gaps ?? null;
    case 'equipment':
      return data.dashboard?.equipment_overdue ?? null;
    case 'medicines':
      return data.dashboard?.medicine_expiring_soon ?? null;
    case 'governance':
      return data.dashboard?.governance_overdue ?? null;
    case 'calendar':
      return data.dashboard?.calendar_overdue ?? null;
    default:
      return null;
  }
}

export default function CompliancePage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialTab = (searchParams.get('tab') as Tab) ?? 'dashboard';
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  const [profile, setProfile] = useState<StaffProfile | null>(null);

  const [dashboard, setDashboard]     = useState<ComplianceDashboard | null>(null);
  const [hrRecords, setHrRecords]     = useState<HRRecord[]>([]);
  const [matrix, setMatrix]           = useState<TrainingMatrixRow[]>([]);
  const [equipment, setEquipment]     = useState<EquipmentItem[]>([]);
  const [medicines, setMedicines]     = useState<MedicineItem[]>([]);
  const [cqcAnswers, setCqcAnswers]   = useState<CQCAnswer[]>([]);
  const [govLog, setGovLog]           = useState<GovernanceEntry[]>([]);
  const [calTasks, setCalTasks]       = useState<CalendarTask[]>([]);
  const [users, setUsers]             = useState<ActiveUser[]>([]);

  const loadAll = useCallback(async () => {
    const [cu, dashRes, hrRes, matRes, eqRes, medRes, cqcRes, govRes, calRes, usersRes] = await Promise.all([
      getCurrentUser(),
      getComplianceDashboard(),
      getHRRecords(),
      getTrainingMatrix(),
      getEquipmentList(),
      getMedicines(),
      getCQCAudit(),
      getGovernanceLog(),
      getCalendarTasks(),
      getActiveUsers(),
    ]);

    const uid = cu?.userId ?? '';
    setCurrentUserId(uid);

    if (uid) {
      const p = await getStaffProfile('clinic', uid);
      if (p.success && p.data) setProfile(p.data.profile);
    }

    setDashboard(dashRes);
    setHrRecords(hrRes);
    setMatrix(matRes);
    setEquipment(eqRes);
    setMedicines(medRes);
    setCqcAnswers(cqcRes);
    setGovLog(govRes);
    setCalTasks(calRes);
    setUsers(usersRes);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleNavigate = (t: string) => {
    setTab(t as Tab);
    router.push(`/staff/compliance?tab=${t}&userId=${currentUserId}`);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadAll();
  };

  const handleStartMeeting = () => {
    router.push('/staff/teams');
  };

  if (loading) return <OrbLoader />;

  const badgeData = { hrRecords, matrix, equipment, medicines, cqcAnswers, govLog, calTasks, dashboard };

  return (
    <div className="min-h-screen" style={{ background: BG }}>
      {profile && (
        <StaffNav
          profile={profile}
          userId={currentUserId}
          brandColor={profile.brandColor || BLUE}
          currentPath="Compliance"
        />
      )}

      <div style={{ paddingLeft: 'var(--nav-w, 240px)' }}>
        <div className="max-w-[1400px] mx-auto px-8 py-8">

          {/* Page header */}
          <div className="flex items-center justify-between mb-6" style={{ borderBottom: `1px solid ${BORDER}`, paddingBottom: 20 }}>
            <div>
              <p className="mb-1" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.26em', fontWeight: 700, color: MUTED }}>
                Edgbaston Wellness Clinic
              </p>
              <h1 style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-0.04em', color: NAVY, lineHeight: 1 }}>
                Compliance
              </h1>
              <p className="mt-1" style={{ fontSize: 11, color: MUTED }}>
                CQC-ready compliance management
              </p>
            </div>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-medium transition-all"
              style={{
                border: `1px solid ${BORDER}`,
                color: MUTED,
                background: 'transparent',
                opacity: refreshing ? 0.6 : 1,
              }}
            >
              <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-8 overflow-x-auto" style={{ borderBottom: `1px solid ${BORDER}` }}>
            {TABS.map(t => {
              const badge = getTabBadge(t.key, badgeData);
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => handleNavigate(t.key)}
                  className="flex items-center gap-1.5 pb-3 px-1 text-[11px] transition-all whitespace-nowrap"
                  style={{
                    color: active ? NAVY : MUTED,
                    fontWeight: active ? 700 : 500,
                    background: 'none',
                    border: 'none',
                    borderBottom: active ? `2px solid ${BLUE}` : '2px solid transparent',
                    marginBottom: -1,
                  }}
                >
                  {t.label}
                  {badge !== null && badge > 0 && (
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold"
                      style={{ background: `${RED}14`, color: RED }}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {tab === 'dashboard' && dashboard && (
                <DashboardTab
                  dash={dashboard}
                  onNavigate={handleNavigate}
                  onStartMeeting={handleStartMeeting}
                />
              )}
              {tab === 'hr' && (
                <HRTrackerTab
                  records={hrRecords}
                  users={users}
                  currentUserId={currentUserId}
                  onRefresh={loadAll}
                />
              )}
              {tab === 'training' && (
                <TrainingMatrixTab
                  matrix={matrix}
                  currentUserId={currentUserId}
                  onRefresh={loadAll}
                />
              )}
              {tab === 'equipment' && (
                <EquipmentTab
                  equipment={equipment}
                  users={users}
                  currentUserId={currentUserId}
                  onRefresh={loadAll}
                />
              )}
              {tab === 'medicines' && (
                <MedicinesTab
                  medicines={medicines}
                  users={users}
                  currentUserId={currentUserId}
                  onRefresh={loadAll}
                />
              )}
              {tab === 'cqc' && (
                <CQCTab
                  questions={cqcAnswers}
                  users={users}
                  currentUserId={currentUserId}
                  onRefresh={loadAll}
                />
              )}
              {tab === 'governance' && (
                <GovernanceTab
                  log={govLog}
                  users={users}
                  currentUserId={currentUserId}
                  onRefresh={loadAll}
                />
              )}
              {tab === 'calendar' && (
                <CalendarTab
                  tasks={calTasks}
                  users={users}
                  currentUserId={currentUserId}
                  onRefresh={loadAll}
                />
              )}
            </motion.div>
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
