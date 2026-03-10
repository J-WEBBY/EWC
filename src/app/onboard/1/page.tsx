'use server';

import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/actions/platform/activate';
import Phase1Client from './client';

export default async function OnboardPhase1() {
  const session = await getTenantSession();
  if (!session) redirect('/activate');

  return (
    <Phase1Client
      sessionId={session.sessionId}
      tenantName={session.tenantName}
      profile={session.profile}
      completedPhases={session.completedPhases}
    />
  );
}
