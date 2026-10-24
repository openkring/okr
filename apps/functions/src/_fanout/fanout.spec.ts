import { beforeEach, describe, expect, it, vi } from 'vitest';

const { info, error } = vi.hoisted(() => ({ info: vi.fn(), error: vi.fn() }));
vi.mock('firebase-functions/v2', () => ({ logger: { info, error } }));

import { runHandlers, runJobs } from './index';

describe('runHandlers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not skip other handlers when one rejects, and names the failure', async () => {
    const ok = vi.fn().mockResolvedValue(undefined);
    const res = await runHandlers('groups', { id: 1 }, [
      { name: 'bad', run: () => Promise.reject(new Error('boom')) },
      { name: 'good', run: ok },
    ]);
    expect(ok).toHaveBeenCalledWith({ id: 1 });
    expect(res.failed).toEqual(['bad']);
    expect(error).toHaveBeenCalledWith('groups:bad failed', expect.anything());
  });

  it('survives a handler that throws synchronously', async () => {
    const res = await runHandlers('t', 1, [
      {
        name: 'sync',
        run: () => {
          throw new Error('x');
        },
      },
    ]);
    expect(res.failed).toEqual(['sync']);
  });

  it('starts handlers concurrently', async () => {
    const started: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const p = runHandlers('t', 0, [
      { name: 'slow', run: async () => { started.push('slow'); await gate; } },
      { name: 'fast', run: async () => { started.push('fast'); } },
    ]);
    await Promise.resolve();
    expect(started).toEqual(['slow', 'fast']);
    release();
    expect((await p).failed).toEqual([]);
  });
});

describe('runJobs', () => {
  beforeEach(() => vi.clearAllMocks());

  it('runs jobs in order', async () => {
    const order: string[] = [];
    const res = await runJobs('s', [
      { name: 'a', run: async () => { order.push('a'); } },
      { name: 'b', run: async () => { order.push('b'); } },
    ]);
    expect(order).toEqual(['a', 'b']);
    expect(res).toEqual({ ran: ['a', 'b'], skipped: [], failed: [] });
    expect(info).toHaveBeenCalledWith(expect.stringContaining('s:a'), expect.anything());
  });

  it('a failing job does not stop later jobs', async () => {
    const later = vi.fn().mockResolvedValue(undefined);
    const res = await runJobs('s', [
      { name: 'bad', run: () => Promise.reject(new Error('boom')) },
      { name: 'later', run: later },
    ]);
    expect(later).toHaveBeenCalled();
    expect(res).toEqual({ ran: ['later'], skipped: [], failed: ['bad'] });
    expect(error).toHaveBeenCalledWith('s:bad failed', expect.objectContaining({ durationMs: expect.any(Number) }));
  });

  it('skips a job whose when() is false and passes now', async () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const when = vi.fn().mockReturnValue(false);
    const run = vi.fn();
    const res = await runJobs('s', [{ name: 'x', run, when }], now);
    expect(when).toHaveBeenCalledWith(now);
    expect(run).not.toHaveBeenCalled();
    expect(res.skipped).toEqual(['x']);
  });

  it('counts a throwing when() as failed', async () => {
    const res = await runJobs('s', [
      { name: 'x', run: vi.fn(), when: () => { throw new Error('w'); } },
    ]);
    expect(res.failed).toEqual(['x']);
  });
});
