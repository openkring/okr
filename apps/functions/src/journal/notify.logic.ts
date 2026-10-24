import { JournalChange, JournalGuestLink } from '@okr/shared-models';
import { DigestItem, guestLinkState, NOTICE_SUBJECT_MAX, NOTICE_TEXT_MAX } from '@okr/travel-journal-util';

/*
 * Spec 1.113 §8, plan 7 — who hears about a journal's news, by which channel, with which words. Pure, so the
 * hourly function only reads and sends. Texts: German, «du», friendly, no jargon (CLAUDE.md).
 */

export type GuestChannelChoice = 'signal' | 'email' | 'none';

/** Guests who get the digest: a live link (not revoked, not expired) and not muted. */
export function digestRecipients(links: JournalGuestLink[], nowIso: string): JournalGuestLink[] {
  return links.filter((l) => guestLinkState(l, nowIso) === 'ok' && !l.mutedAt);
}

/**
 * The guest's channel (spec §8.1): their own `newsDelivery` on the person; nothing chosen yet = email.
 * Signal only where the tenant switched the integration on and a mobile number exists; otherwise email.
 */
export function chooseChannel(newsDelivery: unknown, signalEnabled: boolean, hasPhone: boolean, hasEmail: boolean): GuestChannelChoice {
  const chosen = Array.isArray(newsDelivery) ? newsDelivery : undefined;
  if (chosen && chosen.length === 0) return 'none';
  if (chosen?.includes('signal') && signalEnabled && hasPhone) return 'signal';
  return hasEmail ? 'email' : 'none';
}

/** StoreDate `20270114` → `14.01.2027`. */
export function viewDate(storeDate: string): string {
  return /^\d{8}$/.test(storeDate) ? `${storeDate.slice(6, 8)}.${storeDate.slice(4, 6)}.${storeDate.slice(0, 4)}` : '';
}

function itemLine(item: DigestItem): string {
  const parts = [item.title || 'Ohne Titel'];
  const date = viewDate(item.date);
  if (date) parts.push(date);
  const what: string[] = [];
  if (item.updated) what.push('neu oder ergänzt');
  if (item.newComments === 1) what.push('1 neuer Kommentar');
  if (item.newComments > 1) what.push(`${item.newComments} neue Kommentare`);
  return `${parts.join(', ')}${what.length ? ` – ${what.join(', ')}` : ''}`;
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export { NOTICE_SUBJECT_MAX, NOTICE_TEXT_MAX };

/**
 * The proposed notice (plan 8): the author sees it, may change it, and sends it. The personal link and the
 * mute link are not part of it — they are added per guest when sending.
 */
export function proposedNotice(journalTitle: string, items: DigestItem[]): { subject: string; text: string } {
  const title = journalTitle || 'Reisetagebuch';
  const subject = `Neues im Reisetagebuch «${title}»`;
  const text = items.length === 0
    ? `Hallo zusammen\n\nEin kurzer Gruss von unterwegs aus dem Reisetagebuch «${title}».`
    : [`Hallo zusammen`, '', `Neues im Reisetagebuch «${title}»:`, ...items.map((i) => `• ${itemLine(i)}`)].join('\n');
  return { subject, text };
}

/** The author's notice, trimmed and checked; undefined when empty or too long. */
export function checkNotice(subject: unknown, text: unknown): { subject: string; text: string } | undefined {
  const s = typeof subject === 'string' ? subject.trim() : '';
  const t = typeof text === 'string' ? text.trim() : '';
  if (s === '' || t === '' || s.length > NOTICE_SUBJECT_MAX || t.length > NOTICE_TEXT_MAX) return undefined;
  return { subject: s, text: t };
}

/** One guest's message: the author's text, then the personal link and how to switch notifications off. */
export function guestMessage(notice: { subject: string; text: string }, link: string, muteLink: string): { subject: string; text: string; html: string } {
  const text = [notice.text, '', `Hier liest du weiter: ${link}`, '', `Keine Nachrichten mehr zu diesem Reisetagebuch? ${muteLink}`].join('\n');
  const html = notice.text.split(/\n{2,}/).map((p) => `<p>${escape(p).replace(/\n/g, '<br>')}</p>`).join('')
    + `<p><a href="${escape(link)}">Hier liest du weiter</a></p>`
    + `<p style="color:#888;font-size:12px">Keine Nachrichten mehr zu diesem Reisetagebuch? <a href="${escape(muteLink)}">Benachrichtigungen ausschalten</a></p>`;
  return { subject: notice.subject, text, html };
}

/** New guest comments per footprint key — the news for the authors (their own comments are not news). */
export function guestComments(records: JournalChange[], authorKeys: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of records) {
    if (r.entity !== 'comment' || r.op !== 'create' || authorKeys.includes(r.authorKey)) continue;
    const fk = r.fields['footprintKey'];
    if (typeof fk === 'string') counts.set(fk, (counts.get(fk) ?? 0) + 1);
  }
  return counts;
}
