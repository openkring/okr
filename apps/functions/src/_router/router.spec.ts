import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CallableRequest, HttpsError as HttpsErrorType } from 'firebase-functions/v2/https';

// Real firebase-functions logger, only its console sink is captured: the emitted entry is what Cloud Logging shows.
const sink = vi.spyOn(console, 'error').mockImplementation(() => undefined);

// Loaded after the spy: the logger binds console.error when first imported.
let dispatchOp: typeof import('./index').dispatchOp;
let HttpsError: typeof HttpsErrorType;

beforeAll(async () => {
  ({ dispatchOp } = await import('./index'));
  ({ HttpsError } = await import('firebase-functions/v2/https'));
});
afterAll(() => sink.mockRestore());

const req = (data: unknown, extra: Record<string, unknown> = {}): CallableRequest<unknown> =>
  ({ data, auth: { uid: 'u1', token: {} }, app: { appId: 'a1' }, ...extra }) as unknown as CallableRequest<unknown>;

async function code(p: Promise<unknown>): Promise<string | undefined> {
  try {
    await p;
  } catch (e) {
    return (e as HttpsErrorType).code;
  }
  return undefined;
}

describe('dispatchOp', () => {
  it('missing op / non-string op -> invalid-argument unknown op', async () => {
    const run = vi.fn();
    for (const data of [undefined, null, {}, { op: 5 }, { op: '' }]) {
      await expect(dispatchOp('r', { a: run }, req(data))).rejects.toMatchObject({ code: 'invalid-argument', message: 'unknown op' });
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('unknown op -> invalid-argument, no handler called', async () => {
    const run = vi.fn();
    expect(await code(dispatchOp('r', { a: run }, req({ op: 'b' })))).toBe('invalid-argument');
    expect(run).not.toHaveBeenCalled();
  });

  it("'__proto__' / 'toString' / 'hasOwnProperty' are unknown (own keys only)", async () => {
    const run = vi.fn();
    for (const op of ['__proto__', 'toString', 'hasOwnProperty', 'constructor']) {
      expect(await code(dispatchOp('r', { a: run }, req({ op })))).toBe('invalid-argument');
    }
    expect(run).not.toHaveBeenCalled();
  });

  it('the handler receives data without op, and the same auth/app', async () => {
    const run = vi.fn().mockResolvedValue(1);
    const request = req({ op: 'a', x: 1, y: { z: 2 } });
    await dispatchOp('r', { a: run }, request);
    const passed = run.mock.calls[0][0];
    expect(passed.data).toEqual({ x: 1, y: { z: 2 } });
    expect('op' in passed.data).toBe(false);
    expect(passed.auth).toBe(request.auth);
    expect(passed.app).toBe(request.app);
    expect((request.data as { op: string }).op).toBe('a');
  });

  it('the return value passes through', async () => {
    const result = { success: true, token: 't' };
    expect(await dispatchOp('r', { a: () => Promise.resolve(result) }, req({ op: 'a' }))).toBe(result);
  });

  it('an HttpsError passes through unlogged', async () => {
    sink.mockClear();
    const err = new HttpsError('permission-denied', 'nope');
    await expect(dispatchOp('r', { a: () => Promise.reject(err) }, req({ op: 'a' }))).rejects.toBe(err);
    expect(sink).not.toHaveBeenCalled();
  });

  it('a plain Error is logged with the tag and rethrown', async () => {
    const err = new Error('boom 42');
    await expect(dispatchOp('matrixAdmin', { listX: () => Promise.reject(err) }, req({ op: 'listX' }))).rejects.toBe(err);
    const entry = JSON.parse(sink.mock.calls[sink.mock.calls.length - 1][0] as string);
    expect(entry.severity).toBe('ERROR');
    expect(entry.message.startsWith('matrixAdmin:listX failed')).toBe(true);
    expect(entry.message).toContain('boom 42');
  });

  it('performs no role check of its own (handler called with auth undefined)', async () => {
    const run = vi.fn().mockResolvedValue('ok');
    const request = { data: { op: 'a' }, auth: undefined, app: undefined } as unknown as CallableRequest<unknown>;
    expect(await dispatchOp('r', { a: run }, request)).toBe('ok');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
