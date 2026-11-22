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

/** The public link of a web version. */
export function webVersionUrl(origin: string, token: string): string {
  return `${origin}/m/${token}`;
}

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
