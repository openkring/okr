import { MatrixMessage } from '@okr/shared-models';
import { isImageFileName } from './image.util';

export interface ImageBatchGroup {
  kind: 'image-batch';
  messages: MatrixMessage[];
  sender: string;
  senderName: string;
  senderAvatar: string | undefined;
  timestamp: number;
}

export type MessageOrBatch = MatrixMessage | ImageBatchGroup;

export function isImageMessage(msg: MatrixMessage): boolean {
  if (msg.type === 'm.image') return true;
  if (msg.type !== 'm.file') return false;
  const mimetype = msg.content?.info?.mimetype as string | undefined;
  // An explicit mimetype is always authoritative — a PDF named `foo.png` stays a file.
  if (mimetype) return mimetype.startsWith('image/');
  // No mimetype at all: classify by filename. This is what repairs the messages already
  // sitting in rooms, sent before `sendFile` learned the extension fallback — a device
  // that reported an empty `File.type` (iOS Files/iCloud picker, some Windows drag-and-drop)
  // produced `m.file` with `mimetype: ''`, which rendered as a document card instead of the
  // image it is. Reclassifying on read fixes the history without a migration.
  return isImageFileName(msg.body ?? '');
}

export function groupMessages(messages: MatrixMessage[]): MessageOrBatch[] {
  const result: MessageOrBatch[] = [];
  for (const msg of messages) {
    if (isImageMessage(msg)) {
      const last = result[result.length - 1];
      if (
        last &&
        'kind' in last &&
        last.kind === 'image-batch' &&
        last.sender === msg.sender &&
        msg.timestamp - last.timestamp <= 5000
      ) {
        last.messages.push(msg);
        last.timestamp = msg.timestamp;
      } else {
        result.push({
          kind: 'image-batch',
          messages: [msg],
          sender: msg.sender,
          senderName: msg.senderName,
          senderAvatar: msg.senderAvatar,
          timestamp: msg.timestamp,
        });
      }
    } else {
      result.push(msg);
    }
  }
  return result;
}
