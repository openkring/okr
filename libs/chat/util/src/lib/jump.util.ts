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
