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

/** The `tenants` entry of a shared email template: the operator's, used by every tenant. */
export const SHARED_TEMPLATE_OWNER = 'system';

/**
 * A template is usable when it is of the wanted kind, published, not archived and owned exactly by
 * `owner`: the tenant for a fork key, `system` for a base key. Containing the owner is not enough. The
 * rules let a tenant create a doc under any key with a mixed `tenants`, and that tenant's edit must
 * not reach another tenant's mail (design 7.2).
 */
export function isUsableEmailTemplate(doc: StoredTemplate | undefined, owner: string, kind: TemplateKind): boolean {
  if (!doc) return false;
  if ((doc.kind ?? 'pdf') !== kind) return false;
  if (doc.isArchived === true) return false;
  if ((doc.currentVersion ?? 0) < 1) return false;
  return doc.tenants?.length === 1 && doc.tenants[0] === owner;
}

/** An emailLayout must carry the unescaped content slot, otherwise the body would vanish from the mail. */
export function layoutHasContent(source: string): boolean {
  return /\{\{\{\s*content\s*\}\}\}/.test(source);
}

/** Around the sanitised reset html, which has no document structure of its own left. */
function inResetShell(fragment: string): string {
  return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>'
    + `<body style="margin:0;padding:0;background-color:#fff;">${fragment}</body></html>`;
}

/**
 * The token is, every time, the exact `href` of an `<a>`. Only sound on `sanitizeResetMail` output: it is
 * well-formed and escapes `<`, `>` and `"` inside attribute values, so a tag and an attribute can be read
 * off the string.
 */
function isOnlyALink(html: string, token: string): boolean {
  const occurrences = html.split(token).length - 1;
  const href = ` href="${token}"`;
  const links = (html.match(/<a\s[^<>]*>/g) ?? []).reduce((count, tag) => count + tag.split(href).length - 1, 0);
  return occurrences > 0 && links === occurrences;
}

/**
 * The token is there, and each time alone on its line, with only ascii spaces or tabs around it. Other
 * whitespace does not count: a client that linkifies the text half can read a url across a U+FEFF or
 * U+00A0 and would send the link to whoever the url names.
 */
function standsAlone(text: string, token: string): boolean {
  const occurrences = text.split(token).length - 1;
  const alone = text.replace(/\r\n/g, '\n').split('\n').filter((line) => line.replace(/^[ \t]+|[ \t]+$/g, '') === token).length;
  return occurrences > 0 && alone === occurrences;
}

/**
 * Swaps the token of a rendered reset mail for the real link, which never enters a template (a template
 * can read a variable character by character, so only the token may be readable to it). `mail.html` must
 * be the output of `sanitizeResetMail`; the result is that html in a fixed shell, so the bytes checked are
 * the bytes sent. `undefined` unless the token is only ever the `href` of an `<a>` in the html, stands
 * alone on its line in the text, and is not in the subject. So a template cannot lead the link anywhere but into a link.
 */
export function placeResetLink(mail: { html: string; text: string; subject: string }, token: string, link: string): { html: string; text: string } | undefined {
  if (mail.subject.includes(token) || !standsAlone(mail.text, token) || !isOnlyALink(mail.html, token)) return undefined;
  return {
    html: inResetShell(mail.html).split(token).join(link.replace(/&/g, '&amp;').replace(/"/g, '&quot;')),
    text: mail.text.split(token).join(link),
  };
}

/** The layout a client asked for: `plain` only when it says so, `standard` for anything else (also none). */
export function asLayoutChoice(value: unknown): EmailLayoutChoice {
  return value === 'plain' ? 'plain' : 'standard';
}
