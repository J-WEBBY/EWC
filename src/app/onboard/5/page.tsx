'use server';

import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/actions/platform/activate';
import GoLiveClient from './client';

export default async function OnboardPhase5() {
  const session = await getTenantSession();
  if (!session) redirect('/activate');

  return (
    <GoLiveClient
      sessionId={session.sessionId}
      tenantName={session.tenantName}
      tenantSlug={session.tenantSlug}
      completedPhases={session.completedPhases}
      profile={session.profile}
    />
  );
}
