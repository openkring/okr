import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import * as models from '@okr/shared-models';
import { describe, expect, it } from 'vitest';
import { SUBJECT_DATA_MAP, entriesFor } from './subject-data-map';

describe('SUBJECT_DATA_MAP', () => {
  it('has no duplicate collection rows', () => {
    const names = SUBJECT_DATA_MAP.map((e) => e.collection);
    expect(new Set(names).size).toBe(names.length);
  });

  it('declares a retention rule on every row', () => {
    for (const e of SUBJECT_DATA_MAP) {
      expect(e.retention, `${e.collection} has no retention`).toBeDefined();
      expect(e.retention.legalBasis.length).toBeGreaterThan(0);
    }
  });

  it('names the fields to overwrite on every anonymize row', () => {
    for (const e of SUBJECT_DATA_MAP.filter((x) => x.onErasure === 'anonymize')) {
      expect(e.anonymizeFields?.length, `${e.collection} anonymizes nothing`).toBeGreaterThan(0);
    }
  });

  it('gives every index-export row the fields to build the index from', () => {
    for (const e of SUBJECT_DATA_MAP.filter((x) => x.onExport === 'index')) {
      expect(e.indexFields, `${e.collection} has no indexFields`).toBeDefined();
    }
  });

  it('covers the vault and the person record', () => {
    const names = SUBJECT_DATA_MAP.map((e) => e.collection);
    expect(names).toContain('addresses');
    expect(names).toContain('persons');
  });

  it('never exports a financial row as index-only (they are full records)', () => {
    for (const e of SUBJECT_DATA_MAP.filter((x) => x.dataClass === 'financial')) {
      expect(e.onExport).toBe('full');
    }
  });

  it('entriesFor filters by export mode', () => {
    expect(entriesFor('full').every((e) => e.onExport === 'full')).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────
// Completeness, DERIVED — not a re-listing of the map.
//
// The regression that matters is "someone adds a collection to shared-models and the
// privacy map never hears about it". So: read every `*Collection` constant out of
// `@okr/shared-models` at runtime, read the omission/gap comments out of the map's own
// source, and require each constant to be classified by exactly one of the three.
// ────────────────────────────────────────────────────────────────────────────────────
// Located from cwd rather than import.meta so the file stays type-clean under the
// app's CommonJS tsconfig; vitest runs with apps/functions as cwd, nx from the root.
function readMapSource(): string {
  const candidates = [
    resolve(process.cwd(), 'src/privacy/subject-data-map.ts'),
    resolve(process.cwd(), 'apps/functions/src/privacy/subject-data-map.ts'),
  ];
  const hit = candidates.find((p) => existsSync(p));
  if (!hit) throw new Error(`subject-data-map.ts not found from ${process.cwd()}`);
  return readFileSync(hit, 'utf8');
}

const MAP_SOURCE = readMapSource();

function commentedCollections(marker: string): Set<string> {
  const re = new RegExp(`^//\\s*${marker}:\\s*([A-Za-z0-9_/-]+)`, 'gm');
  return new Set([...MAP_SOURCE.matchAll(re)].map((m) => m[1]));
}

/** Every `*Collection = '<name>'` constant exported by shared-models. */
function declaredCollections(): { constant: string; name: string }[] {
  return Object.entries(models as Record<string, unknown>)
    .filter(([k, v]) => k.endsWith('Collection') && typeof v === 'string')
    .map(([constant, v]) => ({ constant, name: v as string }));
}

describe('SUBJECT_DATA_MAP — completeness, derived from shared-models', () => {
  const rows = new Set(SUBJECT_DATA_MAP.map((e) => e.collection));
  const omitted = commentedCollections('not personal data');
  const gaps = commentedCollections('gap');

  it('finds the collection constants and the classification comments at all', () => {
    // guards the derivation itself: if the barrel import or the comment regex silently
    // returned nothing, every assertion below would pass vacuously.
    expect(declaredCollections().length).toBeGreaterThan(50);
    expect(omitted.size).toBeGreaterThan(10);
    expect(gaps.size).toBeGreaterThan(0);
  });

  it('classifies every declared collection as a row, an omission or a gap', () => {
    const unclassified = declaredCollections()
      .filter(({ name }) => !rows.has(name) && !omitted.has(name) && !gaps.has(name))
      .map(({ constant, name }) => `${constant} ('${name}')`);
    expect(
      unclassified,
      `unclassified collection(s) — add a row, a "// not personal data:" line or a "// gap:" line:\n  ${unclassified.join('\n  ')}`,
    ).toEqual([]);
  });

  it('classifies each collection exactly once', () => {
    for (const { name } of declaredCollections()) {
      const hits = [rows.has(name), omitted.has(name), gaps.has(name)].filter(Boolean).length;
      expect(hits, `${name} is classified ${hits} times`).toBeLessThanOrEqual(1);
    }
  });

  it('never omits or gaps a collection that already has a row', () => {
    for (const name of rows) {
      expect(omitted.has(name), `${name} is both a row and an omission`).toBe(false);
      expect(gaps.has(name), `${name} is both a row and a gap`).toBe(false);
    }
  });

  it('covers the collections that carry no *Collection constant', () => {
    // subcollections / CF-written paths the constant list cannot reach
    for (const c of ['users/fcmTokens', 'stats_members']) {
      expect([...rows], `${c} has no row`).toContain(c);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────────────────
// Row-level invariants, blocker predicates and matches() post-filters.
// ────────────────────────────────────────────────────────────────────────────────────

/** A DocumentSnapshot stand-in supporting dotted `get()` paths, like the real one. */
function snap(data: Record<string, unknown>): DocumentSnapshot {
  return {
    get: (path: string) => path.split('.')
      .reduce<unknown>((acc, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), data),
  } as unknown as DocumentSnapshot;
}

function entry(name: string) {
  const e = SUBJECT_DATA_MAP.find((x) => x.collection === name);
  if (!e) throw new Error(`no row for ${name}`);
  return e;
}

describe('SUBJECT_DATA_MAP — row invariants', () => {
  it('declares a tenantScope on every row', () => {
    for (const e of SUBJECT_DATA_MAP) {
      expect(e.tenantScope, `${e.collection} has no tenantScope`).toBeTruthy();
    }
  });

  it('scopes the collections without a tenants[] array by their own mechanism', () => {
    // esignList has a singular tenantId, esignAudit has no tenant field at all — a
    // generic "filter on tenants[]" rule discards every document of both.
    expect(entry('esignList').tenantScope).toBe('inQuery');
    expect(entry('esignAudit').tenantScope).toBe('docPath');
  });

  it('declares a post-filter for every row whose find() is a scan', () => {
    for (const e of SUBJECT_DATA_MAP.filter((x) => x.tenantScope === 'inQuery')) {
      expect(e.matches, `${e.collection} scans without a matches() post-filter`).toBeDefined();
    }
    for (const c of ['groups', 'calevents', 'trips', 'transfers', 'sections']) {
      expect(entry(c).matches, `${c} has no matches()`).toBeDefined();
    }
  });

  it('keeps every retention-bound financial row out of hard deletion', () => {
    for (const e of SUBJECT_DATA_MAP.filter((x) => x.dataClass === 'financial')) {
      expect(e.onErasure, `${e.collection} deletes accounting data`).not.toBe('delete');
      expect(e.retention.months, `${e.collection} is not on the 10y clock`).toBe(120);
    }
  });

  it('gives every index row a title, a date and a route field', () => {
    const index = entriesFor('index');
    expect(index.length).toBeGreaterThan(0);
    for (const e of index) {
      expect(e.indexFields?.route.length, `${e.collection} has no route`).toBeGreaterThan(0);
      expect(e.indexFields?.title.length, `${e.collection} has no title field`).toBeGreaterThan(0);
      expect(e.indexFields?.date.length, `${e.collection} has no date field`).toBeGreaterThan(0);
    }
  });

  it('never index-exports a row it also hard-deletes', () => {
    for (const e of SUBJECT_DATA_MAP.filter((x) => x.onErasure === 'delete')) {
      expect(['full', 'none'], `${e.collection} is deleted but only index-exported`).toContain(e.onExport);
    }
  });
});

describe('SUBJECT_DATA_MAP — blocker predicates', () => {
  const blocking = SUBJECT_DATA_MAP.filter((e) => e.blocksErasure);

  it('covers every Blocker code', () => {
    expect(blocking.length).toBeGreaterThanOrEqual(4);
  });

  it('never blocks on an empty result set', () => {
    for (const e of blocking) {
      expect(e.blocksErasure?.([]), `${e.collection} blocks on an empty result`).toBeUndefined();
    }
  });

  it('writes each message as plain, complete German addressed to the member', () => {
    const german = /\b(Sie|Ihre|Ihren|Ihnen|Ihr)\b/;
    for (const e of blocking) {
      // force the blocking branch with a doc that fails every terminal-state test
      const b = e.blocksErasure?.([snap({
        dateOfExit: '', state: 'created', status: 'draft', documentStatus: 'in-progress',
        paymentDate: '', admins: [{ key: 'p1' }],
      })]);
      expect(b, `${e.collection} did not block on an obviously open record`).toBeDefined();
      expect(b?.count, `${e.collection} reports no count`).toBe(1);
      expect(b?.detail.length, `${e.collection}: message too terse`).toBeGreaterThan(40);
      expect(b?.detail, `${e.collection}: message does not address the member`).toMatch(german);
      expect(b?.detail.endsWith('.'), `${e.collection}: message is not a finished sentence`).toBe(true);
      expect(b?.detail, `${e.collection}: message leaks English`).not.toMatch(/\b(the|your|please)\b/i);
    }
  });

  it('memberships blocks only while the membership is running', () => {
    const b = entry('memberships').blocksErasure;
    expect(b?.([snap({ dateOfExit: '' })])?.code).toBe('activeMembership');
    expect(b?.([snap({ dateOfExit: '20250101' })])).toBeUndefined();
  });

  // C1 regression: the predicate used literals that are not in ExpenseStatus, so every
  // expense counted as open forever. At least one REAL status must clear the blocker.
  it('expenses clears on a real terminal ExpenseStatus', () => {
    const EXPENSE_STATUS = ['draft', 'processing', 'validated', 'error', 'posted', 'pending-export'] as const;
    const b = entry('expenses').blocksErasure;
    const clearing = EXPENSE_STATUS.filter((s) => b?.([snap({ status: s })]) === undefined);
    expect(clearing.length, 'no ExpenseStatus can ever clear the expenses blocker').toBeGreaterThan(0);
    expect(clearing).toContain('posted');
    expect(b?.([snap({ status: 'draft' })])?.code).toBe('openInvoice');
  });

  // C2 regression: same failure mode on esignList — a fully signed document blocked forever.
  it('esignList clears on a real terminal EsignDocumentStatus', () => {
    const ESIGN_STATUS = ['uploading', 'draft', 'in-progress', 'signed', 'withdrawn', 'rejected', 'error'] as const;
    const b = entry('esignList').blocksErasure;
    const clearing = ESIGN_STATUS.filter((s) => b?.([snap({ documentStatus: s })]) === undefined);
    expect(clearing.length, 'no EsignDocumentStatus can ever clear the esign blocker').toBeGreaterThan(0);
    expect(clearing, 'a signed document must not block erasure').toContain('signed');
    expect(b?.([snap({ documentStatus: 'in-progress' })])?.code).toBe('pendingSignature');
  });

  it('scs-memberfees clears once the fee is paid or cancelled', () => {
    const b = entry('scs-memberfees').blocksErasure;
    expect(b?.([snap({ state: 'paid' })])).toBeUndefined();
    expect(b?.([snap({ state: 'cancelled' })])).toBeUndefined();
    expect(b?.([snap({ state: 'initial' })])?.code).toBe('openInvoice');
  });

  it('invoices clears once paid or cancelled', () => {
    const b = entry('invoices').blocksErasure;
    expect(b?.([snap({ paymentDate: '20260101', state: 'paid' })])).toBeUndefined();
    expect(b?.([snap({ paymentDate: '', state: 'cancelled' })])).toBeUndefined();
    expect(b?.([snap({ paymentDate: '', state: 'created' })])?.code).toBe('openInvoice');
  });

  // I7 regression: blocksErasure sees the post-`matches` set, so a group with a second
  // admin must not block. Handed the raw scan, an admin-less group would block everybody.
  it('groups blocks only when the subject is the last admin', () => {
    const b = entry('groups').blocksErasure;
    expect(b?.([snap({ admins: [{ key: 'p1' }, { key: 'p2' }] })])).toBeUndefined();
    expect(b?.([snap({ admins: [{ key: 'p1' }] })])?.code).toBe('soleAdmin');
  });
});

describe('SUBJECT_DATA_MAP — matches() post-filters', () => {
  const ctx = { uid: 'u1', personKey: 'p1', parentKey: 'person.p1', tenantId: 't1', email: 'a@b.ch' };
  const other = { ...ctx, uid: 'u9', personKey: 'p9', parentKey: 'person.p9', email: 'z@b.ch' };

  it('groups matches an admin entry and nothing else', () => {
    const m = entry('groups').matches;
    expect(m?.(snap({ admins: [{ key: 'p1', modelType: 'person' }] }), ctx)).toBe(true);
    expect(m?.(snap({ admins: [{ key: 'p1', modelType: 'person' }] }), other)).toBe(false);
    expect(m?.(snap({}), ctx)).toBe(false);
  });

  it('treats a missing modelType as person', () => {
    // hand-built section configs and older documents omit it; requiring it would
    // silently exclude them from both export and erasure
    expect(entry('trips').matches?.(snap({ participants: [{ key: 'p1' }] }), ctx)).toBe(true);
  });

  // I11 regression: sections was filed as an unsolvable gap; for the people section the
  // path is fixed at properties.persons.
  it('sections matches a people section listing the member', () => {
    const m = entry('sections').matches;
    expect(m?.(snap({ type: 'people', properties: { persons: [{ key: 'p1' }] } }), ctx)).toBe(true);
    expect(m?.(snap({ type: 'people', properties: { persons: [{ key: 'p9' }] } }), ctx)).toBe(false);
    expect(m?.(snap({ type: 'article', properties: {} }), ctx)).toBe(false);
  });

  it('calevents matches both the responsible person and an attendee', () => {
    const m = entry('calevents').matches;
    expect(m?.(snap({ responsiblePersons: [{ key: 'p1' }] }), ctx)).toBe(true);
    expect(m?.(snap({ attendees: [{ person: { key: 'p1' } }] }), ctx)).toBe(true);
    expect(m?.(snap({ attendees: [{ person: { key: 'p9' } }] }), ctx)).toBe(false);
  });

  // I8 regression: an anonymously submitted application still has an empty personKey.
  it('applications matches by e-mail when personKey is still empty', () => {
    const m = entry('applications').matches;
    const pending = snap({ personKey: '', email: 'A@B.ch' });
    expect(m?.(pending, ctx)).toBe(true);
    expect(m?.(pending, other)).toBe(false);
    // an empty ctx.personKey must not sweep up every unconverted application
    expect(m?.(pending, { ...ctx, personKey: '', email: 'z@b.ch' })).toBe(false);
  });

  // I10 regression: a member who only SIGNED someone else's document.
  it('esignList matches both the owner and a signee', () => {
    const m = entry('esignList').matches;
    expect(m?.(snap({ ownerUserId: 'u1', signees: [] }), ctx)).toBe(true);
    expect(m?.(snap({ ownerUserId: 'u9', signees: [{ email: 'A@B.ch' }] }), ctx)).toBe(true);
    expect(m?.(snap({ ownerUserId: 'u9', signees: [{ email: 'x@y.ch' }] }), ctx)).toBe(false);
  });

  // I9 regression: logAuth writes author.key = '' and puts the e-mail into payload.
  it('activities matches both the authored events and the login events', () => {
    const m = entry('activities').matches;
    expect(m?.(snap({ author: { key: 'p1' }, scope: 'person' }), ctx)).toBe(true);
    expect(m?.(snap({ author: { key: '' }, scope: 'auth', payload: 'login A@B.ch ok' }), ctx)).toBe(true);
    expect(m?.(snap({ author: { key: '' }, scope: 'auth', payload: 'login z@b.ch ok' }), ctx)).toBe(false);
    // an empty e-mail must not make every auth record match
    expect(m?.(
      snap({ author: { key: '' }, scope: 'auth', payload: 'login x@y.ch' }),
      { ...ctx, personKey: '', email: '' },
    )).toBe(false);
  });
});
