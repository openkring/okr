import { beforeEach, describe, expect, it, vi } from 'vitest';
// vi.mock is hoisted above this import, so the map sees the stub.
import { resolveDocs, SUBJECT_DATA_MAP } from './subject-data-map';
import type { SubjectCtx } from './types';

/**
 * C5 §4 — the one row in the map that needs a query to find its query.
 *
 * A prospect is identified by e-mail alone, and that e-mail is deliberately NOT on the prospect:
 * it is an `addresses` document with `parentKey = 'prospect.<okey>'`. So both halves have to be
 * checked, and neither is visible to the shape assertions in `subject-data-map.find.spec.ts`:
 *
 *  1. `prospects.resolve` walks addresses → parentKey → prospects, and returns NOTHING for an
 *     e-mail nobody signed up with (the failure mode that would silently under-erase);
 *  2. `addresses.resolve` returns the subject's own vault UNION the vault of their prospect
 *     records — without which erasing the prospect leaves its e-mail behind, orphaned.
 *
 * The stub below is a tiny in-memory query engine rather than a recorder, because what is being
 * asserted here is which DOCUMENTS come back, not which predicates were issued.
 */

interface Doc { id: string; data: Record<string, unknown> }

const DATA: Record<string, Doc[]> = {
  addresses: [
    // the subject's own vault
    { id: 'A1', data: { parentKey: 'person.PK-1', addressChannel: 'email', email: 'a@b.ch', tenants: ['TENANT-1'] } },
    // the same person's signup, months earlier, before they had an account
    { id: 'A2', data: { parentKey: 'prospect.P1', addressChannel: 'email', email: 'a@b.ch', tenants: ['TENANT-1'] } },
    { id: 'A3', data: { parentKey: 'prospect.P1', addressChannel: 'phone', phone: '+41…', tenants: ['TENANT-1'] } },
    // somebody else entirely — must never appear
    { id: 'A4', data: { parentKey: 'prospect.P9', addressChannel: 'email', email: 'other@b.ch', tenants: ['TENANT-1'] } },
  ],
  prospects: [
    { id: 'P1', data: { name: 'Turnverein Musterhausen', status: 'claimed', tenants: ['TENANT-1'] } },
    { id: 'P9', data: { name: 'Nicht dieser Verein', status: 'open', tenants: ['TENANT-1'] } },
  ],
};

vi.mock('firebase-admin/firestore', () => {
  type Pred = { f: string; op: string; v: unknown };

  const holds = (doc: Doc, p: Pred): boolean => {
    const value = p.f === '__name__' ? doc.id : doc.data[p.f];
    if (p.op === 'in') return (p.v as unknown[]).includes(value);
    if (p.op === 'array-contains') return Array.isArray(value) && value.includes(p.v);
    return value === p.v;
  };

  class FakeQuery {
    private readonly preds: Pred[] = [];
    constructor(private readonly root: string) {}
    where(f: string, op: string, v: unknown) { this.preds.push({ f, op, v }); return this; }
    async get() {
      const docs = (DATA[this.root] ?? []).filter((d) => this.preds.every((p) => holds(d, p)));
      return { docs: docs.map((d) => ({ id: d.id, get: (f: string) => d.data[f] })) };
    }
  }

  return {
    getFirestore: () => ({ collection: (n: string) => new FakeQuery(n) }),
    FieldPath: { documentId: () => '__name__' },
    Filter: { where: () => ({}), or: () => ({}), and: () => ({}) },
  };
});

const CTX: SubjectCtx = {
  uid: 'UID-1', personKey: 'PK-1', parentKey: 'person.PK-1', tenantId: 'TENANT-1', email: 'a@b.ch',
};

function row(collection: string) {
  const entry = SUBJECT_DATA_MAP.find((e) => e.collection === collection);
  if (!entry) throw new Error(`no row for ${collection}`);
  return entry;
}

const ids = (docs: { id: string }[]) => docs.map((d) => d.id).sort();

describe('prospects — the addresses → parentKey → prospect resolver (C5 §4)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reaches the prospect through its signup address', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs = await resolveDocs(row('prospects'), CTX) as any[];
    expect(ids(docs)).toEqual(['P1']);
  });

  it('returns nothing for an e-mail that never signed up', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs = await resolveDocs(row('prospects'), { ...CTX, email: 'nobody@b.ch' }) as any[];
    expect(docs).toEqual([]);
  });

  it('never reaches another lead: P9 belongs to a different e-mail', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs = await resolveDocs(row('prospects'), CTX) as any[];
    expect(ids(docs)).not.toContain('P9');
  });

  it('erases the prospect vault together with the subject own vault', async () => {
    // A2/A3 are the lead's contact data. If they were missing here, deleting P1 would orphan
    // the e-mail this whole row exists to reach.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs = await resolveDocs(row('addresses'), CTX) as any[];
    expect(ids(docs)).toEqual(['A1', 'A2', 'A3']);
  });

  it('leaves the addresses row unchanged for a subject with no prospect record', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const docs = await resolveDocs(row('addresses'), { ...CTX, email: 'nobody@b.ch' }) as any[];
    expect(ids(docs)).toEqual(['A1']);
  });
});
