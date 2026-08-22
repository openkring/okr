import { beforeEach, describe, expect, it, vi } from 'vitest';

const docGet = vi.fn();
const docUpdate = vi.fn();
const docRef = { get: docGet, update: docUpdate };
const docFn = vi.fn(() => docRef);

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ doc: docFn }) }),
  FieldValue: { increment: (n: number) => ({ __increment: n }) },
}));
vi.mock('firebase-functions/v2', () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('../rateLimit', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99, retryAfterMs: 0 })),
  clientIp: () => '1.2.3.4',
}));
vi.mock('../../alias/tenant-domains', () => ({
  tenantByHost: vi.fn(async (host: string) => (host.includes('seeclub.org') ? 'scs' : undefined)),
  appBaseUrl: vi.fn(async () => 'https://app.seeclub.org'),
}));

import { aliasRouter } from './alias';
import { checkRateLimit } from '../rateLimit';

const TODAY_SAFE = { validFrom: '', validUntil: '' };

const aliasDoc = (over: Record<string, unknown> = {}) => ({
  exists: true,
  id: 'scs__qr__ab3x4y',
  data: () => ({
    tenants: ['scs'], isArchived: false, isEnabled: true, space: 'qr', alias: 'Ab3x4y',
    targetType: 'url', targetUrl: 'https://seeclub.org/anmeldung', targetKey: '',
    maxUses: 0, useCount: 0, ...TODAY_SAFE, ...over,
  }),
});

function fakeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: '',
    redirectedTo: '',
    status(code: number) { res.statusCode = code; return res; },
    set(k: string, v?: string) {
      if (typeof k === 'string' && v !== undefined) res.headers[k] = v;
      return res;
    },
    send(b: string) { res.body = b; return res; },
    redirect(code: number, url: string) { res.statusCode = code; res.redirectedTo = url; return res; },
  };
  return res;
}

const reqFor = (space = 'qr', code = 'Ab3x4y', host = 'app.seeclub.org') =>
  ({ params: { space, code }, headers: { host } }) as never;

describe('GET /s/:space/:code', () => {
  beforeEach(() => {
    docGet.mockReset();
    docUpdate.mockReset().mockResolvedValue(undefined);
    docFn.mockClear();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, remaining: 99, retryAfterMs: 0 });
  });

  it('redirects with 302 and forbids caching, so the second scan still counts', async () => {
    docGet.mockResolvedValue(aliasDoc());
    const res = fakeRes();

    await aliasRouter(reqFor(), res as never);

    expect(res.statusCode).toBe(302);
    expect(res.redirectedTo).toBe('https://seeclub.org/anmeldung');
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });

  it('counts the use after answering', async () => {
    docGet.mockResolvedValue(aliasDoc());
    await aliasRouter(reqFor(), fakeRes() as never);
    expect(docUpdate).toHaveBeenCalledWith(expect.objectContaining({
      useCount: { __increment: 1 },
    }));
  });

  // Ein Zaehlfehler darf den Scan vor dem Plakat nicht kaputtmachen.
  it('still redirects when the counter write fails', async () => {
    docGet.mockResolvedValue(aliasDoc());
    docUpdate.mockRejectedValue(new Error('firestore down'));
    const res = fakeRes();

    await aliasRouter(reqFor(), res as never);

    expect(res.statusCode).toBe(302);
  });

  it('resolves through the deterministic document id — one getDoc, no query', async () => {
    docGet.mockResolvedValue(aliasDoc());
    await aliasRouter(reqFor('qr', 'AB3X4Y'), fakeRes() as never);
    // case-insensitiv normalisiert: ein abgetippter Code ueberlebt Grossschreibung
    expect(docFn).toHaveBeenCalledWith('scs__qr__ab3x4y');
  });

  it('404s an unknown host', async () => {
    const res = fakeRes();
    await aliasRouter(reqFor('qr', 'Ab3x4y', 'evil.example'), res as never);
    expect(res.statusCode).toBe(404);
    expect(docGet).not.toHaveBeenCalled();
  });

  it('404s a missing document', async () => {
    docGet.mockResolvedValue({ exists: false });
    const res = fakeRes();
    await aliasRouter(reqFor(), res as never);
    expect(res.statusCode).toBe(404);
  });

  it('404s a pure identifier — targetType none is not resolvable over HTTP', async () => {
    docGet.mockResolvedValue(aliasDoc({ targetType: 'none', targetUrl: '' }));
    const res = fakeRes();
    await aliasRouter(reqFor(), res as never);
    expect(res.statusCode).toBe(404);
  });

  // Der TP1-Review-Befund am Lese-Ende: createAlias praegt so etwas gar nicht mehr, aber ein
  // von Hand angelegter oder alter Alias kann es tragen. 404 statt eines 302 auf eine
  // falsche Seite.
  it('404s a model target with no detail route instead of redirecting somewhere wrong', async () => {
    docGet.mockResolvedValue(aliasDoc({ targetType: 'model', targetUrl: '', targetKey: 'calevent.abc' }));
    const res = fakeRes();
    await aliasRouter(reqFor(), res as never);
    expect(res.statusCode).toBe(404);
    expect(res.redirectedTo).toBe('');
  });

  it('redirects a person target to its detail route', async () => {
    docGet.mockResolvedValue(aliasDoc({ targetType: 'model', targetUrl: '', targetKey: 'person.abc' }));
    const res = fakeRes();
    await aliasRouter(reqFor(), res as never);
    expect(res.statusCode).toBe(302);
    expect(res.redirectedTo).toBe('https://app.seeclub.org/person/abc');
  });

  it.each([
    ['revoked', { isEnabled: false }],
    ['archived', { isArchived: true }],
    ['expired', { validUntil: '20200101' }],
    ['not yet valid', { validFrom: '29991231' }],
    ['exhausted', { maxUses: 3, useCount: 3 }],
  ])('410s a %s alias — it existed, it just does not any more', async (_label, over) => {
    docGet.mockResolvedValue(aliasDoc(over));
    const res = fakeRes();
    await aliasRouter(reqFor(), res as never);
    expect(res.statusCode).toBe(410);
    expect(docUpdate).not.toHaveBeenCalled();
  });

  it('429s past the rate limit without reading the document', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: false, remaining: 0, retryAfterMs: 1000 });
    const res = fakeRes();
    await aliasRouter(reqFor(), res as never);
    expect(res.statusCode).toBe(429);
    expect(docGet).not.toHaveBeenCalled();
  });

  it('answers with HTML, not JSON — the client is a browser that scanned a code', async () => {
    docGet.mockResolvedValue({ exists: false });
    const res = fakeRes();
    await aliasRouter(reqFor(), res as never);
    expect(res.headers['Content-Type']).toContain('text/html');
    expect(res.body).toContain('<!doctype html>');
  });
});
