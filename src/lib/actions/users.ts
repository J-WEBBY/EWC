'use server';

// =============================================================================
// User Management Server Actions
// Admin-only: create, update, disable, reset password for staff accounts
// =============================================================================

import { createSovereignClient } from '@/lib/supabase/service';
import { getStaffSession } from '@/lib/supabase/tenant-context';
import bcrypt from 'bcryptjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UserRow {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  display_name: string | null;
  job_title: string | null;
  status: 'active' | 'invited' | 'suspended' | 'deactivated';
  is_admin: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
  role: { id: string; name: string; slug: string } | null;
}

export interface RoleRow {
  id: string;
  name: string;
  slug: string;
  permission_level: number;
  is_admin: boolean;
}

// ---------------------------------------------------------------------------
// listUsers — all staff, ordered by name
// ---------------------------------------------------------------------------

export async function listUsers(): Promise<UserRow[]> {
  const session = await getStaffSession();
  if (!session) return [];
  const { tenantId } = session;
  const db = createSovereignClient();
  const { data, error } = await db
    .from('users')
    .select(`
      id, email, first_name, last_name, display_name, job_title,
      status, is_admin, must_change_password, last_login_at, created_at,
      role:roles(id, name, slug)
    `)
    .eq('tenant_id', tenantId)
    .order('first_name', { ascending: true });

  if (error) {
    console.error('[users] listUsers error:', error);
    return [];
  }

  return (data ?? []).map(u => ({
    ...u,
    role: Array.isArray(u.role) ? (u.role[0] ?? null) : (u.role ?? null),
  })) as UserRow[];
}

// ---------------------------------------------------------------------------
// listRoles — for dropdown in create/edit form
// ---------------------------------------------------------------------------

export async function listRoles(): Promise<RoleRow[]> {
  const session = await getStaffSession();
  if (!session) return [];
  const { tenantId } = session;
  const db = createSovereignClient();
  const { data } = await db
    .from('roles')
    .select('id, name, slug, permission_level, is_admin')
    .eq('tenant_id', tenantId)
    .order('permission_level', { ascending: false });
  return (data ?? []) as RoleRow[];
}

// ---------------------------------------------------------------------------
// createUser — admin creates a staff account
// ---------------------------------------------------------------------------

export async function createUser(input: {
  first_name: string;
  last_name: string;
  email: string;
  job_title?: string;
  role_id: string;
  is_admin: boolean;
  temp_password: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  const db = createSovereignClient();
  const { first_name, last_name, email, job_title, role_id, is_admin, temp_password } = input;

  if (!first_name.trim() || !last_name.trim() || !email.trim() || !role_id || !temp_password) {
    return { success: false, error: 'All required fields must be filled.' };
  }
  if (!UUID_RE.test(role_id)) {
    return { success: false, error: 'Invalid role selected.' };
  }
  if (temp_password.length < 8) {
    return { success: false, error: 'Temp password must be at least 8 characters.' };
  }

  try {
    const passwordHash = await bcrypt.hash(temp_password, 10);
    const display_name = `${first_name.trim()} ${last_name.trim()}`;

    const { data, error } = await db
      .from('users')
      .insert({
        tenant_id: tenantId,
        email: email.toLowerCase().trim(),
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        display_name,
        job_title: job_title?.trim() ?? null,
        role_id,
        is_admin,
        password_hash: passwordHash,
        must_change_password: true,
        status: 'active',
        staff_onboarding_completed: true,
        staff_onboarding_completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') return { success: false, error: 'An account with this email already exists.' };
      console.error('[users] createUser error:', error);
      return { success: false, error: 'Failed to create user.' };
    }

    return { success: true, id: data.id };
  } catch (err) {
    console.error('[users] createUser threw:', err);
    return { success: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// updateUser — edit name, job title, role, admin flag
// ---------------------------------------------------------------------------

export async function updateUser(
  userId: string,
  updates: {
    first_name?: string;
    last_name?: string;
    job_title?: string;
    role_id?: string;
    is_admin?: boolean;
    display_name?: string;
  },
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(userId)) return { success: false, error: 'Invalid user.' };
  if (updates.role_id && !UUID_RE.test(updates.role_id)) return { success: false, error: 'Invalid role.' };

  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  const db = createSovereignClient();
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.first_name !== undefined) patch.first_name = updates.first_name.trim();
  if (updates.last_name !== undefined)  patch.last_name  = updates.last_name.trim();
  if (updates.job_title !== undefined)  patch.job_title  = updates.job_title.trim() || null;
  if (updates.role_id !== undefined)    patch.role_id    = updates.role_id;
  if (updates.is_admin !== undefined)   patch.is_admin   = updates.is_admin;
  if (updates.display_name !== undefined) patch.display_name = updates.display_name.trim() || null;

  // Auto-update display_name when name changes
  if ((updates.first_name || updates.last_name) && !updates.display_name) {
    const { data: current } = await db
      .from('users').select('first_name, last_name').eq('id', userId).eq('tenant_id', tenantId).single();
    if (current) {
      patch.display_name = `${updates.first_name?.trim() ?? current.first_name} ${updates.last_name?.trim() ?? current.last_name}`;
    }
  }

  const { error } = await db.from('users').update(patch).eq('id', userId).eq('tenant_id', tenantId);
  if (error) {
    console.error('[users] updateUser error:', error);
    return { success: false, error: 'Failed to update user.' };
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// setUserStatus — suspend, reactivate, or deactivate
// ---------------------------------------------------------------------------

export async function setUserStatus(
  userId: string,
  status: 'active' | 'suspended' | 'deactivated',
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(userId)) return { success: false, error: 'Invalid user.' };

  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  const db = createSovereignClient();
  const { error } = await db
    .from('users')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .eq('tenant_id', tenantId);

  if (error) {
    console.error('[users] setUserStatus error:', error);
    return { success: false, error: 'Failed to update status.' };
  }
  return { success: true };
}

// ---------------------------------------------------------------------------
// resetUserPassword — admin sets a new temp password for a staff member
// Forces must_change_password = true
// ---------------------------------------------------------------------------

export async function resetUserPassword(
  userId: string,
  tempPassword: string,
): Promise<{ success: boolean; error?: string }> {
  if (!UUID_RE.test(userId)) return { success: false, error: 'Invalid user.' };
  if (!tempPassword || tempPassword.length < 8) {
    return { success: false, error: 'Temp password must be at least 8 characters.' };
  }

  const session = await getStaffSession();
  if (!session) return { success: false, error: 'UNAUTHORIZED' };
  const { tenantId } = session;
  try {
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const db = createSovereignClient();

    const { error } = await db
      .from('users')
      .update({
        password_hash: passwordHash,
        temp_password_hash: null,
        must_change_password: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .eq('tenant_id', tenantId);

    if (error) {
      console.error('[users] resetUserPassword error:', error);
      return { success: false, error: 'Failed to reset password.' };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
