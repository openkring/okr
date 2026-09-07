import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportToSentry } from './sentry';

const DSN = 'https://abc123@o4511520038453248.ingest.de.sentry.io/4511520052019280';

describe('reportToSentry', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['SENTRY_FUNCTIONS_DSN'];
  });

  it('does nothing when no DSN is configured', async () => {
    await reportToSentry({ message: 'boom' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing for the "unset" placeholder the secret is provisioned with', async () => {
    process.env['SENTRY_FUNCTIONS_DSN'] = 'unset';
    await reportToSentry({ message: 'boom' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does nothing when the DSN is not a parseable URL', async () => {
    process.env['SENTRY_FUNCTIONS_DSN'] = 'https://';
    await reportToSentry({ message: 'boom' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to the envelope endpoint derived from the DSN', async () => {
    process.env['SENTRY_FUNCTIONS_DSN'] = DSN;
    await reportToSentry({ message: 'boom' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://o4511520038453248.ingest.de.sentry.io/api/4511520052019280/envelope/' +
      '?sentry_key=abc123&sentry_version=7'
    );
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-sentry-envelope');
  });

  it('sends a three-line envelope whose header event_id matches the event', async () => {
    process.env['SENTRY_FUNCTIONS_DSN'] = DSN;
    await reportToSentry({ message: 'boom', tags: { appId: 'elab', code: 'auth/unauthorized-continue-uri' } });

    const lines = (fetchMock.mock.calls[0][1].body as string).trim().split('\n');
    expect(lines).toHaveLength(3);

    const header = JSON.parse(lines[0]);
    const itemHeader = JSON.parse(lines[1]);
    const event = JSON.parse(lines[2]);

    expect(itemHeader).toEqual({ type: 'event' });
    expect(event.event_id).toBe(header.event_id);
    expect(event.event_id).toMatch(/^[0-9a-f]{32}$/);
    expect(event.message.formatted).toBe('boom');
    expect(event.level).toBe('error');
    expect(event.tags).toMatchObject({ appId: 'elab', code: 'auth/unauthorized-continue-uri' });
  });

  it('carries extra context and honours a non-default level', async () => {
    process.env['SENTRY_FUNCTIONS_DSN'] = DSN;
    await reportToSentry({ message: 'boom', level: 'warning', extra: { continueUrl: 'https://app.example.ch/auth/login' } });

    const event = JSON.parse((fetchMock.mock.calls[0][1].body as string).trim().split('\n')[2]);
    expect(event.level).toBe('warning');
    expect(event.extra).toEqual({ continueUrl: 'https://app.example.ch/auth/login' });
  });

  it('never throws when Sentry is unreachable — the caller is already handling a failure', async () => {
    process.env['SENTRY_FUNCTIONS_DSN'] = DSN;
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(reportToSentry({ message: 'boom' })).resolves.toBeUndefined();
  });

  it('never throws when Sentry rejects the envelope', async () => {
    process.env['SENTRY_FUNCTIONS_DSN'] = DSN;
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    await expect(reportToSentry({ message: 'boom' })).resolves.toBeUndefined();
  });
});
