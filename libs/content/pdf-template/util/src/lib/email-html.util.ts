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
