import { describe, expect, it, vi } from 'vitest';
import { resolveDocs, SUBJECT_DATA_MAP } from './subject-data-map';
import type { SubjectCtx } from './types';

/** Spec 1.180 — a Vollmacht names a grantor and a grantee; both are data subjects of it. */

interface Doc { id: string; data: Record<string, unknown> }

const DATA: Record<string, Doc[]> = {
  mandates: [
    { id: 'M-GRANTEE', data: { grantorKey: 'PK-2', granteeKey: 'PK-1', tenants: ['TENANT-1'] } },
    { id: 'M-GRANTOR', data: { grantorKey: 'PK-1', granteeKey: 'PK-3', tenants: ['TENANT-1'] } },
    { id: 'M-SELF', data: { grantorKey: 'PK-1', granteeKey: 'PK-1', tenants: ['TENANT-1'] } },
    { id: 'M-THIRD', data: { grantorKey: 'PK-2', granteeKey: 'PK-3', tenants: ['TENANT-1'] } },
    { id: 'M-FOREIGN', data: { grantorKey: 'PK-1', granteeKey: 'PK-2', tenants: ['TENANT-2'] } },
  ],
};

vi.mock('firebase-admin/firestore', () => {
  type Pred = { f: string; op: string; v: unknown };
  const holds = (doc: Doc, p: Pred): boolean => {
    const value = p.f === '__name__' ? doc.id : doc.data[p.f];
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
  const e = SUBJECT_DATA_MAP.find((x) => x.collection === 'mandates');
  if (!e) throw new Error('no mandates row');
  return e;
};

describe('mandates — Vollmacht of a data subject (spec 1.180)', () => {
  it('finds the mandates where the subject is grantee or grantor, once each, in the tenant', async () => {
    const docs = await resolveDocs(row(), CTX);
    expect(docs.map((d) => d.id).sort()).toEqual(['M-GRANTEE', 'M-GRANTOR', 'M-SELF']);
  });

  it('finds nothing for a person without a mandate', async () => {
    expect(await resolveDocs(row(), { ...CTX, personKey: 'PK-NONE', parentKey: 'person.PK-NONE' })).toEqual([]);
  });

  it('exports in full and deletes on erasure and tenant exit', () => {
    expect(row()).toMatchObject({ dataClass: 'membership', tier: 'T2', onTenantExit: 'delete', onExport: 'full', onErasure: 'delete', tenantScope: 'tenantsArray' });
  });
});
