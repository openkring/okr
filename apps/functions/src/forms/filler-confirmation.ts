import type { Field } from '@okr/shared-models';
import { isSsnField } from '@okr/shared-util-core';

/**
 * The thank-you mail to the filler (1.125 B, spec §10, `sendFillerConfirmation`). Pure.
 *
 * The body is the confirmation text `submitForm` also returns — built by `buildConfirmationMessage`,
 * which never puts an AHV number into a placeholder (R1) — with every filled-in answer passed through
 * {@link mailSafeAnswer}; never the raw answers. Nothing is stored.
 */

export const DEFAULT_FILLER_CONFIRMATION = 'Vielen Dank, deine Antwort ist eingegangen.';

/** One plain address: no list, no spaces, one `@` with something on both sides. */
const ADDRESS = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/** The longest answer the mail repeats; longer ones are cut with «…». */
export const MAIL_ANSWER_MAX = 80;

/**
 * Thank-you mails to one address per tenant per day, and per form per day (`_rateLimits`, fails
 * closed: no mail when the counter cannot be read). Anyone can type a stranger's address into a
 * public form; these bound how often the club's sender can be made to write to them.
 */
export const FILLER_MAIL_PER_RECIPIENT = { limit: 5, windowMs: 24 * 60 * 60 * 1000, failClosed: true as const };
export const FILLER_MAIL_PER_FORM = { limit: 200, windowMs: 24 * 60 * 60 * 1000, failClosed: true as const };

/** Invisible and direction-control characters: they can hide a link from the checks below. */
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;
/**
 * A word that could become a link in a mail client: a dot, slash, colon, at sign or backslash (or a
 * dot look-alike that survives NFKC: ideographic full stop, one-dot leader, division slash, fraction
 * slash) directly followed by a letter or digit. «evil.example», «a@b», «x/y», «1.5» all count.
 */
const LINKISH = /[./:@\\\u3002\u2024\u2215\u2044][\p{L}\p{N}]/u;

/**
 * One answer as the filler mail repeats it in a placeholder: on one line, without any word that
 * could be a link, an address or a domain, at most {@link MAIL_ANSWER_MAX} characters. The mail goes
 * out from the club's address to whatever address was typed in, so a stranger's text must not turn
 * it into a phishing mail. An allowlist by shape: a word is kept only when nothing in it could make
 * a mail client draw a link — even «1.5» or «St.Gallen» is dropped. The screen confirmation keeps
 * the answer as typed.
 */
export function mailSafeAnswer(answer: string): string {
  const cleaned = String(answer ?? '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .split(/\s+/)
    .filter((word) => word !== '' && !LINKISH.test(word))
    .join(' ');
  return cleaned.length > MAIL_ANSWER_MAX ? `${cleaned.slice(0, MAIL_ANSWER_MAX - 1).trimEnd()}…` : cleaned;
}

/**
 * The per-recipient limit key of an address: lower case, the `+tag` and the dots of the local part
 * removed. Many providers deliver «a.d.a+1@…» to «ada@…»; without this every variant would get
 * its own allowance. Only the KEY is normalized — the mail still goes to the address as typed.
 */
export function recipientLimitKey(address: string): string {
  const lower = String(address ?? '').normalize('NFKC').trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at <= 0) return lower;
  const local = lower.slice(0, at).split('+')[0].replace(/\./g, '');
  return `${local}@${lower.slice(at + 1)}`;
}

/** HTML-escapes text for the form mails (this one and the board notification in `index.ts`). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The answer of the first visible `email` field (field order) that holds one address; never an AHV field. */
export function firstVisibleEmail(fields: Field[], values: Record<string, unknown>, visible: Set<string>): string | undefined {
  const sorted = [...(Array.isArray(fields) ? fields : [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const field of sorted) {
    if (field?.type !== 'email' || isSsnField(field) || !visible.has(field.id)) continue;
    const raw = values?.[field.key];
    const address = typeof raw === 'string' ? raw.trim() : '';
    if (address !== '' && address.length <= 254 && ADDRESS.test(address)) return address;
  }
  return undefined;
}

/** The mail body: the form name as heading, the text escaped with its line breaks kept. */
export function buildFillerConfirmationHtml(formName: string, text: string): string {
  const body = escapeHtml(text ?? '').replace(/\r?\n/g, '<br>');
  return `<h2 style="margin:0 0 16px;">${escapeHtml(formName ?? '')}</h2>\n<p>${body}</p>`;
}

/** The whole mail, or undefined when the form has no visible e-mail answer. `confirmation` '' = the default text. */
export function buildFillerMail(
  formName: string,
  confirmation: string,
  fields: Field[],
  answers: Record<string, unknown>,
  visible: Set<string>,
): { to: string; subject: string; html: string } | undefined {
  const to = firstVisibleEmail(fields, answers, visible);
  if (to === undefined) return undefined;
  const text = typeof confirmation === 'string' && confirmation.trim() !== '' ? confirmation : DEFAULT_FILLER_CONFIRMATION;
  return { to, subject: `${formName} – Bestätigung`, html: buildFillerConfirmationHtml(formName, text) };
}

/**
 * A short, value-free code for a failed send, for the log: the HTTP status of a provider error
 * («Mailtrap API error 400: <body>» → '400'), else the error's `code`, else 'unknown'. Never the
 * provider's response body, which can echo the recipient or the text.
 */
export function mailErrorCode(e: unknown): string {
  const message = e instanceof Error ? e.message : '';
  const status = /\berror (\d{3})\b/i.exec(message)?.[1];
  if (status !== undefined) return status;
  const code = (e as { code?: unknown } | null | undefined)?.code;
  if ((typeof code === 'string' && /^[A-Za-z0-9_.-]{1,40}$/.test(code)) || typeof code === 'number') return String(code);
  return 'unknown';
}
