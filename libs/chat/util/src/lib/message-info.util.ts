import { convertDateFormatToString, DateFormat } from '@okr/shared-util-core';
import { POLL_START_EVENT } from './poll.util';

/** i18n keys (in `MATRIX_CHAT_I18N_KEYS`) naming the kind of a message in the info modal. */
export type MessageTypeLabelKey =
  | 'info_type_text'
  | 'info_type_image'
  | 'info_type_file'
  | 'info_type_video'
  | 'info_type_audio'
  | 'info_type_poll'
  | 'info_type_location'
  | 'info_type_other';

const BY_TYPE: Record<string, MessageTypeLabelKey> = {
  'm.text': 'info_type_text',
  'm.notice': 'info_type_text',
  'm.emote': 'info_type_text',
  'm.image': 'info_type_image',
  'm.file': 'info_type_file',
  'm.video': 'info_type_video',
  'm.audio': 'info_type_audio',
  'm.location': 'info_type_location',
  [POLL_START_EVENT]: 'info_type_poll',
};

/**
 * Which label names a message in the info modal (spec 1.109 §7). `MatrixMessage.type` already
 * carries `msgtype ?? eventType`; an explicit `msgtype` still wins when both are passed.
 * Anything unknown is the neutral «Nachricht».
 */
export function messageTypeLabelKey(type: string, msgtype?: string): MessageTypeLabelKey {
  return BY_TYPE[msgtype ?? ''] ?? BY_TYPE[type] ?? 'info_type_other';
}

/** A read receipt as the chat store holds it, keyed by the event the person read up to. */
export interface InfoReceipt {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  ts: number;
}

/**
 * Everyone who has read a message: a receipt marks only the LATEST event a person read, so a
 * receipt on this event or on any later one counts. `orderedEventIds` is the room timeline,
 * oldest first. A message outside that list (e.g. a thread reply) falls back to the receipts on
 * its own event. One entry per person (their newest receipt wins).
 */
export function readersOfMessage(
  eventId: string,
  orderedEventIds: readonly string[],
  receiptsByEventId: ReadonlyMap<string, InfoReceipt[]>,
): InfoReceipt[] {
  const idx = orderedEventIds.indexOf(eventId);
  const relevant = idx < 0 ? [eventId] : orderedEventIds.slice(idx);
  const byUser = new Map<string, InfoReceipt>();
  for (const id of relevant) {
    for (const r of receiptsByEventId.get(id) ?? []) {
      const prev = byUser.get(r.userId);
      if (!prev || r.ts > prev.ts) byUser.set(r.userId, r);
    }
  }
  return [...byUser.values()].sort((a, b) => a.ts - b.ts);
}

/** Local wall clock of an epoch-ms timestamp as a StoreDateTime (`yyyyMMddHHmmss`). */
export function storeDateTimeOfMs(ms: number): string {
  const d = new Date(ms);
  const p = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${p(d.getFullYear(), 4)}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** Local date and time of an epoch-ms timestamp, zero-padded: `05.10.2026 14:03`. */
export function viewDateTimeOfMs(ms: number): string {
  const store = storeDateTimeOfMs(ms);
  const date = convertDateFormatToString(store.substring(0, 8), DateFormat.StoreDate, DateFormat.ViewDate, false);
  const time = convertDateFormatToString(store, DateFormat.StoreDateTime, DateFormat.Time, false);
  return `${date} ${time}`;
}
