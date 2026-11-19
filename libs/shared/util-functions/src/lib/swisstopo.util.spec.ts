import { beforeEach, describe, expect, it, vi } from 'vitest';
import { geocodeSnapshot, normaliseQuery, parseSearchResponse, resetSwisstopoState, searchSwissAddresses } from './swisstopo.util';

// Recorded 2026-11-19 from api3.geo.admin.ch SearchServer for "seestrasse 12 stäfa" (first 3 of 10 results).
const FIXTURE = {
  results: [
    {
      attrs: {
        detail: 'seestrasse 12 8712 staefa 158 staefa ch zh',
        featureId: '210198894_0',
        geom_quadindex: '030030033320122023221',
        geom_st_box2d: 'BOX(8.7156 47.239645,8.7156 47.239645)',
        label: 'Seestrasse 12 <b>8712 Stäfa</b>',
        lat: 47.23964309692383,
        links: [
          { href: '/rest/services/ech/MapServer/ch.swisstopo.amtliches-gebaeudeadressverzeichnis/101880576', rel: 'related', title: 'ch.swisstopo.amtliches-gebaeudeadressverzeichnis' },
          { href: '/rest/services/ech/MapServer/ch.bfs.gebaeude_wohnungs_register/210198894_0', rel: 'related', title: 'ch.bfs.gebaeude_wohnungs_register' },
        ],
        lon: 8.715611457824707,
        num: 12,
        objectclass: '',
        origin: 'address',
        rank: 7,
        x: 8.715611457824707,
        y: 47.23964309692383,
        zoomlevel: 10,
      },
      id: 2685398,
      weight: 7,
    },
    {
      attrs: {
        detail: 'seestrasse 120 8712 staefa 158 staefa ch zh',
        featureId: '201025958_0',
        label: 'Seestrasse 120 <b>8712 Stäfa</b>',
        lat: 47.236907958984375,
        links: [{ href: '/rest/services/ech/MapServer/ch.swisstopo.amtliches-gebaeudeadressverzeichnis/101551003', rel: 'related', title: 'ch.swisstopo.amtliches-gebaeudeadressverzeichnis' }],
        lon: 8.728658676147461,
        num: 120,
        origin: 'address',
      },
      id: 2654214,
      weight: 2,
    },
    {
      attrs: {
        detail: 'seestrasse 122 8712 staefa 158 staefa ch zh',
        featureId: '78464_0',
        label: 'Seestrasse 122 <b>8712 Stäfa</b>',
        lat: 47.2364616394043,
        links: [{ href: '/rest/services/ech/MapServer/ch.swisstopo.amtliches-gebaeudeadressverzeichnis/100071958', rel: 'related', title: 'ch.swisstopo.amtliches-gebaeudeadressverzeichnis' }],
        lon: 8.728910446166992,
        num: 122,
        origin: 'address',
      },
      id: 1954274,
      weight: 2,
    },
  ],
};

function okFetch(body: unknown): typeof fetch {
  return vi.fn(async () => ({ ok: true, status: 200, json: async () => body }) as Response) as unknown as typeof fetch;
}

describe('swisstopo util', () => {
  beforeEach(() => {
    resetSwisstopoState();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('normaliseQuery trims, collapses whitespace and lowercases', () => {
    expect(normaliseQuery(' Bahnhofstr  3  STÄFA ')).toBe('bahnhofstr 3 stäfa');
  });

  it('parses the recorded response', () => {
    const hits = parseSearchResponse(FIXTURE);
    expect(hits).toHaveLength(3);
    expect(hits[0]).toEqual({
      egaid: '101880576',
      streetName: 'Seestrasse',
      streetNumber: '12',
      zipCode: '8712',
      city: 'Stäfa',
      latitude: 47.23964309692383,
      longitude: 8.715611457824707,
      label: 'Seestrasse 12 8712 Stäfa',
    });
  });

  it('drops a hit that has a featureId but no EGAID link', () => {
    const attrs = { featureId: '1_0', label: 'X 1 8000 Zürich', lat: 1, lon: 2, links: [{ href: '/rest/services/ech/MapServer/ch.bfs.gebaeude_wohnungs_register/1_0' }] };
    expect(parseSearchResponse({ results: [{ attrs }] })).toEqual([]);
  });

  it('drops hits without featureId and tolerates garbage', () => {
    expect(parseSearchResponse({ results: [{ attrs: { label: 'X 1 8000 Zürich', lat: 1, lon: 2 } }] })).toEqual([]);
    expect(parseSearchResponse(null)).toEqual([]);
    expect(parseSearchResponse({})).toEqual([]);
  });

  it('returns [] on 429 and on non-2xx', async () => {
    const f429 = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    expect(await searchSwissAddresses('a 1 x', f429)).toEqual([]);
    const f500 = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as Response) as unknown as typeof fetch;
    expect(await searchSwissAddresses('b 1 x', f500)).toEqual([]);
  });

  it('returns [] when fetch throws', async () => {
    const boom = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await searchSwissAddresses('c 1 x', boom)).toEqual([]);
  });

  it('does not cache failures', async () => {
    const boom = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await searchSwissAddresses('d 1 x', boom);
    const f = okFetch(FIXTURE);
    expect(await searchSwissAddresses('d 1 x', f)).toHaveLength(3);
  });

  it('gives up on a hanging request after 5 s: aborts it, returns [] and does not cache', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      const hanging = vi.fn((_url: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => undefined); // never settles, ignores the signal
      }) as unknown as typeof fetch;
      const pending = searchSwissAddresses('seestrasse 12 stäfa', hanging);
      await vi.advanceTimersByTimeAsync(4999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await pending).toEqual([]);
      expect(signal?.aborted).toBe(true);
      const ok = okFetch(FIXTURE);
      await vi.advanceTimersByTimeAsync(200);
      expect(await searchSwissAddresses('seestrasse 12 stäfa', ok)).toHaveLength(3);
      expect(ok).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('serves a second identical (normalised) query from the cache', async () => {
    const f = okFetch(FIXTURE);
    await searchSwissAddresses('seestrasse 12 stäfa', f);
    await searchSwissAddresses('  Seestrasse   12 STÄFA ', f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('spaces consecutive real fetches by at least 200 ms', async () => {
    const times: number[] = [];
    const f = vi.fn(async () => {
      times.push(Date.now());
      return { ok: true, status: 200, json: async () => ({ results: [] }) } as Response;
    }) as unknown as typeof fetch;
    await Promise.all([searchSwissAddresses('e 1 x', f), searchSwissAddresses('e 2 x', f)]);
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(190);
  });

  describe('geocodeSnapshot', () => {
    it('is exact for a matching snapshot (case/diacritics-insensitive)', async () => {
      const out = await geocodeSnapshot({ streetName: 'SEESTRASSE', streetNumber: '12', zipCode: '8712', city: 'Staefa' }, okFetch(FIXTURE));
      expect(out.kind).toBe('exact');
      if (out.kind === 'exact') expect(out.hit.egaid).toBe('101880576');
    });

    it('is ambiguous when no hit matches the number', async () => {
      const out = await geocodeSnapshot({ streetName: 'Seestrasse', streetNumber: '99', zipCode: '8712', city: 'Stäfa' }, okFetch(FIXTURE));
      expect(out.kind).toBe('ambiguous');
      if (out.kind === 'ambiguous') expect(out.hits).toHaveLength(3);
    });

    it('is none for an empty result', async () => {
      const out = await geocodeSnapshot({ streetName: 'Nirgends', streetNumber: '1', zipCode: '0000', city: 'X' }, okFetch({ results: [] }));
      expect(out).toEqual({ kind: 'none' });
    });
  });
});
