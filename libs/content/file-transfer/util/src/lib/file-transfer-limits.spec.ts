import { checkFileTransferRequest, DEFAULT_FILE_TRANSFER_LIMITS, openBytes, resolveFileTransferLimits } from './file-transfer-limits';

const GB = 1024 ** 3;

describe('resolveFileTransferLimits', () => {
  it('uses defaults without config', () => {
    expect(resolveFileTransferLimits(undefined, 'p1')).toEqual({
      maxFileTransferBytes: GB,
      maxOpenBytes: 5 * GB,
      defaultLifetimeDays: 7,
      maxLifetimeDays: 30,
      maxExternalRecipients: 20,
    });
  });
  it('applies an override to that person only', () => {
    const cfg = { ...DEFAULT_FILE_TRANSFER_LIMITS, overrides: [{ personKey: 'p1', name: 'A', maxFileTransferBytes: 50 * GB, maxOpenBytes: 200 * GB }] };
    expect(resolveFileTransferLimits(cfg, 'p1').maxFileTransferBytes).toBe(50 * GB);
    expect(resolveFileTransferLimits(cfg, 'p1').maxOpenBytes).toBe(200 * GB);
    expect(resolveFileTransferLimits(cfg, 'p2').maxFileTransferBytes).toBe(GB);
  });
  it('clamps an override to the ceiling', () => {
    const cfg = { ...DEFAULT_FILE_TRANSFER_LIMITS, overrides: [{ personKey: 'p1', name: 'A', maxFileTransferBytes: 900 * GB, maxOpenBytes: 900 * GB }] };
    const r = resolveFileTransferLimits(cfg, 'p1');
    expect(r.maxFileTransferBytes).toBe(500 * GB);
    expect(r.maxOpenBytes).toBe(500 * GB);
  });
});

describe('checkFileTransferRequest', () => {
  const limits = resolveFileTransferLimits(undefined, 'p1');
  const ok = { totalBytes: 1000, fileCount: 1, externalCount: 1, recipientCount: 1, lifetimeDays: 7, emails: ['a@b.ch'] };
  it('accepts a valid request', () => expect(checkFileTransferRequest(ok, limits, 0)).toBeUndefined());
  it('tooLarge', () => expect(checkFileTransferRequest({ ...ok, totalBytes: GB + 1 }, limits, 0)).toBe('tooLarge'));
  it('openTotalExceeded', () => expect(checkFileTransferRequest({ ...ok, totalBytes: 1000 }, limits, 5 * GB)).toBe('openTotalExceeded'));
  it('tooManyExternals', () => expect(checkFileTransferRequest({ ...ok, externalCount: 21 }, limits, 0)).toBe('tooManyExternals'));
  it('tooManyExternals counts emails, not just externalCount', () => {
    const emails = Array.from({ length: 21 }, (_, i) => `u${i}@x.ch`);
    expect(checkFileTransferRequest({ ...ok, externalCount: 1, emails }, limits, 0)).toBe('tooManyExternals');
    expect(checkFileTransferRequest({ ...ok, externalCount: 0, emails: Array.from({ length: 50 }, (_, i) => `u${i}@x.ch`) }, limits, 0)).toBe('tooManyExternals');
  });
  it('invalidRequest for NaN, negative and fractional numbers', () => {
    expect(checkFileTransferRequest({ ...ok, totalBytes: NaN }, limits, 0)).toBe('invalidRequest');
    expect(checkFileTransferRequest({ ...ok, totalBytes: -1 }, limits, 0)).toBe('invalidRequest');
    expect(checkFileTransferRequest({ ...ok, lifetimeDays: 1.5 }, limits, 0)).toBe('invalidRequest');
    expect(checkFileTransferRequest(ok, limits, NaN)).toBe('invalidRequest');
  });
  it('lifetimeTooLong', () => expect(checkFileTransferRequest({ ...ok, lifetimeDays: 31 }, limits, 0)).toBe('lifetimeTooLong'));
  it('noFiles', () => expect(checkFileTransferRequest({ ...ok, fileCount: 0 }, limits, 0)).toBe('noFiles'));
  it('noRecipients', () => expect(checkFileTransferRequest({ ...ok, recipientCount: 0, externalCount: 0, emails: [] }, limits, 0)).toBe('noRecipients'));
  it('invalidEmail', () => expect(checkFileTransferRequest({ ...ok, emails: ['nope'] }, limits, 0)).toBe('invalidEmail'));
});

describe('openBytes', () => {
  it('counts uploading and open transfers', () => {
    expect(
      openBytes([
        { state: 'uploading', totalBytes: 3e9 },
        { state: 'open', totalBytes: 2e9 },
        { state: 'expired', totalBytes: 9e9 },
      ])
    ).toBe(5e9);
  });
});
