// apps/functions/src/email/mail-page/web-version.logic.ts
//
// The web version of a Versand (spec 1.171 §7.5): pure helpers. The server decides whether a send gets one,
// creates its unguessable token and adds the «Im Browser ansehen» line to the E-Mail channel only.
import { randomBytes } from 'node:crypto';

/** On when the sender asked for it; without an explicit choice, on for a newsletter and off otherwise (§7.1). */
export function webVersionOn(requested: boolean | undefined, isNewsletter: boolean): boolean {
  return typeof requested === 'boolean' ? requested : isNewsletter;
}

/** 128 random bits as 22 base64url characters: the id of `mailingWeb/{token}` and the last segment of the link. */
export function newWebToken(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * The function's own URL, like the answer links (`mailingAnswerFunctionUrl`): no app-domain rewrite, so no
 * hosting route and no service-worker exclusion per app.
 */
export function mailingWebFunctionUrl(projectId: string): string {
  return `https://europe-west6-${projectId}.cloudfunctions.net/mailingWeb`;
}

/** The public link of a web version: the function URL with the token as `t`. */
export function webVersionUrl(baseUrl: string, token: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set('t', token);
  return url.toString();
}

const WEB_TOKEN = /^[A-Za-z0-9_-]{22}$/;

/**
 * The token of a web-version request: exactly 22 base64url characters in `t`, at the function's root. Anything
 * else (another path, a repeated or missing `t`, a shorter or longer value, `..`, a slash) is no token.
 */
export function webTokenFromRequest(path: string, query: Record<string, unknown>): string | undefined {
  if (path !== '' && path !== '/') return undefined;
  const t = query['t'];
  return typeof t === 'string' && WEB_TOKEN.test(t) ? t : undefined;
}

/**
 * The web version's CSP. As ANSWER_PAGE_CSP (no script of any kind, no framing, no <base>), with two changes:
 * - img-src allows every https image, because the mail body does (`sanitizeEmailBody`: img src https) and an
 *   article image may come from outside imgix; the snapshot would otherwise show broken images.
 * - form-action 'none': the snapshot has no form (the answer page posts back to its function; this page never).
 */
export const WEB_VERSION_CSP = "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

/** The page for an unknown or turned-off token: neutral, no tenant frame (no tenant is known), no detail. */
export const WEB_VERSION_NOT_FOUND_PAGE = '<!doctype html><html lang="de"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Nicht gefunden</title></head>'
  + '<body style="font-family:Arial,Helvetica,sans-serif;color:#333333;max-width:600px;margin:48px auto;padding:0 16px;">'
  + '<h1 style="font-size:20px;">Diese Seite gibt es nicht</h1>'
  + '<p>Der Link ist nicht mehr gültig, oder die Webversion wurde ausgeschaltet.</p></body></html>';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** A small centred line with the link to the web version, above the body. */
export function withWebLink(body: string, url: string, label: string): string {
  const line = '<p style="text-align:center;font-size:12px;color:#888888;margin:0 0 16px 0;">'
    + `<a href="${escapeHtml(url)}" style="color:#888888;">${escapeHtml(label)}</a></p>`;
  return line + body;
}
