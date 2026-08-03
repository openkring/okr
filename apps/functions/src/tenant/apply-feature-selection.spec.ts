import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  applySelection, chunk, commitChunked, computeTransitions,
  planMenuOpsForBlocks, planRootMenuOp, planSelection, rootNavKeys,
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

const menuItem = (over: Partial<MenuItemModel> = {}): MenuItemModel => ({
  okey: 'parent', name: 'parent', index: '', action: 'sub', url: '', label: 'Parent',
  icon: 'help-circle', tenants: ['p13'], menuItems: [], ...over,
} as MenuItemModel);

describe('planMenuOpsForBlocks (BUG 1 regression — shared parent menu docs)', () => {
  const childSpec = (key: string): MenuSpec => ({
    key, name: key, url: `/x/${key}`, action: 'navigate', roleNeeded: 'registered',
    icon: 'help-circle', label: `@x.${key}`,
  });

  it('does not lose a sibling block\'s child when two blocks append to the same EXISTING parent', () => {
    const parentSpec = (child: string): MenuSpec => ({
      key: 'shared-parent', name: 'shared-parent', url: '', action: 'sub',
      roleNeeded: 'registered', icon: 'help-circle', label: '@shared',
      children: [childSpec(child)],
    });
    const blockA: FeatureBlock = {
      id: 'a', bundle: 'special', label: '@f.a', icon: 'help-circle', defaultAvailability: 'ga',
      dependsOn: [], collections: [], menu: [parentSpec('childX')],
    };
    const blockB: FeatureBlock = {
      id: 'b', bundle: 'special', label: '@f.b', icon: 'help-circle', defaultAvailability: 'ga',
      dependsOn: [], collections: [], menu: [parentSpec('childY')],
    };
    // The parent doc already exists in Firestore, with neither child yet.
    const existing = new Map<string, MenuItemModel>([
      ['shared-parent', menuItem({ okey: 'shared-parent', name: 'shared-parent', menuItems: [] })],
    ]);

    const ops = planMenuOpsForBlocks([blockA, blockB], 'p13', existing);

    // Exactly ONE op for the shared parent (folded, not last-write-wins duplicates).
    const parentOps = ops.filter(o => o.key === 'shared-parent');
    expect(parentOps).toHaveLength(1);
    // Naive planning (planMenuOps called twice against the SAME stale snapshot) would
    // produce ['childX'] and ['childY'] as two competing writes — the last batch.set()
    // wins and the other child is silently lost. The fix must carry BOTH.
    expect(parentOps[0].fields.menuItems).toEqual(['childX', 'childY']);
  });

  it('does not lose a sibling block\'s child when the parent is CREATED by the first block', () => {
    const parentSpec = (child: string): MenuSpec => ({
      key: 'new-parent', name: 'new-parent', url: '', action: 'sub',
      roleNeeded: 'registered', icon: 'help-circle', label: '@new',
      children: [childSpec(child)],
    });
    const blockA: FeatureBlock = {
      id: 'a', bundle: 'special', label: '@f.a', icon: 'help-circle', defaultAvailability: 'ga',
      dependsOn: [], collections: [], menu: [parentSpec('childX')],
    };
    const blockB: FeatureBlock = {
      id: 'b', bundle: 'special', label: '@f.b', icon: 'help-circle', defaultAvailability: 'ga',
      dependsOn: [], collections: [], menu: [parentSpec('childY')],
    };
    const existing = new Map<string, MenuItemModel>(); // parent does not exist yet

    const ops = planMenuOpsForBlocks([blockA, blockB], 'p13', existing);

    const parentOps = ops.filter(o => o.key === 'new-parent');
    expect(parentOps).toHaveLength(1);
    expect(parentOps[0].fields.menuItems).toEqual(['childX', 'childY']);
  });

  it('does not lose a child when ONE block\'s own menu has two top-level specs sharing a parent (review fix round 1, minor 3)', () => {
    // Regression for a bug the reviewer proved by hand: `planMenuOps(block.menu, …)` used
    // to be called once per BLOCK, passing the whole `menu` array in one shot. Since
    // `planMenuOps` fully evaluates against a single snapshot of `existing` before the
    // caller gets to fold anything back, two top-level entries in the SAME block's `menu`
    // that reference the same parent key were still computed against the same stale
    // snapshot as each other — the inter-BLOCK fold never got a chance to run between
    // them. `menu: [parent('childX'), parent('childY')]` on one block used to yield
    // `menuItems: ['childY']` only. The fix folds per top-level SPEC, not per block.
    const parentSpec = (child: string): MenuSpec => ({
      key: 'shared-parent', name: 'shared-parent', url: '', action: 'sub',
      roleNeeded: 'registered', icon: 'help-circle', label: '@shared',
      children: [childSpec(child)],
    });
    const oneBlockTwoTopLevelSpecs: FeatureBlock = {
      id: 'a', bundle: 'special', label: '@f.a', icon: 'help-circle', defaultAvailability: 'ga',
      dependsOn: [], collections: [],
      menu: [parentSpec('childX'), parentSpec('childY')],
    };
    const existing = new Map<string, MenuItemModel>(); // parent does not exist yet

    const ops = planMenuOpsForBlocks([oneBlockTwoTopLevelSpecs], 'p13', existing);

    const parentOps = ops.filter(o => o.key === 'shared-parent');
    expect(parentOps).toHaveLength(1);
    expect(parentOps[0].fields.menuItems).toEqual(['childX', 'childY']);
  });

  it('records \'create\' for a brand-new key even though the SECOND touch (folded existing) reports update-structure (minor 4)', () => {
    const parentSpec = (child: string): MenuSpec => ({
      key: 'new-parent', name: 'new-parent', url: '', action: 'sub',
      roleNeeded: 'registered', icon: 'help-circle', label: '@new',
      children: [childSpec(child)],
    });
    const oneBlockTwoTopLevelSpecs: FeatureBlock = {
      id: 'a', bundle: 'special', label: '@f.a', icon: 'help-circle', defaultAvailability: 'ga',
      dependsOn: [], collections: [],
      menu: [parentSpec('childX'), parentSpec('childY')],
    };
    const existing = new Map<string, MenuItemModel>();

    const ops = planMenuOpsForBlocks([oneBlockTwoTopLevelSpecs], 'p13', existing);

    const parentOp = ops.find(o => o.key === 'new-parent');
    expect(parentOp?.op).toBe('create');
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

    const op = planRootMenuOp('p13', existing, ['aoc-menu'], []);

    expect(op?.key).toBe('main_p13');
    // every original entry survives, in the SAME order, with the new key appended LAST —
    // not reordered, not alphabetised, not inserted anywhere else.
    expect(op?.fields.menuItems).toEqual([
      'home', 'profile', 'logout', 'login', 'misc-menu', 'cms', 'version', 'aoc-menu',
    ]);
  });

  it('adding a key that is already present is a no-op (no duplicate, and no write at all if nothing else changed)', () => {
    const existing = new Map<string, MenuItemModel>([['main_p13', rootDoc()]]);

    const op = planRootMenuOp('p13', existing, ['cms'], []);

    expect(op).toBeUndefined();
  });

  it('disabling removes its top-level key, preserving the order of everything else', () => {
    const existing = new Map<string, MenuItemModel>([['main_p13', rootDoc()]]);

    const op = planRootMenuOp('p13', existing, [], ['misc-menu']);

    expect(op?.fields.menuItems).toEqual(['home', 'profile', 'logout', 'login', 'cms', 'version']);
  });

  it('does not remove a key a still/newly-enabled block also owns, even if a disabled block used to own it too', () => {
    const existing = new Map<string, MenuItemModel>([['main_p13', rootDoc()]]);

    // 'cms' is nominally being removed by a disabled block, but also being (re-)added by
    // a currently-enabled one in the SAME call — it must survive, in its original spot.
    const op = planRootMenuOp('p13', existing, ['cms'], ['cms']);

    expect(op).toBeUndefined(); // nothing actually changes: 'cms' was already there and stays
  });

  it('re-running with the already-applied state is idempotent — no duplicate keys, no spurious write', () => {
    const existing = new Map<string, MenuItemModel>([['main_p13', rootDoc()]]);
    const firstRun = planRootMenuOp('p13', existing, ['aoc-menu'], []);
    expect(firstRun?.fields.menuItems).toEqual([
      'home', 'profile', 'logout', 'login', 'misc-menu', 'cms', 'version', 'aoc-menu',
    ]);

    // Simulate the write having landed, then re-run against the now-updated doc — the
    // same shape `applySelection` re-fetches `existing` and recomputes from live state.
    const afterFirstRun = new Map<string, MenuItemModel>([
      ['main_p13', { ...rootDoc(), menuItems: firstRun!.fields.menuItems as string[] }],
    ]);
    const secondRun = planRootMenuOp('p13', afterFirstRun, ['aoc-menu'], []);

    expect(secondRun).toBeUndefined(); // converged — nothing left to write
  });

  it('a tenant with no root doc gets one created with tenants: [tenantId] and the enabled blocks\' keys', () => {
    const existing = new Map<string, MenuItemModel>(); // no main_p13 doc at all

    const op = planRootMenuOp('p13', existing, ['calevent-all', 'aoc-menu'], []);

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
    expect(planRootMenuOp('p13', existing, [], [])).toBeUndefined();
  });

  it('self-heals a root doc whose tenants[] ever drifted from exactly [tenantId], without touching menuItems', () => {
    const existing = new Map<string, MenuItemModel>([
      ['main_p13', rootDoc({ tenants: ['p13', 'stray-other-tenant'] })],
    ]);

    const op = planRootMenuOp('p13', existing, [], []);

    expect(op?.fields.tenants).toEqual(['p13']);
    expect(op?.fields.menuItems).toBeUndefined(); // array itself is unchanged, not rewritten
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

describe('applySelection (full write path — BUG 1 must survive past the pure planner)', () => {
  it('two enabled blocks sharing an EXISTING parent menu doc both land in the real store, config and events are written', async () => {
    const fdb = new FakeFirestore();
    // Explicit (non-legacy) app-config with nothing enabled yet, so both blocks are
    // genuinely NEW transitions — a legacy doc with no `enabledFeatures` field reads as
    // "every non-internal block already enabled" (D-BB-10) and would log zero events for
    // a catalogue of only 'ga' blocks, defeating the point of this assertion.
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    // pre-existing shared parent, seeded for a different tenant already
    fdb.seed(MenuItemCollection, 'shared-parent', {
      okey: 'shared-parent', name: 'shared-parent', url: '', action: 'sub',
      roleNeeded: 'registered', icon: 'help-circle', label: '@shared',
      tenants: ['other-tenant'], menuItems: [],
    });

    const childSpec = (key: string): MenuSpec => ({
      key, name: key, url: `/x/${key}`, action: 'navigate', roleNeeded: 'registered',
      icon: 'help-circle', label: `@x.${key}`,
    });
    const parentSpec = (child: string): MenuSpec => ({
      key: 'shared-parent', name: 'shared-parent', url: '', action: 'sub',
      roleNeeded: 'registered', icon: 'help-circle', label: '@shared', children: [childSpec(child)],
    });
    const blockA = catalogueBlock('a', [parentSpec('childX')]);
    const blockB = catalogueBlock('b', [parentSpec('childY')]);
    const catalogue = [blockA, blockB];
    const plan: SelectionPlan = { enabled: ['a', 'b'], withheld: [] };

    const { applied } = await applySelection(fdb as unknown as Firestore, catalogue, plan, 'p13', 'uid-admin-1');

    expect(applied.sort()).toEqual(['a', 'b']);

    // BUG 1: neither child was lost, and the pre-existing tenant wasn't dropped either.
    const parentDoc = fdb.dump(MenuItemCollection)['shared-parent'];
    expect((parentDoc.menuItems as string[]).sort()).toEqual(['childX', 'childY']);
    expect(parentDoc.tenants).toEqual(['other-tenant', 'p13']);

    // enablement persisted
    expect(fdb.dump(AppConfigCollection)['p13']).toEqual({ enabledFeatures: ['a', 'b'] });

    // one audit event per newly-enabled block, attributed to the acting admin
    const events = Object.values(fdb.dump(FeatureEventCollection));
    expect(events).toHaveLength(2);
    expect(events.every((e) => e['by'] === 'uid-admin-1' && e['tenantId'] === 'p13')).toBe(true);
    expect(events.map((e) => e['block']).sort()).toEqual(['a', 'b']);
    expect(events.every((e) => e['op'] === 'enable')).toBe(true);

    // ROOT MENU ATTACHMENT: no root doc existed, so a fresh one was created for this
    // tenant only, seeded with the (single, shared) top-level key both blocks own.
    const root = fdb.dump(MenuItemCollection)['main_p13'];
    expect(root).toBeDefined();
    expect(root.tenants).toEqual(['p13']);
    expect(root.menuItems).toEqual(['shared-parent']);
  });

  it('a second call with the same selection (idempotent re-run) logs no new events', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] }); // see comment above
    const block = catalogueBlock('a', []);
    const plan: SelectionPlan = { enabled: ['a'], withheld: [] };

    await applySelection(fdb as unknown as Firestore, [block], plan, 'p13', 'uid-admin-1');
    await applySelection(fdb as unknown as Firestore, [block], plan, 'p13', 'uid-admin-1');

    expect(Object.keys(fdb.dump(FeatureEventCollection))).toHaveLength(1);
  });

  it('root menu attachment (task-8 review round 2): enabling a block appends its top-level key to the tenant\'s EXISTING, hand-curated root, in place, and re-running does not duplicate it', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    // A tenant's real root doc: hand-curated order, nothing to do with catalogue order.
    fdb.seed(MenuItemCollection, 'main_p13', {
      okey: 'main_p13', name: 'main_p13', action: 'main', url: '', label: 'main', icon: '',
      roleNeeded: 'none', tenants: ['p13'],
      menuItems: ['home', 'profile', 'logout', 'login', 'misc-menu', 'cms', 'version'],
    });
    const menuBlock = catalogueBlock('calevent', [{
      key: 'calevent-all', name: 'calevent-all', url: '/calevent/all', action: 'navigate',
      roleNeeded: 'registered', icon: 'calendar', label: '@main.calevent.all',
    }]);
    const plan: SelectionPlan = { enabled: ['calevent'], withheld: [] };

    await applySelection(fdb as unknown as Firestore, [menuBlock], plan, 'p13', 'uid-admin-1');

    expect(fdb.dump(MenuItemCollection)['main_p13'].menuItems).toEqual([
      'home', 'profile', 'logout', 'login', 'misc-menu', 'cms', 'version', 'calevent-all',
    ]);

    // Re-run the identical selection: must not duplicate the key.
    await applySelection(fdb as unknown as Firestore, [menuBlock], plan, 'p13', 'uid-admin-1');
    expect(fdb.dump(MenuItemCollection)['main_p13'].menuItems).toEqual([
      'home', 'profile', 'logout', 'login', 'misc-menu', 'cms', 'version', 'calevent-all',
    ]);
  });

  it('root menu attachment: disabling a block removes its top-level key from the tenant\'s root, leaving the rest untouched', async () => {
    const fdb = new FakeFirestore();
    // Previously enabled: 'calevent'. This call disables it (enabled becomes []).
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: ['calevent'] });
    fdb.seed(MenuItemCollection, 'main_p13', {
      okey: 'main_p13', name: 'main_p13', action: 'main', url: '', label: 'main', icon: '',
      roleNeeded: 'none', tenants: ['p13'],
      menuItems: ['home', 'profile', 'calevent-all', 'version'],
    });
    const menuBlock = catalogueBlock('calevent', [{
      key: 'calevent-all', name: 'calevent-all', url: '/calevent/all', action: 'navigate',
      roleNeeded: 'registered', icon: 'calendar', label: '@main.calevent.all',
    }]);
    const plan: SelectionPlan = { enabled: [], withheld: [] };

    await applySelection(fdb as unknown as Firestore, [menuBlock], plan, 'p13', 'uid-admin-1');

    expect(fdb.dump(MenuItemCollection)['main_p13'].menuItems).toEqual(['home', 'profile', 'version']);
    const events = Object.values(fdb.dump(FeatureEventCollection));
    expect(events).toEqual([{ tenantId: 'p13', block: 'calevent', op: 'disable', at: expect.any(String), by: 'uid-admin-1' }]);
  });

  it('root menu removal survives a retry AFTER chunk 0 already committed (review round 3, Important 1) — fails on the pre-fix delta-based removeKeys', async () => {
    const fdb = new FakeFirestore();
    // Simulates the state immediately after a first `applySelection` attempt's chunk 0
    // (config + events) landed but its root-menu write then failed: `enabledFeatures` is
    // ALREADY the new, post-disable value, but `main_p13` still lists the disabled
    // block's key — nothing removed it yet. A delta computed as `computeTransitions
    // (previous, plan.enabled)` would see `previous == plan.enabled == []` here (the
    // config doc already reflects the target state) and compute an EMPTY delta, so a
    // removeKeys derived from that delta would never touch `aoc-menu` again — on this
    // retry OR any future one. `removeKeys` must be derived from full catalogue state
    // (every block not in `plan.enabled`) precisely so this retry still converges.
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    fdb.seed(MenuItemCollection, 'main_p13', {
      okey: 'main_p13', name: 'main_p13', action: 'main', url: '', label: 'main', icon: '',
      roleNeeded: 'none', tenants: ['p13'],
      menuItems: ['home', 'profile', 'aoc-menu', 'version'],
    });
    const aocBlock = catalogueBlock('aoc', [{
      key: 'aoc-menu', name: 'aoc-menu', url: '', action: 'sub',
      roleNeeded: 'admin', icon: 'admin', label: 'AOC',
    }]);
    const plan: SelectionPlan = { enabled: [], withheld: [] }; // same target as before the "crash"

    await applySelection(fdb as unknown as Firestore, [aocBlock], plan, 'p13', 'uid-admin-1');

    expect(fdb.dump(MenuItemCollection)['main_p13'].menuItems).toEqual(['home', 'profile', 'version']);
    // No spurious audit event: the config doc was already at the target value, so this
    // retry is a real no-op for the (separately, correctly, delta-based) audit trail.
    expect(Object.keys(fdb.dump(FeatureEventCollection))).toHaveLength(0);
  });

  it('a context-menu wrapper top-level spec is seeded but NEVER appended to the tenant\'s root nav, while a navigate sibling is (task 12 review round 2)', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    fdb.seed(MenuItemCollection, 'main_p13', {
      okey: 'main_p13', name: 'main_p13', action: 'main', url: '', label: 'main', icon: '',
      roleNeeded: 'none', tenants: ['p13'], menuItems: ['home'],
    });
    const block = catalogueBlock('cms', [
      { key: 'icon-all', name: 'icon-all', url: '/icon/all/c-icon', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'icons', label: 'Icons' },
      { key: 'c-icon', name: 'c-icon', url: '', action: 'context', roleNeeded: 'contentAdmin', icon: 'help-circle', label: '', children: [
        { key: 'icon-add', name: 'icon-add', url: 'add', action: 'call', roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Icon hinzufügen' },
      ] },
    ]);
    const plan: SelectionPlan = { enabled: ['cms'], withheld: [] };

    await applySelection(fdb as unknown as Firestore, [block], plan, 'p13', 'uid-admin-1');

    // The root nav gains ONLY the navigate entry — the context wrapper and its call child
    // are seeded as real menuItems docs (so the app can render the icon list's context
    // menu) but never appended to the root nav.
    expect(fdb.dump(MenuItemCollection)['main_p13'].menuItems).toEqual(['home', 'icon-all']);
    expect(fdb.dump(MenuItemCollection)['c-icon']).toBeDefined();
    expect(fdb.dump(MenuItemCollection)['icon-add']).toBeDefined();
  });

  it('resolves an existing doc by NAME even when its Firestore doc id is a legacy autoid, and writes to that REAL doc — no duplicate is created (task 12 review round 2, repo owner ruling)', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    // The live doc's REAL id is a legacy autoid that differs from its `name` field —
    // exactly the shape of `icon-all`/`ogwzpl15fpuhcxon5e7b` etc.
    fdb.seed(MenuItemCollection, 'ogwzpl15fpuhcxon5e7b', {
      okey: 'ogwzpl15fpuhcxon5e7b', name: 'icon-all', url: '/icon/all/c-icon',
      action: 'navigate', roleNeeded: 'contentAdmin', icon: 'icons', label: 'Icons',
      tenants: ['scs'],
    });
    const block = catalogueBlock('cms', [
      { key: 'icon-all', name: 'icon-all', url: '/icon/all/c-icon', action: 'navigate', roleNeeded: 'contentAdmin', icon: 'icons', label: 'Icons' },
    ]);
    const plan: SelectionPlan = { enabled: ['cms'], withheld: [] };

    await applySelection(fdb as unknown as Firestore, [block], plan, 'p13', 'uid-admin-1');

    const menuDocs = fdb.dump(MenuItemCollection);
    // The original legacy doc gained the new tenant — it was NOT recreated.
    expect((menuDocs['ogwzpl15fpuhcxon5e7b'].tenants as string[]).sort()).toEqual(['p13', 'scs']);
    // No second doc was created under the catalogue key.
    expect(menuDocs['icon-all']).toBeUndefined();
  });

  it('refuses to apply when two live menuItems docs share the same name, rather than silently picking one (repo owner ruling)', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    fdb.seed(MenuItemCollection, 'legacy-id-a', { okey: 'legacy-id-a', name: 'icon-sync', tenants: ['scs'] });
    fdb.seed(MenuItemCollection, 'legacy-id-b', { okey: 'legacy-id-b', name: 'icon-sync', tenants: ['test'] });
    const block = catalogueBlock('cms', []);
    const plan: SelectionPlan = { enabled: ['cms'], withheld: [] };

    await expect(applySelection(fdb as unknown as Firestore, [block], plan, 'p13', 'uid-admin-1'))
      .rejects.toThrow(/duplicate menuItems name.*icon-sync/i);
  });
});
