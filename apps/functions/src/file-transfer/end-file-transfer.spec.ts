import { endAction } from './end-file-transfer';

describe('endAction', () => {
  it('is a no-op for a missing, ended or expired transfer', () => {
    expect(endAction(undefined, true)).toBe('noop');
    expect(endAction({ state: 'ended' }, true)).toBe('noop');
    expect(endAction({ state: 'expired' }, false)).toBe('noop');
  });
  it('ends an open transfer for the sender and for an admin', () => {
    expect(endAction({ state: 'open' }, true)).toBe('end');
    expect(endAction({ state: 'open' }, false)).toBe('end');
  });
  it('lets the sender cancel a transfer that is still uploading', () => {
    expect(endAction({ state: 'uploading' }, true)).toBe('cancelUpload');
  });
  it('refuses an admin who is not the sender on an uploading transfer', () => {
    expect(endAction({ state: 'uploading' }, false)).toBe('notOpen');
  });
  it('never ends an open transfer when only an upload may be cancelled', () => {
    expect(endAction({ state: 'open' }, true, true)).toBe('noop');
    expect(endAction({ state: 'uploading' }, true, true)).toBe('cancelUpload');
  });
});
