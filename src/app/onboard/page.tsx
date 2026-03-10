'use server';

import { redirect } from 'next/navigation';
import { getTenantSession } from '@/lib/actions/platform/activate';
import WelcomeClient from './welcome-client';

export default async function OnboardWelcomePage() {
  const session = await getTenantSession();
  if (!session) redirect('/activate');

  return (
    <WelcomeClient
      tenantName={session.tenantName}
      completedPhases={session.completedPhases}
      onboardingPhase={session.onboardingPhase}
    />
  );
}
