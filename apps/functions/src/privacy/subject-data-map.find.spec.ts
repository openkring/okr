import { beforeEach, describe, expect, it, vi } from 'vitest';
// vi.mock below is hoisted above this import by vitest, so the map sees the stub.
import { SUBJECT_DATA_MAP } from './subject-data-map';

/**
 * M17 — regression cover for the QUERY SHAPES themselves.
 *
 * The most consequential correction in this map is invisible to any assertion about
 * the row objects: `persons` must be found by `documentId()`, because `okey` is
 * stripped before every write and is not a queryable field. `where('okey','==',…)`
 * type-checks, reads plausibly, and silently returns nothing forever. The `expenses`
 * and `esignList` blockers failed the same way — a predicate that compiles and never
 * matches.
 *
 * So this file stubs `firebase-admin/firestore` with a recorder and asserts the shape
 * of every `find()` in the map: which collection it targets, which field paths it
 * constrains, and which of the four subject keys (`uid` / `personKey` / `parentKey` /
 * `email`) each predicate is fed.
 */

type Predicate = { field: string; op: string; value: unknown };

interface Recorded {
  root: string;
  kind: 'collection' | 'collectionGroup';
  path: string[];
  predicates: Predicate[];
}

vi.mock('firebase-admin/firestore', () => {
  type Node = { t: 'where'; f: string; op: string; v: unknown } | { t: 'or' | 'and'; c: Node[] };

  class FakeQuery {
    public readonly path: string[] = [];
    public readonly raw: unknown[] = [];
    constructor(public readonly root: string, public readonly kind: 'collection' | 'collectionGroup') {}
    where(...args: unknown[]) { this.raw.push(args.length === 1 ? args[0] : { t: 'where', f: args[0], op: args[1], v: args[2] }); return this; }
    doc(id: string) { this.path.push(`doc:${id}`); return this; }
    collection(id: string) { this.path.push(`collection:${id}`); return this; }
  }

  return {
    __FakeQuery: FakeQuery,
    getFirestore: () => ({
      collection: (n: string) => new FakeQuery(n, 'collection'),
      collectionGroup: (n: string) => new FakeQuery(n, 'collectionGroup'),
    }),
    // documentId() is opaque in the real SDK; '__name__' is its wire name
    FieldPath: { documentId: () => '__name__' },
    Filter: {
      where: (f: string, op: string, v: unknown): Node => ({ t: 'where', f, op, v }),
      or: (...c: Node[]): Node => ({ t: 'or', c }),
      and: (...c: Node[]): Node => ({ t: 'and', c }),
    },
  };
});

const CTX = { uid: 'UID-1', personKey: 'PK-1', parentKey: 'person.PK-1', tenantId: 'TENANT-1', email: 'a@b.ch' };

function flatten(node: unknown, out: Predicate[]): void {
  if (node == null || typeof node !== 'object') return;
  const n = node as { t?: string; f?: string; op?: string; v?: unknown; c?: unknown[] };
  if (n.t === 'where') out.push({ field: String(n.f), op: String(n.op), value: n.v });
  else if (n.c) for (const child of n.c) flatten(child, out);
}

function record(collection: string): Recorded {
  const e = SUBJECT_DATA_MAP.find((x) => x.collection === collection);
  if (!e) throw new Error(`no row for ${collection}`);
  const q = e.find(CTX) as unknown as { root: string; kind: 'collection' | 'collectionGroup'; path: string[]; raw: unknown[] };
  const predicates: Predicate[] = [];
  for (const r of q.raw) flatten(r, predicates);
  return { root: q.root, kind: q.kind, path: q.path, predicates };
}

const fields = (r: Recorded) => r.predicates.map((p) => p.field);
const valueOf = (r: Recorded, field: string) => r.predicates.find((p) => p.field === field)?.value;

describe('find() query shapes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('builds a query for every row without throwing', () => {
    for (const e of SUBJECT_DATA_MAP) {
      expect(() => e.find(CTX), `${e.collection}.find() threw`).not.toThrow();
      const r = record(e.collection);
      expect(r.root.length, `${e.collection} targets no collection`).toBeGreaterThan(0);
    }
  });

  it('never queries a field named okey — it is the document id, not a field', () => {
    for (const e of SUBJECT_DATA_MAP) {
      expect(fields(record(e.collection)), `${e.collection} queries the stripped okey field`).not.toContain('okey');
    }
  });

  // the single most consequential correction in the task
  it('finds persons and users and avatars by document id', () => {
    expect(valueOf(record('persons'), '__name__')).toBe(CTX.personKey);
    expect(valueOf(record('users'), '__name__')).toBe(CTX.uid);
    // the avatar doc id is the PREFIXED key, bare (shared default) or tenant-scoped
    expect(valueOf(record('avatars'), '__name__')).toEqual([CTX.parentKey, `${CTX.tenantId}.${CTX.parentKey}`]);
  });

  it('uses the PREFIXED parentKey for the vault and its projection, and nowhere else', () => {
    expect(valueOf(record('addresses'), 'parentKey')).toBe(CTX.parentKey);
    expect(valueOf(record('address-directory'), 'parentKey')).toBe(CTX.parentKey);
    const prefixUsers = SUBJECT_DATA_MAP
      .filter((e) => record(e.collection).predicates.some((p) => p.value === CTX.parentKey
        || (Array.isArray(p.value) && p.value.includes(CTX.parentKey))))
      .map((e) => e.collection);
    expect(prefixUsers.sort()).toEqual(['address-directory', 'addresses', 'avatars']);
  });

  it('uses the RAW personKey for memberships and the other relation collections', () => {
    for (const [collection, field] of [
      ['memberships', 'memberKey'],
      ['ownerships', 'ownerKey'],
      ['workrels', 'subjectKey'],
      ['competition-levels', 'personKey'],
      ['invoice-positions', 'personKey'],
      ['docs', 'authorKey'],
      ['folders', 'ownerKey'],
      ['assets', 'responsiblePersonKey'],
    ] as const) {
      const r = record(collection);
      expect(valueOf(r, field), `${collection}.${field} got the wrong key shape`).toBe(CTX.personKey);
      expect(valueOf(r, field), `${collection}.${field} got the prefixed form`).not.toBe(CTX.parentKey);
    }
  });

  it('keeps the modelType predicate on every polymorphic key', () => {
    for (const [collection, field] of [
      ['memberships', 'memberModelType'],
      ['ownerships', 'ownerModelType'],
      ['workrels', 'subjectModelType'],
      ['bookings', 'counterparty.modelType'],
      ['invoices', 'receiver.modelType'],
      ['bills', 'vendor.modelType'],
      ['scs-memberfees', 'member.modelType'],
      ['reservations', 'reserver.modelType'],
      // I12: responsibleAvatar / delegateAvatar are "Person or Group"
      ['responsibilities', 'responsibleAvatar.modelType'],
      ['responsibilities', 'delegateAvatar.modelType'],
    ] as const) {
      expect(fields(record(collection)), `${collection} lost its ${field} filter`).toContain(field);
    }
  });

  it('queries the uid-linked collections with the uid', () => {
    expect(valueOf(record('sessions'), 'userKey')).toBe(CTX.uid);
    expect(valueOf(record('expenses'), 'userId')).toBe(CTX.uid);
    expect(valueOf(record('docGenerations'), 'userId')).toBe(CTX.uid);
    expect(valueOf(record('esignAudit'), 'deletedBy')).toBe(CTX.uid);
    expect(valueOf(record('payment-orders'), 'createdBy')).toBe(CTX.uid);
    expect(valueOf(record('payment-orders'), 'approvedBy')).toBe(CTX.uid);
  });

  // C4: authorKey holds the personKey for user-written comments and the uid for the
  // auto-generated audit comments; both must be in the query.
  it('queries comments with BOTH key shapes', () => {
    const values = record('comments').predicates.filter((p) => p.field === 'authorKey').map((p) => p.value);
    expect(values).toContain(CTX.personKey);
    expect(values).toContain(CTX.uid);
  });

  // I8 + N2: a pending application has no personKey, and ApplicationModel.email is
  // stored as typed — an equality query with the lowercased ctx.email would silently
  // miss `Hans.Muster@example.ch`, and no post-filter can rescue an unfetched document.
  // So the row scans the tenant and matches case-insensitively.
  it('scans applications by tenant instead of querying the un-normalized email', () => {
    const r = record('applications');
    expect(valueOf(r, 'tenants')).toBe(CTX.tenantId);
    expect(fields(r), 'an email equality query cannot match un-normalized casing').not.toContain('email');
  });

  it('covers both sides of the two-sided relations', () => {
    expect(fields(record('personal-rels')).sort()).toEqual(['objectKey', 'subjectKey']);
    expect(fields(record('invitations')).sort()).toEqual(['inviteeKey', 'inviterKey']);
    expect(fields(record('tasks')).sort()).toEqual(['assignee.key', 'author.key']);
  });

  it('scopes esignList by its SINGULAR tenantId field', () => {
    // C3: esign records have no tenants[] array, so the tenant must be in the query
    const r = record('esignList');
    expect(valueOf(r, 'tenantId')).toBe(CTX.tenantId);
    expect(fields(r)).not.toContain('tenants');
  });

  it('bounds every scan row by the tenant or by the section type', () => {
    // N3: tenantScope is a POST-filter, so a scan row without a tenant leg in the query
    // reads every tenant's documents off the server before anything is discarded.
    for (const c of ['groups', 'calevents', 'trips', 'transfers', 'applications', 'activities']) {
      const r = record(c);
      expect(valueOf(r, 'tenants'), `${c} scans cross-tenant`).toBe(CTX.tenantId);
      expect(r.predicates.find((p) => p.field === 'tenants')?.op).toBe('array-contains');
    }
    // sections is the one deliberate exception: bounded by a low-cardinality type
    // instead, so it needs no composite index; tenantScope trims the remainder.
    expect(valueOf(record('sections'), 'type')).toBe('people');
    expect(record('sections').predicates).toHaveLength(1);
  });

  // N3: the auth-log leg must not become an unbounded cross-tenant read.
  it('keeps the activities tenant leg outside the OR so one array-contains suffices', () => {
    const r = record('activities');
    expect(valueOf(r, 'tenants')).toBe(CTX.tenantId);
    expect(valueOf(r, 'author.key')).toBe(CTX.personKey);
    expect(valueOf(r, 'scope')).toBe('auth');
    expect(r.predicates.filter((p) => p.op === 'array-contains')).toHaveLength(1);
  });

  it('declares every scan row as inQuery so resolveDocs does not double-filter', () => {
    for (const c of ['groups', 'calevents', 'trips', 'transfers', 'applications', 'activities']) {
      const e = SUBJECT_DATA_MAP.find((x) => x.collection === c);
      expect(e?.tenantScope, `${c} bounds by tenant in the query but claims otherwise`).toBe('inQuery');
    }
  });

  it('reaches the subcollections by path, not by a field query', () => {
    const fcm = record('users/fcmTokens');
    expect(fcm.root).toBe('users');
    expect(fcm.path).toEqual([`doc:${CTX.uid}`, 'collection:fcmTokens']);

    const stats = record('stats_members');
    expect(stats.root).toBe('stats_members');
    expect(stats.path).toEqual([`doc:${CTX.personKey}`, 'collection:years']);
  });

  it('reaches esignAudit through a collection-group query', () => {
    const r = record('esignAudit');
    expect(r.kind).toBe('collectionGroup');
    expect(r.root).toBe('deletions');
  });

  it('targets the collection its row is named after', () => {
    // the four documented exceptions: two subcollections reached via a parent doc, and
    // the esignAudit collection group whose leaf name differs from the row name
    const exceptions: Record<string, string> = {
      'users/fcmTokens': 'users',
      stats_members: 'stats_members',
      esignAudit: 'deletions',
    };
    for (const e of SUBJECT_DATA_MAP) {
      const expected = exceptions[e.collection] ?? e.collection;
      expect(record(e.collection).root, `${e.collection} targets the wrong collection`).toBe(expected);
    }
  });
});
