import { MatrixMessage } from '@okr/shared-models';
import { isMatrixUserId, readForwarded } from '@okr/chat-util';

/**
 * Verified original-author names for forwarded messages (spec 1.109 §5). The `org.okr.forwarded`
 * claim is free text any client can write, so a name is only returned when the original event is
 * held locally, its real sender equals the claimed one and that is a well-formed Matrix id.
 * Everything else gets no entry and renders neutrally.
 */
export function verifiedForwardedNames(
  messages: MatrixMessage[],
  senderOf: (roomId: string, eventId: string) => string | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of messages) {
    const from = readForwarded(m.content);
    if (!from || !isMatrixUserId(from.sender)) continue;
    if (senderOf(from.roomId, from.eventId) !== from.sender) continue;
    const known = messages.find((x) => x.sender === from.sender)?.senderName;
    out.set(m.eventId, known || from.sender.slice(1).split(':')[0]);
  }
  return out;
}
