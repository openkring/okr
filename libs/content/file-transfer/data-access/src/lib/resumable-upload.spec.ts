import { describe, expect, it } from 'vitest';
import { ResumableSessionExpiredError, uploadResumable } from './resumable-upload';

const MIB = 1024 * 1024;
const CHUNK = 8 * MIB;

function blob(size: number): Blob {
  return new Blob([new Uint8Array(size)]);
}

interface Call { method: string; range: string | null; bodySize: number }

function res(status: number, range?: string): Response {
  return new Response(null, { status, headers: range ? { Range: range } : {} });
}

function stub(script: (call: Call, n: number) => Response | Error) {
  const calls: Call[] = [];
  const fetchFn = (async (_url: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const body = init?.body as Blob | undefined;
    const call: Call = { method: String(init?.method), range: headers.get('Content-Range'), bodySize: body?.size ?? 0 };
    calls.push(call);
    const r = script(call, calls.length - 1);
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

describe('uploadResumable', () => {
  it('uploads in 8 MiB chunks: 308 + Range continues, 200 finishes', async () => {
    const size = CHUNK + 1000;
    const { calls, fetchFn } = stub((_c, n) => (n === 0 ? res(308, `bytes=0-${CHUNK - 1}`) : res(200)));
    const progress: number[] = [];
    await uploadResumable('https://s', blob(size), s => progress.push(s), { fetchFn });
    expect(calls[0].range).toBe(`bytes 0-${CHUNK - 1}/${size}`);
    expect(calls[1].range).toBe(`bytes ${CHUNK}-${size - 1}/${size}`);
    expect(calls).toHaveLength(2);
    expect(progress).toEqual([CHUNK, size]);
  });

  it('accepts 201 as completion of a single chunk', async () => {
    const { calls, fetchFn } = stub(() => res(201));
    await uploadResumable('https://s', blob(10), () => undefined, { fetchFn });
    expect(calls[0].range).toBe('bytes 0-9/10');
  });

  it('resumes from the server Range after a failed chunk, not from 0', async () => {
    const size = 3 * CHUNK;
    const { calls, fetchFn } = stub((c, n) => {
      if (n === 0) return res(308, `bytes=0-${CHUNK - 1}`);
      if (n === 1) return new TypeError('network');
      if (c.range === `bytes */${size}`) return res(308, `bytes=0-${CHUNK + 999}`);
      if (c.range?.startsWith(`bytes ${CHUNK + 1000}-`)) return res(308, `bytes=0-${2 * CHUNK + 999}`);
      return res(200);
    });
    await uploadResumable('https://s', blob(size), () => undefined, { fetchFn, retryDelayMs: 0 });
    expect(calls[2].range).toBe(`bytes */${size}`);
    expect(calls[3].range).toBe(`bytes ${CHUNK + 1000}-${2 * CHUNK + 999}/${size}`);
  });

  it('resumes at 0 when the status query returns no Range', async () => {
    const { calls, fetchFn } = stub((c, n) => {
      if (n === 0) return new TypeError('network');
      if (c.range === 'bytes */10') return res(308);
      return res(200);
    });
    await uploadResumable('https://s', blob(10), () => undefined, { fetchFn, retryDelayMs: 0 });
    expect(calls[2].range).toBe('bytes 0-9/10');
  });

  it('treats a 200 on the status query as already complete', async () => {
    const { calls, fetchFn } = stub((_c, n) => (n === 0 ? new TypeError('x') : res(200)));
    await uploadResumable('https://s', blob(10), () => undefined, { fetchFn, retryDelayMs: 0 });
    expect(calls).toHaveLength(2);
  });

  it('gives up after maxRetries and rejects (exact call counts)', async () => {
    const { calls, fetchFn } = stub(() => new TypeError('network'));
    await expect(
      uploadResumable('https://s', blob(10), () => undefined, { fetchFn, maxRetries: 3, retryDelayMs: 0 }),
    ).rejects.toThrow();
    expect(calls.filter(c => c.range === 'bytes 0-9/10')).toHaveLength(1);
    expect(calls.filter(c => c.range === 'bytes */10')).toHaveLength(3);
  });

  it('a 308 that never advances rejects after maxRetries (exact counts)', async () => {
    const { calls, fetchFn } = stub(() => res(308, 'bytes=0-0'));
    await expect(
      uploadResumable('https://s', blob(10), () => undefined, { fetchFn, maxRetries: 3, retryDelayMs: 0 }),
    ).rejects.toThrow();
    expect(calls.filter(c => c.range?.startsWith('bytes ') && !c.range.startsWith('bytes */'))).toHaveLength(5);
    expect(calls.filter(c => c.range === 'bytes */10')).toHaveLength(3);
  });

  it('fails clearly when a 308 carries no readable Range even after a status query', async () => {
    const { calls, fetchFn } = stub(() => res(308));
    await expect(
      uploadResumable('https://s', blob(10), () => undefined, { fetchFn, retryDelayMs: 0 }),
    ).rejects.toThrow(/bucket CORS/);
    expect(calls).toHaveLength(2);
  });

  it('retries 408', async () => {
    const { calls, fetchFn } = stub((_c, n) => (n === 0 ? res(408) : n === 1 ? res(308) : res(200)));
    await uploadResumable('https://s', blob(10), () => undefined, { fetchFn, retryDelayMs: 0 });
    expect(calls).toHaveLength(3);
  });

  it('rejects with ResumableSessionExpiredError on a 410 status query', async () => {
    const { fetchFn } = stub((_c, n) => (n === 0 ? new TypeError('x') : res(410)));
    await expect(
      uploadResumable('https://s', blob(10), () => undefined, { fetchFn, retryDelayMs: 0 }),
    ).rejects.toBeInstanceOf(ResumableSessionExpiredError);
  });

  it('rejects with ResumableSessionExpiredError on a 404 chunk', async () => {
    const { fetchFn } = stub(() => res(404));
    await expect(
      uploadResumable('https://s', blob(10), () => undefined, { fetchFn }),
    ).rejects.toBeInstanceOf(ResumableSessionExpiredError);
  });

  it('rejects with AbortError when aborted during a flight', async () => {
    const ctl = new AbortController();
    const fetchFn = ((_u: string, init?: RequestInit) => new Promise((_r, rej) => {
      init?.signal?.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      setTimeout(() => ctl.abort(), 0);
    })) as unknown as typeof fetch;
    await expect(
      uploadResumable('https://s', blob(10), () => undefined, { fetchFn, signal: ctl.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('rejects on a non-retryable 4xx', async () => {
    const { fetchFn } = stub(() => res(403));
    await expect(uploadResumable('https://s', blob(10), () => undefined, { fetchFn, retryDelayMs: 0 })).rejects.toThrow();
  });

  it('rejects with AbortError when aborted', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const { fetchFn } = stub(() => res(200));
    await expect(uploadResumable('https://s', blob(10), () => undefined, { fetchFn, signal: ctl.signal })).rejects.toThrow();
  });
});
