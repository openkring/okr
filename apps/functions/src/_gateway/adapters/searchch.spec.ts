// apps/functions/src/_gateway/adapters/searchch.spec.ts
import { describe, it, expect } from 'vitest';
import { searchChQueryName, mapSearchCh, searchChAdapter } from './searchch';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:tel="http://tel.search.ch/api/spec/result/1.0/">
  <updated>2026-08-01T09:15:00+02:00</updated>
  <entry>
    <updated>2026-07-30T00:00:00+02:00</updated>
    <tel:firstname>Hans</tel:firstname>
    <tel:name>Muster</tel:name>
    <tel:street>Seestrasse</tel:street>
    <tel:streetno>12</tel:streetno>
    <tel:zip>8712</tel:zip>
    <tel:city>Stäfa</tel:city>
    <tel:phone>+41446543210</tel:phone>
  </entry>
</feed>`;

describe('searchChQueryName', () => {
  it('joins first and last name', () => {
    expect(searchChQueryName({ firstName: 'Hans', lastName: 'Muster' })).toBe('Hans Muster');
  });
  it('tolerates a missing part without leaving stray whitespace', () => {
    expect(searchChQueryName({ lastName: 'Muster' })).toBe('Muster');
    expect(searchChQueryName({ firstName: ' Hans ' })).toBe('Hans');
  });
  it('is empty when nothing was given — fetch turns this into invalid-argument', () => {
    expect(searchChQueryName({})).toBe('');
    expect(searchChQueryName({ firstName: '  ', lastName: '' })).toBe('');
  });
});

describe('mapSearchCh', () => {
  it('maps the tel feed to directory results', () => {
    expect(mapSearchCh(FEED)).toEqual({
      results: [
        {
          firstName: 'Hans',
          lastName: 'Muster',
          streetName: 'Seestrasse',
          streetNumber: '12',
          zipCode: '8712',
          city: 'Stäfa',
          countryCode: 'CH',
          phone: '+41446543210',
          email: '',
          web: '',
          occupation: '',
        },
      ],
    });
  });
  it('returns empty results for a feed with no entries', () => {
    expect(mapSearchCh('<feed></feed>')).toEqual({ results: [] });
  });
});

describe('searchChAdapter.sourceTimestamp', () => {
  it('reads the FEED-level updated, not the first entry it finds', () => {
    expect(searchChAdapter.sourceTimestamp(FEED)).toBe('2026-08-01T09:15:00+02:00');
  });
  it('is null when the feed carries no updated element', () => {
    expect(searchChAdapter.sourceTimestamp('<feed><entry><name>X</name></entry></feed>')).toBeNull();
  });
});

describe('searchChAdapter declaration', () => {
  // These three are the isolation contract; a silent flip would cross tenants.
  it('is tenant-scoped, authenticated, and declares no deploy-time secret', () => {
    expect(searchChAdapter.scope).toBe('tenant');
    expect(searchChAdapter.requiresAuth).toBe(true);
    expect(searchChAdapter.secrets).toEqual([]);
  });
  it('keeps the PII cache short-lived (1h) and sets no cross-tenant monthly cap', () => {
    expect(searchChAdapter.ttlSeconds).toBe(3600);
    expect(searchChAdapter.monthlyCap).toBeUndefined();
  });
});
