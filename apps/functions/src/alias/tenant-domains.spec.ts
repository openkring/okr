import { beforeEach, describe, expect, it, vi } from 'vitest';

const getMock = vi.fn();
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: () => ({ collection: () => ({ get: getMock }) }),
}));

import { appBaseUrl, resetDomainMapCache, shortUrl, tenantByHost } from './tenant-domains';

const snapshot = (rows: [string, string][]) => ({
  docs: rows.map(([id, appDomain]) => ({ id, data: () => ({ appDomain }) })),
});

describe('tenantByHost', () => {
  beforeEach(() => {
    resetDomainMapCache();
    getMock.mockReset();
    getMock.mockResolvedValue(snapshot([['scs', 'seeclub.org'], ['p13', 'p13.ch']]));
  });

  it('maps the app host, the apex and www to the same tenant', async () => {
    expect(await tenantByHost('app.seeclub.org')).toBe('scs');
    expect(await tenantByHost('seeclub.org')).toBe('scs');
    expect(await tenantByHost('www.seeclub.org')).toBe('scs');
  });

  it('keeps tenants apart', async () => {
    expect(await tenantByHost('app.p13.ch')).toBe('p13');
  });

  it('ignores case and a port', async () => {
    expect(await tenantByHost('APP.Seeclub.ORG:443')).toBe('scs');
  });

  it('returns undefined for an unknown host — the resolver turns that into a 404', async () => {
    expect(await tenantByHost('evil.example')).toBeUndefined();
  });

  it('skips a tenant whose app-config carries no appDomain', async () => {
    resetDomainMapCache();
    getMock.mockResolvedValue(snapshot([['scs', 'seeclub.org'], ['ghost', '']]));
    expect(await tenantByHost('app.seeclub.org')).toBe('scs');
    expect(await tenantByHost('')).toBeUndefined();
  });

  // Vor jedem Redirect zaehlt ein Roundtrip — die Karte wird einmal pro Instanz gelesen.
  it('reads app-config once and serves every later lookup from memory', async () => {
    await tenantByHost('app.seeclub.org');
    await tenantByHost('app.p13.ch');
    await appBaseUrl('scs');
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});

describe('appBaseUrl', () => {
  beforeEach(() => {
    resetDomainMapCache();
    getMock.mockReset();
    getMock.mockResolvedValue(snapshot([['scs', 'seeclub.org']]));
  });

  it('is the app origin without a trailing slash', async () => {
    expect(await appBaseUrl('scs')).toBe('https://app.seeclub.org');
  });

  it('throws for a tenant that has no appDomain rather than building a broken url', async () => {
    await expect(appBaseUrl('nope')).rejects.toThrow(/appDomain/);
  });
});

describe('shortUrl', () => {
  // Die KURZ-URL, nicht die Ziel-URL. Die beiden zu verwechseln ergibt einen Alias,
  // der auf sich selbst zeigt.
  it('is /s/<space>/<alias> on the tenant app origin', () => {
    expect(shortUrl('https://app.seeclub.org', 'qr', 'Ab3x4y'))
      .toBe('https://app.seeclub.org/s/qr/Ab3x4y');
  });
});
