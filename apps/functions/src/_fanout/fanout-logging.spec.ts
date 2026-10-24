import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Real firebase-functions logger, only its console sink is captured: the emitted entry is what Cloud Logging shows.
const sink = vi.spyOn(console, 'error').mockImplementation(() => undefined);

let runJobs: typeof import('./index').runJobs;
let runHandlers: typeof import('./index').runHandlers;

beforeAll(async () => {
  ({ runJobs, runHandlers } = await import('./index'));
});
afterAll(() => sink.mockRestore());

function lastEntry(): { severity: string; message: string; durationMs?: number } {
  return JSON.parse(sink.mock.calls[sink.mock.calls.length - 1][0] as string);
}

describe('failure log entries (real firebase-functions logger)', () => {
  it('runJobs: message starts with the tag, carries the error text, durationMs is structured', async () => {
    await runJobs('nightlyMaintenance', [{ name: 'tripStats', run: () => Promise.reject(new Error('quota exhausted')) }]);
    const entry = lastEntry();
    expect(entry.severity).toBe('ERROR');
    expect(entry.message.startsWith('nightlyMaintenance:tripStats failed')).toBe(true);
    expect(entry.message).toContain('quota exhausted');
    expect(entry.durationMs).toEqual(expect.any(Number));
  });

  it('runHandlers: message starts with the tag and carries the error text', async () => {
    await runHandlers('onGroupDocWritten', {}, [{ name: 'replication', run: () => Promise.reject(new Error('permission denied')) }]);
    const entry = lastEntry();
    expect(entry.severity).toBe('ERROR');
    expect(entry.message.startsWith('onGroupDocWritten:replication failed')).toBe(true);
    expect(entry.message).toContain('permission denied');
  });
});
