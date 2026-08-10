import { afterEach, describe, expect, it, vi } from 'vitest';

import { idTokenFor } from './push';
import type { MeteringConfig } from './push';

/**
 * The refresh-token exchange (C3 §3 option 4, 2026-08-09).
 *
 * Only the response handling is covered here, and deliberately: that the endpoint itself is not
 * App Check enforced is a fact about the live project, not about this code, and was established by
 * probing it (an invalid token gets past the gate and fails as `400 INVALID_REFRESH_TOKEN`, where
 * every `identitytoolkit` sign-in endpoint answers `401 App Check token is invalid` first).
 *
 * What IS this code's problem is the casing branch. `securetoken` answers `id_token` to a
 * form-encoded request and `idToken` to a JSON one, and reading the wrong key yields `undefined`,
 * which then travels onward as the literal string `Bearer undefined` and surfaces as an auth error
 * three layers from its cause.
 */
const config = {
  partnerKey: 'p1',
  endpoint: 'https://europe-west6-bkaiser-org.cloudfunctions.net/pushMetering',
  serviceEmail: 'partner-alpha@bkaiser.ch',
  serviceRefreshToken: 'refresh-me',
  apiKey: 'k',
  tenants: [],
} satisfies MeteringConfig;

function stubFetch(response: { ok: boolean; status?: number; body?: unknown; text?: string }) {
  const spy = vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 400),
    json: async () => response.body,
    text: async () => response.text ?? '',
  }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => vi.unstubAllGlobals());

describe('idTokenFor', () => {
  it('reads the snake_case id_token a form-encoded request gets back', async () => {
    stubFetch({ ok: true, body: { id_token: 'ID-SNAKE', refresh_token: 'r' } });
    expect(await idTokenFor(config)).toBe('ID-SNAKE');
  });

  it('reads the camelCase idToken too, so the request encoding cannot silently break it', async () => {
    stubFetch({ ok: true, body: { idToken: 'ID-CAMEL' } });
    expect(await idTokenFor(config)).toBe('ID-CAMEL');
  });

  it('hits securetoken, not identitytoolkit — the whole point of the change', async () => {
    const spy = stubFetch({ ok: true, body: { id_token: 'x' } });
    await idTokenFor(config);
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('securetoken.googleapis.com/v1/token');
    expect(url).not.toContain('identitytoolkit');
    expect(String(init.body)).toContain('grant_type=refresh_token');
  });

  it('throws rather than returning undefined when the body carries no token at all', async () => {
    // The failure this guards: `undefined` becomes 'Bearer undefined' and fails as a permission
    // error on the far side, pointing at the callable instead of at the exchange.
    stubFetch({ ok: true, body: { expires_in: '3600' } });
    await expect(idTokenFor(config)).rejects.toThrow(/no id_token/);
  });

  it('names the identity when the exchange is refused, so a dead token is diagnosable', async () => {
    stubFetch({ ok: false, status: 400, text: 'INVALID_REFRESH_TOKEN' });
    await expect(idTokenFor(config)).rejects.toThrow(/partner-alpha@bkaiser\.ch.*400/);
  });
});
