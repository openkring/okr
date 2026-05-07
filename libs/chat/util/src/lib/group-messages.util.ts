import { MatrixMessage } from '@bk2/shared-models';

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
  if (msg.type === 'm.file' && (msg.content?.info?.mimetype as string | undefined)?.startsWith('image/')) return true;
  return false;
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
