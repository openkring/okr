import { bytesToGb, formatFileTransferSize, gbToBytes, isFileTransferInline, isFileTransferVideo } from './file-transfer-format';

const GB = 1024 ** 3;

describe('bytesToGb / gbToBytes', () => {
  it('rounds to at most one decimal', () => {
    expect(bytesToGb(GB)).toBe(1);
    expect(bytesToGb(1.5 * GB)).toBe(1.5);
    expect(bytesToGb(1.04 * GB)).toBe(1);
    expect(bytesToGb(500 * GB)).toBe(500);
  });
  it('converts back to whole bytes', () => {
    expect(gbToBytes(1)).toBe(GB);
    expect(gbToBytes(0.1)).toBe(Math.round(0.1 * GB));
  });
});

describe('formatFileTransferSize', () => {
  it('picks a readable unit', () => {
    expect(formatFileTransferSize(0)).toBe('1 KB');
    expect(formatFileTransferSize(850 * 1024)).toBe('850 KB');
    expect(formatFileTransferSize(12.34 * 1024 ** 2)).toBe('12.3 MB');
    expect(formatFileTransferSize(1.4 * GB)).toBe('1.4 GB');
  });
});

describe('isFileTransferInline / isFileTransferVideo', () => {
  it('follows the server allow-list', () => {
    expect(isFileTransferInline('video/mp4')).toBe(true);
    expect(isFileTransferInline('Video/MP4; codecs=avc1')).toBe(true);
    expect(isFileTransferInline('application/pdf')).toBe(true);
    expect(isFileTransferInline('image/svg+xml')).toBe(false);
    expect(isFileTransferInline('text/html')).toBe(false);
    expect(isFileTransferInline('video/mp4, text/html')).toBe(false);
  });
  it('videos are inline types starting with video/', () => {
    expect(isFileTransferVideo('video/quicktime')).toBe(true);
    expect(isFileTransferVideo('image/png')).toBe(false);
    expect(isFileTransferVideo('video/x-msvideo')).toBe(false);
  });
});
