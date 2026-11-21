// apps/functions/src/newsletter/newsletter-link.ts
//
// Signed newsletter links (spec 1.169): double opt-in confirmation and one-click unsubscribe.
// Same HMAC scheme as the invitation links (calendar/answer-link.ts): nothing is stored, the signature
// binds the keys and a scope to INVITATION_LINK_SECRET, so the two kinds (and the invitation, mailing
// and course kinds) never verify for one another.
// `sign` takes two keys; the confirm link has only one, so its second key is the empty string.

import { sign, verify } from '../calendar/answer-link';

const CONFIRM = 'newsletter-confirm';
const UNSUBSCRIBE = 'newsletter-unsubscribe';

function buildUrl(base: string, params: Record<string, string>): string {
  const query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `${base}?${query}`;
}

/** The confirm link: `s` = signup key, `h` = signature. */
export function newsletterConfirmUrl(base: string, signupKey: string, secret: string): string {
  return buildUrl(base, { s: signupKey, h: sign(signupKey, '', CONFIRM, secret) });
}

export function verifyNewsletterConfirm(signupKey: string, sig: string, secret: string): boolean {
  return verify(signupKey, '', CONFIRM, sig, secret);
}

/** The unsubscribe link: `p` = person key, `g` = group key, `h` = signature. */
export function newsletterUnsubscribeUrl(base: string, personKey: string, groupKey: string, secret: string): string {
  return buildUrl(base, { p: personKey, g: groupKey, h: sign(personKey, groupKey, UNSUBSCRIBE, secret) });
}

export function verifyNewsletterUnsubscribe(personKey: string, groupKey: string, sig: string, secret: string): boolean {
  return verify(personKey, groupKey, UNSUBSCRIBE, sig, secret);
}

/**
 * An unsubscribe link of the longest length a real one gets, for counting a letter's pages before the send (the
 * Pingen quote): a project id of the GCP maximum (30), a person key longer than a Firestore auto id, the real group
 * key and a signature of the real length. Its text wraps at least as far as any real link, so the count is never
 * an underestimate; the QR code has a fixed size.
 */
export function sampleUnsubscribeUrl(groupKey: string): string {
  return newsletterUnsubscribeUrl(newsletterFunctionUrl('x'.repeat(30), 'newsletterUnsubscribe'), 'x'.repeat(28), groupKey, 'sample');
}

/** The function's own URL — deliberately not an app-domain rewrite, like the invitation links. */
export function newsletterFunctionUrl(projectId: string, fn: 'newsletterConfirm' | 'newsletterUnsubscribe'): string {
  return `https://europe-west6-${projectId}.cloudfunctions.net/${fn}`;
}
