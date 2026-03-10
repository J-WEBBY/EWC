'use server';

import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/actions/platform/activate';
import AgentOnboardClient from './client';

export default async function OnboardPhase2() {
  const session = await getTenantSession();
  if (!session) redirect('/activate');

  return (
    <AgentOnboardClient
      sessionId={session.sessionId}
      tenantName={session.tenantName}
      completedPhases={session.completedPhases}
    />
  );
}
