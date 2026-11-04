// apps/functions/src/matrix-simple/chat-email.logic.ts
//
// The pure parts of «Chat messages by email» (TOC 1.139): who may switch it, which events become
// a digest line, and which member gets which lines. No I/O, so all of it is unit-tested.

import { createHash } from 'node:crypto';

import { DeliveryChannel } from '@okr/shared-models';
import { toDeliveryChannels } from '@okr/shared-util-core';

import { mayPinForAll, PinRoomKind } from './shared';

/** Room state `{ enabled: true }`. Keep in sync with libs/chat/util/src/lib/email-delivery.util.ts. */
export const OKR_EMAIL_DELIVERY_EVENT = 'org.okr.email_delivery';
export const ChatEmailRoomsCollection = 'chat-email-rooms';

/** A message waits this long, so a member who is in the chat right now can read it first. */
export const CHAT_EMAIL_GRACE_MS = 10 * 60_000;
export const CHAT_EMAIL_MAX_MESSAGES = 50;
/** Longer messages are cut: the mail is a notice, the chat stays the place to read. */
export const CHAT_EMAIL_MAX_TEXT_CHARS = 2_000;

export type EmailDeliveryRoomKind = PinRoomKind | 'direct';

/** Who may switch (spec 1.139 §3): the pin rules, plus either participant of a direct chat. */
export function mayChangeEmailDelivery(kind: EmailDeliveryRoomKind, roles: Record<string, boolean>, isGroupAdmin: boolean): boolean {
  return kind === 'direct' || mayPinForAll(kind, roles, isGroupAdmin);
}

/** The slice of a Matrix event the digest reads. */
export interface RoomEvent {
  event_id?: string;
  type?: string;
  sender?: string;
  origin_server_ts?: number;
  content?: Record<string, unknown>;
}

export interface DigestMessage {
  eventId: string;
  sender: string;
  ts: number;
  text: string;
}

const MEDIA_LINES: Record<string, string> = {
  'm.image': 'Bild im Chat',
  'm.video': 'Video im Chat',
  'm.audio': 'Sprachnachricht im Chat',
  'm.file': 'Datei im Chat',
};

/** The quoted lines a rich reply puts in front of its `body`. */
function withoutReplyFallback(body: string): string {
  const lines = body.split('\n');
  let first = 0;
  while (first < lines.length && lines[first].startsWith('>')) first++;
  const rest = lines.slice(first).join('\n').trim();
  return rest || body.trim();
}

function digestText(content: Record<string, unknown>): string | undefined {
  const msgtype = content['msgtype'];
  if (typeof msgtype === 'string' && MEDIA_LINES[msgtype]) return MEDIA_LINES[msgtype];
  if (msgtype !== 'm.text' && msgtype !== 'm.emote') return undefined;
  const body = content['body'];
  if (typeof body !== 'string') return undefined;
  const text = withoutReplyFallback(body);
  return text ? Array.from(text).slice(0, CHAT_EMAIL_MAX_TEXT_CHARS).join('') : undefined;
}

/**
 * The lines of one run, oldest first: messages with `sinceTs < ts <= untilTs`. Left out are edits
 * (`m.replace`), redacted and encrypted events, and everything the bot posted.
 */
export function digestMessages(events: RoomEvent[], sinceTs: number, untilTs: number, botUserId: string): DigestMessage[] {
  const messages: DigestMessage[] = [];
  for (const e of events) {
    const ts = e.origin_server_ts;
    if (e.type !== 'm.room.message' || typeof ts !== 'number' || ts <= sinceTs || ts > untilTs) continue;
    if (!e.event_id || !e.sender || e.sender === botUserId || !e.content) continue;
    const relation = e.content['m.relates_to'] as { rel_type?: unknown } | undefined;
    if (relation?.rel_type === 'm.replace') continue;
    const text = digestText(e.content);
    if (text) messages.push({ eventId: e.event_id, sender: e.sender, ts, text });
  }
  return messages.sort((a, b) => a.ts - b.ts);
}

/**
 * Up to which timestamp each member has read: `m.receipt` contents (`{ <eventId>: { 'm.read':
 * { <userId>: … } } }`), resolved through the room's events of this run. A receipt on an event
 * older than the run says nothing about the run, so it adds nothing.
 */
export function readUpTo(receipts: Record<string, unknown>[], events: RoomEvent[]): Map<string, number> {
  const tsOf = new Map(events.map((e) => [e.event_id, e.origin_server_ts]));
  const result = new Map<string, number>();
  for (const receipt of receipts) {
    for (const [eventId, types] of Object.entries(receipt)) {
      const ts = tsOf.get(eventId);
      if (typeof ts !== 'number') continue;
      for (const userId of Object.keys((types as Record<string, object> | null)?.['m.read'] ?? {})) {
        result.set(userId, Math.max(result.get(userId) ?? 0, ts));
      }
    }
  }
  return result;
}

/** What one member gets of a run: nothing of their own, nothing they already read. */
export function messagesForMember(messages: DigestMessage[], matrixUserId: string, readTs: number): DigestMessage[] {
  return messages.filter((m) => m.sender !== matrixUserId && m.ts > readTs);
}

/** The cap of §4: the newest messages stay, the rest becomes «… und N weitere». */
export function capMessages(messages: DigestMessage[]): { shown: DigestMessage[]; more: number } {
  const more = Math.max(0, messages.length - CHAT_EMAIL_MAX_MESSAGES);
  return { shown: messages.slice(more), more };
}

/** The room's own switch is on; this asks the person (decision 2). */
export function wantsEmail(newsDelivery: unknown): boolean {
  return toDeliveryChannels(newsDelivery).includes(DeliveryChannel.Email);
}

/** Same room, recipient and cursor = same id: a crashed run cannot mail the same digest twice. */
export function digestOutboxId(roomId: string, personKey: string, cursor: number): string {
  const hash = createHash('sha256').update(`${roomId}|${personKey}|${cursor}`).digest('hex').slice(0, 40);
  return `chat-email_${hash}`;
}

/** The bot notice of §3, posted at every change. */
export function emailDeliveryNotice(enabled: boolean): string {
  return enabled
    ? 'E-Mail-Zustellung ist eingeschaltet. Nachrichten dieses Chats gehen ab jetzt auch per E-Mail an alle Mitglieder, die Neuigkeiten per E-Mail erhalten möchten. E-Mails sind nicht Ende-zu-Ende-verschlüsselt und bleiben im Postfach, auch wenn eine Nachricht hier gelöscht wird.'
    : 'E-Mail-Zustellung ist ausgeschaltet. Nachrichten dieses Chats gehen nicht mehr per E-Mail hinaus.';
}
