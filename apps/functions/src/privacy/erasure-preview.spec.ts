import type { DocumentSnapshot, Query, QueryDocumentSnapshot, Timestamp } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import {
  OUT_OF_REACH_PROCESSORS, buildPreview, firestoreDocFetcher, previewTokenOf,
} from './erasure-preview';
import type { SubjectCtx, SubjectDataEntry } from './types';

const ctx: SubjectCtx = { uid: 'u1', personKey: 'p1', parentKey: 'person.p1', tenantId: 'scs', email: 'a@b.ch' };

/** A map row stand-in. `find` is never called — `buildPreview` receives its docs from the
 * injected fetcher — but it has to exist for the type. */
function row(over: Partial<SubjectDataEntry>): SubjectDataEntry {
  return {
    collection: 'x',
    dataClass: 'content',
    tier: 'T4',
    onTenantExit: 'retain',
    onExport: 'none',
    onErasure: 'delete',
    tenantScope: 'tenantsArray',
    retention: { months: 12, legalBasis: 'test' },
    find: () => null as never,
    ...over,
  };
}

/** A DocumentSnapshot stand-in; `updateTime` drives the retention-end calculation. */
function doc(id: string, updateTimeIso?: string): DocumentSnapshot {
  return {
    id,
    updateTime: updateTimeIso ? ({ toDate: () => new Date(updateTimeIso) } as Timestamp) : undefined,
    get: () => undefined,
  } as unknown as DocumentSnapshot;
}

const some = (...ids: string[]) => async () => ids.map((id) => doc(id));
const none = async () => [];

describe('buildPreview', () => {
  it('reports an active membership as a blocker', async () => {
    const entries = [row({
      collection: 'memberships', onErasure: 'delete',
      blocksErasure: () => ({
        code: 'activeMembership', count: 1, detail: 'laufende Mitgliedschaft', blocksTiers: ['T1'],
      }),
    })];
    const p = await buildPreview(ctx, entries, some('m1'), 2);
    expect(p.blockers.map((b) => b.code)).toEqual(['activeMembership']);
  });

  it('partitions rows by onErasure and counts them', async () => {
    const entries = [
      row({ collection: 'users', tier: 'T1', onErasure: 'delete' }),
      row({
        collection: 'bookings', tier: 'T3', dataClass: 'financial', onErasure: 'anonymize',
        anonymizeFields: ['memberName'], retention: { months: 120, legalBasis: 'GebüV' },
      }),
      row({ collection: 'esignList', tier: 'T3', onErasure: 'retain', retention: { months: 120, legalBasis: 'OR Art. 958f' } }),
    ];
    const p = await buildPreview(ctx, entries, some('1', '2'), 2);
    expect(p.willDelete).toEqual([expect.objectContaining({ collection: 'users', count: 2 })]);
    expect(p.willAnonymize).toEqual([expect.objectContaining({ collection: 'bookings', count: 2, legalBasis: 'GebüV' })]);
    expect(p.willRetain).toEqual([expect.objectContaining({ collection: 'esignList', count: 2 })]);
  });

  it('omits empty collections from the report entirely', async () => {
    const p = await buildPreview(ctx, [row({ collection: 'users' })], none, 2);
    expect(p.willDelete).toEqual([]);
  });

  it('blocks when the caller is the last admin of the tenant', async () => {
    const p = await buildPreview(ctx, [], none, 0);
    expect(p.blockers.map((b) => b.code)).toContain('soleAdmin');
  });

  it('does not block on sole-admin when another admin remains', async () => {
    const p = await buildPreview(ctx, [], none, 1);
    expect(p.blockers.map((b) => b.code)).not.toContain('soleAdmin');
  });

  it('writes the sole-admin blocker in German and scopes it to the contract tier', async () => {
    const [blocker] = (await buildPreview(ctx, [], none, 0)).blockers;
    expect(blocker.detail.length).toBeGreaterThan(40);
    expect(blocker.detail).toMatch(/\b(du|dein\w*|dir|Du|Dein\w*)\b/);
    expect(blocker.detail.endsWith('.')).toBe(true);
    expect(blocker.blocksTiers).toEqual(['T1']);
  });

  it('collects a blocker from every row, not just the first', async () => {
    const entries = [
      row({ collection: 'memberships', blocksErasure: () => ({ code: 'activeMembership', count: 1, detail: 'a', blocksTiers: ['T1'] }) }),
      row({ collection: 'invoices', blocksErasure: () => ({ code: 'openInvoice', count: 3, detail: 'b', blocksTiers: ['T1', 'T3'] }) }),
    ];
    const p = await buildPreview(ctx, entries, some('1'), 2);
    expect(p.blockers.map((b) => b.code).sort()).toEqual(['activeMembership', 'openInvoice']);
  });

  it('never asks a blocker about an empty result set', async () => {
    let asked = false;
    const entries = [row({ blocksErasure: () => { asked = true; return undefined; } })];
    await buildPreview(ctx, entries, none, 2);
    expect(asked).toBe(false);
  });

  it('produces a token that changes when the content changes', async () => {
    const a = await buildPreview(ctx, [row({ collection: 'users' })], some('1'), 2);
    const b = await buildPreview(ctx, [row({ collection: 'users' })], some('1', '2'), 2);
    expect(a.previewToken).not.toBe(b.previewToken);
  });

  it('produces a stable token for identical content', async () => {
    const mk = () => buildPreview(ctx, [row({ collection: 'users' })], some('1'), 2);
    expect((await mk()).previewToken).toBe((await mk()).previewToken);
  });

  it('never mentions another tenant (D-P5-2)', async () => {
    const p = await buildPreview(ctx, [row({ collection: 'persons' })], some('p1'), 2);
    expect(JSON.stringify(p)).not.toMatch(/tenant(s)?["']?\s*:\s*\[/);
  });

  it('states the retention end date and the legal basis on a row it keeps', async () => {
    const entries = [row({
      collection: 'bookings', tier: 'T3', onErasure: 'anonymize', anonymizeFields: ['x'],
      retention: { months: 120, legalBasis: 'GebüV / OR Art. 958f — 10 Jahre' },
    })];
    const fetch = async () => [doc('b1', '2020-03-15T10:00:00.000Z'), doc('b2', '2026-07-29T10:00:00.000Z')];
    const [rowOut] = (await buildPreview(ctx, entries, fetch, 2)).willAnonymize;
    // newest document + 120 months, as a StoreDate — never a hand-rolled date helper
    expect(rowOut.retentionEndsAt).toBe('20360729');
    expect(rowOut.legalBasis).toBe('GebüV / OR Art. 958f — 10 Jahre');
  });

  it('leaves the end date open when the retention is indefinite', async () => {
    const entries = [row({
      collection: 'transfers', onErasure: 'anonymize', anonymizeFields: ['x'],
      retention: { months: 'indefinite', legalBasis: 'Vereinsdokumentation' },
    })];
    const [rowOut] = (await buildPreview(ctx, entries, some('t1'), 2)).willAnonymize;
    expect(rowOut.retentionEndsAt).toBeUndefined();
    expect(rowOut.legalBasis).toBe('Vereinsdokumentation');
  });

  it('says nothing about a retention end it cannot compute', async () => {
    // legacy documents can reach us without an updateTime; inventing a date would be
    // worse than leaving the question open.
    const entries = [row({ onErasure: 'anonymize', anonymizeFields: ['x'], retention: { months: 120, legalBasis: 'GebüV' } })];
    const [rowOut] = (await buildPreview(ctx, entries, some('x1'), 2)).willAnonymize;
    expect(rowOut.retentionEndsAt).toBeUndefined();
  });

  it('lists the processors beyond our reach', async () => {
    const p = await buildPreview(ctx, [], none, 2);
    expect(p.outOfReach.length).toBeGreaterThan(0);
    for (const r of p.outOfReach) {
      expect(r.name.length, `${r.key} has no name`).toBeGreaterThan(0);
      expect(r.contact.length, `${r.key} has no contact channel`).toBeGreaterThan(20);
      expect(r.dataClasses.length, `${r.key} names no data categories`).toBeGreaterThan(0);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────
// The C1 amendment (2026-07-29): erasure is conditional, not all-or-nothing. An active
// membership blocks the CONTRACT tier; consent is withdrawable at any time, so the
// voluntary tier stays deletable and the report has to say so.
// ────────────────────────────────────────────────────────────────────────────────────
describe('buildPreview — canDeleteNow', () => {
  const avatars = row({ collection: 'avatars', tier: 'T2', dataClass: 'identity', onErasure: 'delete' });
  const blocked = (tiers?: ('T1' | 'T2' | 'T3' | 'T4')[]) => row({
    collection: 'memberships', tier: 'T1',
    blocksErasure: () => ({ code: 'activeMembership', count: 1, detail: 'laufend', blocksTiers: tiers }),
  });

  it('offers the voluntary rows while a blocker stops the full erasure', async () => {
    const p = await buildPreview(ctx, [avatars, blocked(['T1'])], some('a1'), 2);
    expect(p.blockers).toHaveLength(1);
    expect(p.canDeleteNow).toEqual([expect.objectContaining({ collection: 'avatars', count: 1, tier: 'T2' })]);
  });

  it('stays empty when nothing is blocked — the whole preview is already the answer', async () => {
    const p = await buildPreview(ctx, [avatars], some('a1'), 2);
    expect(p.canDeleteNow).toEqual([]);
    expect(p.willDelete).toEqual([expect.objectContaining({ collection: 'avatars' })]);
  });

  it('never offers a row a present blocker actually blocks', async () => {
    const p = await buildPreview(ctx, [avatars, blocked(['T1', 'T2'])], some('a1'), 2);
    expect(p.canDeleteNow).toEqual([]);
  });

  it('treats a blocker that names no tiers as blocking everything', async () => {
    const p = await buildPreview(ctx, [avatars, blocked(undefined)], some('a1'), 2);
    expect(p.canDeleteNow).toEqual([]);
  });

  it('never offers a contract-, accounting- or club-tier row', async () => {
    const entries = [
      row({ collection: 'addresses', tier: 'T1' }),
      row({ collection: 'bookings', tier: 'T3', onErasure: 'anonymize', anonymizeFields: ['x'] }),
      row({ collection: 'trips', tier: 'T4', onErasure: 'anonymize', anonymizeFields: ['x'] }),
      blocked(['T1']),
    ];
    const p = await buildPreview(ctx, entries, some('1'), 2);
    expect(p.canDeleteNow).toEqual([]);
  });

  // canDeleteNow is a SUBSET VIEW of the erasure, not a separate list: "of everything
  // the erasure would remove, this much is available to you right now". A row offered
  // here that the erasure itself would not remove would be a promise nothing keeps.
  it('only ever offers rows the erasure would remove anyway', async () => {
    const p = await buildPreview(ctx, [avatars, blocked(['T1'])], some('a1'), 2);
    const removed = p.willDelete.map((r) => r.collection);
    for (const r of p.canDeleteNow) {
      expect(removed, `${r.collection} is offered but not part of the erasure`).toContain(r.collection);
    }
  });
});

describe('previewTokenOf', () => {
  const base = { blockers: [], willDelete: [], willAnonymize: [], willRetain: [], canDeleteNow: [] };
  const rowOut = { collection: 'users', dataClass: 'consent' as const, tier: 'T1' as const, count: 1 };

  it('changes when any section changes', async () => {
    const token = previewTokenOf(base);
    expect(previewTokenOf({ ...base, willDelete: [rowOut] })).not.toBe(token);
    expect(previewTokenOf({ ...base, willAnonymize: [rowOut] })).not.toBe(token);
    expect(previewTokenOf({ ...base, willRetain: [rowOut] })).not.toBe(token);
    expect(previewTokenOf({ ...base, canDeleteNow: [rowOut] })).not.toBe(token);
    expect(previewTokenOf({
      ...base, blockers: [{ code: 'soleAdmin' as const, count: 1, detail: 'x' }],
    })).not.toBe(token);
  });

  it('does not depend on key order — the token is over content, not JSON layout', () => {
    const a = previewTokenOf({ ...base, willDelete: [{ collection: 'users', dataClass: 'consent', tier: 'T1', count: 1 }] });
    const b = previewTokenOf({ ...base, willDelete: [{ count: 1, tier: 'T1', dataClass: 'consent', collection: 'users' }] });
    expect(a).toBe(b);
  });

  it('is a hex digest, not the payload itself', () => {
    expect(previewTokenOf({ ...base, willDelete: [rowOut] })).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────
// The production fetcher MUST go through `resolveDocs`. Reading `entry.find(ctx).get()`
// directly compiles and looks right, but on the 8 rows carrying a `matches` it returns
// other members' documents — which the executor would then delete or anonymise.
// ────────────────────────────────────────────────────────────────────────────────────
describe('firestoreDocFetcher', () => {
  function qdoc(id: string, data: Record<string, unknown>): QueryDocumentSnapshot {
    return {
      id,
      ref: { parent: { parent: null } },
      get: (path: string) => path.split('.')
        .reduce<unknown>((acc, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), data),
    } as unknown as QueryDocumentSnapshot;
  }

  it('applies the row tenant filter and the matches post-filter, not just find()', async () => {
    const docs = [
      qdoc('mine', { tenants: ['scs'], owner: 'p1' }),
      qdoc('otherTenant', { tenants: ['p13'], owner: 'p1' }),
      qdoc('otherMember', { tenants: ['scs'], owner: 'p9' }),
    ];
    const entry = row({
      find: () => ({ get: async () => ({ docs }) }) as unknown as Query,
      matches: (d, c) => d.get('owner') === c.personKey,
    });
    const got = await firestoreDocFetcher(entry, ctx);
    expect(got.map((d) => d.id)).toEqual(['mine']);
  });
});

describe('OUT_OF_REACH_PROCESSORS', () => {
  it('has a stable key per processor', () => {
    const keys = OUT_OF_REACH_PROCESSORS.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('names the Matrix homeserver, whose message bodies we cannot reach at all', () => {
    expect(OUT_OF_REACH_PROCESSORS.map((p) => p.key)).toContain('matrix');
  });
});
