import { beforeEach, describe, expect, it } from 'vitest';
import { groupMessages, isImageMessage, ImageBatchGroup } from './group-messages.util';
import { MatrixMessage } from '@okr/shared-models';

let idSeq = 0;
beforeEach(() => {
  idSeq = 0;
});
function msg(overrides: Partial<MatrixMessage> = {}): MatrixMessage {
  return {
    eventId: `evt-${++idSeq}`,
    roomId: 'room1',
    sender: '@alice:server',
    senderName: 'Alice',
    senderAvatar: undefined,
    body: 'image.jpg',
    timestamp: 1000,
    type: 'm.image',
    content: { msgtype: 'm.image', url: 'mxc://example/abc' },
    mediaUrl: 'blob:url',
    isRedacted: false,
    isEdited: false,
    ...overrides,
  };
}

describe('groupMessages', () => {
  it('wraps a single image in a batch of one', () => {
    const result = groupMessages([msg()]);
    expect((result[0] as ImageBatchGroup).kind).toBe('image-batch');
    expect((result[0] as ImageBatchGroup).messages).toHaveLength(1);
  });

  it('groups two images from the same sender within 5 s', () => {
    const result = groupMessages([msg({ timestamp: 1000 }), msg({ timestamp: 5000 })]);
    expect(result).toHaveLength(1);
    expect((result[0] as ImageBatchGroup).messages).toHaveLength(2);
  });

  it('splits images from the same sender more than 5 s apart', () => {
    const result = groupMessages([msg({ timestamp: 1000 }), msg({ timestamp: 7000 })]);
    expect(result).toHaveLength(2);
  });

  it('does not group images from different senders', () => {
    const result = groupMessages([
      msg({ sender: '@alice:server', timestamp: 1000 }),
      msg({ sender: '@bob:server', timestamp: 1001 }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('passes non-image messages through unchanged', () => {
    const m = msg({ type: 'm.text', content: { msgtype: 'm.text', body: 'hello' } });
    const result = groupMessages([m]);
    expect(result).toHaveLength(1);
    expect('kind' in result[0]).toBe(false);
    expect(result[0]).toBe(m);
  });

  it('groups m.file with image mimetype', () => {
    const m = msg({ type: 'm.file', content: { msgtype: 'm.file', info: { mimetype: 'image/png' } } });
    const result = groupMessages([m]);
    expect((result[0] as ImageBatchGroup).kind).toBe('image-batch');
  });

  it('does not group m.file with non-image mimetype', () => {
    const m = msg({ type: 'm.file', content: { msgtype: 'm.file', info: { mimetype: 'application/pdf' } } });
    const result = groupMessages([m]);
    expect('kind' in result[0]).toBe(false);
  });

  it('updates batch timestamp to the last image in the group', () => {
    const result = groupMessages([msg({ timestamp: 1000 }), msg({ timestamp: 3000 })]);
    expect((result[0] as ImageBatchGroup).timestamp).toBe(3000);
  });
});

describe('isImageMessage', () => {
  it('treats an m.image as an image', () => {
    expect(isImageMessage(msg())).toBe(true);
  });

  it('treats an m.file with an image mimetype as an image', () => {
    expect(isImageMessage(msg({
      type: 'm.file',
      body: 'photo.png',
      content: { msgtype: 'm.file', url: 'mxc://x/y', info: { mimetype: 'image/png' } },
    }))).toBe(true);
  });

  // Regression: devices that report an empty File.type (iOS Files/iCloud picker, some
  // Windows drag-and-drop) produced m.file with mimetype:'' — these already sit in rooms
  // and rendered as a document card. Reclassifying by filename repairs them on read.
  it('reclassifies an m.file with NO mimetype by its filename', () => {
    expect(isImageMessage(msg({
      type: 'm.file',
      body: 'IMG_6840.png',
      content: { msgtype: 'm.file', url: 'mxc://x/y', info: { mimetype: '' } },
    }))).toBe(true);
    expect(isImageMessage(msg({
      type: 'm.file',
      body: 'IMG_6840.png',
      content: { msgtype: 'm.file', url: 'mxc://x/y' },
    }))).toBe(true);
  });

  it('keeps a genuine document a document', () => {
    expect(isImageMessage(msg({
      type: 'm.file',
      body: 'report.pdf',
      content: { msgtype: 'm.file', url: 'mxc://x/y', info: { mimetype: 'application/pdf' } },
    }))).toBe(false);
  });

  // An explicit mimetype stays authoritative — the filename fallback must not override it.
  it('does not reclassify a PDF that happens to be named .png', () => {
    expect(isImageMessage(msg({
      type: 'm.file',
      body: 'invoice.png',
      content: { msgtype: 'm.file', url: 'mxc://x/y', info: { mimetype: 'application/pdf' } },
    }))).toBe(false);
  });

  it('leaves text messages alone', () => {
    expect(isImageMessage(msg({ type: 'm.text', body: 'look at cat.png', content: { msgtype: 'm.text' } }))).toBe(false);
  });
});
