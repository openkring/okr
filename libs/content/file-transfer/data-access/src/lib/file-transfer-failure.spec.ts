import { describe, expect, it } from 'vitest';
import { FileTransferError, fileTransferFailureOf } from './file-transfer.service';

describe('fileTransferFailureOf', () => {
  it('reads expired and notFound from the callable message', () => {
    expect(fileTransferFailureOf(new FileTransferError('failed-precondition', 'expired'))).toBe('expired');
    expect(fileTransferFailureOf(new FileTransferError('not-found', 'notFound'))).toBe('notFound');
  });

  it('unwraps the cause of an rxResource error', () => {
    expect(fileTransferFailureOf({ cause: new FileTransferError('not-found', 'notFound') })).toBe('notFound');
  });

  it('is other for any other failure', () => {
    expect(fileTransferFailureOf(new FileTransferError('unavailable', 'Die Dateiübertragung ist fehlgeschlagen.'))).toBe('other');
    expect(fileTransferFailureOf(new Error('expired'))).toBe('other');
    expect(fileTransferFailureOf(undefined)).toBe('other');
  });
});
