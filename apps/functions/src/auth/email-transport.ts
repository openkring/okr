import * as nodemailer from 'nodemailer';

export type EmailProvider = 'mailgun_smtp' | 'mailtrap_api' | 'netzone_smtp' | 'mailtrap_test';

export const VALID_PROVIDERS: EmailProvider[] = ['mailgun_smtp', 'mailtrap_api', 'netzone_smtp', 'mailtrap_test'];

/**
 * Provider used when a tenant's `app-config` carries no `emailProvider` field.
 *
 * The single source of truth for every caller — the erasure notification used to fall back to
 * `mailgun_smtp` while the mail job and the workflow outbox fell back to `mailtrap_api`, so a
 * tenant without the field silently sent one of its mails through a different provider (other
 * credentials, other verified sender domain). Change it here, not at a call site.
 */
export const DEFAULT_EMAIL_PROVIDER: EmailProvider = 'mailtrap_api';

export function isValidProvider(p: string): p is EmailProvider {
  return VALID_PROVIDERS.includes(p as EmailProvider);
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  contentType: string;
}

export interface EmailOptions {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments?: EmailAttachment[];
  template?: string;                            // Mailtrap template UUID (mailtrap_api only)
  templateVariables?: Record<string, string>;   // Variables passed to the Mailtrap template
}

// ─── SMTP configs ────────────────────────────────────────────────────────────

function mailgunSmtpConfig() {
  return {
    host: 'smtp.mailgun.org',
    port: 587,
    secure: false,
    auth: { user: 'postmaster@mail.seeclub.org', pass: process.env['MAILGUN_SMTP_PASSWORD'] },
  };
}

function netzoneSmtpConfig() {
  return {
    host: 'mail.netzone.ch',
    port: 587,
    secure: false,
    auth: { user: 'app@seeclub.org', pass: process.env['NETZONE_SMTP_PASSWORD'] },
  };
}

function mailtrapTestConfig() {
  // Credentials from Mailtrap → Inboxes → SMTP Settings
  return {
    host: 'sandbox.smtp.mailtrap.io',
    port: 2525,
    secure: false,
    auth: { user: process.env['MAILTRAP_TEST_USER'], pass: process.env['MAILTRAP_TEST_PASS'] },
  };
}

// ─── Mailtrap template resolution ────────────────────────────────────────────

const TEMPLATE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve `options.template` to a Mailtrap template UUID.
 *
 * Templates are identified by UUID only — callers read the tenant's own UUID from `app-config`
 * (e.g. `mailtrapPasswordResetTemplate`), so adding a tenant is one Firestore field and no deploy.
 * Anything that is not a UUID is ignored, and the send falls back to `subject` + `html`.
 */
function resolveTemplateUuid(template?: string): string | undefined {
  return template && TEMPLATE_UUID_RE.test(template) ? template : undefined;
}

// ─── Senders ─────────────────────────────────────────────────────────────────

async function sendViaSMTP(config: object, options: EmailOptions): Promise<void> {
  const transporter = nodemailer.createTransport(config);
  await transporter.sendMail({
    from: options.from,
    replyTo: options.from,
    to: options.to.join(', '),
    ...(options.cc?.length  ? { cc:  options.cc.join(', ')  } : {}),
    ...(options.bcc?.length ? { bcc: options.bcc.join(', ') } : {}),
    subject: options.subject,
    html: options.html,
    ...(options.attachments?.length ? {
      attachments: options.attachments.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    } : {}),
  });
}

async function sendViaMailtrapApi(options: EmailOptions): Promise<void> {
  const apiKey = process.env['MAILTRAP_APIKEY'];

  const body: Record<string, unknown> = {
    from: parseFrom(options.from),
    to:   options.to.map(e => ({ email: e })),
  };

  if (options.cc?.length)  body['cc']  = options.cc.map(e => ({ email: e }));
  if (options.bcc?.length) body['bcc'] = options.bcc.map(e => ({ email: e }));

  const templateUuid = resolveTemplateUuid(options.template);

  if (templateUuid) {
    body['template_uuid']      = templateUuid;
    body['template_variables'] = options.templateVariables ?? {};
  } else {
    body['subject'] = options.subject;
    body['html']    = options.html;
  }

  if (options.attachments?.length) {
    body['attachments'] = options.attachments.map(a => ({
      filename:    a.filename,
      content:     a.content.toString('base64'),
      type:        a.contentType,
      disposition: 'attachment',
    }));
  }

  const response = await fetch('https://send.api.mailtrap.io/api/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mailtrap API error ${response.status}: ${text}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Parse "Display Name <email@domain.com>" or plain "email@domain.com" */
function parseFrom(from: string): { email: string; name?: string } {
  const match = from.match(/^(.+)<(.+)>$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { email: from.trim() };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function sendEmailViaProvider(provider: string, options: EmailOptions): Promise<void> {
  switch (provider) {
    case 'mailgun_smtp':  return sendViaSMTP(mailgunSmtpConfig(), options);
    case 'mailtrap_api':  return sendViaMailtrapApi(options);
    case 'netzone_smtp':  return sendViaSMTP(netzoneSmtpConfig(), options);
    case 'mailtrap_test': return sendViaSMTP(mailtrapTestConfig(), options);
    default: throw new Error(`Unknown email provider: ${provider}`);
  }
}
