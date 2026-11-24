import { describe, expect, it } from 'vitest';

import { createSerialQueue } from './serial-queue.util';

describe('createSerialQueue', () => {
  it('starts a job only after the previous one has finished', async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    const slow = enqueue(async () => { await new Promise((r) => setTimeout(r, 20)); log.push('first'); });
    const fast = enqueue(async () => { log.push('second'); });
    await Promise.all([slow, fast]);
    expect(log).toEqual(['first', 'second']);
  });

  it('keeps running after a job rejects or throws', async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    await enqueue(async () => { throw new Error('boom'); });
    await enqueue(() => { throw new Error('sync boom'); });
    await enqueue(async () => { log.push('still running'); });
    expect(log).toEqual(['still running']);
  });
});
