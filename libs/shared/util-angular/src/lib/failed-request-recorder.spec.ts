import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearRecentFailedRequests, getRecentFailedRequests, hasRecentFailedRequest, installFailedRequestRecorder } from './failed-request-recorder';

/**
 * The recorder wraps whatever `fetch` it finds at install time and installs exactly once,
 * so the tests swap the implementation *behind* a stable stub rather than reassigning
 * globalThis.fetch (which would replace the wrapper itself).
 */
let impl: (...args: Parameters<typeof fetch>) => Promise<Response>;
globalThis.fetch = ((...args: Parameters<typeof fetch>) => impl(...args)) as typeof fetch;
installFailedRequestRecorder();

describe('failed request recorder', () => {
  beforeEach(() => {
    clearRecentFailedRequests();
  });

  it('records non-ok responses and leaves the response untouched', async () => {
    const response = new Response('', { status: 504, statusText: 'Gateway Timeout' });
    impl = vi.fn().mockResolvedValue(response);

    const returned = await fetch('https://www.googletagmanager.com/gtag/js?id=G-XYZ');

    expect(returned).toBe(response);
    expect(getRecentFailedRequests()).toEqual([
      expect.objectContaining({ url: 'https://www.googletagmanager.com/gtag/js', status: 504 }),
    ]);
  });

  it('strips the query string, which is where identifiers live', async () => {
    impl = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    await fetch('https://example.org/x?token=secret');

    expect(getRecentFailedRequests()[0].url).toBe('https://example.org/x');
  });

  it('records a thrown fetch as status 0 and re-throws', async () => {
    const boom = new TypeError('Failed to fetch');
    impl = vi.fn().mockRejectedValue(boom);

    await expect(fetch('https://example.org/y')).rejects.toBe(boom);
    expect(getRecentFailedRequests()[0]).toMatchObject({ url: 'https://example.org/y', status: 0 });
  });

  it('does not record successful responses', async () => {
    impl = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    await fetch('https://example.org/ok');

    expect(getRecentFailedRequests()).toHaveLength(0);
  });

  it('keeps only the last five entries', async () => {
    impl = vi.fn().mockResolvedValue(new Response('', { status: 503 }));
    for (let i = 0; i < 7; i++) await fetch(`https://example.org/${i}`);

    const urls = getRecentFailedRequests().map((r) => r.url);
    expect(urls).toEqual(['https://example.org/2', 'https://example.org/3', 'https://example.org/4', 'https://example.org/5', 'https://example.org/6']);
  });

  it('matches a recent failure by host pattern within a window', async () => {
    impl = vi.fn().mockResolvedValue(new Response('', { status: 504 }));
    await fetch('https://www.googletagmanager.com/gtag/js');

    expect(hasRecentFailedRequest(/googletagmanager\.com/, 10_000)).toBe(true);
    expect(hasRecentFailedRequest(/firestore\.googleapis\.com/, 10_000)).toBe(false);
  });

  it('forgets a failure once it falls out of the window', async () => {
    impl = vi.fn().mockResolvedValue(new Response('', { status: 504 }));
    await fetch('https://www.googletagmanager.com/gtag/js');

    const later = Date.now() + 30_000;
    vi.spyOn(Date, 'now').mockReturnValue(later);
    try {
      expect(hasRecentFailedRequest(/googletagmanager\.com/, 10_000)).toBe(false);
    } finally {
      vi.mocked(Date.now).mockRestore();
    }
  });
});
