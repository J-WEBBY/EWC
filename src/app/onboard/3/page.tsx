'use server';

import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/actions/platform/activate';
import { getExistingTeam } from '@/lib/actions/platform/onboard';
import TeamOnboardClient from './client';

export default async function OnboardPhase3() {
  const session = await getTenantSession();
  if (!session) redirect('/activate');

  const existingTeam = await getExistingTeam();

  return (
    <TeamOnboardClient
      sessionId={session.sessionId}
      tenantName={session.tenantName}
      completedPhases={session.completedPhases}
      existingTeam={existingTeam}
    />
  );
}
