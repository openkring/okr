// apps/functions/src/email/render-email.logic.ts
// Pure decisions of the email renderer. The Firestore-backed renderer builds on these.
import type { EmailLayoutChoice, TemplateKind } from '@okr/shared-models';

/** The slice of a `templates/{id}` doc the renderer reads. Legacy docs have no `kind`. */
export interface StoredTemplate {
  kind?: TemplateKind;
  tenants?: string[];
  isArchived?: boolean;
  currentVersion?: number;
  sampleData?: string;
}

/** A template is usable when it is of the wanted kind, published, not archived and visible to the tenant. */
export function isUsableEmailTemplate(doc: StoredTemplate | undefined, tenantId: string, kind: TemplateKind): boolean {
  if (!doc) return false;
  if ((doc.kind ?? 'pdf') !== kind) return false;
  if (doc.isArchived === true) return false;
  if ((doc.currentVersion ?? 0) < 1) return false;
  const tenants = doc.tenants ?? [];
  return tenants.includes(tenantId) || tenants.includes('system');
}

/** An emailLayout must carry the unescaped content slot, otherwise the body would vanish from the mail. */
export function layoutHasContent(source: string): boolean {
  return /\{\{\{\s*content\s*\}\}\}/.test(source);
}

/**
 * A password-reset mail is only worth sending when the user can reach the link from either half. The HTML half is
 * compiled with escaping, so the link may appear escaped; the text half is compiled raw and must hold it as is.
 */
export function resetLinkPresent(mail: { html: string; text: string }, link: string, escapedLink: string): boolean {
  return (mail.html.includes(link) || mail.html.includes(escapedLink)) && mail.text.includes(link);
}

/** The layout a client asked for: `plain` only when it says so, `standard` for anything else (also none). */
export function asLayoutChoice(value: unknown): EmailLayoutChoice {
  return value === 'plain' ? 'plain' : 'standard';
}
