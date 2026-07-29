import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { SUBJECT_DATA_MAP } from './subject-data-map';
import {
  anonymizePatch, executeErasure, pseudonymFor,
} from './erasure-execute';
import type { ErasureOps } from './erasure-execute';
import type { ErasurePreview } from './erasure-preview';
import type { SubjectCtx, SubjectDataEntry } from './types';

const SALT = 'test-salt-0123456789';
const ctx: SubjectCtx = { uid: 'u1', personKey: 'p1', parentKey: 'person.p1', tenantId: 'scs', email: 'a@b.ch' };

function mapRow(collection: string): SubjectDataEntry {
  const e = SUBJECT_DATA_MAP.find((x) => x.collection === collection);
  if (!e) throw new Error(`no row for ${collection}`);
  return e;
}

/** A DocumentSnapshot stand-in with dotted `get()` and a mutable `tenants` array. */
function snap(id: string, data: Record<string, unknown>): DocumentSnapshot {
  return {
    id,
    data: () => data,
    get: (path: string) => path.split('.')
      .reduce<unknown>((acc, k) => (acc == null ? undefined : (acc as Record<string, unknown>)[k]), data),
  } as unknown as DocumentSnapshot;
}

describe('pseudonymFor', () => {
  it('is stable for the same tenant and person', () => {
    expect(pseudonymFor('scs', 'p1', SALT)).toBe(pseudonymFor('scs', 'p1', SALT));
  });

  it('differs across tenants for the same person (no cross-tenant relinking)', () => {
    expect(pseudonymFor('scs', 'p1', SALT)).not.toBe(pseudonymFor('p13', 'p1', SALT));
  });

  it('differs across persons in the same tenant', () => {
    expect(pseudonymFor('scs', 'p1', SALT)).not.toBe(pseudonymFor('scs', 'p2', SALT));
  });

  it('is human-readable in German', () => {
    expect(pseudonymFor('scs', 'p1', SALT)).toMatch(/^Gelöschtes Mitglied #[0-9a-f]{8}$/);
  });

  // Without the salt the person-key space is small enough to enumerate, so the "hash"
  // reverses to a person key in seconds. A silent fallback to '' would produce exactly
  // that while looking like it worked.
  it('mixes the salt in, and refuses to run without one', () => {
    expect(pseudonymFor('scs', 'p1', 'salt-a')).not.toBe(pseudonymFor('scs', 'p1', 'salt-b'));
    expect(() => pseudonymFor('scs', 'p1', '')).toThrow(/ERASURE_SALT/);
  });
});

describe('anonymizePatch', () => {
  const pseudonym = 'Gelöschtes Mitglied #abc12345';
  const entry = (over: Partial<SubjectDataEntry>): SubjectDataEntry => ({
    collection: 'x', dataClass: 'financial', tier: 'T3', onTenantExit: 'anonymize',
    tenantScope: 'tenantsArray', onExport: 'full', onErasure: 'anonymize',
    retention: { months: 120, legalBasis: 'GebüV' }, find: () => null as never, ...over,
  });

  it('puts the pseudonym in the display name and clears every other identity field', () => {
    const e = entry({ anonymizeFields: ['personKey', 'firstName', 'lastName'] });
    const p = anonymizePatch(e, snap('i1', { personKey: 'p1', firstName: 'Ann', lastName: 'Müller' }), ctx, pseudonym, '20260729');
    expect(p['lastName']).toBe(pseudonym);
    expect(p['firstName']).toBe('');
    expect(p['personKey']).toBe('');
  });

  it('nulls the key rather than pseudonymizing it — the link must break', () => {
    const e = entry({ anonymizeFields: ['counterparty.key', 'counterparty.name1', 'counterparty.name2'] });
    const doc = snap('b1', { counterparty: { key: 'p1', name1: 'Ann', name2: 'Müller' } });
    const p = anonymizePatch(e, doc, ctx, pseudonym, '20260729');
    expect(p['counterparty.key']).toBe('');
    expect(p['counterparty.name2']).toBe(pseudonym);
  });

  it('stamps anonymizedAt', () => {
    const e = entry({ anonymizeFields: ['personKey'] });
    expect(anonymizePatch(e, snap('i1', { personKey: 'p1' }), ctx, pseudonym, '20260729')['anonymizedAt'])
      .toBe('20260729');
  });

  it('touches nothing else — amounts and dates survive (D-P5-6)', () => {
    const e = entry({ anonymizeFields: ['personKey', 'firstName', 'lastName'] });
    const doc = snap('i1', { personKey: 'p1', firstName: 'Ann', lastName: 'Müller', amount: 120.5, date: '20260101' });
    const p = anonymizePatch(e, doc, ctx, pseudonym, '20260729');
    expect(Object.keys(p).sort()).toEqual(['anonymizedAt', 'firstName', 'lastName', 'personKey']);
  });

  // types.ts contract step 5: a document can carry a SECOND party. Overwriting the whole
  // row would anonymise a stranger who happens to share the document.
  it('leaves a second party on the same document alone', () => {
    const e = mapRow('tasks');   // author + assignee
    const doc = snap('t1', {
      author: { key: 'p1', name1: 'Ann', name2: 'Müller' },
      assignee: { key: 'p9', name1: 'Beat', name2: 'Zünd' },
    });
    const p = anonymizePatch(e, doc, ctx, pseudonym, '20260729');
    expect(p['author.key']).toBe('');
    expect(p['author.name2']).toBe(pseudonym);
    expect(Object.keys(p)).not.toContain('assignee.key');
    expect(Object.keys(p)).not.toContain('assignee.name2');
  });

  it('removes only the subject from an array field, keeping the others', () => {
    const e = mapRow('groups');
    const doc = snap('g1', { admins: [{ key: 'p1', name2: 'Müller' }, { key: 'p9', name2: 'Zünd' }] });
    const p = anonymizePatch(e, doc, ctx, pseudonym, '20260729');
    expect(p['admins']).toEqual([{ key: 'p9', name2: 'Zünd' }]);
  });

  it('removes the subject from an array of embedded objects', () => {
    const e = mapRow('calevents');
    const doc = snap('c1', {
      responsiblePersons: [{ key: 'p9' }],
      attendees: [{ person: { key: 'p1' }, state: 'yes' }, { person: { key: 'p9' }, state: 'no' }],
    });
    const p = anonymizePatch(e, doc, ctx, pseudonym, '20260729');
    expect(p['attendees']).toEqual([{ person: { key: 'p9' }, state: 'no' }]);
    // the subject is not among the responsible persons — that array must not be rewritten
    expect(Object.keys(p)).not.toContain('responsiblePersons');
  });

  it('writes no patch entry for a field the subject does not appear in', () => {
    const e = mapRow('groups');
    const doc = snap('g1', { admins: [{ key: 'p9' }] });
    expect(Object.keys(anonymizePatch(e, doc, ctx, pseudonym, '20260729'))).toEqual(['anonymizedAt']);
  });

  it('handles a dotted array path', () => {
    const e = mapRow('sections');   // properties.persons
    const doc = snap('s1', { type: 'people', properties: { persons: [{ key: 'p1' }, { key: 'p9' }] } });
    expect(anonymizePatch(e, doc, ctx, pseudonym, '20260729')['properties.persons']).toEqual([{ key: 'p9' }]);
  });

  // Drives the REAL rows: catches a field name in the map that no longer exists on the
  // model, and a quasi-identifier that would survive as a pseudonym instead of being
  // cleared.
  it('clears the quasi-identifiers on a member fee, not just the name', () => {
    const e = mapRow('scs-memberfees');
    const doc = snap('f1', {
      member: { key: 'p1', name1: 'Ann', name2: 'Müller' },
      memberBexioId: '4711', invoiceBexioId: '99', memberBirthYear: '1963', amount: 250,
    });
    const p = anonymizePatch(e, doc, ctx, pseudonym, '20260729');
    expect(p['member.name2']).toBe(pseudonym);
    expect(p['member.key']).toBe('');
    expect(p['memberBexioId']).toBe('');
    expect(p['invoiceBexioId']).toBe('');
    expect(p['memberBirthYear']).toBe('');
    expect(Object.keys(p)).not.toContain('amount');
  });
});

// ────────────────────────────────────────────────────────────────────────────────────
// The executor. Every side effect goes through `ErasureOps`, so the ORDER and the
// DECISIONS are testable without an emulator — which is where the D-P5-2 and D-L2
// properties actually live.
// ────────────────────────────────────────────────────────────────────────────────────
interface Recorded { readonly op: string; readonly detail?: unknown }

function fakeOps(over: Partial<ErasureOps> & { addresses?: DocumentSnapshot[]; personTenants?: string[] } = {}) {
  const calls: Recorded[] = [];
  const deleted: string[] = [];
  const patched: { id: string; patch: Record<string, unknown> }[] = [];
  const detached: string[] = [];
  const addresses = over.addresses ?? [];
  let personTenants = over.personTenants ?? ['scs'];

  const ops: ErasureOps = {
    resolve: async (entry) => (entry.collection === 'addresses' ? addresses : [snap(`${entry.collection}-1`, {})]),
    deleteAll: async (docs) => {
      calls.push({ op: 'deleteAll', detail: docs.map((d) => d.id) });
      deleted.push(...docs.map((d) => d.id));
      return docs.length;
    },
    patchAll: async (patches) => {
      calls.push({ op: 'patchAll', detail: patches.map((p) => p.doc.id) });
      patched.push(...patches.map((p) => ({ id: p.doc.id, patch: p.patch })));
      return patches.length;
    },
    detachTenant: async (docs, tenantId) => {
      calls.push({ op: 'detachTenant', detail: docs.map((d) => d.id) });
      let removed = 0;
      let gone = 0;
      for (const d of docs) {
        const tenants = ((d.get('tenants') as string[] | undefined) ?? []).filter((t) => t !== tenantId);
        detached.push(d.id);
        removed++;
        if (tenants.length === 0) {
          gone++;
          deleted.push(d.id);
        }
        (d.data() as Record<string, unknown>)['tenants'] = tenants;
      }
      if (docs.some((d) => d.id === 'person')) personTenants = personTenants.filter((t) => t !== tenantId);
      return { detached: removed, deleted: gone };
    },
    loadAddresses: async () => addresses,
    loadAvatar: async () => snap('avatar', { tenants: ['scs'] }),
    loadPerson: async () => snap('person', { tenants: personTenants }),
    loadUser: async () => snap('u1', { tenants: ['scs'] }),
    personTenantsAfterDetach: async () => personTenants,
    deleteAuthUser: async (uid) => { calls.push({ op: 'deleteAuthUser', detail: uid }); },
    rebuildAddressDirectory: async (parentKey) => { calls.push({ op: 'rebuildAddressDirectory', detail: parentKey }); },
    writeErasureLog: async (entry) => { calls.push({ op: 'writeErasureLog', detail: entry }); },
    ...over,
  };
  return { ops, calls, deleted, patched, detached, order: () => calls.map((c) => c.op) };
}

const cleanPreview: ErasurePreview = {
  blockers: [], willDelete: [], willAnonymize: [], willRetain: [], canDeleteNow: [],
  outOfReach: [], previewToken: 'tok',
};

const row = (collection: string, over: Partial<SubjectDataEntry> = {}): SubjectDataEntry => ({
  collection, dataClass: 'content', tier: 'T4', onTenantExit: 'delete', tenantScope: 'tenantsArray',
  onExport: 'none', onErasure: 'delete', retention: { months: 12, legalBasis: 'test' },
  find: () => null as never, ...over,
});

describe('executeErasure', () => {
  it('refuses to run while the preview reports a blocker', async () => {
    const { ops } = fakeOps();
    const blocked = {
      ...cleanPreview,
      blockers: [{ code: 'activeMembership' as const, count: 1, detail: 'laufend', blocksTiers: ['T1' as const] }],
    };
    await expect(executeErasure(ctx, blocked, [], ops, { salt: SALT })).rejects.toThrow();
  });

  it('runs deletes, then anonymizations, then the detach, then the projection and the log', async () => {
    const entries = [
      row('sessions'),
      row('bookings', { onErasure: 'anonymize', anonymizeFields: ['personKey'] }),
    ];
    const { ops, order } = fakeOps();
    await executeErasure(ctx, cleanPreview, entries, ops, { salt: SALT });
    const seq = order();
    expect(seq.indexOf('deleteAll')).toBeLessThan(seq.indexOf('patchAll'));
    expect(seq.indexOf('patchAll')).toBeLessThan(seq.indexOf('detachTenant'));
    expect(seq.lastIndexOf('detachTenant')).toBeLessThan(seq.indexOf('rebuildAddressDirectory'));
    expect(seq.indexOf('rebuildAddressDirectory')).toBeLessThan(seq.indexOf('writeErasureLog'));
  });

  // D-P5-2: these four are shared across tenancies. Hard-deleting them in step 1 would
  // damage another tenancy — and disclose that it exists.
  it('never hard-deletes a tenant-shared row in the delete pass', async () => {
    const entries = [row('persons', { onTenantExit: 'detach' }), row('sessions')];
    const { ops, deleted } = fakeOps({ personTenants: ['scs', 'p13'] });
    await executeErasure(ctx, cleanPreview, entries, ops, { salt: SALT });
    expect(deleted).toContain('sessions-1');
    expect(deleted).not.toContain('persons-1');
  });

  describe('D-L2 — the detach reaches the address documents', () => {
    const addresses = () => [
      snap('addr-shared', { parentKey: 'person.p1', tenants: ['scs', 'p13'], addressChannel: 'ssn' }),
      snap('addr-only-scs', { parentKey: 'person.p1', tenants: ['scs'], addressChannel: 'dob' }),
      snap('addr-other', { parentKey: 'person.p1', tenants: ['p13'], addressChannel: 'email' }),
    ];

    it('strips the tenant from a shared address and keeps the document', async () => {
      const addrs = addresses();
      const { ops } = fakeOps({ addresses: addrs, personTenants: ['scs', 'p13'] });
      await executeErasure(ctx, cleanPreview, [], ops, { salt: SALT });
      expect(addrs[0].get('tenants')).toEqual(['p13']);
    });

    it('deletes an address that existed only for this tenant', async () => {
      const addrs = addresses();
      const { ops, deleted } = fakeOps({ addresses: addrs, personTenants: ['scs', 'p13'] });
      await executeErasure(ctx, cleanPreview, [], ops, { salt: SALT });
      expect(deleted).toContain('addr-only-scs');
    });

    it('leaves an address of another tenant untouched', async () => {
      const addrs = addresses();
      const { ops, detached } = fakeOps({ addresses: addrs, personTenants: ['scs', 'p13'] });
      await executeErasure(ctx, cleanPreview, [], ops, { salt: SALT });
      expect(detached).not.toContain('addr-other');
      expect(addrs[2].get('tenants')).toEqual(['p13']);
    });

    // The whole point of D-L2: without it the departing tenant's privileged users keep
    // raw read access to ssn, dob and iban forever, because canReadVault tests the
    // ADDRESS document's tenants[], not the parent's.
    it('leaves no surviving address carrying the departing tenant', async () => {
      const addrs = addresses();
      const { ops, deleted } = fakeOps({ addresses: addrs, personTenants: ['scs', 'p13'] });
      await executeErasure(ctx, cleanPreview, [], ops, { salt: SALT });
      const surviving = addrs.filter((a) => !deleted.includes(a.id));
      for (const a of surviving) {
        expect((a.get('tenants') as string[]) ?? [], `${a.id} still carries the tenant`).not.toContain('scs');
      }
    });

    it('detaches the avatar the same way', async () => {
      const { ops, detached } = fakeOps({ personTenants: ['scs', 'p13'] });
      await executeErasure(ctx, cleanPreview, [], ops, { salt: SALT });
      expect(detached).toContain('avatar');
    });
  });

  describe('the hard delete happens only when the last tenancy goes', () => {
    it('keeps the person and the login when another tenancy remains (D-P5-2)', async () => {
      const { ops, order, deleted } = fakeOps({ personTenants: ['scs', 'p13'] });
      const result = await executeErasure(ctx, cleanPreview, [], ops, { salt: SALT });
      expect(order()).not.toContain('deleteAuthUser');
      expect(deleted).not.toContain('person');
      expect(result.personDeleted).toBe(false);
    });

    it('deletes person, remaining vault and login when the last tenancy goes', async () => {
      const { ops, order, deleted } = fakeOps({ personTenants: ['scs'] });
      const result = await executeErasure(ctx, cleanPreview, [], ops, { salt: SALT });
      expect(order()).toContain('deleteAuthUser');
      expect(deleted).toContain('person');
      expect(result.personDeleted).toBe(true);
    });

    // The preview is a snapshot; the decision to destroy an identity must be taken on a
    // fresh read, or a concurrent join in another tenant loses its person record.
    it('re-reads the tenancies instead of trusting the preview', async () => {
      let asked = 0;
      const { ops } = fakeOps({
        personTenantsAfterDetach: async () => { asked++; return ['p13']; },
      });
      const result = await executeErasure(ctx, cleanPreview, [], ops, { salt: SALT });
      expect(asked).toBe(1);
      expect(result.personDeleted).toBe(false);
    });
  });

  describe('the erasure-log entry', () => {
    it('records counts, tenant and pseudonym', async () => {
      const entries = [row('sessions'), row('bookings', { onErasure: 'anonymize', anonymizeFields: ['personKey'] })];
      const { ops, calls } = fakeOps();
      await executeErasure(ctx, cleanPreview, entries, ops, { salt: SALT });
      const logged = calls.find((c) => c.op === 'writeErasureLog')?.detail as Record<string, unknown>;
      expect(logged['tenantId']).toBe('scs');
      expect(logged['trigger']).toBe('self');
      expect(logged['pseudonym']).toBe(pseudonymFor('scs', 'p1', SALT));
      expect((logged['counts'] as Record<string, number>)['sessions']).toBe(1);
      expect((logged['counts'] as Record<string, number>)['bookings']).toBe(1);
    });

    // The log is admin-readable evidence that an erasure happened. Putting the erased
    // identity back into it would defeat the erasure it documents.
    it('carries no name, no e-mail, no personKey and no uid', async () => {
      const { ops, calls } = fakeOps();
      await executeErasure(ctx, cleanPreview, [], ops, { salt: SALT });
      const logged = JSON.stringify(calls.find((c) => c.op === 'writeErasureLog')?.detail);
      expect(logged).not.toContain('p1');
      expect(logged).not.toContain('u1');
      expect(logged).not.toContain('a@b.ch');
    });

    // D-P5-2, the subtle half: a `personDeleted: false` in a tenant-readable log tells
    // that tenant's admin the member still belongs somewhere else. The log has to read
    // identically whether or not another tenancy exists.
    it('says nothing about whether the person record survived', async () => {
      const { ops, calls } = fakeOps({ personTenants: ['scs', 'p13'] });
      await executeErasure(ctx, cleanPreview, [], ops, { salt: SALT });
      const logged = calls.find((c) => c.op === 'writeErasureLog')?.detail as Record<string, unknown>;
      expect(Object.keys(logged).sort())
        .toEqual(['counts', 'executedAt', 'okey', 'pseudonym', 'tenantId', 'tenants', 'trigger']);
    });

    it('reads identically whether or not another tenancy remains', async () => {
      const strip = (d: unknown) => JSON.stringify(d).replace(/"okey":"[^"]*"/, '').replace(/"executedAt":"[^"]*"/, '');
      const only = fakeOps({ personTenants: ['scs'] });
      const shared = fakeOps({ personTenants: ['scs', 'p13'] });
      await executeErasure(ctx, cleanPreview, [], only.ops, { salt: SALT, now: '20260729' });
      await executeErasure(ctx, cleanPreview, [], shared.ops, { salt: SALT, now: '20260729' });
      expect(strip(only.calls.find((c) => c.op === 'writeErasureLog')?.detail))
        .toBe(strip(shared.calls.find((c) => c.op === 'writeErasureLog')?.detail));
    });
  });

  it('rebuilds the address projection explicitly — a delete may not fire the parent trigger', async () => {
    const { ops, calls } = fakeOps();
    await executeErasure(ctx, cleanPreview, [], ops, { salt: SALT });
    expect(calls.find((c) => c.op === 'rebuildAddressDirectory')?.detail).toBe('person.p1');
  });
});
