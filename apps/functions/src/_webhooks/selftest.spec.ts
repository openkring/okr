import { describe, it, expect, vi, beforeEach } from 'vitest';

const { error } = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('firebase-functions/v2', () => ({ logger: { error } }));

import { mergeDays, runWebhookSelftest, type SelftestDeps, type WebhookSelftestResult } from './selftest';
import { verifyHmacHex } from './verify';
import type { WebhookEventState } from './types';

function deps(over: Partial<SelftestDeps> & { states?: (WebhookEventState | undefined)[] } = {}) {
  let t = Date.parse('2026-11-07T02:15:00Z');
  const states = over.states ?? ['received', 'handled'];
  let i = 0;
  const written: WebhookSelftestResult[] = [];
  const d: SelftestDeps = {
    url: 'https://x/webhooks/selftest',
    secret: 's3cret',
    post: vi.fn(async () => 200),
    readState: async () => states[Math.min(i++, states.length - 1)],
    readPrevious: async () => undefined,
    writeResult: async r => {
      written.push(r);
    },
    now: () => new Date(t),
    sleep: async ms => {
      t += ms;
    },
    ...over,
  };
  return { d, written };
}

describe('runWebhookSelftest', () => {
  beforeEach(() => error.mockClear());

  it('passes when the row reaches handled, signing the body like a real sender', async () => {
    const { d, written } = deps();
    const r = await runWebhookSelftest('nightly', d);
    expect(r.level).toBe('ok');
    expect(r.failedStep).toBeUndefined();
    expect(written).toEqual([r]);
    expect(r.days).toEqual([{ date: '2026-11-07', level: 'ok' }]);
    const [, body, headers] = (d.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(verifyHmacHex(Buffer.from(body), headers['x-okr-signature'], 's3cret')).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it('fails at http on a non-2xx answer', async () => {
    const { d } = deps({ post: async () => 500 });
    expect((await runWebhookSelftest('manual', d)).failedStep).toBe('http');
  });

  it('fails at http when the post throws (timeout)', async () => {
    const { d } = deps({ post: async () => { throw new Error('The operation was aborted due to timeout'); } });
    const r = await runWebhookSelftest('manual', d);
    expect(r.failedStep).toBe('http');
    expect(r.level).toBe('down');
  });

  it('fails at stored when no row appears within 60 s', async () => {
    const { d } = deps({ states: [undefined] });
    expect((await runWebhookSelftest('deploy', d)).failedStep).toBe('stored');
  });

  it('fails at processed when 2xx but the row never reaches handled', async () => {
    const { d } = deps({ states: ['received'] });
    const r = await runWebhookSelftest('deploy', d);
    expect(r.failedStep).toBe('processed');
    expect(r.detail).toBe('state received');
  });

  it('fails at processed with the state when the row failed', async () => {
    const { d } = deps({ states: ['failed'] });
    const r = await runWebhookSelftest('deploy', d);
    expect(r.failedStep).toBe('processed');
    expect(r.detail).toBe('state failed');
  });

  it('logs a webhooks: error on failure', async () => {
    const { d } = deps({ post: async () => 503 });
    await runWebhookSelftest('nightly', d);
    expect(error).toHaveBeenCalledWith('webhooks: selftest failed', expect.objectContaining({ failedStep: 'http' }));
  });
});

describe('runWebhookSelftest, pingen probe', () => {
  beforeEach(() => error.mockClear());
  const withPingen = (over: Partial<SelftestDeps> & { states?: (WebhookEventState | undefined)[] } = {}) =>
    deps({ pingen: { url: 'https://x/webhooks/pingen', secret: 'pingen-key' }, ...over });

  it('is skipped without a signing key, leaving the result as before', async () => {
    const { d } = deps();
    expect((await runWebhookSelftest('nightly', d)).pingen).toBeUndefined();
    expect(d.post).toHaveBeenCalledTimes(1);
  });

  it('posts a letter event signed in the Signature header for a letter no sending has', async () => {
    const { d } = withPingen({ states: ['handled', 'received', 'ignored'] });
    const r = await runWebhookSelftest('nightly', d);
    expect(r.pingen).toMatchObject({ level: 'ok' });
    const [url, body, headers] = (d.post as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(url).toBe('https://x/webhooks/pingen');
    expect(verifyHmacHex(Buffer.from(body), headers['Signature'], 'pingen-key')).toBe(true);
    const parsed = JSON.parse(body);
    expect(parsed.data.type).toBe('webhook_delivered');
    expect(parsed.data.relationships.deliverable.data).toMatchObject({ type: 'letters' });
    expect(parsed.data.relationships.deliverable.data.id).toMatch(/^selftest-/);
    expect(parsed.data.relationships.event.data.id).toBe(parsed.data.relationships.deliverable.data.id);
  });

  it('a failing pingen probe does not fail the receiver result, and is logged', async () => {
    let n = 0;
    const { d } = withPingen({ post: async () => (n++ === 0 ? 200 : 401) });
    const r = await runWebhookSelftest('manual', d);
    expect(r.level).toBe('ok');
    expect(r.pingen).toMatchObject({ level: 'down', failedStep: 'http', detail: 'HTTP 401' });
    expect(error).toHaveBeenCalledWith('webhooks: pingen selftest failed', expect.objectContaining({ failedStep: 'http' }));
  });

  it('fails the probe when its row stays received', async () => {
    const { d } = withPingen({ states: ['handled', 'received'] });
    expect((await runWebhookSelftest('manual', d)).pingen).toMatchObject({ level: 'down', failedStep: 'processed' });
  });
});

describe('mergeDays', () => {
  it('keeps down when a later run on the same day passes', () => {
    expect(mergeDays([{ date: '2026-11-07', level: 'down' }], '2026-11-07', 'ok')).toEqual([{ date: '2026-11-07', level: 'down' }]);
  });
  it('appends a new day and keeps at most 30', () => {
    const days = Array.from({ length: 30 }, (_, n) => ({ date: `2026-10-${String(n + 1).padStart(2, '0')}`, level: 'ok' as const }));
    const out = mergeDays(days, '2026-11-01', 'down');
    expect(out).toHaveLength(30);
    expect(out[0].date).toBe('2026-10-02');
    expect(out.at(-1)).toEqual({ date: '2026-11-01', level: 'down' });
  });
});
