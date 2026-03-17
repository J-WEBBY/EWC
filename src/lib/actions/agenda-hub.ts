'use server';

import { createSovereignClient } from '@/lib/supabase/service';

const TENANT_ID = 'clinic';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgendaEvidence {
  id:            string;
  agenda_id:     string;
  uploaded_by:   string | null;
  file_name:     string;
  file_mime:     string;
  file_data:     string;
  file_size:     number | null;
  caption:       string | null;
  evidence_type: string;
  created_at:    string;
  uploader_name?: string;
}

export interface AgendaTimelineEntry {
  id:          string;
  agenda_id:   string;
  author_id:   string | null;
  content:     string;
  note_type:   'update' | 'blocker' | 'observation' | 'completion' | 'system';
  created_at:  string;
  author_name?: string;
}

export interface AgendaReport {
  id:              string;
  agenda_id:       string;
  sender_id:       string | null;
  recipient_id:    string;
  cover_note:      string | null;
  agenda_snapshot: Record<string, unknown> | null;
  is_read:         boolean;
  acknowledged_at: string | null;
  created_at:      string;
  sender_name?:    string;
  agenda_title?:   string;
  agenda_category?: string;
}

// ── Get full agenda hub data ──────────────────────────────────────────────────

export async function getAgendaHub(agendaId: string): Promise<{
  evidence: AgendaEvidence[];
  timeline: AgendaTimelineEntry[];
  reportCount: number;
} | null> {
  try {
    const db = createSovereignClient();

    const [evidenceRes, timelineRes, reportRes] = await Promise.all([
      db.from('agenda_evidence')
        .select(`
          *,
          uploader:uploaded_by(first_name, last_name)
        `)
        .eq('agenda_id', agendaId)
        .order('created_at', { ascending: true }),

      db.from('agenda_timeline')
        .select(`
          *,
          author:author_id(first_name, last_name)
        `)
        .eq('agenda_id', agendaId)
        .order('created_at', { ascending: true }),

      db.from('agenda_reports')
        .select('id', { count: 'exact' })
        .eq('agenda_id', agendaId),
    ]);

    const evidence: AgendaEvidence[] = (evidenceRes.data ?? []).map((e: Record<string, unknown>) => {
      const u = e.uploader as { first_name?: string; last_name?: string } | null;
      return {
        ...(e as unknown as AgendaEvidence),
        uploader_name: u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : undefined,
      };
    });

    const timeline: AgendaTimelineEntry[] = (timelineRes.data ?? []).map((t: Record<string, unknown>) => {
      const a = t.author as { first_name?: string; last_name?: string } | null;
      return {
        ...(t as unknown as AgendaTimelineEntry),
        author_name: a ? `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() : undefined,
      };
    });

    return {
      evidence,
      timeline,
      reportCount: reportRes.count ?? 0,
    };
  } catch (err) {
    console.error('[getAgendaHub]', err);
    return null;
  }
}

// ── Add timeline note ─────────────────────────────────────────────────────────

export async function addTimelineNote(
  agendaId:  string,
  content:   string,
  noteType:  'update' | 'blocker' | 'observation' | 'completion' | 'system',
  authorId:  string,
): Promise<{ success: boolean; entry?: AgendaTimelineEntry }> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('agenda_timeline')
      .insert({
        tenant_id: TENANT_ID,
        agenda_id: agendaId,
        author_id: authorId,
        content:   content.trim(),
        note_type: noteType,
      })
      .select(`*, author:author_id(first_name, last_name)`)
      .single();

    if (error) return { success: false };

    const a = (data as Record<string, unknown>).author as { first_name?: string; last_name?: string } | null;
    return {
      success: true,
      entry: {
        ...(data as unknown as AgendaTimelineEntry),
        author_name: a ? `${a.first_name ?? ''} ${a.last_name ?? ''}`.trim() : undefined,
      },
    };
  } catch (err) {
    console.error('[addTimelineNote]', err);
    return { success: false };
  }
}

// ── Upload evidence ───────────────────────────────────────────────────────────

export async function uploadEvidence(
  agendaId:     string,
  fileName:     string,
  fileMime:     string,
  fileData:     string,   // base64
  fileSize:     number,
  caption:      string,
  evidenceType: string,
  uploadedBy:   string,
): Promise<{ success: boolean; evidence?: AgendaEvidence }> {
  try {
    if (fileSize > 2_200_000) return { success: false };

    const db = createSovereignClient();
    const { data, error } = await db
      .from('agenda_evidence')
      .insert({
        tenant_id:     TENANT_ID,
        agenda_id:     agendaId,
        uploaded_by:   uploadedBy,
        file_name:     fileName,
        file_mime:     fileMime,
        file_data:     fileData,
        file_size:     fileSize,
        caption:       caption || null,
        evidence_type: evidenceType,
      })
      .select(`*, uploader:uploaded_by(first_name, last_name)`)
      .single();

    if (error) return { success: false };

    const u = (data as Record<string, unknown>).uploader as { first_name?: string; last_name?: string } | null;
    return {
      success: true,
      evidence: {
        ...(data as unknown as AgendaEvidence),
        uploader_name: u ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : undefined,
      },
    };
  } catch (err) {
    console.error('[uploadEvidence]', err);
    return { success: false };
  }
}

// ── Delete evidence ───────────────────────────────────────────────────────────

export async function deleteEvidence(evidenceId: string): Promise<{ success: boolean }> {
  try {
    const db = createSovereignClient();
    const { error } = await db.from('agenda_evidence').delete().eq('id', evidenceId);
    return { success: !error };
  } catch {
    return { success: false };
  }
}

// ── Update agenda metrics (extends notes JSON) ────────────────────────────────

export async function updateAgendaMetrics(
  agendaId: string,
  patch:    Record<string, unknown>,
): Promise<{ success: boolean }> {
  try {
    const db = createSovereignClient();

    // Read current notes
    const { data } = await db.from('staff_goals').select('notes').eq('id', agendaId).single();
    let current: Record<string, unknown> = {};
    try { if ((data as { notes: string } | null)?.notes) current = JSON.parse((data as { notes: string }).notes); } catch { /* */ }

    const merged = { ...current, ...patch };
    const { error } = await db.from('staff_goals')
      .update({ notes: JSON.stringify(merged), updated_at: new Date().toISOString() })
      .eq('id', agendaId);

    return { success: !error };
  } catch (err) {
    console.error('[updateAgendaMetrics]', err);
    return { success: false };
  }
}

// ── Send agenda report ────────────────────────────────────────────────────────

export async function sendAgendaReport(
  agendaId:    string,
  recipientId: string,
  coverNote:   string,
  senderId:    string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const db = createSovereignClient();

    // Load full agenda snapshot
    const [agendaRes, evidenceRes, timelineRes, senderRes, recipientRes] = await Promise.all([
      db.from('staff_goals').select('*').eq('id', agendaId).single(),
      db.from('agenda_evidence').select('file_name, caption, evidence_type, created_at').eq('agenda_id', agendaId),
      db.from('agenda_timeline').select('content, note_type, created_at').eq('agenda_id', agendaId).order('created_at'),
      db.from('users').select('first_name, last_name').eq('id', senderId).single(),
      db.from('users').select('first_name, last_name').eq('id', recipientId).single(),
    ]);

    const agenda = agendaRes.data as Record<string, unknown> | null;
    if (!agenda) return { success: false, error: 'Agenda not found.' };

    const senderData = senderRes.data as { first_name?: string; last_name?: string } | null;
    const senderName = senderData ? `${senderData.first_name ?? ''} ${senderData.last_name ?? ''}`.trim() : 'A colleague';

    const snapshot = {
      agenda,
      evidence:  evidenceRes.data ?? [],
      timeline:  timelineRes.data ?? [],
      sent_at:   new Date().toISOString(),
      sender_name: senderName,
    };

    // Store report
    const { error: reportErr } = await db.from('agenda_reports').insert({
      tenant_id:       TENANT_ID,
      agenda_id:       agendaId,
      sender_id:       senderId,
      recipient_id:    recipientId,
      cover_note:      coverNote || null,
      agenda_snapshot: snapshot,
    });

    if (reportErr) return { success: false, error: reportErr.message };

    // Fire signal notification for recipient
    await db.from('signals').insert({
      tenant_id:         TENANT_ID,
      signal_type:       'task',
      title:             `Report received: "${agenda.title}"`,
      description:       `${senderName} sent you a completed agenda report${coverNote ? `: "${coverNote}"` : '.'} View it in Knowledge Base → Reports.`,
      priority:          'medium',
      status:            'new',
      source_type:       'system',
      created_by_user_id: senderId,
    });

    return { success: true };
  } catch (err) {
    console.error('[sendAgendaReport]', err);
    return { success: false, error: 'Failed to send report.' };
  }
}

// ── Get received reports ──────────────────────────────────────────────────────

export async function getMyReceivedReports(userId: string): Promise<AgendaReport[]> {
  try {
    const db = createSovereignClient();
    const { data, error } = await db
      .from('agenda_reports')
      .select(`
        *,
        sender:sender_id(first_name, last_name),
        agenda:agenda_id(title, category)
      `)
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) return [];

    return (data as Record<string, unknown>[]).map(r => {
      const s = r.sender as { first_name?: string; last_name?: string } | null;
      const a = r.agenda as { title?: string; category?: string } | null;
      return {
        ...(r as unknown as AgendaReport),
        sender_name:    s ? `${s.first_name ?? ''} ${s.last_name ?? ''}`.trim() : 'Unknown',
        agenda_title:   a?.title ?? 'Untitled',
        agenda_category: a?.category ?? '',
      };
    });
  } catch (err) {
    console.error('[getMyReceivedReports]', err);
    return [];
  }
}

// ── Mark report read / acknowledged ──────────────────────────────────────────

export async function markReportRead(reportId: string): Promise<void> {
  try {
    const db = createSovereignClient();
    await db.from('agenda_reports').update({ is_read: true }).eq('id', reportId);
  } catch { /* silent */ }
}

export async function acknowledgeReport(reportId: string): Promise<{ success: boolean }> {
  try {
    const db = createSovereignClient();
    const { error } = await db.from('agenda_reports')
      .update({ is_read: true, acknowledged_at: new Date().toISOString() })
      .eq('id', reportId);
    return { success: !error };
  } catch {
    return { success: false };
  }
}

// ── Unread report count (for nav badge) ──────────────────────────────────────

export async function getUnreadReportCount(userId: string): Promise<number> {
  try {
    const db = createSovereignClient();
    const { count } = await db
      .from('agenda_reports')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('is_read', false);
    return count ?? 0;
  } catch {
    return 0;
  }
}
