// =============================================================================
// Email Client — Resend
// Used by automation workflows to send transactional emails
//
// Required env var:
//   RESEND_API_KEY       — From resend.com dashboard
//   RESEND_FROM_EMAIL    — Verified sender e.g. "EWC <noreply@edgbastonwellness.co.uk>"
// =============================================================================

import { Resend } from 'resend';

const RESEND_API_KEY   = process.env.RESEND_API_KEY   ?? '';
const FROM_EMAIL       = process.env.RESEND_FROM_EMAIL ?? 'EWC <noreply@edgbastonwellness.co.uk>';

export function isEmailConfigured(): boolean {
  return Boolean(RESEND_API_KEY);
}

// =============================================================================
// sendEmail — plain text + HTML email via Resend
// =============================================================================

export async function sendEmail(params: {
  to:      string;
  subject: string;
  text:    string;    // plain text fallback
  html:    string;    // HTML body
}): Promise<{ id: string }> {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

  const resend = new Resend(RESEND_API_KEY);
  const { data, error } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      params.to,
    subject: params.subject,
    text:    params.text,
    html:    params.html,
  });

  if (error || !data) throw new Error(error?.message ?? 'Resend send failed');
  return { id: data.id };
}

// =============================================================================
// bookingConfirmationEmail — branded HTML for appointment confirmation
// =============================================================================

export function bookingConfirmationEmail(params: {
  firstName:        string;
  appointmentType:  string;
  dateLabel:        string;
  timeLabel:        string;
  practitionerName: string;
}): { subject: string; text: string; html: string } {
  const subject = `Your appointment is confirmed — ${params.dateLabel}`;

  const text =
    `Hi ${params.firstName},\n\n` +
    `Your ${params.appointmentType} appointment at Edgbaston Wellness Clinic is confirmed.\n\n` +
    `Date: ${params.dateLabel}\n` +
    `Time: ${params.timeLabel}\n` +
    `Practitioner: ${params.practitionerName}\n\n` +
    `We look forward to seeing you.\n\n` +
    `Edgbaston Wellness Clinic\n` +
    `Please do not reply to this email.`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Appointment Confirmed</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFF;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;border:1px solid #D4E2FF;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:#181D23;padding:28px 36px;">
              <p style="margin:0;font-size:11px;color:#96989B;letter-spacing:0.18em;text-transform:uppercase;">Edgbaston Wellness Clinic</p>
              <h1 style="margin:6px 0 0;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">Appointment Confirmed</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px;">
              <p style="margin:0 0 20px;font-size:15px;color:#181D23;">Hi ${params.firstName},</p>
              <p style="margin:0 0 28px;font-size:14px;color:#3D4451;line-height:1.6;">
                Your <strong>${params.appointmentType}</strong> appointment is confirmed. We look forward to seeing you.
              </p>

              <!-- Appointment details card -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFF;border:1px solid #D4E2FF;border-radius:12px;margin-bottom:28px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #D4E2FF;">
                          <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:#96989B;font-weight:600;">Date</span><br/>
                          <span style="font-size:14px;color:#181D23;font-weight:500;">${params.dateLabel}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #D4E2FF;">
                          <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:#96989B;font-weight:600;">Time</span><br/>
                          <span style="font-size:14px;color:#181D23;font-weight:500;">${params.timeLabel}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;border-bottom:1px solid #D4E2FF;">
                          <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:#96989B;font-weight:600;">Treatment</span><br/>
                          <span style="font-size:14px;color:#181D23;font-weight:500;">${params.appointmentType}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:#96989B;font-weight:600;">Practitioner</span><br/>
                          <span style="font-size:14px;color:#181D23;font-weight:500;">${params.practitionerName}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#3D4451;line-height:1.6;">
                If you need to reschedule or have any questions, please call us directly.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F8FAFF;border-top:1px solid #D4E2FF;padding:20px 36px;">
              <p style="margin:0;font-size:11px;color:#96989B;line-height:1.6;">
                Edgbaston Wellness Clinic · Edgbaston, Birmingham<br/>
                Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
