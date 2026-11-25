// apps/functions/src/email/personal-mail.logic.ts
//
// A Versand that asks about events sends one mail per recipient, each with that person's signed answer link
// (design §5). Pure helpers for the personal path of `onMailing` / `onMailJob`; no Firestore, no provider.

import { HttpsError } from 'firebase-functions/v2/https';

import { escapeHtml } from '../calendar/mail';
import { eventRefusalOf, type AnswerRefusal } from '../calendar/refusal';
import type { AnswerableEvent } from '../calendar/invitation';

/** At most this many events one Versand asks about. */
export const MAX_ANSWER_EVENTS = 20;
/** At most this many email recipients with events: one 540 s `onMailJob` run at `PER_MAIL_PAUSE_MS`. */
export const MAX_PERSONAL_RECIPIENTS = 800;
/** Pause between two personal mails; keeps the provider's per-second limit. */
export const PER_MAIL_PAUSE_MS = 200;
/**
 * A personal send stops starting new mails after this long, so the 540 s run still has time to write
 * how far it got. Slow providers and big attachments can make 800 mails take longer than the run.
 */
export const PERSONAL_DEADLINE_MS = 480_000;

/** Whether a personal send has used up its time and must not start another mail. */
export function deadlineReached(startMs: number, nowMs: number, limitMs = PERSONAL_DEADLINE_MS): boolean {
  return nowMs - startMs > limitMs;
}

/** The job's end state when the deadline stopped the send: failed, with how many mails went out. */
export function deadlineOutcome(sent: number, total: number): { state: 'failed'; error: string } {
  return { state: 'failed', error: `${sent} von ${total} Mails gesendet – die Zeit hat nicht gereicht.` };
}

/** A block appended below the body of every personal mail; each has its own placeholder and per-entry url. */
export type PersonalBlock = 'answer' | 'unsubscribe';

export interface PersonalEntry {
  to: string;
  /** the signed answer link (block `answer`); absent on a newsletter send without events */
  answerUrl?: string;
  /** the signed unsubscribe link (block `unsubscribe`), set on a newsletter send only */
  unsubscribeUrl?: string;
  /** Extra mail headers for this recipient's mail (e.g. a personal `List-Unsubscribe`). */
  headers?: Record<string, string>;
}

export interface AnswerEventLine {
  name: string;
  when: string;
}

/** The calevent keys of a request: none = `[]`, each once, at most MAX_ANSWER_EVENTS, all strings. */
export function parseCaleventKeys(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.some((key) => typeof key !== 'string' || !key)) {
    throw new HttpsError('invalid-argument', 'caleventKeys must be a list of strings.');
  }
  const keys = [...new Set(raw as string[])];
  if (keys.length > MAX_ANSWER_EVENTS) throw new HttpsError('invalid-argument', `At most ${MAX_ANSWER_EVENTS} events.`);
  return keys;
}

/**
 * One entry per person with an address, in order. Never deduped by address: two persons sharing one
 * (a couple, a family) each get their own mail with their own link. `urlFor` gives the answer link (none
 * without events); `unsubscribeUrlFor` (a newsletter send) adds the person's unsubscribe link and its headers.
 */
export function personalEntries(
  personKeys: string[], emailByKey: Map<string, string>, urlFor: ((personKey: string) => string) | undefined,
  unsubscribeUrlFor?: (personKey: string) => string,
): PersonalEntry[] {
  const out: PersonalEntry[] = [];
  for (const key of personKeys) {
    const to = emailByKey.get(key);
    if (!to) continue;
    const unsubscribeUrl = unsubscribeUrlFor?.(key);
    out.push({
      to,
      ...(urlFor ? { answerUrl: urlFor(key) } : {}),
      ...(unsubscribeUrl ? { unsubscribeUrl, headers: unsubscribeHeaders(unsubscribeUrl) } : {}),
    });
  }
  return out;
}

/** The entries split into mail jobs of at most `size`: one `onMailJob` run sends at most MAX_PERSONAL_RECIPIENTS. */
export function chunkPersonal<T>(entries: T[], size = MAX_PERSONAL_RECIPIENTS): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < entries.length; i += size) out.push(entries.slice(i, i + size));
  return out;
}

/** The links of the two blocks; `composeSample` finds them in the text half by these. */
export const ANSWER_LINK_LABEL = 'An- oder abmelden';
export const UNSUBSCRIBE_LINK_LABEL = 'Newsletter abbestellen';

/** The newsletter footer line under the mail body: the person's own link to sign off. */
export function unsubscribeBlockHtml(url: string): string {
  return `<p style="text-align:center;font-size:12px;color:#6e7781;">`
    + `<a href="${escapeHtml(url)}" style="color:#6e7781;">${UNSUBSCRIBE_LINK_LABEL}</a></p>`;
}

/** The one-click unsubscribe headers (RFC 8058) of a newsletter mail. */
export function unsubscribeHeaders(url: string): Record<string, string> {
  return { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
}

/** The block under the mail body: the events and the button to the personal answer page. */
export function answerBlockHtml(url: string, events: AnswerEventLine[]): string {
  const lines = events.map((e) => `${escapeHtml(e.when)} · ${escapeHtml(e.name)}`).join('<br>');
  return `<p>Melde dich hier für die Anlässe an oder ab:</p>`
    + `<p>${lines}</p>`
    + `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 20px;background:#1f6feb;color:#ffffff;`
    + `text-decoration:none;border-radius:6px;">${ANSWER_LINK_LABEL}</a></p>`;
}

/** The job's end state: `failed` only when nothing went out; any failure is named in `error`. */
export function personalOutcome(sent: number, failed: number): { state: 'sent' | 'failed'; error?: string } {
  const state = sent === 0 && failed > 0 ? 'failed' : 'sent';
  return failed > 0 ? { state, error: `${failed} von ${sent + failed} Mails konnten nicht gesendet werden.` } : { state };
}

/** The answer block's url while the mail is composed once for everybody; cannot occur in user text. */
export const ANSWER_URL_PLACEHOLDER = 'https://answer.invalid/__OKR_ANSWER_URL__';

/** The unsubscribe block's url while the mail is composed once for everybody; cannot occur in user text. */
export const UNSUBSCRIBE_URL_PLACEHOLDER = 'https://unsubscribe.invalid/__OKR_UNSUBSCRIBE_URL__';

/** The placeholder each block's url takes while the mail is composed once. */
export const BLOCK_PLACEHOLDER: Record<PersonalBlock, string> = { answer: ANSWER_URL_PLACEHOLDER, unsubscribe: UNSUBSCRIBE_URL_PLACEHOLDER };

/** One person's mail out of the shared composition: `placeholder` becomes the url (escaped in html, raw in text). */
export function fillUrl(rendered: { html: string; text?: string }, placeholder: string, url: string): { html: string; text?: string } {
  return {
    html: rendered.html.split(placeholder).join(escapeHtml(url)),
    ...(rendered.text !== undefined ? { text: rendered.text.split(placeholder).join(url) } : {}),
  };
}

/** One person's mail out of the shared composition: the answer placeholder becomes the url. */
export function fillAnswerUrl(rendered: { html: string; text?: string }, url: string): { html: string; text?: string } {
  return fillUrl(rendered, ANSWER_URL_PLACEHOLDER, url);
}

/**
 * Why an event cannot be asked about at send time (undefined = fine): the tenant check, a personal event
 * (no calendar: only its organiser and invitees may see it, never a Versand list), then the answer rules.
 */
export function sendableEventRefusal(event: AnswerableEvent | undefined, tenantId: string, today: string): AnswerRefusal | undefined {
  if (!event?.tenants?.includes(tenantId)) return 'eventGone';
  if (!Array.isArray(event.calendars) || event.calendars.length === 0) return 'eventGone';
  return eventRefusalOf(event, today);
}

/** The sender's message for an event `sendMailing` refuses: names the event, so they know which to remove. */
export function refusedEventMessage(name: string | undefined): string {
  const label = (name ?? '').trim();
  return label
    ? `Der Anlass «${label}» kann nicht mehr beantwortet werden (nicht mehr vorhanden, abgesagt, geschlossen oder vorbei). Entferne ihn bitte aus dem Versand.`
    : 'Ein Anlass kann nicht mehr beantwortet werden (nicht mehr vorhanden, abgesagt, geschlossen oder vorbei). Entferne ihn bitte aus dem Versand.';
}

/** A non-PII code for a failed send: the error class and an HTTP status or error code when it carries one. */
export function sendErrorCode(error: unknown): string {
  const e = error as { name?: unknown; code?: unknown; status?: unknown; responseCode?: unknown } | undefined;
  const name = typeof e?.name === 'string' ? e.name : 'Error';
  const detail = [e?.status, e?.responseCode, e?.code].find((v) => typeof v === 'number' || typeof v === 'string');
  const mailtrap = error instanceof Error ? /^Mailtrap API error (\d{3})/.exec(error.message)?.[1] : undefined;
  return [name, detail ?? mailtrap].filter((v) => v !== undefined).join(' ').slice(0, 60);
}

/** Whether the composed mail still carries `placeholder` in every half it has: without it no personal link can be set. */
export function hasPlaceholder(rendered: { html: string; text?: string }, placeholder: string): boolean {
  return rendered.html.includes(placeholder) && (rendered.text === undefined || rendered.text.includes(placeholder));
}

/** Whether the composed mail still carries the answer placeholder in every half it has. */
export function hasAnswerPlaceholder(rendered: { html: string; text?: string }): boolean {
  return hasPlaceholder(rendered, ANSWER_URL_PLACEHOLDER);
}
