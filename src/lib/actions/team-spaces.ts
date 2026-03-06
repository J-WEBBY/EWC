'use server';

import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// TYPES
// =============================================================================

export type TeamSpace    = 'all_staff' | 'reception' | 'clinical' | 'management';
export type PostCategory = 'announcement' | 'handover' | 'task' | 'resource' | 'kudos' | 'update';
export type MemberStatus = 'online' | 'away' | 'offline';

export interface TeamPost {
  id:          string;
  space:       TeamSpace;
  category:    PostCategory;
  title:       string | null;
  body:        string;
  tags:        string[];
  author_name: string;
  author_role: string | null;
  likes:       number;
  pinned:      boolean;
  metadata:    Record<string, string | boolean | null>;
  created_at:  string;
}

export interface TeamMember {
  id:        string;
  full_name: string;
  role:      string;
  status:    MemberStatus;
  color:     string;
}

export interface TeamSpaceStats {
  all_staff:  number;
  reception:  number;
  clinical:   number;
  management: number;
}

// =============================================================================
// SIMULATED DATA
// =============================================================================

const now  = new Date();
const hAgo = (h: number) => new Date(now.getTime() - h * 3600000).toISOString();
const dAgo = (d: number) => new Date(now.getTime() - d * 86400000).toISOString();

const DEMO_POSTS: TeamPost[] = [
  {
    id: 'post-001',
    space: 'all_staff', category: 'announcement', pinned: true,
    title: 'CQC Inspection — 3 Days to Go',
    body: 'Team, our CQC inspection is confirmed for Thursday 8 March. All documentation checklists must be completed by Wednesday 5pm. Particular focus areas: CPD logs, consent record access, and the incident reporting folder. I will be doing a walk-through of the consultation rooms on Wednesday morning — please ensure they are in inspection-ready condition. Thank you all for your hard work preparing.',
    author_name: 'Dr S. Ganata', author_role: 'Medical Director',
    tags: ['cqc', 'urgent', 'compliance'],
    likes: 5, metadata: { priority: 'urgent' }, created_at: hAgo(2),
  },
  {
    id: 'post-002',
    space: 'reception', category: 'handover', pinned: false,
    title: 'Morning Handover — Wednesday 5 March',
    body: 'Good morning. From yesterday: Sarah Jones called re: Botox rebooking — awaiting confirmation of Thu 12 March 10am slot. Mrs Morrison has not responded to rebooking SMS — may need a second outreach. Emma Richardson B12 enquiry replied with pricing — she asked about a course, I quoted £180 for 4 sessions. Sophie Harte CoolSculpting consult confirmed for today 10:30am — new patient pack prepared. 3 voicemails to return before 11am (list on the desk). Have a great day!',
    author_name: 'Emma Clarke', author_role: 'Senior Receptionist',
    tags: ['handover', 'patients'],
    likes: 2, metadata: {}, created_at: hAgo(4),
  },
  {
    id: 'post-003',
    space: 'all_staff', category: 'kudos', pinned: false,
    title: null,
    body: 'Want to give a huge thank you to Emma in reception for handling the February enquiry backlog single-handedly last week. 23 new patient enquiries responded to, 11 bookings confirmed. That is exceptional work and it directly contributed to our best February revenue on record. The whole team benefits from this kind of commitment. Thank you Emma.',
    author_name: 'Dr S. Ganata', author_role: 'Medical Director',
    tags: ['recognition', 'team'],
    likes: 8, metadata: {}, created_at: dAgo(1),
  },
  {
    id: 'post-004',
    space: 'clinical', category: 'announcement', pinned: true,
    title: 'Updated Botox Dilution Protocol — Effective Today',
    body: 'Following the Allergan supplier update, we are switching to the new 2.5ml / 100u dilution ratio for all forehead and glabella treatments with immediate effect. The previous 2.0ml ratio is no longer recommended by the manufacturer. The updated protocol sheet is pinned in the clinical resources folder. If you have any questions before your next treatment session, please speak to me directly before the patient arrives.',
    author_name: 'Dr S. Ganata', author_role: 'Medical Director',
    tags: ['protocol', 'clinical', 'botox'],
    likes: 3, metadata: { resource_url: '#' }, created_at: hAgo(6),
  },
  {
    id: 'post-005',
    space: 'reception', category: 'task', pinned: false,
    title: 'Callback Priority List — Today',
    body: '4 callbacks needed before 5pm today:\n1. Sarah Jones — confirm Thu 12 March 10am Botox slot\n2. Catherine Blake — weight management 6-week follow-up\n3. Michael Taylor — review appointment (post-health screening)\n4. James Worthington — corporate proposal decision expected\n\nPlease log all outcomes in the shared notebook and update relevant patient records in Cliniko.',
    author_name: 'Emma Clarke', author_role: 'Senior Receptionist',
    tags: ['task', 'callbacks'],
    likes: 1, metadata: { task_due: 'Today 5pm', assignee: 'Reception Team' }, created_at: hAgo(3),
  },
  {
    id: 'post-006',
    space: 'clinical', category: 'handover', pinned: false,
    title: 'Clinical Handover — Friday 28 Feb, PM',
    body: 'Afternoon treatments completed:\n• 2x Botox Anti-Wrinkle (both satisfactory, no adverse reactions)\n• 1x Juvederm filler — minor bruising at injection site (within expected range, patient informed and happy)\n• CoolSculpting session — machine performed well post-service\n\nEquipment notes: Laser unit showing calibration drift — booked for engineer visit Monday 3 March. Autoclave cycle log signed and filed. Consumables stock low on 1ml Juvederm Ultra 2 — order placed (ETA Thursday).',
    author_name: 'Nurse P. Patel', author_role: 'Clinical Nurse',
    tags: ['handover', 'equipment', 'clinical'],
    likes: 2, metadata: {}, created_at: dAgo(5),
  },
  {
    id: 'post-007',
    space: 'management', category: 'resource', pinned: true,
    title: 'February P&L — Filed',
    body: 'February P&L has been submitted and is available in the shared management folder. Headline: Revenue £31,200 vs target £28,000 (111% of target). Gross margin: 68%. Notable items: CoolSculpting campaign drove 5 new consultations (£4,200 gross), Allergan product invoice £1,840 due 14 March. Staff cost ratio slightly elevated due to additional clinical hours — within budget. Q1 projection looking strong — on track for £95k if March holds.',
    author_name: 'James Mitchell', author_role: 'Practice Manager',
    tags: ['finance', 'report'],
    likes: 2, metadata: { resource_url: '#', document: 'Feb 2026 P&L.pdf' }, created_at: dAgo(3),
  },
  {
    id: 'post-008',
    space: 'all_staff', category: 'announcement', pinned: false,
    title: 'Extended Thursday Evening Hours from 15 March',
    body: 'Following positive team feedback, we are extending Thursday appointments to 8pm from 15 March 2026. This adds 2 additional appointment slots per Thursday. The updated rota has been shared with all relevant staff. Reception: please ensure the online booking portal reflects the new availability from next week. Clinical team: the additional hour will be compensated at standard overtime rate. Thank you for your flexibility.',
    author_name: 'James Mitchell', author_role: 'Practice Manager',
    tags: ['rota', 'hours'],
    likes: 6, metadata: {}, created_at: dAgo(2),
  },
];

const DEMO_MEMBERS: TeamMember[] = [
  { id: 'u-001', full_name: 'Dr S. Ganata',   role: 'Medical Director',    status: 'online',   color: '#0058E6' },
  { id: 'u-002', full_name: 'Emma Clarke',     role: 'Senior Receptionist', status: 'online',   color: '#00A693' },
  { id: 'u-003', full_name: 'Nurse P. Patel',  role: 'Clinical Nurse',      status: 'away',     color: '#D8A600' },
  { id: 'u-004', full_name: 'James Mitchell',  role: 'Practice Manager',    status: 'online',   color: '#3B82F6' },
  { id: 'u-005', full_name: 'Dr S. Khan',      role: 'GP',                  status: 'offline',  color: '#EC4899' },
];

// =============================================================================
// SERVER ACTIONS
// =============================================================================

export async function getTeamPosts(space: TeamSpace | 'all'): Promise<TeamPost[]> {
  try {
    const db = createSovereignClient();
    const q  = db.from('team_posts').select('*').order('pinned', { ascending: false }).order('created_at', { ascending: false }).limit(30);
    const { data } = space === 'all' ? await q : await q.eq('space', space);

    if (data && data.length > 0) {
      return (data as Record<string, unknown>[]).map(p => ({
        id:          p.id as string,
        space:       p.space as TeamSpace,
        category:    p.category as PostCategory,
        title:       (p.title as string | null) ?? null,
        body:        p.body as string,
        tags:        (p.tags as string[]) ?? [],
        author_name: p.author_name as string,
        author_role: (p.author_role as string | null) ?? null,
        likes:       (p.likes as number) ?? 0,
        pinned:      (p.pinned as boolean) ?? false,
        metadata:    (p.metadata as Record<string, string | boolean | null>) ?? {},
        created_at:  p.created_at as string,
      }));
    }
  } catch { /* fall through */ }

  const demo = space === 'all' ? DEMO_POSTS : DEMO_POSTS.filter(p => p.space === space || p.space === 'all_staff');
  return demo.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getTeamRoster(): Promise<TeamMember[]> {
  try {
    const db = createSovereignClient();
    const { data } = await db
      .from('users')
      .select('id, first_name, last_name, roles!inner(name)')
      .eq('status', 'active')
      .limit(20);

    if (data && data.length > 0) {
      const COLORS = ['#0058E6', '#00A693', '#D8A600', '#3B82F6', '#EC4899', '#22C55E'];
      return (data as Record<string, unknown>[]).map((u, i) => ({
        id:        u.id as string,
        full_name: `${u.first_name} ${u.last_name}`.trim(),
        role:      ((u.roles as Record<string, unknown>)?.name as string) ?? '—',
        status:    'offline' as MemberStatus,
        color:     COLORS[i % COLORS.length],
      }));
    }
  } catch { /* fall through */ }

  return DEMO_MEMBERS;
}

export async function getTeamSpaceStats(): Promise<TeamSpaceStats> {
  try {
    const db = createSovereignClient();
    const { data } = await db.from('team_posts').select('space');
    if (data && data.length > 0) {
      const counts = { all_staff: 0, reception: 0, clinical: 0, management: 0 };
      for (const r of data as { space: TeamSpace }[]) counts[r.space]++;
      return counts;
    }
  } catch { /* fall through */ }

  return {
    all_staff:  DEMO_POSTS.filter(p => p.space === 'all_staff').length,
    reception:  DEMO_POSTS.filter(p => p.space === 'reception').length,
    clinical:   DEMO_POSTS.filter(p => p.space === 'clinical').length,
    management: DEMO_POSTS.filter(p => p.space === 'management').length,
  };
}

export async function createTeamPost(data: {
  space:       TeamSpace;
  category:    PostCategory;
  title?:      string;
  body:        string;
  tags?:       string[];
  author_name: string;
  author_role: string | null;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const db = createSovereignClient();
    const { data: row, error } = await db
      .from('team_posts')
      .insert({
        space:       data.space,
        category:    data.category,
        title:       data.title ?? null,
        body:        data.body,
        tags:        data.tags ?? [],
        author_name: data.author_name,
        author_role: data.author_role,
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, id: (row as Record<string, string>)?.id };
  } catch {
    return { success: true }; // demo mode
  }
}

export async function likeTeamPost(id: string): Promise<{ success: boolean }> {
  try {
    const db = createSovereignClient();
    await db.rpc('increment_team_post_likes', { post_id: id });
  } catch { /* demo mode */ }
  return { success: true };
}
