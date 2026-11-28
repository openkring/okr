// libs/content/pdf-template/util/src/lib/email-html.util.ts
// Pure helpers for composing the outgoing document email — no Angular/DOM deps.

import { parseEmailList } from '@okr/shared-util-core';

/**
 * Split a comma/semicolon-separated address string into bare, non-empty addresses
 * (`Name <a@b.ch>` and `mailto:a@b.ch` are reduced to `a@b.ch`).
 */
export function parseEmails(raw: string): string[] {
  return parseEmailList(raw);
}

/** Does the html body hold anything to read: text, or an image? The server refuses a mail without. */
export function emailBodyHasContent(html: string): boolean {
  if (/<img\s[^>]*\bsrc=/i.test(html)) return true;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').trim().length > 0;
}

/** Domain part of an email address, lower-cased. Empty when there is none. */
export function emailDomainOf(email: string): string {
  return email.trim().toLowerCase().split('@')[1] ?? '';
}

/**
 * Is `email` an acceptable sender for an app whose verified sending domain is `senderDomain`?
 *
 * The app is hosted on `app.seeclub.org` but mail is sent from the apex `seeclub.org`, and the
 * provider verifies the apex — so a strict equality check flagged the perfectly valid
 * `kommunikation@seeclub.org` as wrong. Accept the configured domain plus anything on either side
 * of the subdomain relation (`app.seeclub.org` ↔ `seeclub.org`); a foreign domain still fails.
 */
export function isSenderDomainAllowed(email: string, senderDomain: string): boolean {
  const domain = emailDomainOf(email);
  const expected = senderDomain.trim().toLowerCase();
  if (domain.length === 0 || expected.length === 0) return false;
  return domain === expected
    || domain.endsWith(`.${expected}`)      // mail from a subdomain of the verified domain
    || expected.endsWith(`.${domain}`);     // app hosted on a subdomain, mail from the apex
}

/** The id of the empty element that marks where the mail goes in its template (`withLayoutSlot`, `MailLayoutFrame`). */
export const MAIL_LAYOUT_SLOT_ID = 'okr-mail-layout-slot';

/** The body the template is rendered with to find its head and foot: one paragraph holding a word no mail contains. */
export const MAIL_LAYOUT_SLOT_BODY = `<p>${MAIL_LAYOUT_SLOT_ID}</p>`;

/**
 * The template as rendered around `MAIL_LAYOUT_SLOT_BODY`, its paragraph replaced by an empty `<div id=MAIL_LAYOUT_SLOT_ID>`:
 * what stands above the marker is the head of the template, what stands below it the foot. The renderer may give the
 * paragraph attributes; if it rewrote it otherwise, the word alone is replaced. Undefined when the word is not there.
 */
export function withLayoutSlot(rendered: string): string | undefined {
  const marker = `<div id="${MAIL_LAYOUT_SLOT_ID}"></div>`;
  const paragraph = new RegExp(`<p\\b[^>]*>\\s*${MAIL_LAYOUT_SLOT_ID}\\s*</p>`, 'i');
  if (paragraph.test(rendered)) return rendered.replace(paragraph, marker);
  if (rendered.includes(MAIL_LAYOUT_SLOT_ID)) return rendered.replace(MAIL_LAYOUT_SLOT_ID, marker);
  return undefined;
}
