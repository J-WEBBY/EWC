import { createSovereignClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = createSovereignClient();

  // Check if users table exists and has rows
  const { data: users, error: usersError } = await db
    .from('users')
    .select('email, status')
    .limit(5);

  // Check clinic_config
  const { data: clinic, error: clinicError } = await db
    .from('clinic_config')
    .select('clinic_name')
    .single();

  return NextResponse.json({
    users: usersError ? { error: usersError.message } : { count: users?.length, emails: users?.map(u => u.email) },
    clinic: clinicError ? { error: clinicError.message } : clinic,
  });
}
