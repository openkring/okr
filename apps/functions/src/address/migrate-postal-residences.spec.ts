import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';

import { AddressModel } from '@okr/shared-models';
import { resetSwisstopoState } from '@okr/shared-util-functions';

import {
  ConflictPair, migrationTaskId, MigrationRow, repairFavorites, resolveConflicts, runPostalResidenceMigration, summaryTasks,
} from './migrate-postal-residences';

function postal(okey: string, patch: Partial<AddressModel> = {}, updateTime = '2026-01-01T00:00:00.000Z'): MigrationRow {
  const row = new AddressModel('scs');
  row.okey = okey;
  row.addressChannel = 'postal';
  row.addressUsage = 'home';
  row.parentKey = 'person.p1';
  return { okey, row: Object.assign(row, patch), updateTime };
}

const at = (n: number): string => `2026-01-0${n}T00:00:00.000Z`;

describe('resolveConflicts', () => {
  it('home vs work of one parent: no conflict', () => {
    const home = postal('home');
    const work = postal('work', { addressUsage: 'work' });
    const loc = { home: 'L1', work: 'L2' } as Record<string, string>;
    const { winners, losers } = resolveConflicts([home, work], (k) => loc[k]);
    expect(winners.map((w) => w.okey).sort()).toEqual(['home', 'work']);
    expect(losers).toEqual([]);
  });

  it('two home rows at two locations: the newer wins, the older loses', () => {
    const older = postal('older', {}, at(1));
    const newer = postal('newer', {}, at(2));
    const loc = { older: 'L1', newer: 'L2' } as Record<string, string>;
    const { winners, losers } = resolveConflicts([newer, older], (k) => loc[k]);
    expect(winners.map((w) => w.okey)).toEqual(['newer']);
    expect(losers.map((p) => [p.loser.okey, p.winner.okey])).toEqual([['older', 'newer']]);
  });

  it('the same location in scs and kring: one winner, the duplicate loses', () => {
    const scs = postal('scs', { tenants: ['scs'] }, at(3));
    const kring = postal('kring', { tenants: ['kring'] }, at(1));
    const { winners, losers } = resolveConflicts([kring, scs], () => 'L1');
    expect(winners.map((w) => w.okey)).toEqual(['scs']);
    expect(losers.map((p) => p.loser.okey)).toEqual(['kring']);
  });

  it('an unlinked (ambiguous) row is neither winner nor loser', () => {
    const linked = postal('linked', {}, at(1));
    const ambiguous = postal('ambiguous', {}, at(5));
    const { winners, losers } = resolveConflicts([linked, ambiguous], (k) => (k === 'linked' ? 'L1' : undefined));
    expect(winners.map((w) => w.okey)).toEqual(['linked']);
    expect(losers).toEqual([]);
  });

  it('different parents never conflict', () => {
    const a = postal('a');
    const b = postal('b', { parentKey: 'person.p2' });
    expect(resolveConflicts([a, b], () => 'L1').losers).toEqual([]);
  });
});

describe('summaryTasks', () => {
  it('three losers in scs, one in kring: two entries', () => {
    const winner = postal('w', { streetName: 'Neuweg', streetNumber: '1', zipCode: '8000', city: 'Zürich' });
    const lose = (okey: string, tenant: string, street: string): ConflictPair => ({
      loser: postal(okey, { tenants: [tenant], streetName: street, streetNumber: '2', zipCode: '8712', city: 'Stäfa', parentKey: `person.${okey}` }),
      winner,
    });
    const losers = [lose('a', 'scs', 'Altweg'), lose('b', 'scs', 'Bachweg'), lose('c', 'scs', 'Dorfweg'), lose('d', 'kring', 'Altweg')];
    const result = summaryTasks(losers, (r) => r.row.tenants, (r) => r.row.parentKey.substring(7).toUpperCase());
    expect([...result.keys()]).toEqual(['kring', 'scs']);
    expect(result.get('scs')).toHaveLength(3);
    expect(result.get('kring')).toEqual(['D: Altweg 2, 8712 Stäfa → Neuweg 1, 8000 Zürich']);
  });
});

describe('repairFavorites', () => {
  it('a winner whose loser was the favorite takes it over; the loser loses it', () => {
    const loser = postal('loser', { isFavorite: true }, at(1));
    const winner = postal('winner', {}, at(2));
    const changes = repairFavorites([loser, winner], [{ loser, winner }]);
    expect(Object.fromEntries(changes)).toEqual({ winner: true, loser: false });
  });

  it('at most one favorite per parent: the newest stays', () => {
    const home = postal('home', { isFavorite: true }, at(1));
    const work = postal('work', { isFavorite: true, addressUsage: 'work' }, at(2));
    expect(Object.fromEntries(repairFavorites([home, work], []))).toEqual({ home: false });
  });

  it('nothing to repair: no changes', () => {
    expect(repairFavorites([postal('a', { isFavorite: true }), postal('b', { addressUsage: 'work' })], []).size).toBe(0);
  });
});

describe('migrationTaskId', () => {
  it('is deterministic per tenant and admin', () => {
    expect(migrationTaskId('scs', 'p1')).toBe(migrationTaskId('scs', 'p1'));
    expect(migrationTaskId('scs', 'p1')).not.toBe(migrationTaskId('kring', 'p1'));
    expect(migrationTaskId('scs', 'p1')).toMatch(/^umzug-migration-[0-9a-f]{32}$/);
  });
});

// ─── runPostalResidenceMigration against an in-memory fake ─────────────────────────────────

interface StoredDoc { data: Record<string, unknown>; updateTime: string }
type Filter = [string, string, unknown];

function getPath(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((v, k) => (v as Record<string, unknown> | undefined)?.[k], data);
}

function matches(data: Record<string, unknown>, [field, op, value]: Filter): boolean {
  const v = getPath(data, field);
  if (op === '==') return v === value;
  if (op === 'array-contains') return Array.isArray(v) && v.some((x) => JSON.stringify(x) === JSON.stringify(value));
  throw new Error(`fake: op ${op}`);
}

/** A tiny Firestore fake: every write is recorded in `writes`; `readOnly` makes every write throw. */
function fakeDb(seed: Record<string, Record<string, Record<string, unknown>>>, times: Record<string, string> = {}) {
  const store = new Map<string, Map<string, StoredDoc>>();
  for (const [col, docs] of Object.entries(seed)) {
    store.set(col, new Map(Object.entries(docs).map(([id, data]) => [id, { data: { ...data }, updateTime: times[id] ?? at(1) }])));
  }
  const writes: string[] = [];
  const state = { readOnly: false, nextId: 0 };
  const colOf = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name) as Map<string, StoredDoc>;
  };
  const write = (what: string, fn: () => void) => {
    if (state.readOnly) throw new Error(`write in read-only mode: ${what}`);
    writes.push(what);
    fn();
  };
  const snapOf = (col: string, id: string, d: StoredDoc | undefined) => ({
    id, exists: !!d, data: () => (d ? { ...d.data } : undefined), updateTime: d ? { toDate: () => new Date(d.updateTime) } : undefined, ref: docRef(col, id),
  });
  const docRef = (col: string, id: string) => ({
    id, col,
    get: async () => snapOf(col, id, colOf(col).get(id)),
    set: async (data: Record<string, unknown>) => write(`set ${col}/${id}`, () => colOf(col).set(id, { data: { ...data }, updateTime: at(9) })),
    create: async (data: Record<string, unknown>) => {
      if (colOf(col).has(id)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
      write(`create ${col}/${id}`, () => colOf(col).set(id, { data: { ...data }, updateTime: at(9) }));
    },
  });
  const query = (col: string, filters: Filter[]) => ({
    where: (f: string, op: string, v: unknown) => query(col, [...filters, [f, op, v]]),
    get: async () => {
      const docs = [...colOf(col).entries()].filter(([, d]) => filters.every((f) => matches(d.data, f))).map(([id, d]) => snapOf(col, id, d));
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  const db = {
    collection: (col: string) => ({
      ...query(col, []),
      doc: (id?: string) => docRef(col, id ?? `new${++state.nextId}`),
    }),
    batch: () => {
      const ops: (() => void)[] = [];
      return {
        update: (ref: { col: string; id: string }, patch: Record<string, unknown>) => {
          ops.push(() => write(`update ${ref.col}/${ref.id}`, () => {
            const d = colOf(ref.col).get(ref.id) as StoredDoc;
            d.data = { ...d.data, ...patch };
            d.updateTime = at(9);
          }));
        },
        commit: async () => { ops.forEach((op) => op()); },
      };
    },
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn({
      get: (q: { get: () => Promise<unknown> }) => q.get(),
      set: (ref: { col: string; id: string }, data: Record<string, unknown>) => write(`set ${ref.col}/${ref.id}`, () => colOf(ref.col).set(ref.id, { data: { ...data }, updateTime: at(9) })),
    }),
  };
  return { db: db as unknown as Firestore, store, writes, state };
}

/** swisstopo answers: exact hits by street, an ambiguous answer for «Hauptstrasse». */
const EGAID: Record<string, string> = { 'seestrasse 12': '101', 'bergweg 3': '202' };
const fakeFetch = (async (url: string) => {
  const q = decodeURIComponent(url.split('searchText=')[1]);
  const result = (label: string, egaid: string) => ({ attrs: { featureId: egaid, label, lat: 47.2, lon: 8.7, links: [{ href: `https://x/ch.swisstopo.amtliches-gebaeudeadressverzeichnis/${egaid}` }] } });
  let results: unknown[] = [];
  if (q.startsWith('hauptstrasse')) results = [result('Hauptstrasse 1a 8712 Stäfa', '301'), result('Hauptstrasse 1b 8712 Stäfa', '302')];
  for (const [street, egaid] of Object.entries(EGAID)) {
    if (q.startsWith(street)) results = [result(`${street.replace(/^./, (c) => c.toUpperCase())} 8712 Stäfa`, egaid)];
  }
  return { ok: true, status: 200, json: async () => ({ results }) };
}) as unknown as typeof fetch;

function addr(patch: Partial<AddressModel>): Record<string, unknown> {
  return { addressChannel: 'postal', addressUsage: 'home', streetNumber: '', zipCode: '8712', city: 'Stäfa', countryCode: 'CH', tenants: ['scs'], isArchived: false, isFavorite: false, notes: '', ...patch };
}

function seed() {
  return {
    persons: {
      p1: { firstName: 'Anna', lastName: 'Muster', tenants: ['scs', 'kring'] },
      p2: { firstName: 'Beat', lastName: 'Beispiel', tenants: ['scs'] },
      p3: { firstName: 'Cora', lastName: 'Fremd', tenants: ['kring'] },
      admin: { firstName: 'Ada', lastName: 'Admin', tenants: ['scs', 'kring'] },
    },
    users: {
      u1: { personKey: 'admin', tenants: ['scs', 'kring'], roles: { memberAdmin: true } },
    },
    addresses: {
      // p1: same address in scs (newer, not favorite) and kring (older, favorite) → one winner, kring archived
      a1: addr({ parentKey: 'person.p1', streetName: 'seestrasse', streetNumber: '12', tenants: ['scs'] }),
      a2: addr({ parentKey: 'person.p1', streetName: 'Seestrasse', streetNumber: '12', tenants: ['kring'], isFavorite: true, notes: 'alt' }),
      // p2: two home rows at two locations → the newer wins; plus an ambiguous one that takes no part
      b1: addr({ parentKey: 'person.p2', streetName: 'Seestrasse', streetNumber: '12' }),
      b2: addr({ parentKey: 'person.p2', streetName: 'Bergweg', streetNumber: '3' }),
      b3: addr({ parentKey: 'person.p2', streetName: 'Hauptstrasse', streetNumber: '1', addressUsage: 'work' }),
      // p3: the row shares no tenant with its parent → untouched, listed
      c1: addr({ parentKey: 'person.p3', streetName: 'Bergweg', streetNumber: '3', tenants: ['scs'] }),
      // abroad → manual location
      d1: addr({ parentKey: 'person.p2', streetName: 'Hauptstraße', streetNumber: '5', zipCode: '10115', city: 'Berlin', countryCode: 'DE', addressUsage: 'other' }),
      // archived history stays untouched
      e1: addr({ parentKey: 'person.p1', streetName: 'Altweg', streetNumber: '1', isArchived: true }),
    },
  };
}

const TIMES = { a1: at(3), a2: at(1), b1: at(1), b2: at(4), b3: at(2) };

describe('runPostalResidenceMigration', () => {
  let reportDir: string;
  beforeEach(() => {
    resetSwisstopoState();
    reportDir = mkdtempSync(join(tmpdir(), 'migrate-postal-'));
  });

  it('dry run writes nothing, not even a register location, and reports what it would do', async () => {
    const { db, writes, state } = fakeDb(seed(), TIMES);
    state.readOnly = true;
    const reportPath = join(reportDir, 'dry.json');
    const report = await runPostalResidenceMigration(db, { write: false, reportPath, fetchFn: fakeFetch, log: () => undefined });
    expect(writes).toEqual([]);
    expect(report.counts['register locations to create']).toBe(2);   // EGAID 101 + 202, each planned once
    expect(report.counts['manual locations to create']).toBe(1);
    expect(report.counts['summary tasks to create']).toBe(2);         // kring (a2) + scs (b1), one admin each
    expect(JSON.parse(readFileSync(reportPath, 'utf8')).mode).toBe('dry-run');
  });

  it('write: links, archives the losers with a note, widens the winners, repairs the favorite, writes the tasks', async () => {
    const { db, store } = fakeDb(seed(), TIMES);
    const report = await runPostalResidenceMigration(db, { write: true, reportPath: join(reportDir, 'w.json'), fetchFn: fakeFetch, log: () => undefined });
    const a = (id: string) => store.get('addresses')?.get(id)?.data as Record<string, unknown>;

    // p1: a1 wins (newer), is widened to the parent's tenants and takes over the favorite from a2
    expect(a('a1')['locationKey']).toBeTruthy();
    expect(a('a1')['tenants']).toEqual(['scs', 'kring']);
    expect(a('a1')['isFavorite']).toBe(true);
    expect(a('a1')['streetName']).toBe('Seestrasse');
    expect(a('a1')['validFrom']).toBe('');
    expect(a('a2')['isArchived']).toBe(true);
    expect(a('a2')['isFavorite']).toBe(false);
    expect(a('a2')['notes']).toBe('alt\nMigration 1.164: ersetzt durch Seestrasse 12, 8712 Stäfa');
    expect(a('a2')['locationKey']).toBe(a('a1')['locationKey']);

    // p2: b2 (newer) wins over b1; the ambiguous work row stays unlinked and active
    expect(a('b2')['isArchived']).toBe(false);
    expect(a('b1')['isArchived']).toBe(true);
    expect(a('b1')['notes']).toBe('Migration 1.164: ersetzt durch Bergweg 3, 8712 Stäfa');
    expect(a('b3')['locationKey'] ?? '').toBe('');
    expect(report.ambiguous.map((r) => r.okey)).toEqual(['b3']);

    // p3: foreign tenants, untouched and listed
    expect(a('c1')['locationKey'] ?? '').toBe('');
    expect(a('c1')['tenants']).toEqual(['scs']);
    expect(report.foreignTenants.map((r) => r.okey)).toEqual(['c1']);

    // abroad: a manual location; archived history untouched
    expect(a('d1')['locationKey']).toBeTruthy();
    expect(a('e1')['locationKey'] ?? '').toBe('');

    // one register location per EGAID + one manual
    const locations = [...(store.get('locations')?.values() ?? [])];
    expect(locations).toHaveLength(3);

    // one summary task per losing tenant per memberAdmin
    const tasks = store.get('tasks');
    expect(tasks?.get(migrationTaskId('kring', 'admin'))?.data['notes']).toBe('Anna Muster: Seestrasse 12, 8712 Stäfa → Seestrasse 12, 8712 Stäfa');
    expect(tasks?.get(migrationTaskId('scs', 'admin'))?.data['name']).toBe('Adressen ersetzt (Migration)');
    expect(tasks?.get(migrationTaskId('scs', 'admin'))?.data['tags']).toBe('umzug');
  });

  it('a second run is idempotent: nothing is geocoded, written or duplicated', async () => {
    const { db, writes } = fakeDb(seed(), TIMES);
    const opts = { write: true, fetchFn: fakeFetch, log: () => undefined };
    await runPostalResidenceMigration(db, { ...opts, reportPath: join(reportDir, '1.json') });
    const firstRun = writes.length;
    let fetched = 0;
    const countingFetch = (async (url: string) => { fetched++; return fakeFetch(url); }) as unknown as typeof fetch;
    resetSwisstopoState();
    const report = await runPostalResidenceMigration(db, { ...opts, fetchFn: countingFetch, reportPath: join(reportDir, '2.json') });
    expect(writes.length).toBe(firstRun);
    expect(report.conflicts).toEqual([]);
    expect(report.counts['already linked (skipped)']).toBe(3);   // a1, b2, d1
    expect(fetched).toBe(1);                                     // only the ambiguous b3 is asked again
  });
});
