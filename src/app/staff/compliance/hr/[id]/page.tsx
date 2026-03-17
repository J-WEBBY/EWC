import { redirect } from 'next/navigation';
import { getCurrentUser, getStaffProfile } from '@/lib/actions/staff-onboarding';
import { getHRRecords, getActiveUsers } from '@/lib/actions/compliance';
import HRRecordClient from './client';

export default async function HRRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ userId?: string }>;
}) {
  const { id } = await params;
  const { userId: qUserId } = await searchParams;

  const userRes = await getCurrentUser();
  if (!userRes.success || !userRes.userId) redirect('/login');

  const userId = qUserId || userRes.userId;

  const [profileRes, records, users] = await Promise.all([
    getStaffProfile('clinic', userId),
    getHRRecords(),
    getActiveUsers(),
  ]);

  if (!profileRes.success || !profileRes.data) redirect('/login');

  const record = records.find(r => r.user_id === id) ?? null;
  const staffUser = users.find(u => u.id === id) ?? null;

  return (
    <HRRecordClient
      profile={profileRes.data.profile}
      currentUserId={userId}
      record={record}
      staffUser={staffUser}
    />
  );
}
