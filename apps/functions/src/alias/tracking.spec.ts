import { describe, expect, it, vi } from 'vitest';

import type { AliasModel, AliasSpaceModel } from '@okr/shared-models';

import { deviceClass, hashIp, recordUse, referrerHost, sanitizeKey, statsDate } from './tracking';

const NOW = Date.UTC(2026, 7, 22, 10, 26, 31);   // 2026-08-22T10:26:31Z

const alias = (over: Partial<AliasModel> = {}): AliasModel => ({
  okey: '', tenants: ['scs'], isArchived: false, tags: '', notes: '',
  space: 'qr', alias: 'Ab3x4y', targetType: 'url', targetUrl: 'https://seeclub.org',
  targetKey: '', original: '', isEnabled: true, validFrom: '', validUntil: '',
  maxUses: 0, useCount: 0, lastUsedAt: '', trackingLevel: 'inherit', retentionDays: 0,
  createdBy: '', createdAt: '', ...over,
} as AliasModel);

const space = (over: Partial<AliasSpaceModel> = {}): AliasSpaceModel => ({
  okey: 's1', tenants: ['scs'], isArchived: false, notes: '',
  name: 'qr', label: '', kind: 'redirect', length: 6, charset: 'base32-safe',
  allowCustom: false, caseSensitive: false, targetTypes: ['url'],
  defaultValidDays: 0, defaultMaxUses: 0, trackingLevel: 'counter', retentionDays: 365,
  roleNeeded: 'privileged', isEnabled: true, ...over,
} as AliasSpaceModel);

const ctx = (over = {}) => ({
  ip: '203.0.113.7', userAgent: 'Mozilla/5.0 (iPhone)', referrer: 'https://news.example/a?q=x',
  country: 'CH', uid: '', nowMs: NOW, ...over,
});

function fakeDb() {
  const update = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn().mockResolvedValue(undefined);
  const add = vi.fn().mockResolvedValue(undefined);
  const db = {
    collection: vi.fn((name: string) => ({
      doc: () => ({ update, set }),
      add,
      __name: name,
    })),
  };
  return { db: db as never, update, set, add, collection: db.collection };
}

describe('referrerHost', () => {
  // Eine volle Referrer-URL kann Suchbegriffe oder Token tragen — der Host reicht fuer die
  // Frage "woher kamen die Klicks", alles Weitere waere Vorratsdatenhaltung ohne Zweck.
  it('reduces a referrer to its host and drops the query', () => {
    expect(referrerHost('https://news.example/artikel?q=geheim')).toBe('news.example');
  });

  it('calls an empty referrer "direct" and an unparseable one "unknown"', () => {
    expect(referrerHost('')).toBe('direct');
    expect(referrerHost('not a url')).toBe('unknown');
  });
});

describe('deviceClass', () => {
  it('splits into exactly two classes — anything finer is a fingerprint', () => {
    expect(deviceClass('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('mobile');
    expect(deviceClass('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('desktop');
  });
});

describe('hashIp', () => {
  it('is stable within a day and CHANGES the next day — that bounds the linkage', () => {
    const a = hashIp('203.0.113.7', NOW, 'secret');
    const b = hashIp('203.0.113.7', NOW + 60_000, 'secret');
    const nextDay = hashIp('203.0.113.7', NOW + 24 * 3600_000, 'secret');
    expect(a).toBe(b);
    expect(a).not.toBe(nextDay);
  });

  it('depends on the secret, so a public hash cannot be reversed by brute force', () => {
    expect(hashIp('203.0.113.7', NOW, 'a')).not.toBe(hashIp('203.0.113.7', NOW, 'b'));
  });

  it('returns empty for a missing ip rather than hashing the empty string', () => {
    expect(hashIp('', NOW, 'secret')).toBe('');
  });
});

describe('statsDate / sanitizeKey', () => {
  it('is the UTC calendar day', () => {
    expect(statsDate(NOW)).toBe('2026-08-22');
  });

  // Ein Punkt im Map-Schluessel wuerde beim Lesen als Feldpfad missverstanden.
  it('strips characters that would break a firestore field path', () => {
    expect(sanitizeKey('news.example')).toBe('news_example');
    expect(sanitizeKey('')).toBe('unknown');
  });
});

describe('recordUse', () => {
  it('always counts the use, even when tracking is off — maxUses depends on it', async () => {
    const { db, update, set, add } = fakeDb();
    await recordUse(db, 'scs__qr__ab3x4y', alias(), space({ trackingLevel: 'off' }), ctx(), 'secret');
    expect(update).toHaveBeenCalledTimes(1);
    expect(set).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it('writes the daily aggregate at counter level, but no per-click row', async () => {
    const { db, set, add } = fakeDb();
    await recordUse(db, 'scs__qr__ab3x4y', alias(), space(), ctx(), 'secret');
    expect(set).toHaveBeenCalledTimes(1);
    expect(add).not.toHaveBeenCalled();
  });

  // Der eigentliche Datenschutz-Punkt von 'counter': das Aggregat enthaelt WEDER IP NOCH uid.
  it('puts no ip and no uid into the aggregate', async () => {
    const { db, set } = fakeDb();
    await recordUse(db, 'scs__qr__ab3x4y', alias(), space(), ctx({ uid: 'uidA' }), 'secret');
    const written = JSON.stringify(set.mock.calls[0][0]);
    expect(written).not.toContain('203.0.113.7');
    expect(written).not.toContain('uidA');
    expect(written).not.toContain('ipHash');
  });

  it('uses nested maps, not dotted keys — set() would take a dot as a literal field name', async () => {
    const { db, set } = fakeDb();
    await recordUse(db, 'scs__qr__ab3x4y', alias(), space(), ctx(), 'secret');
    const doc = set.mock.calls[0][0] as Record<string, unknown>;
    expect(doc['byReferrer']).toBeTypeOf('object');
    expect(Object.keys(doc)).not.toContain('byReferrer.news_example');
    expect(set.mock.calls[0][1]).toEqual({ merge: true });
  });

  it('writes a per-click row at detailed level', async () => {
    const { db, add } = fakeDb();
    await recordUse(db, 'scs__qr__ab3x4y', alias(), space({ trackingLevel: 'detailed' }), ctx({ uid: 'uidA' }), 'secret');
    expect(add).toHaveBeenCalledTimes(1);
    const event = add.mock.calls[0][0] as Record<string, unknown>;
    expect(event['uid']).toBe('uidA');
    expect(event['ipHash']).toHaveLength(32);
    expect(event['referrer']).toBe('news.example');   // nur der Host, nie die volle URL
    expect(event['expiresAt']).toBeDefined();
  });

  // Ohne Frist waere das eine unbefristete Sammlung von Personendaten. Das Formular verhindert
  // es bereits; hier ist der zweite Riegel fuer einen von Hand gesetzten Space.
  it('refuses to write a detailed event when retention is 0', async () => {
    const { db, add, set } = fakeDb();
    await recordUse(db, 'scs__qr__ab3x4y', alias(),
      space({ trackingLevel: 'detailed', retentionDays: 0 }), ctx(), 'secret');
    expect(add).not.toHaveBeenCalled();
    expect(set).toHaveBeenCalledTimes(1);   // das Aggregat laeuft weiter
  });

  it('lets the alias override the space level', async () => {
    const { db, set } = fakeDb();
    await recordUse(db, 'scs__qr__ab3x4y', alias({ trackingLevel: 'off' }), space(), ctx(), 'secret');
    expect(set).not.toHaveBeenCalled();
  });

  it('omits expiresAt on the aggregate when retention is 0 — 0 means never expire', async () => {
    const { db, set } = fakeDb();
    await recordUse(db, 'scs__qr__ab3x4y', alias(), space({ retentionDays: 0 }), ctx(), 'secret');
    expect(set.mock.calls[0][0]).not.toHaveProperty('expiresAt');
  });
});
