import { beforeEach, describe, expect, it, vi } from 'vitest';

const names = ['handleOcrFileFinalized', 'handleRagFileCreated', 'handleRagFileDeleted', 'handleAlbumSourceDeleted'];
const calls = vi.hoisted(() => ({ fns: {} as Record<string, ReturnType<typeof vi.fn>>, opts: {} as Record<string, unknown> }));
const secret = vi.hoisted(() => ({ name: 'GEMINI_API_KEY', value: () => 'k' }));

vi.mock('firebase-functions/v2/storage', () => ({
  // the wrapped function is returned as-is so the spec can call it directly; options are captured
  onObjectFinalized: (opts: unknown, fn: unknown) => { calls.opts['finalized'] = opts; return fn; },
  onObjectDeleted: (opts: unknown, fn: unknown) => { calls.opts['deleted'] = opts; return fn; },
}));
vi.mock('firebase-functions/v2', () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('../ocr', () => ({ geminiApiKey: secret, handleOcrFileFinalized: (e: unknown) => calls.fns['handleOcrFileFinalized'](e) }));
vi.mock('../rag', () => ({
  handleRagFileCreated: (e: unknown) => calls.fns['handleRagFileCreated'](e),
  handleRagFileDeleted: (e: unknown) => calls.fns['handleRagFileDeleted'](e),
}));
vi.mock('../video', () => ({ handleAlbumSourceDeleted: (e: unknown) => calls.fns['handleAlbumSourceDeleted'](e) }));

import { STORAGE_FINALIZED_HANDLERS, onStorageFinalized } from './on-storage-finalized';
import { STORAGE_DELETED_HANDLERS, onStorageDeleted } from './on-storage-deleted';

type Trigger = (e: unknown) => Promise<void>;

describe('storage triggers', () => {
  beforeEach(() => {
    for (const n of names) calls.fns[n] = vi.fn().mockResolvedValue(undefined);
  });

  it('lists the handlers in order', () => {
    expect(STORAGE_FINALIZED_HANDLERS.map((h) => h.name)).toEqual(['ocr', 'rag']);
    expect(STORAGE_DELETED_HANDLERS.map((h) => h.name)).toEqual(['rag', 'albumSource']);
  });

  it('same event to both handlers', async () => {
    const fin = { data: { name: 'tenant/scs/rag/a.pdf' } };
    await (onStorageFinalized as unknown as Trigger)(fin);
    for (const n of ['handleOcrFileFinalized', 'handleRagFileCreated']) {
      expect(calls.fns[n]).toHaveBeenCalledTimes(1);
      expect(calls.fns[n].mock.calls[0][0]).toBe(fin);
    }
    const del = { data: { name: 'x' } };
    await (onStorageDeleted as unknown as Trigger)(del);
    for (const n of ['handleRagFileDeleted', 'handleAlbumSourceDeleted']) {
      expect(calls.fns[n]).toHaveBeenCalledTimes(1);
      expect(calls.fns[n].mock.calls[0][0]).toBe(del);
    }
  });

  it('a rejecting handler does not stop the other and the trigger does not reject', async () => {
    calls.fns['handleOcrFileFinalized'].mockRejectedValue(new Error('boom'));
    await expect((onStorageFinalized as unknown as Trigger)({ data: {} })).resolves.toBeUndefined();
    expect(calls.fns['handleRagFileCreated']).toHaveBeenCalledTimes(1);
    calls.fns['handleRagFileDeleted'].mockRejectedValue(new Error('boom'));
    await expect((onStorageDeleted as unknown as Trigger)({ data: {} })).resolves.toBeUndefined();
    expect(calls.fns['handleAlbumSourceDeleted']).toHaveBeenCalledTimes(1);
  });

  it('keeps the union of the former options (OCR keeps 1GiB)', () => {
    expect(calls.opts['finalized']).toEqual({ region: 'europe-west6', secrets: [secret], memory: '1GiB' });
    expect(calls.opts['deleted']).toEqual({
      region: 'europe-west6', memory: '256MiB', cpu: 1, concurrency: 10, timeoutSeconds: 60, maxInstances: 10,
      secrets: [secret, 'SENTRY_FUNCTIONS_DSN'],
    });
  });
});
