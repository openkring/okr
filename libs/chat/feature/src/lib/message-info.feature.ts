import { MatrixMessage, MatrixReadReceipt } from '@okr/shared-models';
import { DateFormat, convertDateFormatToString, fill, prettyFormatDateTime } from '@okr/shared-util-core';
import {
  MatrixChatI18n, buildReceiptRows, matrixPermalink, messageTypeLabelKey, readForwarded, readersOfMessage, storeDateTimeOfMs, verifiedForwardedNames,
} from '@okr/chat-util';

import type { MessageInfoPerson, MessageInfoReaction } from './message-info.modal';

export interface MessageInfoSources {
  message: MatrixMessage;
  roomName: string;
  /** The room timeline, oldest first (decides who counts as having read the message). */
  timeline: readonly MatrixMessage[];
  receiptsByEventId: ReadonlyMap<string, MatrixReadReceipt[]>;
  /** Joined members of the room, self and service accounts already excluded. */
  eligibleReaderCount: number;
  currentUserId: string | undefined;
  senderOf: (roomId: string, eventId: string) => string | undefined;
  isAdmin: boolean;
  i18n: MatrixChatI18n;
}

/** Local date and time of an epoch-ms timestamp, e.g. `5.10.2026 14:03`. */
function dateTimeText(ms: number): string {
  return prettyFormatDateTime(storeDateTimeOfMs(ms));
}

/** Time only, e.g. `14:03`. */
function timeText(ms: number): string {
  return convertDateFormatToString(storeDateTimeOfMs(ms), DateFormat.StoreDateTime, DateFormat.Time, false);
}

/** Everything the info modal shows for one message, resolved (spec 1.109 §7). */
export function buildMessageInfoProps(src: MessageInfoSources): Record<string, unknown> {
  const { message, i18n } = src;

  const receipts = readersOfMessage(message.eventId, src.timeline.map((m) => m.eventId), src.receiptsByEventId)
    .filter((r) => r.userId !== src.currentUserId);
  // Same rows (and the same person-merge) as the read-receipt strip, without the reaction extras.
  const readers: MessageInfoPerson[] = buildReceiptRows(receipts, undefined, new Map(), src.currentUserId)
    .map((r) => ({ userId: r.userId, displayName: r.displayName, avatarUrl: r.avatarUrl, timeText: timeText(r.ts ?? 0) }));

  const reactions: MessageInfoReaction[] = [...(message.reactions ?? new Map<string, Set<string>>())]
    .map(([emoji, users]) => ({ emoji, count: users.size }))
    .filter((r) => r.count > 0);

  let forwardedLabel: string | undefined;
  if (readForwarded(message.content)) {
    const name = verifiedForwardedNames([message], src.senderOf).get(message.eventId);
    forwardedLabel = name ? fill(i18n.forwarded_from(), { name }) : i18n.forwarded_plain();
  }

  const rawJson = src.isAdmin
    ? JSON.stringify({
        type: message.type,
        sender: message.sender,
        origin_server_ts: message.timestamp,
        event_id: message.eventId,
        room_id: message.roomId,
        content: message.content,
      }, null, 2)
    : undefined;

  return {
    senderId: message.sender,
    senderName: message.senderName,
    senderAvatar: message.senderAvatar,
    roomName: src.roomName,
    sentText: dateTimeText(message.timestamp),
    edited: message.isEdited,
    typeLabel: i18n[messageTypeLabelKey(message.type)](),
    forwardedLabel,
    readByTitle: fill(i18n.info_read_by(), { x: readers.length, y: src.eligibleReaderCount }),
    readers,
    reactions,
    link: matrixPermalink(message.roomId, message.eventId),
    rawJson,
  };
}
