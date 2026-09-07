import { describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  chunk, commitChunked, createApplyFeatureSelection, nestedMenuKeys,
  planAddMenuRows, planApplyCatalogueValue, planDisableBlock, planEnableBlock, planPinField,
  planRootMenuOp, planSelection, rootNavKeys,
} from './apply-feature-selection';
import type { PendingWrite, SelectionPlan } from './apply-feature-selection';
import type { FeatureBlock, FeatureRollout, MenuSpec } from '@okr/tenant-util';
import { AppConfigCollection, FeatureEventCollection, MenuItemCollection, UserCollection } from '@okr/shared-models';
import type { MenuItemModel } from '@okr/shared-models';

// `createApplyFeatureSelection`'s handler calls `getFirestore()` directly (it is the real
// Cloud Function entry point, not a plan-only helper), so the dispatch tests below mock the
// module and point it at a `FakeFirestore` per test via `dbRef.current` — the same in-memory
// stand-in every verb test above already uses, just reached through the callable instead of
// being passed in directly.
const dbRef = vi.hoisted(() => ({ current: undefined as unknown as Firestore }));
vi.mock('firebase-admin/firestore', () => ({ getFirestore: () => dbRef.current }));

const block = (id: string, over: Partial<FeatureBlock> = {}): FeatureBlock => ({
  id, bundle: 'special', label: `@f.${id}`, icon: 'help-circle',
  defaultAvailability: 'ga', dependsOn: [], menu: [], collections: [],
  ...over,
});

describe('planSelection', () => {
  const catalogue = [
    block('person'),
    block('calevent', { dependsOn: ['person'] }),
    block('chat', { defaultAvailability: 'internal' }),
  ];

  it('expands dependencies into the enabled set', () => {
    const plan = planSelection(catalogue, [], ['calevent'], 'p13');
    expect(plan.enabled.sort()).toEqual(['calevent', 'person']);
  });

  it('reports a withheld block instead of failing the whole call', () => {
    const plan = planSelection(catalogue, [], ['calevent', 'chat'], 'p13');
    expect(plan.enabled).not.toContain('chat');
    expect(plan.withheld).toEqual([{ id: 'chat', reason: '' }]);
  });

  it('carries the operator reason through to the caller', () => {
    const rollouts: FeatureRollout[] = [{
      okey: 'calevent', availability: 'disabled', allowTenants: [], denyTenants: [],
      reason: 'Bug OKR-42', updatedAt: '', updatedBy: '',
    }];
    const plan = planSelection(catalogue, rollouts, ['calevent'], 'p13');
    expect(plan.withheld).toEqual([{ id: 'calevent', reason: 'Bug OKR-42' }]);
  });

  it('drops an unknown block id silently', () => {
    expect(planSelection(catalogue, [], ['nope'], 'p13').enabled).toEqual([]);
  });
});


describe('rootNavKeys (task 12 review round 2 — only navigate/sub top-level specs belong in a tenant\'s root nav)', () => {
  const spec = (over: Partial<MenuSpec>): MenuSpec => ({
    key: 'x', name: 'x', url: '', action: 'navigate', roleNeeded: 'registered',
    icon: 'help-circle', label: '@x', ...over,
  });

  it('keeps a top-level navigate spec', () => {
    const b = catalogueBlock('a', [spec({ key: 'login', name: 'login', action: 'navigate' })]);
    expect(rootNavKeys([b])).toEqual(['login']);
  });

  it('keeps a top-level sub (shared-parent wrapper) spec', () => {
    const b = catalogueBlock('a', [spec({ key: 'cms-menu', name: 'cms-menu', action: 'sub' })]);
    expect(rootNavKeys([b])).toEqual(['cms-menu']);
  });

  it('drops a top-level context (context-menu wrapper) spec — it attaches via :contextMenuName, not the root nav', () => {
    const b = catalogueBlock('a', [spec({ key: 'c-icon', name: 'c-icon', action: 'context', url: '', label: '' })]);
    expect(rootNavKeys([b])).toEqual([]);
  });

  it('drops a top-level call spec — a toolbar action, not a navigable destination', () => {
    const b = catalogueBlock('a', [spec({ key: 'page-edit', name: 'page-edit', action: 'call', url: 'editPage' })]);
    expect(rootNavKeys([b])).toEqual([]);
  });

  it('drops a top-level toggle spec', () => {
    const b = catalogueBlock('a', [spec({ key: 'editmode-toggle', name: 'editmode-toggle', action: 'toggle', url: 'toggleEditMode' })]);
    expect(rootNavKeys([b])).toEqual([]);
  });

  it('does not recurse into children — a navigate child of a context wrapper never leaks into the root nav on its own', () => {
    const b = catalogueBlock('a', [spec({
      key: 'c-icon', name: 'c-icon', action: 'context', url: '', label: '',
      children: [spec({ key: 'icon-all', name: 'icon-all', action: 'navigate' })],
    })]);
    expect(rootNavKeys([b])).toEqual([]);
  });

  it('reproduces the reported failure shape: a bundle with mostly context/call top-level specs contributes only its navigate/sub ones', () => {
    // Mirrors task 12's `core` bundle pre-fix shape: 9 context wrappers + 1 stray
    // top-level call entry alongside 2 genuine navigate entries.
    const wrappers = Array.from({ length: 9 }, (_, i) =>
      spec({ key: `c-${i}`, name: `c-${i}`, action: 'context', url: '', label: '' }));
    const b = catalogueBlock('a', [
      spec({ key: 'login', name: 'login', action: 'navigate' }),
      spec({ key: 'logout', name: 'logout', action: 'navigate' }),
      spec({ key: 'page-edit', name: 'page-edit', action: 'call', url: 'editPage' }),
      ...wrappers,
    ]);
    expect(rootNavKeys([b])).toEqual(['login', 'logout']);
  });
});

describe('planRootMenuOp (root menu attachment — task-8 review round 2)', () => {
  const rootDoc = (over: Partial<MenuItemModel> = {}): MenuItemModel => ({
    okey: 'main_p13', name: 'main_p13', index: '', action: 'main', url: '',
    label: 'main', icon: '', tenants: ['p13'],
    menuItems: ['home', 'profile', 'logout', 'login', 'misc-menu', 'cms', 'version'],
    ...over,
  } as MenuItemModel);

  it('enabling a block appends its top-level key to an EXISTING root while preserving the other entries\' exact order', () => {
    const existing = new Map<string, MenuItemModel>([['main_p13', rootDoc()]]);

    const op = planRootMenuOp('p13', existing, ['aoc-menu']);

    expect(op?.key).toBe('main_p13');
    // every original entry survives, in the SAME order, with the new key appended LAST —
    // not reordered, not alphabetised, not inserted anywhere else.
    expect(op?.fields.menuItems).toEqual([
      'home', 'profile', 'logout', 'login', 'misc-menu', 'cms', 'version', 'aoc-menu',
    ]);
  });

  it('adding a key that is already present is a no-op (no duplicate, and no write at all if nothing else changed)', () => {
    const existing = new Map<string, MenuItemModel>([['main_p13', rootDoc()]]);

    const op = planRootMenuOp('p13', existing, ['cms']);

    expect(op).toBeUndefined();
  });

  it('re-running with the already-applied state is idempotent — no duplicate keys, no spurious write', () => {
    const existing = new Map<string, MenuItemModel>([['main_p13', rootDoc()]]);
    const firstRun = planRootMenuOp('p13', existing, ['aoc-menu']);
    expect(firstRun?.fields.menuItems).toEqual([
      'home', 'profile', 'logout', 'login', 'misc-menu', 'cms', 'version', 'aoc-menu',
    ]);

    // Simulate the write having landed, then re-run against the now-updated doc — the
    // same shape a verb re-fetches `existing` and recomputes from live state.
    const afterFirstRun = new Map<string, MenuItemModel>([
      ['main_p13', { ...rootDoc(), menuItems: firstRun!.fields.menuItems as string[] }],
    ]);
    const secondRun = planRootMenuOp('p13', afterFirstRun, ['aoc-menu']);

    expect(secondRun).toBeUndefined(); // converged — nothing left to write
  });

  it('a tenant with no root doc gets one created with tenants: [tenantId] and the enabled blocks\' keys', () => {
    const existing = new Map<string, MenuItemModel>(); // no main_p13 doc at all

    const op = planRootMenuOp('p13', existing, ['calevent-all', 'aoc-menu']);

    expect(op?.key).toBe('main_p13');
    expect(op?.op).toBe('create');
    // FULL field object, not a subset (review round 3, Minor 2) — checking only a few
    // fields is exactly how a missing `index` slipped past round 2's version of this test.
    expect(op?.fields).toEqual({
      okey: 'main_p13', name: 'main_p13', action: 'main', url: '', label: 'main', icon: '',
      description: '', tags: '', data: [], isArchived: false,
      index: 'n:main_p13 a:main k:main_p13',
      roleNeeded: 'none', tenants: ['p13'], menuItems: ['calevent-all', 'aoc-menu'],
    });
  });

  it('creates nothing for a brand-new tenant with nothing enabled yet', () => {
    const existing = new Map<string, MenuItemModel>();
    expect(planRootMenuOp('p13', existing, [])).toBeUndefined();
  });

  it('does NOT append a key the tenant already nested under a hand-made sub-menu (the scs duplicate-row bug)', () => {
    // Live shape, scs 2026-08: the admin curated `event-menu-scs` and put the calendar/task
    // entries inside it. Before the dedupe fix, `addKeys` (full desired set) saw them missing
    // from the ROOT array and appended them, so each rendered twice — and trimming the root
    // by hand did not stick, because the next run re-appended them.
    const existing = new Map<string, MenuItemModel>([
      ['main_p13', rootDoc({ menuItems: ['home', 'event-menu-scs', 'version'] })],
      ['event-menu-scs', {
        okey: 'event-menu-scs', name: 'event-menu-scs', action: 'sub',
        menuItems: ['calevent-all', 'task-all', 'task-my', 'invitation-all'],
      } as MenuItemModel],
    ]);

    const op = planRootMenuOp('p13', existing, ['calevent-all', 'task-all']);

    expect(op).toBeUndefined(); // nothing to attach — both are already reachable
  });

  it('still appends a genuinely new block key when a DIFFERENT key is nested', () => {
    const existing = new Map<string, MenuItemModel>([
      ['main_p13', rootDoc({ menuItems: ['home', 'event-menu-scs'] })],
      ['event-menu-scs', {
        okey: 'event-menu-scs', name: 'event-menu-scs', action: 'sub', menuItems: ['calevent-all'],
      } as MenuItemModel],
    ]);

    const op = planRootMenuOp('p13', existing, ['calevent-all', 'aoc-menu']);

    // `calevent-all` is nested and skipped; `aoc-menu` is reachable nowhere and is attached.
    expect(op?.fields.menuItems).toEqual(['home', 'event-menu-scs', 'aoc-menu']);
  });

  it('dedupes against nesting at any depth, not just one level down', () => {
    const existing = new Map<string, MenuItemModel>([
      ['main_p13', rootDoc({ menuItems: ['outer'] })],
      ['outer', { okey: 'outer', name: 'outer', action: 'sub', menuItems: ['inner'] } as MenuItemModel],
      ['inner', { okey: 'inner', name: 'inner', action: 'sub', menuItems: ['task-my'] } as MenuItemModel],
    ]);

    expect(planRootMenuOp('p13', existing, ['task-my'])).toBeUndefined();
  });

  it('a key removed from its nesting parent is attached at the root again on the next run', () => {
    // The nesting is what suppressed the append; take it away and the block must become
    // reachable again rather than silently dropping out of the navigation.
    const existing = new Map<string, MenuItemModel>([
      ['main_p13', rootDoc({ menuItems: ['home', 'event-menu-scs'] })],
      ['event-menu-scs', {
        okey: 'event-menu-scs', name: 'event-menu-scs', action: 'sub', menuItems: [],
      } as MenuItemModel],
    ]);

    const op = planRootMenuOp('p13', existing, ['calevent-all']);

    expect(op?.fields.menuItems).toEqual(['home', 'event-menu-scs', 'calevent-all']);
  });

  it('self-heals a root doc whose tenants[] ever drifted from exactly [tenantId], without touching menuItems', () => {
    const existing = new Map<string, MenuItemModel>([
      ['main_p13', rootDoc({ tenants: ['p13', 'stray-other-tenant'] })],
    ]);

    const op = planRootMenuOp('p13', existing, []);

    expect(op?.fields.tenants).toEqual(['p13']);
    expect(op?.fields.menuItems).toBeUndefined(); // array itself is unchanged, not rewritten
  });
});

describe('nestedMenuKeys', () => {
  it('returns keys below the root only — the root array itself is not "nested"', () => {
    const existing = new Map<string, MenuItemModel>([
      ['main_p13', { okey: 'main_p13', name: 'main_p13', menuItems: ['home', 'sub-a'] } as MenuItemModel],
      ['sub-a', { okey: 'sub-a', name: 'sub-a', menuItems: ['deep'] } as MenuItemModel],
    ]);

    const nested = nestedMenuKeys('main_p13', existing);

    expect([...nested]).toEqual(['deep']);
    expect(nested.has('home')).toBe(false);  // root-level, deduped by `kept` instead
    expect(nested.has('sub-a')).toBe(false);
  });

  it('terminates on a circular menu reference instead of looping forever', () => {
    // A → B → A is one bad save away in user-editable menu data; the renderer guards the
    // same shape via `isMenuBlocked`.
    const existing = new Map<string, MenuItemModel>([
      ['main_p13', { okey: 'main_p13', name: 'main_p13', menuItems: ['a'] } as MenuItemModel],
      ['a', { okey: 'a', name: 'a', menuItems: ['b'] } as MenuItemModel],
      ['b', { okey: 'b', name: 'b', menuItems: ['a'] } as MenuItemModel],
    ]);

    expect([...nestedMenuKeys('main_p13', existing)].sort()).toEqual(['a', 'b']);
  });

  it('is empty for a tenant with no root doc, and for a root whose children are all leaves', () => {
    expect(nestedMenuKeys('main_p13', new Map()).size).toBe(0);
    const leavesOnly = new Map<string, MenuItemModel>([
      ['main_p13', { okey: 'main_p13', name: 'main_p13', menuItems: ['home'] } as MenuItemModel],
      ['home', { okey: 'home', name: 'home' } as MenuItemModel],  // no menuItems field at all
    ]);
    expect(nestedMenuKeys('main_p13', leavesOnly).size).toBe(0);
  });
});

describe('chunk (BUG 2 — Firestore WriteBatch 500-op cap)', () => {
  it('splits into groups of the given size, with the remainder in the last group', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns nothing for an empty input', () => {
    expect(chunk([], 2)).toEqual([]);
  });

  it('produces exactly one group when everything fits', () => {
    expect(chunk([1, 2, 3], 400)).toEqual([[1, 2, 3]]);
  });
});

// ────────────────────────────────────────────────────────────────────────────────────
// A minimal in-memory stand-in for `firebase-admin/firestore`, just enough surface for
// `applySelection`/`commitChunked`: collection/doc refs backed by a shared Map, and a
// WriteBatch that applies `{merge}` semantics on `commit()`. Not a Firestore emulator —
// it exists to prove the CONTROL FLOW (which docs get written, how many commits happen,
// what state converges) without spinning up real Firestore.
// ────────────────────────────────────────────────────────────────────────────────────
class FakeDocSnap {
  constructor(public readonly id: string, private readonly _data: Record<string, unknown> | undefined) {}
  public get exists(): boolean { return this._data !== undefined; }
  public data(): Record<string, unknown> | undefined { return this._data; }
}

class FakeDocRef {
  constructor(
    private readonly store: Map<string, Map<string, Record<string, unknown>>>,
    public readonly collectionName: string,
    public readonly id: string,
  ) {}
  /** `DocumentReference.parent` — the planners key writes off `ref.parent.id`. */
  public get parent(): { id: string } { return { id: this.collectionName }; }
  public async get(): Promise<FakeDocSnap> {
    return new FakeDocSnap(this.id, this.store.get(this.collectionName)?.get(this.id));
  }
}

class FakeCollectionRef {
  private autoCounter = 0;
  constructor(private readonly store: Map<string, Map<string, Record<string, unknown>>>, public readonly name: string) {}
  public doc(id?: string): FakeDocRef {
    return new FakeDocRef(this.store, this.name, id ?? `auto-${this.name}-${this.autoCounter++}`);
  }
  public async get(): Promise<{ docs: FakeDocSnap[] }> {
    const coll = this.store.get(this.name) ?? new Map();
    return { docs: [...coll.entries()].map(([id, data]) => new FakeDocSnap(id, data)) };
  }
}

class FakeBatch {
  private readonly ops: { ref: FakeDocRef; data: Record<string, unknown>; merge: boolean }[] = [];
  constructor(private readonly store: Map<string, Map<string, Record<string, unknown>>>, private readonly commitLog: number[]) {}
  public set(ref: FakeDocRef, data: Record<string, unknown>, opts?: { merge?: boolean }): void {
    this.ops.push({ ref, data, merge: !!opts?.merge });
  }
  public async commit(): Promise<void> {
    this.commitLog.push(this.ops.length);
    for (const op of this.ops) {
      let coll = this.store.get(op.ref.collectionName);
      if (!coll) { coll = new Map(); this.store.set(op.ref.collectionName, coll); }
      const prev = coll.get(op.ref.id);
      coll.set(op.ref.id, op.merge && prev ? { ...prev, ...op.data } : { ...op.data });
    }
  }
}

class FakeFirestore {
  public readonly store = new Map<string, Map<string, Record<string, unknown>>>();
  public readonly commitLog: number[] = [];
  private readonly collections = new Map<string, FakeCollectionRef>();
  public collection(name: string): FakeCollectionRef {
    let c = this.collections.get(name);
    if (!c) { c = new FakeCollectionRef(this.store, name); this.collections.set(name, c); }
    return c;
  }
  public batch(): FakeBatch { return new FakeBatch(this.store, this.commitLog); }
  /** Snapshot of one collection's documents, keyed by doc id — for assertions. */
  public dump(name: string): Record<string, Record<string, unknown>> {
    return Object.fromEntries(this.store.get(name) ?? new Map());
  }
  public seed(name: string, id: string, data: Record<string, unknown>): void {
    let coll = this.store.get(name);
    if (!coll) { coll = new Map(); this.store.set(name, coll); }
    coll.set(id, data);
  }
}

describe('commitChunked (BUG 2 regression — actually crosses the batch boundary)', () => {
  it('commits everything in one batch when under the size cap', async () => {
    const fdb = new FakeFirestore();
    const writes: PendingWrite[] = Array.from({ length: 5 }, (_, i) => ({
      ref: fdb.collection('x').doc(`d${i}`) as unknown as FirebaseFirestore.DocumentReference,
      data: { n: i }, merge: false,
    }));
    await commitChunked(fdb as unknown as Firestore, writes);
    expect(fdb.commitLog).toEqual([5]);
    expect(Object.keys(fdb.dump('x'))).toHaveLength(5);
  });

  it('splits into multiple commits once the write count crosses BATCH_SIZE, and every write still lands', async () => {
    const fdb = new FakeFirestore();
    const total = 850; // > 2 × BATCH_SIZE(400) — exercises a partial last chunk too
    const writes: PendingWrite[] = Array.from({ length: total }, (_, i) => ({
      ref: fdb.collection('featureEvents').doc(`e${i}`) as unknown as FirebaseFirestore.DocumentReference,
      data: { n: i }, merge: false,
    }));
    await commitChunked(fdb as unknown as Firestore, writes);
    // 3 separate WriteBatch.commit() calls — proves chunking actually crosses the boundary,
    // not just that the helper compiles.
    expect(fdb.commitLog).toEqual([400, 400, 50]);
    expect(Object.keys(fdb.dump('featureEvents'))).toHaveLength(total);
  });

  it('merge:true chunks converge on re-run instead of duplicating (BUG 2 idempotency claim)', async () => {
    const fdb = new FakeFirestore();
    const writes: PendingWrite[] = [
      { ref: fdb.collection('menuItems').doc('shared-parent') as unknown as FirebaseFirestore.DocumentReference, data: { menuItems: ['childX'] }, merge: true },
    ];
    await commitChunked(fdb as unknown as Firestore, writes);
    await commitChunked(fdb as unknown as Firestore, writes); // simulates a retry after a partial failure
    expect(fdb.dump('menuItems')['shared-parent']).toEqual({ menuItems: ['childX'] });
  });
});

const catalogueBlock = (id: string, menu: MenuSpec[]): FeatureBlock => ({
  id, bundle: 'special', label: `@f.${id}`, icon: 'help-circle', defaultAvailability: 'ga',
  dependsOn: [], collections: [], menu,
});

// ─────────────────────────────────────────────────────────────────────────────────────
// THE VERBS (spec §19). `menuKeys` is a whitelist, an existing document is only ever
// extended, and nothing is derived from a checkbox nobody ticked.
// ─────────────────────────────────────────────────────────────────────────────────────

/** Seed a `FakeFirestore` from a plain `{collection: [{id, ...fields}]}` literal. */
const fakeDb = (seed: Record<string, Record<string, unknown>[]>): FakeFirestore => {
  const fdb = new FakeFirestore();
  for (const [collection, docs] of Object.entries(seed)) {
    for (const { id, ...data } of docs) fdb.seed(collection, id as string, data);
  }
  return fdb;
};

/** Terse `MenuSpec` factory — every field the type demands, only the interesting ones named. */
const menuSpec = (over: Partial<MenuSpec> & { key: string }): MenuSpec => ({
  name: over.key, url: `/${over.key}`, action: 'navigate', roleNeeded: 'member',
  icon: 'help-circle', label: `@main.${over.key}`, ...over,
});

const TEST_CATALOGUE: FeatureBlock[] = [
  block('person', {
    menu: [{
      key: 'person-all', name: 'person-all', url: '/person/all', action: 'navigate',
      roleNeeded: 'member', icon: 'people', label: '@main.person.all',
    }],
  }),
  block('calevent', {
    dependsOn: ['person'],
    menu: [
      {
        key: 'calevent-all', name: 'calevent-all', url: '/calevent/all', action: 'navigate',
        roleNeeded: 'member', icon: 'calendar', label: '@main.calevent.all',
      },
      {
        key: 'calevent-exportics', name: 'calevent-exportics', url: 'exportIcs', action: 'call',
        roleNeeded: 'member', icon: 'download', label: '@main.calevent.exportics',
      },
    ],
  }),
  // A block whose menu is genuinely NESTED — the real catalogue's shape, and the only way
  // the whitelist's recursion into `children` is under test at all.
  //   aoc-menu (sub)
  //    ├─ user-menu (sub)
  //    │   ├─ user-all
  //    │   └─ user-new
  //    └─ priv-audit
  block('aoc', {
    menu: [menuSpec({
      key: 'aoc-menu', url: '', action: 'sub',
      children: [
        menuSpec({
          key: 'user-menu', url: '', action: 'sub',
          children: [menuSpec({ key: 'user-all' }), menuSpec({ key: 'user-new' })],
        }),
        menuSpec({ key: 'priv-audit' }),
      ],
    })],
  }),
  // CO-DECLARES `aoc-menu` (a shared parent, exactly like the live `aoc`/`user`/`security`
  // trio) with a child of its own.
  block('security', {
    menu: [menuSpec({
      key: 'aoc-menu', url: '', action: 'sub',
      children: [menuSpec({ key: 'priv-register' })],
    })],
  }),
  // TWO top-level specs pointing at the SAME parent key — the shared-parent fold. Planning
  // both against one stale snapshot keeps only the last child.
  block('shared', {
    menu: [
      menuSpec({ key: 'shared-menu', url: '', action: 'sub', children: [menuSpec({ key: 'shared-a' })] }),
      menuSpec({ key: 'shared-menu', url: '', action: 'sub', children: [menuSpec({ key: 'shared-b' })] }),
    ],
  }),
  // Rollout fodder: an `internal` block nothing may switch on for an ordinary tenant.
  block('labs', { defaultAvailability: 'internal', menu: [menuSpec({ key: 'labs-all' })] }),
];

const run = (fdb: FakeFirestore): Firestore => fdb as unknown as Firestore;

describe('planEnableBlock', () => {
  it('writes only the ticked rows', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    const { writes, preview } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'calevent', ['calevent-all']);

    const menuDocs = writes.filter(w => w.ref.parent.id === 'menuItems').map(w => w.ref.id);
    expect(menuDocs).toContain('calevent-all');
    expect(menuDocs).not.toContain('calevent-exportics');
    expect(preview.entries.some(e => e.kind === 'menu-created' && e.subject === 'calevent-all'))
      .toBe(true);
  });

  it('does not write a dependency block\'s rows either — only the ticked keys', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    const { writes } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'calevent', ['calevent-all']);

    expect(writes.map(w => w.ref.id)).not.toContain('person-all');
  });

  it('enables the block but creates no document when no row is ticked', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    const { writes, preview } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'calevent', []);

    expect(writes.filter(w => w.ref.parent.id === 'menuItems')).toHaveLength(0);
    expect(writes.some(w => w.ref.parent.id === 'app-config')).toBe(true);
    expect(preview.entries.some(e => e.kind === 'block-enabled')).toBe(true);
  });

  it('adds the block to enabledFeatures instead of replacing the set', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: ['person'] }] });
    const { writes } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'calevent', []);

    const config = writes.find(w => w.ref.parent.id === 'app-config');
    expect((config?.data['enabledFeatures'] as string[]).sort()).toEqual(['calevent', 'person']);
  });

  it('reports the dependency closure with a reason', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    const { preview } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'calevent', []);

    expect(preview.alsoEnabled).toContainEqual({ id: 'person', because: 'calevent' });
  });

  it('never overwrites a field of an existing document', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'calevent-all', name: 'calevent-all', url: '/OLD',
                    action: 'navigate', roleNeeded: 'member', tenants: ['p13'], isArchived: false }],
      'app-config': [{ id: 'scs', enabledFeatures: [] }],
    });
    const { writes } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'calevent', ['calevent-all']);

    const doc = writes.find(w => w.ref.id === 'calevent-all');
    expect(Object.keys(doc?.data ?? {}).sort()).toEqual(['tenants']);
  });

  it('writes to the REAL doc id when a live document carries a legacy autoid', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'ht5rxxw8d7ekvwset8kw', name: 'calevent-all', url: '/calevent/all',
                    action: 'navigate', roleNeeded: 'member', tenants: ['p13'], isArchived: false }],
      'app-config': [{ id: 'scs', enabledFeatures: [] }],
    });
    const { writes } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'calevent', ['calevent-all']);

    const menuDocs = writes.filter(w => w.ref.parent.id === 'menuItems').map(w => w.ref.id);
    expect(menuDocs).toContain('ht5rxxw8d7ekvwset8kw');
    expect(menuDocs).not.toContain('calevent-all'); // no duplicate under the name
  });

  it('refuses when a name this run writes cannot be resolved to a single document', async () => {
    const db = fakeDb({
      menuItems: [
        { id: 'a', name: 'calevent-all', tenants: ['other'], isArchived: false },
        { id: 'b', name: 'calevent-all', tenants: ['third'], isArchived: false },
      ],
      'app-config': [{ id: 'scs', enabledFeatures: [] }],
    });
    await expect(planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'calevent', ['calevent-all']))
      .rejects.toThrow(/cannot be resolved/);
  });

  it('an ambiguous name this run does NOT write no longer blocks the call', async () => {
    const db = fakeDb({
      menuItems: [
        { id: 'a', name: 'event-menu', tenants: ['other'], isArchived: false },
        { id: 'b', name: 'event-menu', tenants: ['third'], isArchived: false },
      ],
      'app-config': [{ id: 'scs', enabledFeatures: [] }],
    });
    const { writes } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'calevent', ['calevent-all']);
    expect(writes.map(w => w.ref.id)).toContain('calevent-all');
  });

  it('rejects an unknown block id', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    await expect(planEnableBlock(run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'nope', []))
      .rejects.toThrow(/Unknown block/);
  });
});

describe('planAddMenuRows', () => {
  it('attaches a row of an already-enabled block and records a menu-add event', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'main_scs', name: 'main_scs', tenants: ['scs'],
                    menuItems: ['help'], isArchived: false }],
      'app-config': [{ id: 'scs', enabledFeatures: ['calevent'] }],
    });
    const { writes, preview } = await planAddMenuRows(
      run(db), TEST_CATALOGUE, 'scs', 'uid1', ['calevent-all']);

    const root = writes.find(w => w.ref.id === 'main_scs');
    expect(root?.data['menuItems']).toEqual(['help', 'calevent-all']);
    expect(writes.some(w => w.ref.parent.id === 'featureEvents' && w.data['op'] === 'menu-add'))
      .toBe(true);
    expect(preview.entries.some(e => e.kind === 'menu-attached')).toBe(true);
  });

  it('writes no app-config document — a row never switches a block on', async () => {
    const db = fakeDb({
      menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: ['calevent'] }],
    });
    const { writes } = await planAddMenuRows(
      run(db), TEST_CATALOGUE, 'scs', 'uid1', ['calevent-all']);
    expect(writes.some(w => w.ref.parent.id === 'app-config')).toBe(false);
  });

  it('refuses a key that belongs to no enabled block', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    await expect(planAddMenuRows(run(db), TEST_CATALOGUE, 'scs', 'uid1', ['calevent-all']))
      .rejects.toThrow(/nicht aktiviert|not enabled/);
  });

  it('refuses a key no catalogue block declares', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: ['calevent'] }] });
    await expect(planAddMenuRows(run(db), TEST_CATALOGUE, 'scs', 'uid1', ['made-up']))
      .rejects.toThrow(/no catalogue block/);
  });

  it('plans nothing at all for an empty key list', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: ['calevent'] }] });
    const { writes, preview } = await planAddMenuRows(run(db), TEST_CATALOGUE, 'scs', 'uid1', []);
    expect(writes).toEqual([]);
    expect(preview).toEqual({ entries: [], alsoEnabled: [], withheld: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Review round 1 — the four Important findings.
// ─────────────────────────────────────────────────────────────────────────────────────

describe('planEnableBlock — a withheld block is reported, never written (Important 1)', () => {
  it('plans nothing at all for a block the rollout withholds', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    const { writes, preview } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'labs', ['labs-all']);

    expect(writes.filter(w => w.ref.parent.id === 'menuItems')).toHaveLength(0);
    expect(writes.filter(w => w.ref.parent.id === 'featureEvents')).toHaveLength(0);
    // `enabledFeatures` is rewritten, but with the block still absent — nothing changed.
    const config = writes.find(w => w.ref.parent.id === 'app-config');
    expect(config?.data['enabledFeatures']).not.toContain('labs');

    expect(preview.entries.some(e => e.kind === 'block-withheld' && e.subject === 'labs')).toBe(true);
    expect(preview.entries.some(e => e.kind === 'block-enabled' && e.subject === 'labs')).toBe(false);
    expect(preview.withheld.map(w => w.id)).toContain('labs');
  });

  it('does not write a withheld block that only appears in the dependency closure', async () => {
    const catalogue = [
      ...TEST_CATALOGUE,
      block('report', { dependsOn: ['labs'], menu: [menuSpec({ key: 'report-all' })] }),
    ];
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    const { writes, preview } = await planEnableBlock(
      run(db), catalogue, [], 'scs', 'uid1', 'report', ['report-all', 'labs-all']);

    const menuDocs = writes.filter(w => w.ref.parent.id === 'menuItems').map(w => w.ref.id);
    expect(menuDocs).toContain('report-all');
    expect(menuDocs).not.toContain('labs-all');
    expect(writes.filter(w => w.ref.parent.id === 'featureEvents').map(w => w.data['block']))
      .toEqual(['report']);
    expect(preview.alsoEnabled.map(a => a.id)).not.toContain('labs');
  });
});

describe('planEnableBlock — the whitelist recurses (Important 4a)', () => {
  it('writes a ticked grandchild and never its unticked sibling, at any depth', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    const { writes } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'aoc',
      ['aoc-menu', 'user-menu', 'user-all']);

    const menuDocs = writes.filter(w => w.ref.parent.id === 'menuItems').map(w => w.ref.id);
    expect(menuDocs).toContain('aoc-menu');
    expect(menuDocs).toContain('user-menu');
    expect(menuDocs).toContain('user-all');
    expect(menuDocs).not.toContain('user-new');  // sibling of a ticked grandchild
    expect(menuDocs).not.toContain('priv-audit'); // unticked child of a ticked parent

    // …and the unticked ones are not smuggled in through a parent's `menuItems` either.
    const userMenu = writes.find(w => w.ref.id === 'user-menu');
    expect(userMenu?.data['menuItems']).toEqual(['user-all']);
    const aocMenu = writes.find(w => w.ref.id === 'aoc-menu');
    expect(aocMenu?.data['menuItems']).toEqual(['user-menu']);
  });

  it('writes nothing below a parent that was ticked alone', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    const { writes } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'aoc', ['aoc-menu']);

    const menuDocs = writes.filter(w => w.ref.parent.id === 'menuItems').map(w => w.ref.id);
    expect(menuDocs).toEqual(['aoc-menu', 'main_scs']);
    expect(writes.find(w => w.ref.id === 'aoc-menu')?.data['menuItems']).toEqual([]);
  });
});

describe('planEnableBlock — shared parent fold (Important 4b)', () => {
  it('keeps BOTH children when two top-level specs append to the same EXISTING parent', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'shared-menu', name: 'shared-menu', action: 'sub', url: '',
                    roleNeeded: 'member', tenants: ['scs'], menuItems: [], isArchived: false }],
      'app-config': [{ id: 'scs', enabledFeatures: [] }],
    });
    const { writes } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'shared',
      ['shared-menu', 'shared-a', 'shared-b']);

    // The LAST write to the parent is what Firestore keeps (merge:true, same doc) — planning
    // both specs against the same stale snapshot would leave only ['shared-b'].
    const parentWrites = writes.filter(w => w.ref.id === 'shared-menu');
    expect(parentWrites.at(-1)?.data['menuItems']).toEqual(['shared-a', 'shared-b']);
  });

  it('keeps both children when the parent is CREATED in the same call', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    const { writes } = await planEnableBlock(
      run(db), TEST_CATALOGUE, [], 'scs', 'uid1', 'shared',
      ['shared-menu', 'shared-a', 'shared-b']);

    const parentWrites = writes.filter(w => w.ref.id === 'shared-menu');
    expect(parentWrites.at(-1)?.data['menuItems']).toEqual(['shared-a', 'shared-b']);
  });
});

describe('planAddMenuRows — nested rows (Important 2)', () => {
  /** A tenant that already has the `aoc-menu` subtree in its main menu. */
  const withAocTree = (over: Record<string, unknown> = {}) => fakeDb({
    menuItems: [
      { id: 'main_scs', name: 'main_scs', tenants: ['scs'], menuItems: ['aoc-menu'], isArchived: false },
      { id: 'aoc-menu', name: 'aoc-menu', action: 'sub', url: '', roleNeeded: 'member',
        tenants: ['scs'], menuItems: ['priv-audit'], isArchived: false, ...over },
      { id: 'priv-audit', name: 'priv-audit', action: 'navigate', url: '/priv-audit',
        roleNeeded: 'member', tenants: ['scs'], menuItems: [], isArchived: false },
    ],
    'app-config': [{ id: 'scs', enabledFeatures: ['aoc'] }],
  });

  it('attaches a nested row to its catalogue parent, not to the root', async () => {
    const db = withAocTree();
    const { writes, preview } = await planAddMenuRows(
      run(db), TEST_CATALOGUE, 'scs', 'uid1', ['user-menu']);

    expect(writes.map(w => w.ref.id)).toContain('user-menu');       // the row itself
    expect(writes.find(w => w.ref.id === 'aoc-menu')?.data['menuItems'])
      .toEqual(['priv-audit', 'user-menu']);                        // appended to the parent
    expect(writes.some(w => w.ref.id === 'main_scs')).toBe(false);  // NOT dumped at the root
    expect(writes.some(w => w.ref.parent.id === 'featureEvents' && w.data['name'] === 'user-menu'))
      .toBe(true);
    expect(preview.entries.some(e => e.kind === 'menu-created' && e.subject === 'user-menu'))
      .toBe(true);
  });

  it('takes the requested descendants of a nested row along, and only those', async () => {
    const db = withAocTree();
    const { writes } = await planAddMenuRows(
      run(db), TEST_CATALOGUE, 'scs', 'uid1', ['user-menu', 'user-new']);

    const menuDocs = writes.filter(w => w.ref.parent.id === 'menuItems').map(w => w.ref.id);
    expect(menuDocs).toContain('user-new');
    expect(menuDocs).not.toContain('user-all');
    expect(writes.find(w => w.ref.id === 'user-menu')?.data['menuItems']).toEqual(['user-new']);
  });

  it('falls back to the root when this tenant does not have the catalogue parent', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'main_scs', name: 'main_scs', tenants: ['scs'],
                    menuItems: ['help'], isArchived: false }],
      'app-config': [{ id: 'scs', enabledFeatures: ['aoc'] }],
    });
    const { writes } = await planAddMenuRows(
      run(db), TEST_CATALOGUE, 'scs', 'uid1', ['user-menu']);

    expect(writes.find(w => w.ref.id === 'main_scs')?.data['menuItems'])
      .toEqual(['help', 'user-menu']);
  });

  it('writes NO event when the row changed nothing at all', async () => {
    const db = withAocTree();
    const { writes, preview } = await planAddMenuRows(
      run(db), TEST_CATALOGUE, 'scs', 'uid1', ['priv-audit']);

    expect(writes).toEqual([]);
    expect(preview.entries).toEqual([]);
  });
});

describe('planAddMenuRows — ANY owner of a shared key may unlock it (Important 3)', () => {
  it('accepts a key co-declared by two blocks when only the second one is enabled', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'main_scs', name: 'main_scs', tenants: ['scs'],
                    menuItems: [], isArchived: false }],
      // `aoc` is OFF, `security` is ON — both declare `aoc-menu`.
      'app-config': [{ id: 'scs', enabledFeatures: ['security'] }],
    });
    const { writes } = await planAddMenuRows(
      run(db), TEST_CATALOGUE, 'scs', 'uid1', ['aoc-menu']);

    expect(writes.map(w => w.ref.id)).toContain('aoc-menu');
    expect(writes.find(w => w.ref.id === 'main_scs')?.data['menuItems']).toEqual(['aoc-menu']);
  });

  it('still refuses when NO declaring block is enabled', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    await expect(planAddMenuRows(run(db), TEST_CATALOGUE, 'scs', 'uid1', ['aoc-menu']))
      .rejects.toThrow(/nicht aktiviert/);
  });
});

describe('planDisableBlock', () => {
  it('changes enabledFeatures and touches no menu document', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'main_scs', name: 'main_scs', tenants: ['scs'],
                    menuItems: ['calevent-all'], isArchived: false }],
      'app-config': [{ id: 'scs', enabledFeatures: ['calevent', 'person'] }],
    });
    const { writes, preview } = await planDisableBlock(run(db), TEST_CATALOGUE, 'scs', 'uid1', 'calevent');

    expect(writes.filter(w => w.ref.parent.id === 'menuItems')).toHaveLength(0);
    expect(writes.find(w => w.ref.parent.id === 'app-config')?.data['enabledFeatures'])
      .toEqual(['person']);
    expect(preview.entries.some(e => e.kind === 'block-disabled')).toBe(true);
  });

  it('writes nothing when the block is already disabled', async () => {
    const db = fakeDb({
      menuItems: [],
      'app-config': [{ id: 'scs', enabledFeatures: ['person'] }],
    });
    const { writes, preview } = await planDisableBlock(run(db), TEST_CATALOGUE, 'scs', 'uid1', 'calevent');
    expect(writes).toEqual([]);
    expect(preview.entries).toEqual([]);
  });
});

describe('planApplyCatalogueValue', () => {
  it('writes exactly one field of one document and records from/to', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'calevent-all', name: 'calevent-all', url: '/OLD', action: 'navigate',
                    roleNeeded: 'admin', tenants: ['scs'], isArchived: false }],
      'app-config': [{ id: 'scs', enabledFeatures: ['calevent'] }],
    });
    const { writes, preview } = await planApplyCatalogueValue(
      run(db), TEST_CATALOGUE, 'scs', 'uid1', 'calevent-all', 'roleNeeded');

    const doc = writes.find(w => w.ref.id === 'calevent-all');
    expect(doc?.data).toEqual({ roleNeeded: 'member' });
    const event = writes.find(w => w.ref.parent.id === 'featureEvents');
    expect(event?.data).toMatchObject({ op: 'catalogue-apply', field: 'roleNeeded', from: 'admin', to: 'member' });
    expect(preview.entries[0]).toMatchObject({ kind: 'field-overwritten', field: 'roleNeeded' });
  });

  it('refuses a pinned field', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'calevent-all', name: 'calevent-all', url: '/calevent/all',
                    action: 'navigate', roleNeeded: 'admin', tenants: ['scs'],
                    isArchived: false, ownedFields: ['roleNeeded'] }],
      'app-config': [{ id: 'scs', enabledFeatures: ['calevent'] }],
    });
    await expect(planApplyCatalogueValue(run(db), TEST_CATALOGUE, 'scs', 'uid1', 'calevent-all', 'roleNeeded'))
      .rejects.toThrow(/fixiert/);
  });

  it('refuses when the live value already equals the catalogue value', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'calevent-all', name: 'calevent-all', url: '/calevent/all',
                    action: 'navigate', roleNeeded: 'member', tenants: ['scs'], isArchived: false }],
      'app-config': [{ id: 'scs', enabledFeatures: ['calevent'] }],
    });
    await expect(planApplyCatalogueValue(run(db), TEST_CATALOGUE, 'scs', 'uid1', 'calevent-all', 'roleNeeded'))
      .rejects.toThrow(/nichts zu übernehmen/);
  });

  it('throws not-found for an unknown document id', async () => {
    const db = fakeDb({ menuItems: [], 'app-config': [{ id: 'scs', enabledFeatures: [] }] });
    await expect(planApplyCatalogueValue(run(db), TEST_CATALOGUE, 'scs', 'uid1', 'nope', 'roleNeeded'))
      .rejects.toThrow(/nicht gefunden/);
  });
});

describe('planPinField', () => {
  it('adds a pin without touching the value', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'calevent-all', name: 'calevent-all', url: '/calevent/all',
                    action: 'navigate', roleNeeded: 'member', tenants: ['scs'], isArchived: false }],
      'app-config': [{ id: 'scs', enabledFeatures: ['calevent'] }],
    });
    const pinned = await planPinField(run(db), TEST_CATALOGUE, 'scs', 'uid1', 'calevent-all', 'roleNeeded', true);
    expect(pinned.writes.find(w => w.ref.id === 'calevent-all')?.data)
      .toEqual({ ownedFields: ['roleNeeded'] });
    const event = pinned.writes.find(w => w.ref.parent.id === 'featureEvents');
    expect(event?.data).toMatchObject({ op: 'pin', block: 'calevent', docId: 'calevent-all', field: 'roleNeeded' });
  });

  it('removes an existing pin without touching the value', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'calevent-all', name: 'calevent-all', url: '/calevent/all',
                    action: 'navigate', roleNeeded: 'member', tenants: ['scs'], isArchived: false,
                    ownedFields: ['roleNeeded'] }],
      'app-config': [{ id: 'scs', enabledFeatures: ['calevent'] }],
    });
    const released = await planPinField(run(db), TEST_CATALOGUE, 'scs', 'uid1', 'calevent-all', 'roleNeeded', false);
    expect(released.writes.find(w => w.ref.id === 'calevent-all')?.data)
      .toEqual({ ownedFields: [] });
    const event = released.writes.find(w => w.ref.parent.id === 'featureEvents');
    expect(event?.data).toMatchObject({ op: 'unpin', block: 'calevent', docId: 'calevent-all', field: 'roleNeeded' });
  });

  it('writes nothing when the field is already in the requested pin state', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'calevent-all', name: 'calevent-all', url: '/calevent/all',
                    action: 'navigate', roleNeeded: 'member', tenants: ['scs'], isArchived: false }],
      'app-config': [{ id: 'scs', enabledFeatures: ['calevent'] }],
    });
    const { writes, preview } = await planPinField(run(db), TEST_CATALOGUE, 'scs', 'uid1', 'calevent-all', 'roleNeeded', false);
    expect(writes).toEqual([]);
    expect(preview.entries).toEqual([]);
  });

  it('writes nothing when the field is already pinned and pinning is requested again', async () => {
    const db = fakeDb({
      menuItems: [{ id: 'calevent-all', name: 'calevent-all', url: '/calevent/all',
                    action: 'navigate', roleNeeded: 'member', tenants: ['scs'], isArchived: false,
                    ownedFields: ['roleNeeded'] }],
      'app-config': [{ id: 'scs', enabledFeatures: ['calevent'] }],
    });
    const { writes, preview } = await planPinField(run(db), TEST_CATALOGUE, 'scs', 'uid1', 'calevent-all', 'roleNeeded', true);
    expect(writes).toEqual([]);
    expect(preview.entries).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// The onCall handler: dispatch to the right verb, `dryRun`, and field validation. The
// authorisation block itself (App Check / auth / admin-of-this-tenant) is exercised only far
// enough to prove it is still wired — its own behaviour is unchanged from before this task.
// ─────────────────────────────────────────────────────────────────────────────────────
describe('applyFeatureSelection dispatch', () => {
  const UID = 'admin-uid';

  /** A tenant with an admin (`UID`) who belongs to `callerTenants` (defaults to `[tenantId]`). */
  const seedFor = (tenantId: string, callerTenants: string[] = [tenantId]): FakeFirestore => fakeDb({
    menuItems: [],
    'app-config': [{ id: tenantId, enabledFeatures: [] }],
    users: [{ id: UID, roles: { admin: true }, tenants: callerTenants }],
  });

  it('rejects an unknown verb', async () => {
    const fdb = seedFor('scs');
    dbRef.current = run(fdb);
    const fn = createApplyFeatureSelection(TEST_CATALOGUE);
    await expect(fn.run({ app: {}, auth: { uid: UID }, data: { tenantId: 'scs', intent: { verb: 'nope' } } } as never))
      .rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('rejects a field that is not structural', async () => {
    const fdb = seedFor('scs');
    dbRef.current = run(fdb);
    const fn = createApplyFeatureSelection(TEST_CATALOGUE);
    await expect(fn.run({
      app: {}, auth: { uid: UID },
      data: { tenantId: 'scs', intent: { verb: 'pinField', docId: 'x', field: 'label' } },
    } as never)).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('dry run returns the same preview and writes nothing', async () => {
    const fdb = seedFor('scs');
    dbRef.current = run(fdb);
    const fn = createApplyFeatureSelection(TEST_CATALOGUE);

    const dry = await fn.run({
      app: {}, auth: { uid: UID },
      data: {
        tenantId: 'scs',
        intent: { verb: 'enableBlock', blockId: 'calevent', menuKeys: ['calevent-all'] },
        dryRun: true,
      },
    } as never);
    expect(dry.applied).toBe(false);
    expect(fdb.commitLog).toHaveLength(0);

    const real = await fn.run({
      app: {}, auth: { uid: UID },
      data: {
        tenantId: 'scs',
        intent: { verb: 'enableBlock', blockId: 'calevent', menuKeys: ['calevent-all'] },
      },
    } as never);
    expect(real.applied).toBe(true);
    expect(real.preview).toEqual(dry.preview);
  });

  it('still refuses a caller who is not an admin of this tenant', async () => {
    const fdb = seedFor('p13', ['scs']);
    dbRef.current = run(fdb);
    const fn = createApplyFeatureSelection(TEST_CATALOGUE);
    await expect(fn.run({
      app: {}, auth: { uid: UID },
      data: { tenantId: 'p13', intent: { verb: 'disableBlock', blockId: 'calevent' } },
    } as never)).rejects.toMatchObject({ code: 'permission-denied' });
  });
});
