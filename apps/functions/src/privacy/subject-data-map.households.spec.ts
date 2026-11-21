import { describe, expect, it, vi } from 'vitest';
// vi.mock is hoisted above this import, so the map sees the stub.
import { dedupeById, householdRecipientKeysOf, resolveDocs, SUBJECT_DATA_MAP } from './subject-data-map';
import type { SubjectCtx } from './types';

/**
 * Spec 1.168 §6.3 — a household letter goes to the contact's postal address under `recipientKey`
 * `household.<okey>`. Export and erasure of a member must find those `sendings` too.
 */

interface Doc { id: string; data: Record<string, unknown> }

const DATA: Record<string, Doc[]> = {
  households: [
    { id: 'H1', data: { memberKeys: ['PK-1', 'PK-2'], tenants: ['TENANT-1'] } },
    { id: 'H-OLD', data: { memberKeys: ['PK-1', 'PK-3'], tenants: ['TENANT-1'], isArchived: true } },
    { id: 'H-OTHER', data: { memberKeys: ['PK-9'], tenants: ['TENANT-1'] } },
  ],
  sendings: [
    { id: 'S-OWN', data: { recipientKey: 'person.PK-1', tenants: ['TENANT-1'] } },
    { id: 'S-H1', data: { recipientKey: 'household.H1', tenants: ['TENANT-1'] } },
    { id: 'S-OLD', data: { recipientKey: 'household.H-OLD', tenants: ['TENANT-1'] } },
    { id: 'S-OTHER', data: { recipientKey: 'household.H-OTHER', tenants: ['TENANT-1'] } },
    { id: 'S-FOREIGN', data: { recipientKey: 'household.H1', tenants: ['TENANT-2'] } },
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
      return { docs: docs.map((d) => ({ id: d.id, get: (f: string) => d.data[f], data: () => d.data })) };
    }
  }
  return {
    getFirestore: () => ({ collection: (n: string) => new FakeQuery(n) }),
    FieldPath: { documentId: () => '__name__' },
    Filter: { where: () => ({}), or: () => ({}), and: () => ({}) },
  };
});

const CTX: SubjectCtx = { uid: 'UID-1', personKey: 'PK-1', parentKey: 'person.PK-1', tenantId: 'TENANT-1', email: 'a@b.ch' };

const row = () => {
  const e = SUBJECT_DATA_MAP.find((x) => x.collection === 'sendings');
  if (!e) throw new Error('no sendings row');
  return e;
};

describe('sendings — household letters of a member (spec 1.168)', () => {
  it('finds the own letters and those of every current or archived household of the subject, in the tenant', async () => {
    const docs = await resolveDocs(row(), CTX);
    expect(docs.map((d) => d.id).sort()).toEqual(['S-H1', 'S-OLD', 'S-OWN']);
  });

  it('finds only the own letters without a household', async () => {
    const docs = await resolveDocs(row(), { ...CTX, personKey: 'PK-NONE', parentKey: 'person.PK-NONE' });
    expect(docs.map((d) => d.id)).toEqual([]);
  });

  it('keeps the erasure behaviour: recipient key, name and PDF path are anonymised', () => {
    expect(row().onErasure).toBe('anonymize');
    expect(row().anonymizeFields).toEqual(['recipientKey', 'recipientName', 'storagePath']);
  });
});

describe('helpers', () => {
  it('builds each household recipient key once', () => {
    expect(householdRecipientKeysOf(['H1', 'H2', 'H1', ''])).toEqual(['household.H1', 'household.H2']);
  });

  it('dedupes documents by id', () => {
    expect(dedupeById([{ id: 'a' }, { id: 'b' }, { id: 'a' }]).map((d) => d.id)).toEqual(['a', 'b']);
  });
});
