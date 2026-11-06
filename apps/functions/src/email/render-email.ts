// apps/functions/src/email/render-email.ts
// The only place that composes a mail: a layout (standard or plain) around either a text template
// or a composer body. Templates are found by fixed document id (design 7.2), never chosen per send.
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
import { compileTemplate } from '../pdf/template-cache';
import { reportToSentry } from '../srv/sentry';
import { htmlToText } from './html-to-text';
import { isUsableEmailTemplate, layoutHasContent, resetLinkPresent, StoredTemplate } from './render-email.logic';

type StoredVersion = Pick<TemplateVersionModel, 'html' | 'text' | 'subject'>;

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

/** The tenant's own doc first, then the shared one; the first usable, published one wins. */
async function resolveTemplate(read: TemplateReader, tenantId: string, kind: TemplateKind, baseKey: string): Promise<Resolved | undefined> {
  for (const okey of [forkKeyFor(baseKey, tenantId), baseKey]) {
    const { doc, version } = await read(okey);
    if (version && isUsableEmailTemplate(doc, tenantId, kind)) return resolvedFrom(okey, doc?.currentVersion ?? 0, version);
  }
  return undefined;
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
    const standard = await resolveTemplate(read, req.tenantId, 'emailLayout', EmailLayoutKey);
    if (standard) return standard;
    if (req.noPlainFallback) throw new EmailTemplateError('The tenant has no standard email layout', 'no-standard-layout');
  }
  const plain = await resolveTemplate(read, req.tenantId, 'emailLayout', EmailPlainLayoutKey);
  if (!plain) throw new EmailTemplateError('No usable email layout', 'no-layout');
  return plain;
}

function compiled(t: Resolved, part: 'html' | 'text' | 'subject'): Promise<(vars: Record<string, string>) => string> {
  return compileTemplate(`email:${t.okey}@${t.version}:${part}`, t[part], undefined, { noEscape: part !== 'html' });
}

/** Same wording as `buildBrandedEmailHtml`. */
function attachmentNote(name: string, escape: (s: string) => string): { html: string; text: string } {
  return {
    html: `<p style="border-top:1px solid #eeeeee;padding-top:16px;color:#555555;font-size:14px;">📎 Beilage: <strong>${escape(name)}</strong></p>`,
    text: `📎 Beilage: ${name}`,
  };
}

export async function renderEmail(req: RenderEmailRequest, read: TemplateReader = firestoreTemplateReader): Promise<RenderedEmail> {
  const { default: Handlebars } = await import('handlebars');
  const cfg = await getAppEmailConfig(req.tenantId);

  // Shared variables come last: a caller must not spoof the footer or the app link.
  const vars: Record<string, string> = {
    ...req.variables,
    app_name: cfg.appName,
    app_url: `https://${cfg.appDomain}`,
    year: String(new Date().getFullYear()),
    ...(req.includeContact ? { contact_email: cfg.contactEmail } : {}),
  };

  const preview = req.previewVersion ? await resolvePreview(read, req.previewVersion) : undefined;
  const layout = await resolveLayout(read, req, preview?.kind === 'emailLayout' ? preview.template : undefined);

  let subject = '';
  let contentHtml: string;
  let contentText: string;
  if (req.textKey) {
    const text = preview?.kind === 'emailText' ? preview.template : await resolveTemplate(read, req.tenantId, 'emailText', req.textKey);
    if (!text) throw new EmailTemplateError('No usable email text', 'no-text');
    contentHtml = (await compiled(text, 'html'))(vars);
    contentText = (await compiled(text, 'text'))(vars);
    subject = (await compiled(text, 'subject'))(vars);
  } else if (req.body !== undefined) {
    contentHtml = req.body;
    contentText = htmlToText(req.body);
  } else {
    throw new EmailTemplateError('Neither a text template nor a body was given', 'no-content');
  }

  if (req.attachmentName) {
    const note = attachmentNote(req.attachmentName, Handlebars.escapeExpression);
    contentHtml += note.html;
    contentText += `\n\n${note.text}`;
  }

  if (!layoutHasContent(layout.html) || !layoutHasContent(layout.text)) {
    throw new EmailTemplateError('The email layout has no content slot', 'layout-without-content');
  }
  const html = (await compiled(layout, 'html'))({ ...vars, content: contentHtml });
  const text = (await compiled(layout, 'text'))({ ...vars, content: contentText });
  return { subject, html, text };
}

/**
 * The reset mail from our own templates, or `undefined` when the caller should fall to the next
 * source. A password reset must never fail because of a template, so this never throws.
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
    const mail = await renderEmail(
      { tenantId, layout: 'standard', textKey: EmailTextPasswordResetKey, noPlainFallback: true, variables },
      read
    );
    const link = variables['url'] ?? '';
    const { default: Handlebars } = await import('handlebars');
    if (!link || !resetLinkPresent(mail, link, Handlebars.escapeExpression(link))) return await fail('The rendered mail lacks the link', 'link-missing');
    // The caller needs a subject: an empty one would make the send throw with no fallback.
    const subject = mail.subject.trim();
    if (!subject) return await fail('The rendered mail has no subject', 'subject-missing');
    return { ...mail, subject };
  } catch (error) {
    if (error instanceof EmailTemplateError && error.code === 'no-standard-layout') {
      logger.info('Password reset: tenant has no standard email layout yet', { tenantId });
      return undefined;
    }
    const code = error instanceof EmailTemplateError ? error.code : 'render-failed';
    return await fail(error instanceof Error ? error.message : 'unknown', code);
  }
}
