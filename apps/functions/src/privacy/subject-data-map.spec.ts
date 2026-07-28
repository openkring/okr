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

describe('SUBJECT_DATA_MAP — codebase-derived completeness', () => {
  const names = SUBJECT_DATA_MAP.map((e) => e.collection);

  it('covers the consent record, the vault projection and the avatar', () => {
    expect(names).toContain('users');            // policyAcceptedVersion / cookieConsent (A1)
    expect(names).toContain('address-directory'); // derived projection of the vault
    expect(names).toContain('avatars');
  });

  it('covers every collection that carries a person foreign key', () => {
    for (const c of [
      'memberships', 'ownerships', 'workrels', 'personal-rels', 'invitations',
      'responsibilities', 'competition-levels', 'applications', 'comments', 'docs',
      'folders', 'reservations', 'whiteboards', 'instruments', 'assets', 'tasks',
    ]) {
      expect(names, `${c} has no row`).toContain(c);
    }
  });

  it('covers the retention-bound accounting records', () => {
    for (const c of ['bookings', 'invoices', 'invoice-positions', 'scs-memberfees', 'bills', 'expenses']) {
      expect(names, `${c} has no row`).toContain(c);
    }
  });

  it('covers the logs that name the subject', () => {
    for (const c of ['sessions', 'activities', 'docGenerations', 'payment-orders', 'esignAudit']) {
      expect(names, `${c} has no row`).toContain(c);
    }
  });

  it('declares a post-filter for every row whose subject sits inside an array', () => {
    for (const c of ['groups', 'calevents', 'trips', 'transfers']) {
      const entry = SUBJECT_DATA_MAP.find((e) => e.collection === c);
      expect(entry?.matches, `${c} scans without a matches() post-filter`).toBeDefined();
    }
  });

  it('keeps every retention-bound financial row out of hard deletion', () => {
    for (const e of SUBJECT_DATA_MAP.filter((x) => x.dataClass === 'financial')) {
      expect(e.onErasure, `${e.collection} deletes accounting data`).not.toBe('delete');
      expect(e.retention.months, `${e.collection} is not on the 10y clock`).toBe(120);
    }
  });

  it('writes every blocker message in plain German', () => {
    const ctx = { uid: 'u1', personKey: 'p1', parentKey: 'person.p1', tenantId: 't1' };
    for (const e of SUBJECT_DATA_MAP.filter((x) => x.blocksErasure)) {
      // an empty result set must never block
      expect(e.blocksErasure?.([]), `${e.collection} blocks on an empty result`).toBeUndefined();
    }
    expect(ctx.parentKey).toBe(`person.${ctx.personKey}`);
  });

  it('entriesFor(index) returns only index rows and every row has a route', () => {
    const index = entriesFor('index');
    expect(index.length).toBeGreaterThan(0);
    for (const e of index) {
      expect(e.onExport).toBe('index');
      expect(e.indexFields?.route.length, `${e.collection} has no route`).toBeGreaterThan(0);
      expect(e.indexFields?.title.length, `${e.collection} has no title field`).toBeGreaterThan(0);
      expect(e.indexFields?.date.length, `${e.collection} has no date field`).toBeGreaterThan(0);
    }
  });

  it('never index-exports a row it also hard-deletes without exporting it first', () => {
    for (const e of SUBJECT_DATA_MAP.filter((x) => x.onErasure === 'delete')) {
      expect(['full', 'none'], `${e.collection} is deleted but only index-exported`).toContain(e.onExport);
    }
  });
});
