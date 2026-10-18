/**
 * «Ab hier ungelesen» (spec 1.104 §6). Read receipts only move forward, so marking a room
 * unread from an older message is a client-side flag in Matrix room account data.
 */

/** Room account data type of the okr flag: `{ eventId, ts }`, `{}` when cleared. */
export const UNREAD_FROM_EVENT = 'org.okr.unread_from';

/** Room account data type of the Matrix spec v1.12 flag, so other clients (Element) agree. */
export const MARKED_UNREAD_EVENT = 'm.marked_unread';

/**
 * The unread count a room shows: the server count when it is above zero; otherwise, when the
 * room is flagged, the number of events from the flagged one to the end of the loaded timeline
 * (at least 1 when the flagged event is not loaded); otherwise 0.
 */
export function effectiveUnreadCount(serverCount: number, unreadFromEventId: string | undefined, eventIdsInOrder: string[]): number {
  if (serverCount > 0) return serverCount;
  if (!unreadFromEventId) return 0;
  const index = eventIdsInOrder.indexOf(unreadFromEventId);
  return index < 0 ? 1 : Math.max(1, eventIdsInOrder.length - index);
}

/** The flagged event id from `org.okr.unread_from` content, or undefined when cleared or malformed. */
export function unreadFromEventIdOf(content: Record<string, unknown> | undefined): string | undefined {
  const eventId = content?.['eventId'];
  return typeof eventId === 'string' && eventId ? eventId : undefined;
}
