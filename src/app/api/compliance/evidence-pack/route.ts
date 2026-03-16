import { NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';

// =============================================================================
// GET /api/compliance/evidence-pack
// Returns a print-ready HTML compliance report for Edgbaston Wellness Clinic
// =============================================================================

interface CQCRow {
  question_number: number;
  domain: string;
  audit_area: string;
  question_text: string;
  answer: string | null;
  evidence_notes: string | null;
  action_required: string | null;
  target_date: string | null;
  answered_by: string | null;
  audit_date: string | null;
}

interface CalRow {
  task_order: number;
  task_name: string;
  frequency: string;
  last_completed_date: string | null;
  next_due_date: string | null;
  status: string;
  notes: string | null;
  responsible_user_id: string | null;
}

interface UserRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

function fmt(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function answerLabel(a: string | null): string {
  if (a === 'yes')     return 'Yes';
  if (a === 'no')      return 'No';
  if (a === 'partial') return 'Partial';
  if (a === 'na')      return 'N/A';
  return 'Not answered';
}

function answerColor(a: string | null): string {
  if (a === 'yes')     return '#059669';
  if (a === 'no')      return '#DC2626';
  if (a === 'partial') return '#EA580C';
  if (a === 'na')      return '#96989B';
  return '#D4E2FF';
}

function calStatusLabel(s: string): string {
  if (s === 'overdue')   return 'Overdue';
  if (s === 'due_soon')  return 'Due Soon';
  if (s === 'ok')        return 'On Track';
  return 'Not Scheduled';
}

function calStatusColor(s: string): string {
  if (s === 'overdue')  return '#DC2626';
  if (s === 'due_soon') return '#EA580C';
  if (s === 'ok')       return '#059669';
  return '#96989B';
}

const DOMAINS = ['SAFE', 'EFFECTIVE', 'CARING', 'RESPONSIVE', 'WELL-LED'];

export async function GET() {
  try {
    const db = createSovereignClient();

    const [cqcRes, calRes, userRes] = await Promise.all([
      db.from('compliance_cqc_answers')
        .select('question_number,domain,audit_area,question_text,answer,evidence_notes,action_required,target_date,answered_by,audit_date')
        .order('question_number'),
      db.from('compliance_calendar')
        .select('task_order,task_name,frequency,last_completed_date,next_due_date,status,notes,responsible_user_id')
        .order('task_order'),
      db.from('users')
        .select('id,first_name,last_name,email')
        .eq('status', 'active'),
    ]);

    const cqcRows  = (cqcRes.data  ?? []) as CQCRow[];
    const calRows  = (calRes.data  ?? []) as CalRow[];
    const userRows = (userRes.data ?? []) as UserRow[];
    const userMap: Record<string, string> = {};
    for (const u of userRows) userMap[u.id] = `${u.first_name} ${u.last_name}`.trim();

    const answered = cqcRows.filter(q => q.answer !== null);
    const yesCount = cqcRows.filter(q => q.answer === 'yes').length;
    const overallScore = cqcRows.length ? Math.round(yesCount / cqcRows.length * 100) : 0;

    const calOverdue  = calRows.filter(t => t.status === 'overdue').length;
    const calDueSoon  = calRows.filter(t => t.status === 'due_soon').length;
    const calOnTrack  = calRows.filter(t => t.status === 'ok').length;

    const generated = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    // ── Domain sections ───────────────────────────────────────────────────────
    const domainSections = DOMAINS.map(domain => {
      const items = cqcRows.filter(q => (q.domain ?? '').toUpperCase() === domain);
      const domScore = items.length
        ? Math.round(items.filter(q => q.answer === 'yes').length / items.length * 100)
        : 0;
      const scoreCol = domScore >= 80 ? '#059669' : domScore >= 60 ? '#EA580C' : '#DC2626';
      const label    = domScore >= 80 ? 'Good' : domScore >= 60 ? 'Partial' : items.filter(q => q.answer !== null).length === 0 ? 'Not started' : 'Action needed';

      const rows = items.map(q => {
        const ac = answerColor(q.answer);
        const evidenceClean = q.evidence_notes?.replace(/^\[remind:\d+\]\s*/, '') ?? '';
        return `
          <tr>
            <td class="qnum">${q.question_number}</td>
            <td class="qtext">
              <div class="question-main">${q.question_text}</div>
              ${q.audit_area ? `<div class="audit-area">${q.audit_area}</div>` : ''}
              ${evidenceClean ? `<div class="evidence">Evidence: ${evidenceClean}</div>` : ''}
              ${q.action_required ? `<div class="action">Action: ${q.action_required}</div>` : ''}
            </td>
            <td class="answer-cell">
              <span class="answer-badge" style="background:${ac}20;color:${ac};border-color:${ac}40">
                ${answerLabel(q.answer)}
              </span>
            </td>
            <td class="meta-col">
              ${q.answered_by && userMap[q.answered_by] ? `<div class="meta-name">${userMap[q.answered_by]}</div>` : '<span class="meta-empty">—</span>'}
              ${q.audit_date ? `<div class="meta-date">${fmt(q.audit_date)}</div>` : ''}
            </td>
            <td class="meta-col">
              ${q.target_date ? `<div class="meta-date">${fmt(q.target_date)}</div>` : '<span class="meta-empty">—</span>'}
            </td>
          </tr>`;
      }).join('');

      return `
        <div class="domain-section">
          <div class="domain-header">
            <div class="domain-title">
              <span class="domain-label">${domain.charAt(0) + domain.slice(1).toLowerCase()}</span>
              <span class="domain-badge" style="background:${scoreCol}18;color:${scoreCol};border-color:${scoreCol}30">${label}</span>
            </div>
            <div class="domain-score" style="color:${scoreCol}">${domScore}%</div>
            <div class="domain-sub">${items.filter(q => q.answer !== null).length} of ${items.length} answered</div>
          </div>
          <table class="q-table">
            <thead>
              <tr>
                <th style="width:36px">#</th>
                <th>Question</th>
                <th style="width:90px">Answer</th>
                <th style="width:130px">Completed by</th>
                <th style="width:110px">Target date</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join('');

    // ── Calendar section ──────────────────────────────────────────────────────
    const calTableRows = calRows.map(t => {
      const sc = calStatusColor(t.status);
      const notesClean = t.notes?.replace(/^\[remind:\d+\]\s*/, '') ?? '';
      const responsible = t.responsible_user_id ? (userMap[t.responsible_user_id] ?? '—') : '—';
      return `
        <tr>
          <td class="task-name">${t.task_name}${notesClean ? `<div class="task-notes">${notesClean}</div>` : ''}</td>
          <td class="freq-badge"><span class="freq">${t.frequency}</span></td>
          <td class="meta-col">${responsible}</td>
          <td class="meta-col">${fmt(t.last_completed_date)}</td>
          <td class="meta-col">${fmt(t.next_due_date)}</td>
          <td class="status-col">
            <span class="status-badge" style="background:${sc}18;color:${sc};border-color:${sc}30">
              ${calStatusLabel(t.status)}
            </span>
          </td>
        </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>EWC Compliance Evidence Pack — ${generated}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 11px;
    color: #181D23;
    background: #F8FAFF;
    padding: 32px;
    max-width: 1100px;
    margin: 0 auto;
  }

  /* ── Cover ── */
  .cover {
    padding: 48px 0 40px;
    border-bottom: 2px solid #0058E6;
    margin-bottom: 40px;
  }
  .cover-logo {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
  }
  .logo-mark {
    width: 44px; height: 44px;
    background: #0058E6;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    color: #fff;
    font-size: 20px; font-weight: 900;
  }
  .logo-text { font-size: 15px; font-weight: 700; color: #181D23; }
  .logo-sub  { font-size: 10px; color: #96989B; }
  .cover-title { font-size: 32px; font-weight: 900; letter-spacing: -0.03em; color: #181D23; margin-bottom: 4px; }
  .cover-sub   { font-size: 13px; color: #5A6475; margin-bottom: 24px; }
  .cover-meta  { font-size: 10px; color: #96989B; }
  .cover-meta span { margin-right: 20px; }

  /* ── Score strip ── */
  .score-strip {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    margin-bottom: 40px;
  }
  .score-card {
    border: 1px solid #D4E2FF;
    border-radius: 14px;
    padding: 16px 20px;
  }
  .score-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.28em; font-weight: 600; color: #96989B; margin-bottom: 4px; }
  .score-value { font-size: 28px; font-weight: 900; letter-spacing: -0.04em; }
  .score-row {
    display: flex; gap: 20px; margin-top: 10px;
  }
  .score-row-item { display: flex; align-items: center; gap: 6px; font-size: 10px; color: #5A6475; }
  .dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }

  /* ── Section headers ── */
  .section-title {
    font-size: 14px; font-weight: 900; letter-spacing: -0.02em;
    color: #181D23;
    margin-bottom: 6px;
    padding-bottom: 10px;
    border-bottom: 1px solid #D4E2FF;
    margin-top: 40px;
  }
  .section-desc { font-size: 10px; color: #5A6475; margin-bottom: 20px; }

  /* ── Domain section ── */
  .domain-section { margin-bottom: 30px; }
  .domain-header {
    display: flex; align-items: center; gap: 12px;
    padding: 12px 16px;
    background: #F0F4FF;
    border-radius: 10px 10px 0 0;
    border: 1px solid #D4E2FF;
    border-bottom: none;
  }
  .domain-title { display: flex; align-items: center; gap: 8px; flex: 1; }
  .domain-label { font-size: 12px; font-weight: 800; color: #181D23; }
  .domain-badge {
    font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
    padding: 2px 8px; border-radius: 6px; border: 1px solid;
  }
  .domain-score { font-size: 16px; font-weight: 900; }
  .domain-sub   { font-size: 9px; color: #96989B; }

  /* ── Question table ── */
  .q-table {
    width: 100%; border-collapse: collapse;
    border: 1px solid #D4E2FF;
    border-radius: 0 0 10px 10px;
    overflow: hidden;
  }
  .q-table thead tr { background: #F8FAFF; }
  .q-table th {
    padding: 8px 10px; text-align: left;
    font-size: 8px; text-transform: uppercase; letter-spacing: 0.2em; font-weight: 600;
    color: #96989B; border-bottom: 1px solid #D4E2FF;
  }
  .q-table td { padding: 9px 10px; border-bottom: 1px solid #EEF2FF; vertical-align: top; }
  .q-table tbody tr:last-child td { border-bottom: none; }
  .q-table tbody tr:hover { background: rgba(0,88,230,0.015); }
  .qnum { font-size: 9px; font-weight: 700; color: #96989B; white-space: nowrap; }
  .qtext { font-size: 10.5px; color: #181D23; line-height: 1.5; }
  .question-main { color: #181D23; }
  .audit-area { font-size: 9px; color: #96989B; margin-top: 2px; }
  .evidence   { font-size: 9px; color: #5A6475; font-style: italic; margin-top: 3px; }
  .action     { font-size: 9px; color: #EA580C; margin-top: 3px; }
  .answer-cell { white-space: nowrap; }
  .answer-badge {
    font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
    padding: 3px 8px; border-radius: 6px; border: 1px solid; white-space: nowrap;
    display: inline-block;
  }
  .meta-col { font-size: 9.5px; color: #3D4451; }
  .meta-name { font-weight: 600; }
  .meta-date { color: #96989B; margin-top: 1px; }
  .meta-empty { color: #D4E2FF; }

  /* ── Calendar table ── */
  .cal-table {
    width: 100%; border-collapse: collapse;
    border: 1px solid #D4E2FF; border-radius: 10px; overflow: hidden;
  }
  .cal-table thead tr { background: #F8FAFF; }
  .cal-table th {
    padding: 9px 12px; text-align: left;
    font-size: 8px; text-transform: uppercase; letter-spacing: 0.2em; font-weight: 600;
    color: #96989B; border-bottom: 1px solid #D4E2FF;
  }
  .cal-table td { padding: 10px 12px; border-bottom: 1px solid #EEF2FF; vertical-align: top; }
  .cal-table tbody tr:last-child td { border-bottom: none; }
  .task-name  { font-size: 11px; font-weight: 600; color: #181D23; }
  .task-notes { font-size: 9px; color: #96989B; font-style: italic; margin-top: 2px; }
  .freq { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em;
    padding: 2px 7px; border-radius: 6px; background: #EEF2FF; color: #5A6475; }
  .status-badge {
    font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em;
    padding: 3px 8px; border-radius: 6px; border: 1px solid; white-space: nowrap;
    display: inline-block;
  }
  .status-col { white-space: nowrap; }

  /* ── Signature block ── */
  .signature-section {
    margin-top: 50px;
    padding-top: 30px;
    border-top: 1px solid #D4E2FF;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
  }
  .sig-block { }
  .sig-line  {
    border-bottom: 1px solid #181D23;
    height: 40px;
    margin-bottom: 6px;
  }
  .sig-label { font-size: 9px; color: #96989B; }
  .sig-name  { font-size: 10px; font-weight: 700; color: #181D23; margin-top: 3px; }

  /* ── Footer ── */
  .footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid #D4E2FF;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 9px; color: #96989B;
  }

  /* ── Print ── */
  @media print {
    body { background: #fff; padding: 20px; max-width: 100%; }
    .domain-section { page-break-inside: avoid; }
    .no-print { display: none !important; }
  }

  /* ── Print button ── */
  .print-bar {
    position: fixed; top: 16px; right: 16px; z-index: 100;
    display: flex; gap: 10px;
  }
  .btn-print {
    padding: 9px 18px; border-radius: 10px;
    background: #0058E6; color: #fff;
    font-size: 11px; font-weight: 700;
    border: none; cursor: pointer; box-shadow: 0 2px 8px rgba(0,88,230,0.25);
  }
  .btn-print:hover { background: #0046c0; }
</style>
</head>
<body>

<div class="print-bar no-print">
  <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
</div>

<!-- ── Cover ── -->
<div class="cover">
  <div class="cover-logo">
    <div class="logo-mark">E</div>
    <div>
      <div class="logo-text">Edgbaston Wellness Clinic</div>
      <div class="logo-sub">Operational Intelligence System — Aria</div>
    </div>
  </div>
  <div class="cover-title">CQC Compliance Evidence Pack</div>
  <div class="cover-sub">Comprehensive compliance report covering all CQC key questions, calendar tasks, and staff attribution</div>
  <div class="cover-meta">
    <span>Generated: ${generated}</span>
    <span>Reference: EWC-CQC-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}</span>
    <span>Total questions: ${cqcRows.length}</span>
    <span>Answered: ${answered.length}</span>
  </div>
</div>

<!-- ── Score summary ── -->
<div class="score-strip">
  <div class="score-card">
    <div class="score-label">Overall CQC Score</div>
    <div class="score-value" style="color:${overallScore >= 80 ? '#059669' : overallScore >= 60 ? '#EA580C' : '#DC2626'}">${overallScore}%</div>
    <div class="score-row">
      <div class="score-row-item"><div class="dot" style="background:#059669"></div> Yes: ${yesCount}</div>
      <div class="score-row-item"><div class="dot" style="background:#EA580C"></div> Partial: ${cqcRows.filter(q => q.answer === 'partial').length}</div>
      <div class="score-row-item"><div class="dot" style="background:#DC2626"></div> No: ${cqcRows.filter(q => q.answer === 'no').length}</div>
    </div>
  </div>
  <div class="score-card">
    <div class="score-label">Calendar Task Status</div>
    <div class="score-row" style="margin-top:8px">
      <div class="score-row-item"><div class="dot" style="background:#059669"></div> On track: ${calOnTrack}</div>
      <div class="score-row-item"><div class="dot" style="background:#EA580C"></div> Due soon: ${calDueSoon}</div>
    </div>
    <div class="score-row">
      <div class="score-row-item"><div class="dot" style="background:#DC2626"></div> Overdue: ${calOverdue}</div>
    </div>
  </div>
  <div class="score-card">
    <div class="score-label">Completion Status</div>
    <div class="score-value" style="color:#181D23">${answered.length}/${cqcRows.length}</div>
    <div class="score-row">
      <div class="score-row-item">Questions answered</div>
    </div>
    <div class="score-row">
      <div class="score-row-item" style="color:#96989B">${cqcRows.filter(q => q.action_required).length} actions outstanding</div>
    </div>
  </div>
</div>

<!-- ── CQC Domain Sections ── -->
<div class="section-title">CQC Audit Checklist — By Domain</div>
<div class="section-desc">
  The following 57 questions map to the CQC 5 key questions framework. Scores reflect answered questions only.
  Evidence, actions, and responsible staff are recorded per question.
</div>
${domainSections}

<!-- ── Calendar Tasks ── -->
<div class="section-title">Compliance Calendar — Recurring Tasks</div>
<div class="section-desc">
  35 recurring compliance tasks covering equipment checks, audits, training, and governance requirements.
  Status is calculated from the next due date relative to today.
</div>
<table class="cal-table">
  <thead>
    <tr>
      <th>Task</th>
      <th>Frequency</th>
      <th>Responsible</th>
      <th>Last Completed</th>
      <th>Next Due</th>
      <th>Status</th>
    </tr>
  </thead>
  <tbody>${calTableRows}</tbody>
</table>

<!-- ── Signature block ── -->
<div class="signature-section">
  <div class="sig-block">
    <div class="sig-line"></div>
    <div class="sig-label">Medical Director / Registered Manager</div>
    <div class="sig-name">Dr Suresh Ganata</div>
  </div>
  <div class="sig-block">
    <div class="sig-line"></div>
    <div class="sig-label">Date signed</div>
    <div class="sig-name">&nbsp;</div>
  </div>
</div>

<!-- ── Footer ── -->
<div class="footer">
  <span>Edgbaston Wellness Clinic · Hagley Road, Edgbaston, Birmingham B16 · CQC Registration: EWC-CQC-2024</span>
  <span>Generated by Aria Operational Intelligence System · ${generated}</span>
</div>

</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
