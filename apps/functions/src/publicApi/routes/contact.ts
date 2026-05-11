import { Request, Response } from 'express';
import { logger } from 'firebase-functions/v2';
import { sendEmailViaProvider } from '../../auth/email-transport';

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
  if (!body.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return 'invalid email';
  if (!body.subject || !VALID_SUBJECTS.includes(body.subject as Subject)) return 'invalid subject';
  if (!body.message || body.message.length < 10 || body.message.length > 5000) return 'message must be 10-5000 chars';
  if (body.honeypot) return 'spam detected';
  return null;
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

  const toEmail = process.env['CONTACT_EMAIL'] ?? 'info@seeclub.org';
  const provider = process.env['EMAIL_PROVIDER'] ?? 'mailgun_smtp';
  const reference = `msg_${Date.now().toString(36)}`;

  const phoneText = body.phone ? `<br><strong>Telefon:</strong> ${escHtml(body.phone)}` : '';
  const html = `
    <p><strong>Kontaktformular-Nachricht</strong> (Ref: ${reference})</p>
    <p>
      <strong>Name:</strong> ${escHtml(body.name)}<br>
      <strong>E-Mail:</strong> ${escHtml(body.email)}${phoneText}<br>
      <strong>Betreff:</strong> ${escHtml(body.subject)}
    </p>
    <p><strong>Nachricht:</strong><br>${escHtml(body.message?.replace(/\n/g, '<br>'))}</p>
  `;

  try {
    await sendEmailViaProvider(provider, {
      from: 'Website Kontakt <app@seeclub.org>',
      to: [toEmail],
      subject: `Kontaktformular: ${body.subject} [${reference}]`,
      html,
    });

    logger.info('publicApi /contact: email sent', { reference, subject: body.subject });
    res.status(202).json({ status: 'accepted', reference });
  } catch (err) {
    logger.error('publicApi /contact: email failed', { err });
    res.status(500).json({ error: { code: 'internal_error', message: 'Failed to send message' } });
  }
}
