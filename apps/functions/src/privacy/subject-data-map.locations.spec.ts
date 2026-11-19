import { beforeEach, describe, expect, it, vi } from 'vitest';
// vi.mock is hoisted above this import, so the map sees the stub.
import { resolveDocs, SUBJECT_DATA_MAP } from './subject-data-map';
import type { SubjectCtx } from './types';

/**
 * Spec 1.164 §3 — register locations are home addresses, reachable only through the subject's
 * own postal vault rows. Club venues stay non-personal and must never be exported or touched.
 */

interface Doc { id: string; data: Record<string, unknown> }

const DATA: Record<string, Doc[]> = {
  addresses: [
    { id: 'A1', data: { parentKey: 'person.PK-1', addressChannel: 'postal', locationKey: 'L-HOME', tenants: ['TENANT-1'] } },
    { id: 'A2', data: { parentKey: 'person.PK-1', addressChannel: 'email', email: 'a@b.ch', tenants: ['TENANT-1'] } },
    { id: 'A3', data: { parentKey: 'person.PK-1', addressChannel: 'postal', locationKey: '', tenants: ['TENANT-1'] } },
    { id: 'A4', data: { parentKey: 'person.OTHER', addressChannel: 'postal', locationKey: 'L-OTHER', tenants: ['TENANT-1'] } },
  ],
  locations: [
    { id: 'L-HOME', data: { name: 'Seestrasse 1', tenants: ['address-register'] } },
    { id: 'L-OTHER', data: { name: 'Bahnhofstrasse 3', tenants: ['address-register'] } },
    { id: 'L-VENUE', data: { name: 'Clubhaus', tenants: ['TENANT-1'] } },
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

const row = () => {
  const e = SUBJECT_DATA_MAP.find((x) => x.collection === 'locations');
  if (!e) throw new Error('no locations row');
  return e;
};

describe('locations — register homes linked from the vault (spec 1.164)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only the register location of the subject own postal rows', async () => {
    const docs = await resolveDocs(row(), CTX);
    expect(docs.map((d) => d.id)).toEqual(['L-HOME']);
  });

  it('returns nothing for a subject without a linked postal row', async () => {
    const docs = await resolveDocs(row(), { ...CTX, parentKey: 'person.NOBODY' });
    expect(docs).toEqual([]);
  });

  it('is exported but retained on erasure: the shared place outlives one resident', () => {
    expect(row().onExport).toBe('full');
    expect(row().onErasure).toBe('retain');
  });
});
