import { FileTransferModel } from '@okr/shared-models';
import { fileTransferFlags } from './file-transfer-flags';
import { resolveFileTransferLimits } from './file-transfer-limits';

const limits = resolveFileTransferLimits(undefined, 'p');
const GB = 1024 ** 3;

function make(emailRecipients: number, totalBytes = 0): FileTransferModel {
  const t = new FileTransferModel('scs');
  t.totalBytes = totalBytes;
  for (let i = 0; i < emailRecipients; i++) {
    t.recipients.push({ id: `e:${i}@x.ch`, kind: 'email', personKey: '', email: `${i}@x.ch`, name: '', tokenHash: '', aliasUrl: '', viaGroupKeys: [] });
  }
  return t;
}

describe('fileTransferFlags', () => {
  it('no flags for a small transfer', () => expect(fileTransferFlags(make(2, 100), {}, limits)).toEqual([]));
  it('manyExternals at 10 email recipients', () => {
    expect(fileTransferFlags(make(9), {}, limits)).not.toContain('manyExternals');
    expect(fileTransferFlags(make(10), {}, limits)).toContain('manyExternals');
  });
  it('nearLimit at 90 percent', () => {
    expect(fileTransferFlags(make(0, 0.89 * GB), {}, limits)).not.toContain('nearLimit');
    expect(fileTransferFlags(make(0, 0.9 * GB), {}, limits)).toContain('nearLimit');
  });
  it('manyDownloads when one recipient has 20', () => {
    expect(fileTransferFlags(make(1), { a: 19, b: 3 }, limits)).not.toContain('manyDownloads');
    expect(fileTransferFlags(make(1), { a: 19, b: 20 }, limits)).toContain('manyDownloads');
  });
});
