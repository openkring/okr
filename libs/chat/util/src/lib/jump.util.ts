/**
 * Whether the chat may send a read receipt for the open room (spec 1.104 §4.4).
 *
 * Landing on an old message (a bookmark, a matrix.to link, «Ab hier ungelesen») shows a
 * "jumped" timeline instead of the live one. A receipt sent then would mark the whole room
 * read although the user has not seen the newer messages. So: on the live timeline always;
 * on a jumped timeline only once it has reached the live end.
 */
export function shouldSendReceipt(isJumped: boolean, atLiveEnd: boolean): boolean {
  return !isJumped || atLiveEnd;
}

/**
 * The thread root a message belongs to, or undefined for a main-timeline message. Thread
 * replies are not shown in the main list, so a jump to one opens its thread instead.
 */
export function threadRootOf(content: Record<string, unknown> | undefined): string | undefined {
  const relatesTo = content?.['m.relates_to'] as { rel_type?: unknown; event_id?: unknown } | undefined;
  if (relatesTo?.rel_type !== 'm.thread') return undefined;
  return typeof relatesTo.event_id === 'string' && relatesTo.event_id ? relatesTo.event_id : undefined;
}

/**
 * Whether a failed event lookup means the message is really gone — deleted for good, or in a
 * room the user is no longer in — rather than a transient failure worth a retry.
 */
export function isMessageGoneError(error: unknown): boolean {
  const errcode = (error as { errcode?: unknown } | null | undefined)?.errcode;
  return errcode === 'M_NOT_FOUND' || errcode === 'M_FORBIDDEN';
}
