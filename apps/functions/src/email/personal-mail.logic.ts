// apps/functions/src/email/personal-mail.logic.ts
//
// A Versand that asks about events sends one mail per recipient, each with that person's signed answer link
// (design §5). Pure helpers for the personal path of `onMailing` / `onMailJob`; no Firestore, no provider.

import { HttpsError } from 'firebase-functions/v2/https';

import { escapeHtml } from '../calendar/mail';

/** At most this many events one Versand asks about. */
export const MAX_ANSWER_EVENTS = 20;
/** At most this many email recipients with events: one 540 s `onMailJob` run at `PER_MAIL_PAUSE_MS`. */
export const MAX_PERSONAL_RECIPIENTS = 800;
/** Pause between two personal mails; keeps the provider's per-second limit. */
export const PER_MAIL_PAUSE_MS = 200;

export interface PersonalEntry {
  to: string;
  answerUrl: string;
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
 * (a couple, a family) each get their own mail with their own link.
 */
export function personalEntries(personKeys: string[], emailByKey: Map<string, string>, urlFor: (personKey: string) => string): PersonalEntry[] {
  const out: PersonalEntry[] = [];
  for (const key of personKeys) {
    const to = emailByKey.get(key);
    if (to) out.push({ to, answerUrl: urlFor(key) });
  }
  return out;
}

/** The block under the mail body: the events and the button to the personal answer page. */
export function answerBlockHtml(url: string, events: AnswerEventLine[]): string {
  const lines = events.map((e) => `${escapeHtml(e.when)} · ${escapeHtml(e.name)}`).join('<br>');
  return `<p>Melde dich hier für die Anlässe an oder ab:</p>`
    + `<p>${lines}</p>`
    + `<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:10px 20px;background:#1f6feb;color:#ffffff;`
    + `text-decoration:none;border-radius:6px;">An- oder abmelden</a></p>`;
}

/** The job's end state: `failed` only when nothing went out; any failure is named in `error`. */
export function personalOutcome(sent: number, failed: number): { state: 'sent' | 'failed'; error?: string } {
  const state = sent === 0 && failed > 0 ? 'failed' : 'sent';
  return failed > 0 ? { state, error: `${failed} von ${sent + failed} Mails konnten nicht gesendet werden.` } : { state };
}
