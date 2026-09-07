import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  chunk, commitChunked, computeTransitions, nestedMenuKeys,
  planAddMenuRows, planEnableBlock, planRootMenuOp, planSelection, rootNavKeys,
} from './apply-feature-selection';
import type { PendingWrite, SelectionPlan } from './apply-feature-selection';
import type { FeatureBlock, FeatureRollout, MenuSpec } from '@okr/tenant-util';
import { AppConfigCollection, FeatureEventCollection, MenuItemCollection } from '@okr/shared-models';
import type { MenuItemModel } from '@okr/shared-models';

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

describe('computeTransitions', () => {
  it('reports newly enabled and newly disabled blocks, and nothing for the unchanged rest', () => {
    const transitions = computeTransitions(['a', 'b'], ['b', 'c']);
    expect(transitions).toEqual([
      { block: 'c', op: 'enable' },
      { block: 'a', op: 'disable' },
    ]);
  });

  it('reports nothing when the selection is unchanged (idempotent re-run)', () => {
    expect(computeTransitions(['a', 'b'], ['a', 'b'])).toEqual([]);
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
