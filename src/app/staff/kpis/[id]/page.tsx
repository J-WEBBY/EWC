'use server';

import { redirect } from 'next/navigation';
import { getLatestTenantAndUser } from '@/lib/actions/staff-onboarding';
import { getStaffProfile } from '@/lib/actions/staff-onboarding';
import { getActiveUsers } from '@/lib/actions/compliance';
import { getAgendaHub } from '@/lib/actions/agenda-hub';
import { createSovereignClient } from '@/lib/supabase/service';
import AgendaHubClient from './client';
import type { StaffGoal } from '@/lib/actions/kpi-goals';

export default async function AgendaHubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId, tenantId } = await getLatestTenantAndUser();
  if (!userId) redirect('/login');

  const db = createSovereignClient();

  const [profileRes, agendaRes, hubData, usersData] = await Promise.all([
    getStaffProfile(tenantId || 'clinic', userId),
    db.from('staff_goals')
      .select(`*, owner:owner_id(first_name, last_name, role_id(name)), assigner:assigned_by(first_name, last_name)`)
      .eq('id', id)
      .single(),
    getAgendaHub(id),
    getActiveUsers(),
  ]);

  if (!profileRes.success || !profileRes.data || !agendaRes.data) redirect('/staff/kpis');

  const raw = agendaRes.data as Record<string, unknown>;
  const owner   = raw.owner   as { first_name?: string; last_name?: string; role_id?: { name?: string } } | null;
  const assigner = raw.assigner as { first_name?: string; last_name?: string } | null;

  const agenda: StaffGoal = {
    ...(raw as unknown as StaffGoal),
    owner_name:    owner   ? `${owner.first_name ?? ''} ${owner.last_name ?? ''}`.trim()   : undefined,
    owner_role:    owner?.role_id?.name ?? undefined,
    assigner_name: assigner ? `${assigner.first_name ?? ''} ${assigner.last_name ?? ''}`.trim() : undefined,
  };

  return (
    <AgendaHubClient
      profile={profileRes.data.profile}
      userId={userId}
      tenantId={tenantId ?? 'clinic'}
      agenda={agenda}
      initialEvidence={hubData?.evidence ?? []}
      initialTimeline={hubData?.timeline ?? []}
      users={usersData}
    />
  );
}
