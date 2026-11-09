import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v2';
import { sendEmailViaProvider } from '../../auth/email-transport';
import { renderEmail } from '../../email/render-email';
import { htmlToText } from '../../email/html-to-text';
import { clientIp, checkRateLimit } from '../rateLimit';

// Per-IP (best-effort) + global backstop. The global cap bounds total relayed
// volume even if the per-IP key is spoofed.
const HOUR_MS = 60 * 60 * 1000;
const PER_IP_LIMIT = { limit: 5, windowMs: HOUR_MS };
const GLOBAL_LIMIT = { limit: 100, windowMs: HOUR_MS };

const VALID_SUBJECTS = ['general', 'course', 'lateral', 'youth', 'boathouse'] as const;
type Subject = typeof VALID_SUBJECTS[number];

interface ContactRequest {
  name: string;
  email: string;
  phone?: string;
  subject: Subject;
  message: string;
  language?: 'de' | 'en';
  honeypot?: string;
}

export function validateContact(body: Partial<ContactRequest>): string | null {
  if (!body.name || body.name.length < 2 || body.name.length > 100) return 'name must be 2-100 chars';
  if (!body.email || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return 'invalid email';
  if (!body.subject || !VALID_SUBJECTS.includes(body.subject as Subject)) return 'invalid subject';
  if (!body.message || body.message.length < 10 || body.message.length > 5000) return 'message must be 10-5000 chars';
  if (body.honeypot) return 'spam detected';
  return null;
}

/** The labels the website shows in its subject dropdown (scs-website kontakt.html). */
const SUBJECT_LABELS: Record<Subject, string> = {
  general: 'Allgemeine Anfrage',
  course: 'Kursanmeldung',
  lateral: 'Quereinstieg',
  youth: 'Jugendrudern',
  boathouse: 'Bootshaus-Projekt',
};

export function subjectLabel(subject: Subject): string {
  return SUBJECT_LABELS[subject] ?? subject;
}

function escHtml(str: string | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function contactRouter(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<ContactRequest>;

  const validationError = validateContact(body);
  if (validationError) {
    res.status(400).json({ error: { code: 'validation_error', message: validationError } });
    return;
  }

  // Throttle relay abuse: per-IP first, then a global backstop. (M-7)
  const ip = clientIp(req);
  const [perIp, global] = await Promise.all([
    checkRateLimit('contact:ip', ip, PER_IP_LIMIT),
    checkRateLimit('contact:global', 'all', GLOBAL_LIMIT),
  ]);
  if (!perIp.allowed || !global.allowed) {
    const retryAfterMs = Math.max(perIp.retryAfterMs, global.retryAfterMs);
    logger.warn('publicApi /contact: rate limited', { scope: !perIp.allowed ? 'ip' : 'global' });
    res.set('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
    res.status(429).json({ error: { code: 'rate_limited', message: 'Too many requests. Please try again later.' } });
    return;
  }

  const toEmail = process.env['CONTACT_EMAIL'] ?? 'info@seeclub.org';
  const provider = process.env['EMAIL_PROVIDER'] ?? 'mailtrap_api';
  const reference = `msg_${Date.now().toString(36)}`;

  const tenantId = process.env['CONTACT_TENANT'] ?? 'scs';
  const label = subjectLabel(body.subject as Subject);
  const mailSubject = `Kontaktformular: ${label}`;
  const fallbackHtml = buildContactBody(body as ContactRequest, reference);
  let html = fallbackHtml;
  let text = htmlToText(fallbackHtml);
  try {
    // The tenant's standard email layout (header, logo, footer) around the message.
    const rendered = await renderEmail({ tenantId, layout: 'standard', body: fallbackHtml });
    html = rendered.html;
    text = rendered.text;
  } catch (err) {
    // A template problem must never lose a message: send the bare body instead.
    logger.warn('publicApi /contact: email layout failed, sending plain body', { tenantId, err });
  }

  try {
    await sendEmailViaProvider(provider, {
      from: 'Website Kontakt <app@seeclub.org>',
      to: [toEmail],
      subject: mailSubject,
      html,
      text,
      // A reply goes straight to the person who wrote, not back to the app address.
      replyTo: body.email,
    });

    logger.info('publicApi /contact: email sent', { reference, subject: body.subject });
    res.status(202).json({ status: 'accepted', reference });
  } catch (err) {
    logger.error('publicApi /contact: email failed', { err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to send message' } });
  }
}

/**
 * The message as a readable mail body: who wrote, how to reach them, what about, and the text itself.
 * Every user value is escaped; line breaks become <br> only after escaping.
 */
export function buildContactBody(body: ContactRequest, reference: string): string {
  const row = (label: string, value: string): string =>
    `<tr><td style="padding:4px 16px 4px 0;color:#555555;vertical-align:top;white-space:nowrap;">${label}</td><td style="padding:4px 0;vertical-align:top;">${value}</td></tr>`;
  const email = escHtml(body.email);
  const rows = [
    row('Name', escHtml(body.name)),
    row('E-Mail', `<a href="mailto:${email}">${email}</a>`),
    ...(body.phone ? [row('Telefon', escHtml(body.phone))] : []),
    row('Thema', escHtml(subjectLabel(body.subject))),
  ].join('');
  const message = escHtml(body.message).replace(/\r?\n/g, '<br>');
  return `
    <p>Über das Kontaktformular der Website ist eine neue Nachricht eingegangen.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;">${rows}</table>
    <p style="margin:16px 0 4px 0;color:#555555;">Nachricht</p>
    <p style="margin:0;padding:12px 16px;background:#f5f7fa;border-left:3px solid #cccccc;">${message}</p>
    <p style="margin-top:16px;color:#555555;font-size:13px;">Mit «Antworten» schreibst du direkt an ${escHtml(body.name)}.</p>
    <p style="color:#999999;font-size:12px;">Referenz: ${reference}</p>
  `;
}
