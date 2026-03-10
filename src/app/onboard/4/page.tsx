'use server';

import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/actions/platform/activate';
import DataImportClient from './client';

export default async function OnboardPhase4() {
  const session = await getTenantSession();
  if (!session) redirect('/activate');

  return (
    <DataImportClient
      sessionId={session.sessionId}
      tenantName={session.tenantName}
      completedPhases={session.completedPhases}
    />
  );
}
