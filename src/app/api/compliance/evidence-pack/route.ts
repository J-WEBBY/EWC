import { NextResponse } from 'next/server';
import { createSovereignClient } from '@/lib/supabase/service';

// GET /api/compliance/evidence-pack — clean, professional compliance report

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
interface UserRow { id: string; first_name: string; last_name: string; }

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';

const shortFmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const answerLabel = (a: string | null) =>
  ({ yes: 'Yes', no: 'No', partial: 'Partial', na: 'N/A' }[a ?? ''] ?? 'Not answered');

const calStatus = (s: string) =>
  ({ overdue: 'Overdue', due_soon: 'Due Soon', ok: 'On Track', not_scheduled: 'Not scheduled' }[s] ?? s);

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
      db.from('users').select('id,first_name,last_name').eq('status', 'active'),
    ]);

    const cqc   = (cqcRes.data  ?? []) as CQCRow[];
    const cal   = (calRes.data  ?? []) as CalRow[];
    const users = (userRes.data ?? []) as UserRow[];
    const uMap: Record<string, string> = {};
    for (const u of users) uMap[u.id] = `${u.first_name} ${u.last_name}`.trim();

    const yesCount = cqc.filter(q => q.answer === 'yes').length;
    const noCount  = cqc.filter(q => q.answer === 'no').length;
    const partCount = cqc.filter(q => q.answer === 'partial').length;
    const answered  = cqc.filter(q => q.answer !== null).length;
    const score     = cqc.length ? Math.round(yesCount / cqc.length * 100) : 0;

    const generated = new Date().toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    const ref = `EWC/CQC/${new Date().getFullYear()}/${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    // Domain sections
    const domainBlocks = DOMAINS.map(domain => {
      const items = cqc.filter(q => (q.domain ?? '').toUpperCase() === domain);
      const domYes  = items.filter(q => q.answer === 'yes').length;
      const domAns  = items.filter(q => q.answer !== null).length;
      const domPct  = items.length ? Math.round(domYes / items.length * 100) : 0;

      const rows = items.map(q => {
        const evidence = q.evidence_notes?.replace(/^\[remind:\d+\]\s*/, '') ?? '';
        const byName   = q.answered_by ? (uMap[q.answered_by] ?? '') : '';
        return `
        <tr>
          <td class="num">${q.question_number}</td>
          <td class="area">${q.audit_area ?? ''}</td>
          <td class="qtext">${q.question_text}${evidence ? `<br/><span class="evidence">${evidence}</span>` : ''}${q.action_required ? `<br/><span class="action">Action: ${q.action_required}</span>` : ''}</td>
          <td class="ans">${answerLabel(q.answer)}</td>
          <td class="by">${byName}${q.audit_date ? `<br/>${shortFmt(q.audit_date)}` : ''}</td>
          <td class="td-date">${q.target_date ? shortFmt(q.target_date) : '—'}</td>
        </tr>`;
      }).join('');

      return `
      <div class="domain-block">
        <table class="domain-header-table">
          <tr>
            <td class="domain-name">${domain.charAt(0) + domain.slice(1).toLowerCase()}</td>
            <td class="domain-score">${domPct}% compliant &nbsp;·&nbsp; ${domAns}/${items.length} answered</td>
          </tr>
        </table>
        <table class="data-table">
          <thead><tr>
            <th class="col-num">#</th>
            <th class="col-area">Area</th>
            <th class="col-q">Question</th>
            <th class="col-ans">Answer</th>
            <th class="col-by">Completed by</th>
            <th class="col-date">Target date</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
    }).join('');

    // Calendar table
    const calRows = cal.map(t => {
      const notesClean = t.notes?.replace(/^\[remind:\d+\]\s*/, '') ?? '';
      const resp = t.responsible_user_id ? (uMap[t.responsible_user_id] ?? '—') : '—';
      return `
      <tr>
        <td>${t.task_name}${notesClean ? `<br/><span class="evidence">${notesClean}</span>` : ''}</td>
        <td>${t.frequency}</td>
        <td>${resp}</td>
        <td>${shortFmt(t.last_completed_date)}</td>
        <td>${shortFmt(t.next_due_date)}</td>
        <td>${calStatus(t.status)}</td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>Compliance Evidence Pack — Edgbaston Wellness Clinic</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 11pt;
    color: #111;
    background: #fff;
    max-width: 960px;
    margin: 0 auto;
    padding: 40px 48px;
  }

  /* Print bar */
  .print-bar {
    position: fixed; top: 16px; right: 16px;
    font-family: Arial, sans-serif;
  }
  .btn-print {
    padding: 8px 20px; background: #111; color: #fff;
    font-size: 11px; font-weight: 600; letter-spacing: 0.04em;
    border: none; cursor: pointer; border-radius: 4px;
  }
  @media print { .print-bar { display: none; } }

  /* Document header */
  .doc-header {
    border-bottom: 2px solid #111;
    padding-bottom: 20px;
    margin-bottom: 28px;
  }
  .doc-title {
    font-size: 20pt;
    font-weight: bold;
    letter-spacing: -0.01em;
    margin-bottom: 4px;
  }
  .doc-sub {
    font-size: 11pt;
    color: #444;
    margin-bottom: 16px;
  }
  .doc-meta {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
    border: 1px solid #111;
  }
  .doc-meta-cell {
    padding: 8px 12px;
    border-right: 1px solid #111;
    font-size: 9pt;
  }
  .doc-meta-cell:last-child { border-right: none; }
  .meta-label { font-weight: bold; text-transform: uppercase; letter-spacing: 0.06em; font-size: 7.5pt; color: #555; }
  .meta-value { margin-top: 2px; }

  /* Score summary */
  .score-table {
    width: 100%;
    border-collapse: collapse;
    margin: 24px 0;
    border: 1px solid #111;
  }
  .score-table th {
    background: #111;
    color: #fff;
    padding: 7px 12px;
    text-align: left;
    font-size: 9pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .score-table td {
    padding: 8px 12px;
    border-bottom: 1px solid #ccc;
    font-size: 10pt;
  }
  .score-table tr:last-child td { border-bottom: none; }
  .score-table .val { font-weight: bold; font-size: 12pt; }

  /* Section titles */
  .section-title {
    font-size: 13pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid #111;
    padding-bottom: 6px;
    margin: 32px 0 16px;
  }

  /* Domain blocks */
  .domain-block { margin-bottom: 28px; page-break-inside: avoid; }
  .domain-header-table {
    width: 100%;
    border-collapse: collapse;
    background: #f5f5f5;
    border: 1px solid #aaa;
    border-bottom: none;
  }
  .domain-header-table td { padding: 8px 12px; }
  .domain-name { font-weight: bold; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.05em; }
  .domain-score { text-align: right; font-size: 9pt; color: #333; }

  /* Data tables */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #aaa;
    font-size: 9.5pt;
  }
  .data-table thead tr { background: #eee; }
  .data-table th {
    padding: 6px 8px;
    text-align: left;
    font-size: 8pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid #aaa;
    border-right: 1px solid #ccc;
  }
  .data-table th:last-child { border-right: none; }
  .data-table td {
    padding: 7px 8px;
    border-bottom: 1px solid #e0e0e0;
    border-right: 1px solid #e8e8e8;
    vertical-align: top;
    line-height: 1.45;
  }
  .data-table td:last-child { border-right: none; }
  .data-table tbody tr:last-child td { border-bottom: none; }

  /* Column widths */
  .col-num  { width: 30px; }
  .col-area { width: 110px; }
  .col-q    { width: auto; }
  .col-ans  { width: 72px; }
  .col-by   { width: 120px; }
  .col-date { width: 90px; }

  .num  { font-size: 8pt; color: #666; }
  .area { font-size: 8.5pt; color: #444; }
  .ans  { font-size: 9pt; font-weight: 600; }
  .by   { font-size: 8.5pt; color: #444; }
  .td-date { font-size: 8.5pt; color: #444; }
  .evidence { font-style: italic; color: #555; font-size: 8.5pt; }
  .action   { color: #333; font-size: 8.5pt; }

  /* Signature block */
  .sig-section {
    margin-top: 48px;
    padding-top: 24px;
    border-top: 1px solid #111;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 48px;
  }
  .sig-line { border-bottom: 1px solid #111; height: 44px; margin-bottom: 6px; }
  .sig-label { font-size: 8.5pt; color: #444; }
  .sig-name  { font-size: 9.5pt; font-weight: bold; margin-top: 3px; }

  /* Footer */
  .doc-footer {
    margin-top: 36px;
    padding-top: 12px;
    border-top: 1px solid #ccc;
    font-size: 8pt;
    color: #666;
    display: flex;
    justify-content: space-between;
  }
</style>
</head>
<body>

<div class="print-bar">
  <button class="btn-print" onclick="window.print()">Print / Save PDF</button>
</div>

<!-- Document Header -->
<div class="doc-header">
  <div class="doc-title">CQC Compliance Evidence Pack</div>
  <div class="doc-sub">Edgbaston Wellness Clinic &nbsp;·&nbsp; Confidential</div>
  <div class="doc-meta">
    <div class="doc-meta-cell">
      <div class="meta-label">Generated</div>
      <div class="meta-value">${generated}</div>
    </div>
    <div class="doc-meta-cell">
      <div class="meta-label">Reference</div>
      <div class="meta-value">${ref}</div>
    </div>
    <div class="doc-meta-cell">
      <div class="meta-label">Provider</div>
      <div class="meta-value">Edgbaston Wellness Clinic, Birmingham</div>
    </div>
  </div>
</div>

<!-- Compliance Score Summary -->
<div class="section-title">Compliance Summary</div>
<table class="score-table">
  <thead><tr>
    <th>Metric</th><th>Value</th><th>Detail</th>
  </tr></thead>
  <tbody>
    <tr>
      <td>Overall CQC Score</td>
      <td class="val">${score}%</td>
      <td>${yesCount} of ${cqc.length} questions answered Yes</td>
    </tr>
    <tr>
      <td>Questions answered</td>
      <td class="val">${answered} / ${cqc.length}</td>
      <td>${cqc.length - answered} not yet answered</td>
    </tr>
    <tr>
      <td>Yes / Partial / No</td>
      <td class="val">${yesCount} / ${partCount} / ${noCount}</td>
      <td>${cqc.filter(q => q.answer === 'na').length} marked N/A</td>
    </tr>
    <tr>
      <td>Actions outstanding</td>
      <td class="val">${cqc.filter(q => q.action_required && q.action_required.trim()).length}</td>
      <td>Questions with a recorded action required</td>
    </tr>
    <tr>
      <td>Calendar tasks overdue</td>
      <td class="val">${cal.filter(t => t.status === 'overdue').length}</td>
      <td>${cal.filter(t => t.status === 'due_soon').length} due within 30 days</td>
    </tr>
  </tbody>
</table>

<!-- CQC Audit -->
<div class="section-title">CQC Audit Checklist</div>
<p style="font-size:9pt;color:#555;margin-bottom:16px;">
  57 questions mapped to the CQC 5 key questions framework.
  Evidence, actions, responsible staff, and target dates are recorded per question.
</p>
${domainBlocks}

<!-- Compliance Calendar -->
<div class="section-title">Compliance Calendar — Recurring Tasks</div>
<p style="font-size:9pt;color:#555;margin-bottom:12px;">
  35 mandatory recurring compliance checks. Status calculated from next due date.
</p>
<table class="data-table">
  <thead><tr>
    <th>Task</th>
    <th style="width:100px">Frequency</th>
    <th style="width:120px">Responsible</th>
    <th style="width:90px">Last Completed</th>
    <th style="width:90px">Next Due</th>
    <th style="width:80px">Status</th>
  </tr></thead>
  <tbody>${calRows}</tbody>
</table>

<!-- Signature -->
<div class="sig-section">
  <div>
    <div class="sig-line"></div>
    <div class="sig-label">Signed — Medical Director / Registered Manager</div>
    <div class="sig-name">Dr Suresh Ganata MB ChB</div>
  </div>
  <div>
    <div class="sig-line"></div>
    <div class="sig-label">Date signed</div>
    <div class="sig-name">&nbsp;</div>
  </div>
</div>

<!-- Footer -->
<div class="doc-footer">
  <span>Edgbaston Wellness Clinic &nbsp;·&nbsp; Hagley Road, Edgbaston, Birmingham B16</span>
  <span>${ref} &nbsp;·&nbsp; Generated ${generated}</span>
</div>

</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
