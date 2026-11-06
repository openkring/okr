// apps/functions/src/email/render-email.ts
// The only place that composes a mail: a layout (standard or plain) around either a text template
// or a composer body. Templates are found by fixed document id (design 7.2), never chosen per send.
import { randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  EmailLayoutChoice,
  EmailLayoutKey,
  EmailPlainLayoutKey,
  EmailTextPasswordResetKey,
  TemplateCollection,
  TemplateKind,
  TemplateVersionModel,
  TemplateVersionSubcollection,
} from '@okr/shared-models';
import { forkKeyFor } from '@okr/shared-util-core';
import { getAppEmailConfig } from '../auth/email-templates';
import { sanitizeEmailBody, sanitizeResetMail } from '../pdf/sanitize';
import { compileTemplate } from '../pdf/template-cache';
import { reportToSentry } from '../srv/sentry';
import { htmlToText } from './html-to-text';
import { isUsableEmailTemplate, layoutHasContent, placeResetLink, SHARED_TEMPLATE_OWNER, StoredTemplate } from './render-email.logic';

type StoredVersion = Pick<TemplateVersionModel, 'html' | 'text' | 'subject' | 'status'>;

/** Reads `templates/<okey>` and its `versions/<version ?? currentVersion>`. No doc gives `{}`. */
export type TemplateReader = (okey: string, version?: number) => Promise<{ doc?: StoredTemplate; version?: StoredVersion }>;

export const firestoreTemplateReader: TemplateReader = async (okey, version) => {
  const ref = getFirestore().collection(TemplateCollection).doc(okey);
  const snap = await ref.get();
  if (!snap.exists) return {};
  const doc = snap.data() as StoredTemplate;
  const wanted = version ?? doc.currentVersion ?? 0;
  if (wanted < 1) return { doc };
  const versionSnap = await ref.collection(TemplateVersionSubcollection).doc(String(wanted)).get();
  return { doc, version: versionSnap.exists ? (versionSnap.data() as StoredVersion) : undefined };
};

export type EmailTemplateErrorCode = 'no-standard-layout' | 'no-layout' | 'no-text' | 'layout-without-content' | 'bad-preview' | 'no-content';

/** A template problem (missing, unusable, malformed). Messages never carry variables, links or addresses. */
export class EmailTemplateError extends Error {
  constructor(
    message: string,
    public readonly code: EmailTemplateErrorCode
  ) {
    super(message);
    this.name = 'EmailTemplateError';
  }
}

export interface RenderEmailRequest {
  tenantId: string;
  layout: EmailLayoutChoice;
  /** Okey of a shared text template, e.g. `EmailTextPasswordResetKey`. Wins over `body`. */
  textKey?: string;
  /** Composer body, already sanitised by the caller. */
  body?: string;
  /** For the text template only: the layout, also tenant-editable, sees the shared variables and the content. */
  variables?: Record<string, string>;
  attachmentName?: string;
  /** Passes `contact_email` to the layout (composer mail only). */
  includeContact?: boolean;
  /** Do not drop to the plain layout when the tenant has no standard layout. */
  noPlainFallback?: boolean;
  /** Renders this exact version (possibly a draft) in place of the resolved template of the same kind. Preview callable only. */
  previewVersion?: { okey: string; version: number };
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

interface Resolved {
  okey: string;
  version: number;
  html: string;
  text: string;
  subject: string;
}

function resolvedFrom(okey: string, version: number, v: Partial<StoredVersion>): Resolved {
  return { okey, version, html: v.html ?? '', text: v.text ?? '', subject: v.subject ?? '' };
}

/**
 * The doc under a fixed key, if its owner is exactly the expected one and it is usable. `currentVersion`
 * alone does not prove a publish, because a client writes that pointer: the version must say so itself.
 */
async function readOwned(read: TemplateReader, okey: string, owner: string, kind: TemplateKind): Promise<Resolved | undefined> {
  const { doc, version } = await read(okey);
  const usable = version?.status === 'published' && isUsableEmailTemplate(doc, owner, kind);
  return usable ? resolvedFrom(okey, doc?.currentVersion ?? 0, version) : undefined;
}

/** The tenant's own doc first, then the shared one; the first usable, published one wins. */
async function resolveTemplate(read: TemplateReader, tenantId: string, kind: TemplateKind, baseKey: string): Promise<Resolved | undefined> {
  return (await readOwned(read, forkKeyFor(baseKey, tenantId), tenantId, kind)) ?? readOwned(read, baseKey, SHARED_TEMPLATE_OWNER, kind);
}

async function resolvePreview(read: TemplateReader, preview: { okey: string; version: number }): Promise<{ kind: TemplateKind; template: Resolved }> {
  const { doc, version } = await read(preview.okey, preview.version);
  const kind = doc?.kind;
  if (!version || (kind !== 'emailLayout' && kind !== 'emailText')) {
    throw new EmailTemplateError('The previewed version is not an email template', 'bad-preview');
  }
  return { kind, template: resolvedFrom(preview.okey, preview.version, version) };
}

async function resolveLayout(read: TemplateReader, req: RenderEmailRequest, override?: Resolved): Promise<Resolved> {
  if (override) return override;
  if (req.layout === 'standard') {
    // Only the tenant's own doc: the standard layout has no shared doc (design 7.2).
    const standard = await readOwned(read, forkKeyFor(EmailLayoutKey, req.tenantId), req.tenantId, 'emailLayout');
    if (standard) return standard;
    if (req.noPlainFallback) throw new EmailTemplateError('The tenant has no standard email layout', 'no-standard-layout');
  }
  const plain = await resolveTemplate(read, req.tenantId, 'emailLayout', EmailPlainLayoutKey);
  if (!plain) throw new EmailTemplateError('No usable email layout', 'no-layout');
  return plain;
}

function compiled(t: Resolved, part: 'html' | 'text' | 'subject'): Promise<(vars: Record<string, string>) => string> {
  return compileTemplate(`email:${t.okey}@${t.version}:${part}`, t[part], undefined, { noEscape: part !== 'html', noLog: true });
}

function attachmentNote(name: string, escape: (s: string) => string): { html: string; text: string } {
  return {
    html: `<p style="border-top:1px solid #eeeeee;padding-top:16px;color:#555555;font-size:14px;">📎 Beilage: <strong>${escape(name)}</strong></p>`,
    text: `📎 Beilage: ${name}`,
  };
}

export async function renderEmail(req: RenderEmailRequest, read: TemplateReader = firestoreTemplateReader): Promise<RenderedEmail> {
  const { default: Handlebars } = await import('handlebars');
  const cfg = await getAppEmailConfig(req.tenantId);

  const shared: Record<string, string> = {
    app_name: cfg.appName,
    app_url: `https://${cfg.appDomain}`,
    year: String(new Date().getFullYear()),
    ...(req.includeContact ? { contact_email: cfg.contactEmail } : {}),
  };
  // Shared variables come last: a caller must not spoof the footer or the app link.
  const textVars = { ...req.variables, ...shared };

  const preview = req.previewVersion ? await resolvePreview(read, req.previewVersion) : undefined;
  const layout = await resolveLayout(read, req, preview?.kind === 'emailLayout' ? preview.template : undefined);

  let subject = '';
  let contentHtml: string;
  let contentText: string;
  if (req.textKey) {
    const text = preview?.kind === 'emailText' ? preview.template : await resolveTemplate(read, req.tenantId, 'emailText', req.textKey);
    if (!text) throw new EmailTemplateError('No usable email text', 'no-text');
    contentHtml = (await compiled(text, 'html'))(textVars);
    contentText = (await compiled(text, 'text'))(textVars);
    subject = (await compiled(text, 'subject'))(textVars);
  } else if (req.body !== undefined) {
    contentHtml = req.body;
    contentText = htmlToText(req.body);
  } else {
    throw new EmailTemplateError('Neither a text template nor a body was given', 'no-content');
  }

  if (req.attachmentName) {
    const note = attachmentNote(req.attachmentName, Handlebars.escapeExpression);
    contentHtml += note.html;
    contentText = [contentText, note.text].filter(Boolean).join('\n\n');
  }

  if (!layoutHasContent(layout.html) || !layoutHasContent(layout.text)) {
    throw new EmailTemplateError('The email layout has no content slot', 'layout-without-content');
  }
  const html = (await compiled(layout, 'html'))({ ...shared, content: contentHtml });
  const text = (await compiled(layout, 'text'))({ ...shared, content: contentText });
  return { subject, html, text };
}

/**
 * A composer body in its layout: the body is sanitised here (never trust the client's HTML), the tenant's
 * contact address goes into the footer, and the result carries both halves. A failure throws; the sender
 * sees an error and nothing is sent (design 8).
 */
export async function composeBody(
  tenantId: string,
  input: { body: string; layout?: EmailLayoutChoice; attachmentName?: unknown },
  read: TemplateReader = firestoreTemplateReader
): Promise<RenderedEmail> {
  const body = await sanitizeEmailBody(input.body);
  // The name arrives from a client on every path: anything but real text means no note.
  const attachmentName = typeof input.attachmentName === 'string' ? input.attachmentName.trim() : '';
  // Checked after sanitising: a body of nothing but dropped tags would go out as an empty framed mail,
  // unless the attachment note gives it content.
  if (!attachmentName && !htmlToText(body) && !/<img\s[^>]*\bsrc=/i.test(body)) throw new EmailTemplateError('The mail body is empty', 'no-content');
  return renderEmail(
    { tenantId, layout: input.layout ?? 'standard', body, attachmentName: attachmentName || undefined, includeContact: true },
    read
  );
}

/**
 * The reset mail from our own templates, or `undefined` when the caller should fall to the next
 * source. A password reset must never fail because of a template, so this never throws.
 *
 * Templates are tenant-editable and the link opens any account, so they render a random token as `url`.
 * The html is then sanitised to a strict allowlist, and only that output is sent. The link replaces the
 * token last, and only where `placeResetLink` allows (design 7.5).
 */
export async function renderPasswordResetEmail(
  tenantId: string,
  variables: Record<string, string>,
  read: TemplateReader = firestoreTemplateReader
): Promise<RenderedEmail | undefined> {
  const fail = async (reason: string, code: string): Promise<undefined> => {
    // No link, no address in the log: only what identifies the cause.
    logger.error('Password-reset email template failed', { tenantId, reason, code });
    await reportToSentry({
      message: 'Password-reset email template failed',
      tags: { appId: tenantId, code },
      fingerprint: ['password-reset-template', code],
    });
    return undefined;
  };

  try {
    const link = variables['url'] ?? '';
    // No scheme and no colon: the sanitiser has to keep it as an href.
    const token = `okr-reset-${randomUUID()}`;
    const mail = await renderEmail(
      { tenantId, layout: 'standard', textKey: EmailTextPasswordResetKey, noPlainFallback: true, variables: { ...variables, url: token } },
      read
    );
    const placed = link ? placeResetLink({ ...mail, html: await sanitizeResetMail(mail.html) }, token, link) : undefined;
    if (!placed) return await fail('The rendered mail has no valid place for the link', 'link-refused');
    // The caller needs a subject: an empty one would make the send throw with no fallback.
    // A template's line breaks or doubled spaces have no place in a header.
    const subject = mail.subject.replace(/\s+/g, ' ').trim();
    if (!subject) return await fail('The rendered mail has no subject', 'subject-missing');
    return { ...placed, subject };
  } catch (error) {
    if (error instanceof EmailTemplateError && error.code === 'no-standard-layout') {
      logger.info('Password reset: tenant has no standard email layout yet', { tenantId });
      return undefined;
    }
    const code = error instanceof EmailTemplateError ? error.code : 'render-failed';
    return await fail(error instanceof Error ? error.message : 'unknown', code);
  }
}
