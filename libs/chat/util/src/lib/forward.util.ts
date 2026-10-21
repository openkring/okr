/**
 * Forwarding a message to another room (spec 1.109 §5). A forward is a fresh message that
 * carries the payload plus an `org.okr.forwarded` attribution; nothing else is copied over.
 */

/** Content field with the attribution of a forwarded message. */
export const OKR_FORWARDED_FIELD = 'org.okr.forwarded';

export interface ForwardedFrom {
  sender: string;
  senderName: string;
  roomId: string;
  eventId: string;
}

const FORWARDABLE_MSGTYPES = ['m.text', 'm.notice', 'm.emote', 'm.image', 'm.file', 'm.video', 'm.audio'];
const COPIED_FIELDS = ['msgtype', 'body', 'format', 'formatted_body', 'url', 'info', 'filename'];
const REPLY_FALLBACK = /<mx-reply>[\s\S]*?<\/mx-reply>/gi;
const MENTION_ANCHOR = /<a\s+href="https:\/\/matrix\.to\/#\/[^"]*"[^>]*>(.*?)<\/a>/gi;

/** Plain messages only: no polls, calls, redacted events (empty content) or bookmark entries. */
export function isForwardable(type: string, content: Record<string, unknown>, isBookmarkEntry: boolean): boolean {
  if (isBookmarkEntry || type !== 'm.room.message') return false;
  const msgtype = content['msgtype'];
  return typeof msgtype === 'string' && FORWARDABLE_MSGTYPES.includes(msgtype);
}

/** Content of the forwarded message: payload only, no mentions, no reply/thread relation. */
export function buildForwardContent(content: Record<string, unknown>, from: ForwardedFrom): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of COPIED_FIELDS) {
    if (content[field] !== undefined) out[field] = content[field];
  }
  if (typeof out['formatted_body'] === 'string') {
    out['formatted_body'] = out['formatted_body'].replace(REPLY_FALLBACK, '').replace(MENTION_ANCHOR, '$1');
  }
  // Reply fallback in the plain body: `> <@user> quote` up to the first blank line.
  if (typeof out['body'] === 'string' && out['body'].startsWith('> <@')) {
    const end = out['body'].indexOf('\n\n');
    if (end >= 0) out['body'] = out['body'].slice(end + 2);
  }
  out['m.mentions'] = {};
  out[OKR_FORWARDED_FIELD] = from;
  return out;
}

/** The attribution of a forwarded message, only when all four fields are non-empty strings. */
export function readForwarded(content: Record<string, unknown> | undefined): ForwardedFrom | undefined {
  const raw = content?.[OKR_FORWARDED_FIELD];
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const { sender, senderName, roomId, eventId } = r;
  if ([sender, senderName, roomId, eventId].every((v) => typeof v === 'string' && v !== '')) {
    return { sender, senderName, roomId, eventId } as ForwardedFrom;
  }
  return undefined;
}

const MATRIX_USER_ID = /^@[a-z0-9._=/+-]+:[A-Za-z0-9.-]+(:\d+)?$/;

/** True when the string is a well-formed Matrix user id (`@localpart:server[:port]`). */
export function isMatrixUserId(value: string): boolean {
  return MATRIX_USER_ID.test(value);
}
