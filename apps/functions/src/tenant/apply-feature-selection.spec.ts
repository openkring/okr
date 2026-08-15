import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  applySelection, chunk, commitChunked, computeTransitions,
  nestedMenuKeys, planMenuOpsForBlocks, planRootMenuOp, planSelection, rootNavKeys,
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

    const op = planRootMenuOp('p13', existing, ['calevent-all', 'task-all'], []);

    expect(op).toBeUndefined(); // nothing to attach — both are already reachable
  });

  it('still appends a genuinely new block key when a DIFFERENT key is nested', () => {
    const existing = new Map<string, MenuItemModel>([
      ['main_p13', rootDoc({ menuItems: ['home', 'event-menu-scs'] })],
      ['event-menu-scs', {
        okey: 'event-menu-scs', name: 'event-menu-scs', action: 'sub', menuItems: ['calevent-all'],
      } as MenuItemModel],
    ]);

    const op = planRootMenuOp('p13', existing, ['calevent-all', 'aoc-menu'], []);

    // `calevent-all` is nested and skipped; `aoc-menu` is reachable nowhere and is attached.
    expect(op?.fields.menuItems).toEqual(['home', 'event-menu-scs', 'aoc-menu']);
  });

  it('dedupes against nesting at any depth, not just one level down', () => {
    const existing = new Map<string, MenuItemModel>([
      ['main_p13', rootDoc({ menuItems: ['outer'] })],
      ['outer', { okey: 'outer', name: 'outer', action: 'sub', menuItems: ['inner'] } as MenuItemModel],
      ['inner', { okey: 'inner', name: 'inner', action: 'sub', menuItems: ['task-my'] } as MenuItemModel],
    ]);

    expect(planRootMenuOp('p13', existing, ['task-my'], [])).toBeUndefined();
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

    const op = planRootMenuOp('p13', existing, ['calevent-all'], []);

    expect(op?.fields.menuItems).toEqual(['home', 'event-menu-scs', 'calevent-all']);
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

  it('refuses to apply when two live menuItems docs it must write share the same name, rather than silently picking one (repo owner ruling)', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    // Two ACTIVE docs, neither naming `p13`, neither with `id === name`: the resolution
    // ladder (task B-1) has nothing left to decide on, so the refusal must stand.
    fdb.seed(MenuItemCollection, 'legacy-id-a', { okey: 'legacy-id-a', name: 'icon-sync', tenants: ['scs'] });
    fdb.seed(MenuItemCollection, 'legacy-id-b', { okey: 'legacy-id-b', name: 'icon-sync', tenants: ['test'] });
    // The block must actually WRITE this name for the refusal to apply — see the
    // "does NOT touch" test below for the other half of that rule.
    const block = catalogueBlock('cms', [{
      key: 'icon-sync', name: 'icon-sync', url: 'sync', action: 'call',
      roleNeeded: 'contentAdmin', icon: 'sync', label: 'Icons synchronisieren',
    }]);
    const plan: SelectionPlan = { enabled: ['cms'], withheld: [] };

    await expect(applySelection(fdb as unknown as Firestore, [block], plan, 'p13', 'uid-admin-1'))
      .rejects.toThrow(/cannot be resolved.*'icon-sync'.*legacy-id-a.*legacy-id-b/s);
    // Nothing was written before the refusal.
    expect(fdb.dump(MenuItemCollection)['icon-sync']).toBeUndefined();
    expect(fdb.dump(AppConfigCollection)['p13']).toEqual({ enabledFeatures: [] });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// Task B-1 — the three live `menuItems` name collisions, end to end through the real
// write path. Every fixture mirrors a document that exists in production (verified
// against Firestore 2026-08-04); the pre-fix global duplicate guard threw on ALL of these
// for EVERY tenant, so nothing below could run at all.
// ─────────────────────────────────────────────────────────────────────────────────────
describe('applySelection — live menuItems name collisions (task B-1)', () => {
  /** `menuItems/resource-menu` (`tenants: ['test']`) — the generic doc, id === name. */
  const seedResourceGeneric = (fdb: FakeFirestore): void => fdb.seed(MenuItemCollection, 'resource-menu', {
    okey: 'resource-menu', name: 'resource-menu', url: '', action: 'sub',
    roleNeeded: 'resourceAdmin', icon: 'help-circle', label: 'Resourcen', isArchived: false,
    tenants: ['test'], menuItems: ['resource-all', 'rboat-all', 'ownerships-all'],
  });
  /** `menuItems/resource-menu-scs` — same `name`, tenant-bespoke reshaping for scs. */
  const seedResourceBespoke = (fdb: FakeFirestore): void => fdb.seed(MenuItemCollection, 'resource-menu-scs', {
    okey: 'resource-menu-scs', name: 'resource-menu', url: '', action: 'sub',
    roleNeeded: 'resourceAdmin', icon: 'help-circle', label: 'Resourcen (Schlüssel, Chäschtli...)',
    isArchived: false, tenants: ['scs'], menuItems: ['resource-all', 'lockers-all', 'res-misc'],
  });
  /** A `resource-menu` block whose subtree gains one child neither live doc has yet, so
   * exactly one of the two docs is provably written and the other provably is not. */
  const resourceBlock = catalogueBlock('resource', [{
    key: 'resource-menu', name: 'resource-menu', url: '', action: 'sub',
    roleNeeded: 'resourceAdmin', icon: 'help-circle', label: 'Resourcen',
    children: [{
      key: 'resource-new', name: 'resource-new', url: '/resource/new', action: 'navigate',
      roleNeeded: 'resourceAdmin', icon: 'help-circle', label: 'Neu',
    }],
  }]);

  it('resource-menu resolves to the TENANT-BESPOKE doc for scs — the generic doc is not touched', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'scs', { enabledFeatures: [] });
    seedResourceGeneric(fdb);
    seedResourceBespoke(fdb);

    await applySelection(fdb as unknown as Firestore, [resourceBlock], { enabled: ['resource'], withheld: [] }, 'scs', 'uid-1');

    const docs = fdb.dump(MenuItemCollection);
    expect(docs['resource-menu-scs'].menuItems).toEqual(['resource-all', 'lockers-all', 'res-misc', 'resource-new']);
    // The generic doc keeps test's ordering and membership — untouched.
    expect(docs['resource-menu'].menuItems).toEqual(['resource-all', 'rboat-all', 'ownerships-all']);
    expect(docs['resource-menu'].tenants).toEqual(['test']);
  });

  it('resource-menu resolves to the GENERIC doc for test — the scs doc is not touched', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'test', { enabledFeatures: [] });
    seedResourceGeneric(fdb);
    seedResourceBespoke(fdb);

    await applySelection(fdb as unknown as Firestore, [resourceBlock], { enabled: ['resource'], withheld: [] }, 'test', 'uid-1');

    const docs = fdb.dump(MenuItemCollection);
    expect(docs['resource-menu'].menuItems).toEqual(['resource-all', 'rboat-all', 'ownerships-all', 'resource-new']);
    expect(docs['resource-menu-scs'].menuItems).toEqual(['resource-all', 'lockers-all', 'res-misc']);
    expect(docs['resource-menu-scs'].tenants).toEqual(['scs']);
  });

  it('resource-menu resolves to the GENERIC doc for a third tenant that inherits neither, and that tenant is added to it', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    seedResourceGeneric(fdb);
    seedResourceBespoke(fdb);

    await applySelection(fdb as unknown as Firestore, [resourceBlock], { enabled: ['resource'], withheld: [] }, 'p13', 'uid-1');

    const docs = fdb.dump(MenuItemCollection);
    expect(docs['resource-menu'].tenants).toEqual(['test', 'p13']);
    expect(docs['resource-menu'].menuItems).toEqual(['resource-all', 'rboat-all', 'ownerships-all', 'resource-new']);
    // The bespoke doc must NOT pick up an unrelated tenant.
    expect(docs['resource-menu-scs'].tenants).toEqual(['scs']);
    expect(docs['resource-menu-scs'].menuItems).toEqual(['resource-all', 'lockers-all', 'res-misc']);
  });

  it('filter-toggle resolves to the ACTIVE twin and leaves the ARCHIVED doc archived and unrewritten', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    // The stale, archived `action: 'call'` version, whose doc id is the catalogue key.
    fdb.seed(MenuItemCollection, 'filter-toggle', {
      okey: 'filter-toggle', name: 'filter-toggle', url: 'toggleFilter', action: 'call',
      roleNeeded: 'registered', icon: 'search', label: 'Filter ein-/ausblenden',
      isArchived: true, tenants: ['scs'], menuItems: [],
    });
    // The live one, on a legacy autoid, carrying fields MenuSpec cannot even express.
    fdb.seed(MenuItemCollection, 'zjbhk84hfrfc32yb6td5', {
      okey: 'zjbhk84hfrfc32yb6td5', name: 'filter-toggle', url: 'toggleFilter', action: 'toggle',
      roleNeeded: 'contentAdmin', icon: 'eye-on', label: 'Filter anzeigen',
      labelAlt: 'Filter ausblenden', iconAlt: 'eye-off', isArchived: false, tenants: ['scs'], menuItems: [],
    });
    const block = catalogueBlock('calevent', [{
      key: 'filter-toggle', name: 'filter-toggle', url: 'toggleFilter', action: 'toggle',
      roleNeeded: 'contentAdmin', icon: 'eye-on', label: 'Filter anzeigen',
    }]);

    await applySelection(fdb as unknown as Firestore, [block], { enabled: ['calevent'], withheld: [] }, 'p13', 'uid-1');

    const docs = fdb.dump(MenuItemCollection);
    expect(docs['zjbhk84hfrfc32yb6td5'].tenants).toEqual(['scs', 'p13']);
    expect(docs['zjbhk84hfrfc32yb6td5'].labelAlt).toBe('Filter ausblenden'); // not clobbered
    // The archived doc is the trap: a merge write here would un-archive it (the create
    // path writes `isArchived: false`) and resurrect the collision as two ACTIVE docs.
    expect(docs['filter-toggle']).toEqual({
      okey: 'filter-toggle', name: 'filter-toggle', url: 'toggleFilter', action: 'call',
      roleNeeded: 'registered', icon: 'search', label: 'Filter ein-/ausblenden',
      isArchived: true, tenants: ['scs'], menuItems: [],
    });
  });

  // ── the archived-document-id trap (task B-1 brief) ────────────────────────────────
  // The catalogue's spec key for `filter-toggle` IS the archived document's id. These two
  // tests pin down what happens on each of the two possible live cleanups, and are the
  // evidence behind the recommendation "DELETE the archived doc, do not un-archive it".
  const filterToggleSpec: MenuSpec = {
    key: 'filter-toggle', name: 'filter-toggle', url: 'toggleFilter', action: 'toggle',
    roleNeeded: 'contentAdmin', icon: 'eye-on', label: 'Filter anzeigen',
  };
  const archivedFilterToggle = {
    okey: 'filter-toggle', name: 'filter-toggle', url: 'toggleFilter', action: 'call',
    roleNeeded: 'registered', icon: 'search', label: 'Filter ein-/ausblenden',
    isArchived: true, tenants: ['scs'], menuItems: [],
  };

  it('CREATE PATH: with only the ARCHIVED doc left, the seed writes to that same doc id and un-archives it, replacing its tenants', async () => {
    // Not a bug in this change — `spec.key` is the only id a create has — but it is why
    // the archived twin must be DELETED rather than left behind: were the ACTIVE twin ever
    // removed first, this write resurrects the stale doc and drops `scs` from its tenants.
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    fdb.seed(MenuItemCollection, 'filter-toggle', { ...archivedFilterToggle });
    const block = catalogueBlock('calevent', [filterToggleSpec]);

    await applySelection(fdb as unknown as Firestore, [block], { enabled: ['calevent'], withheld: [] }, 'p13', 'uid-1');

    const doc = fdb.dump(MenuItemCollection)['filter-toggle'];
    expect(doc.isArchived).toBe(false);        // resurrected
    expect(doc.action).toBe('toggle');         // rewritten from the catalogue
    expect(doc.tenants).toEqual(['p13']);      // scs dropped — the create path owns the field
    expect(Object.keys(fdb.dump(MenuItemCollection))).toEqual(['filter-toggle']); // no second doc
  });

  it('UN-ARCHIVING the stale twin instead of deleting it silently moves the seed target onto it', async () => {
    // Same two docs as the passing collision test above, except `isArchived: false` on the
    // stale one. Rung 3 can no longer separate them (both name scs), so rung 4 picks the
    // one whose id equals the name — the STALE doc. This is exactly the regression the
    // live-data recommendation exists to prevent.
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'scs', { enabledFeatures: [] });
    fdb.seed(MenuItemCollection, 'filter-toggle', { ...archivedFilterToggle, isArchived: false });
    fdb.seed(MenuItemCollection, 'zjbhk84hfrfc32yb6td5', {
      okey: 'zjbhk84hfrfc32yb6td5', name: 'filter-toggle', url: 'toggleFilter', action: 'toggle',
      roleNeeded: 'contentAdmin', icon: 'eye-on', label: 'Filter anzeigen',
      labelAlt: 'Filter ausblenden', iconAlt: 'eye-off', isArchived: false, tenants: ['scs'], menuItems: [],
    });
    const block = catalogueBlock('calevent', [filterToggleSpec]);

    await applySelection(fdb as unknown as Firestore, [block], { enabled: ['calevent'], withheld: [] }, 'scs', 'uid-1');

    const docs = fdb.dump(MenuItemCollection);
    expect(docs['filter-toggle'].action).toBe('toggle');   // the stale doc got the seed
    expect(docs['zjbhk84hfrfc32yb6td5'].action).toBe('toggle'); // the real one, untouched
    expect(docs['zjbhk84hfrfc32yb6td5'].roleNeeded).toBe('contentAdmin');
  });

  it('byte-identical event-menu twins resolve to the doc whose id equals the name, and the stale twin is not written', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'test', { enabledFeatures: [] });
    const twin = {
      name: 'event-menu', url: '', action: 'sub', roleNeeded: 'registered',
      icon: 'help-circle', label: 'Events', isArchived: false, tenants: ['test'],
      menuItems: ['calevent-all'],
    };
    // `info_menu` seeded FIRST: first-seen (the pre-fix tie-break) would pick the stale twin.
    fdb.seed(MenuItemCollection, 'info_menu', { ...twin, okey: 'info_menu' });
    fdb.seed(MenuItemCollection, 'event-menu', { ...twin, okey: 'event-menu' });
    const block = catalogueBlock('calevent', [{
      key: 'event-menu', name: 'event-menu', url: '', action: 'sub',
      roleNeeded: 'registered', icon: 'help-circle', label: 'Events',
      children: [{
        key: 'calevent-new', name: 'calevent-new', url: '/calevent/new', action: 'navigate',
        roleNeeded: 'registered', icon: 'calendar', label: 'Neu',
      }],
    }]);

    await applySelection(fdb as unknown as Firestore, [block], { enabled: ['calevent'], withheld: [] }, 'test', 'uid-1');

    const docs = fdb.dump(MenuItemCollection);
    expect(docs['event-menu'].menuItems).toEqual(['calevent-all', 'calevent-new']);
    expect(docs['info_menu'].menuItems).toEqual(['calevent-all']);
  });

  it('an ambiguous name the selection does NOT touch no longer aborts the run (the event-menu case: no catalogue block owns that name)', async () => {
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    // Genuinely undecidable for p13 — two active docs, neither naming p13, neither
    // `id === name`. Under the pre-fix global guard this alone killed every tenant's seed.
    fdb.seed(MenuItemCollection, 'legacy-id-a', { okey: 'legacy-id-a', name: 'event-menu', tenants: ['test'], isArchived: false });
    fdb.seed(MenuItemCollection, 'legacy-id-b', { okey: 'legacy-id-b', name: 'event-menu', tenants: ['scs'], isArchived: false });
    const block = catalogueBlock('calevent', [{
      key: 'calevent-all', name: 'calevent-all', url: '/calevent/all', action: 'navigate',
      roleNeeded: 'registered', icon: 'calendar', label: '@main.calevent.all',
    }]);

    await applySelection(fdb as unknown as Firestore, [block], { enabled: ['calevent'], withheld: [] }, 'p13', 'uid-1');

    const docs = fdb.dump(MenuItemCollection);
    expect(docs['calevent-all']).toBeDefined();          // the run completed
    expect(docs['main_p13'].menuItems).toEqual(['calevent-all']);
    // …and the untouchable pair was left exactly as it was.
    expect(docs['legacy-id-a']).toEqual({ okey: 'legacy-id-a', name: 'event-menu', tenants: ['test'], isArchived: false });
    expect(docs['legacy-id-b']).toEqual({ okey: 'legacy-id-b', name: 'event-menu', tenants: ['scs'], isArchived: false });
  });

  it('refuses when a nested CHILD spec name is ambiguous, not just a top-level one', async () => {
    // The touched set must be the whole subtree: a child doc is written exactly like a
    // top-level one, so an unresolvable child is just as unsafe to guess at.
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    fdb.seed(MenuItemCollection, 'legacy-id-a', { okey: 'legacy-id-a', name: 'icon-add', tenants: ['scs'], isArchived: false });
    fdb.seed(MenuItemCollection, 'legacy-id-b', { okey: 'legacy-id-b', name: 'icon-add', tenants: ['test'], isArchived: false });
    const block = catalogueBlock('cms', [{
      key: 'c-icon', name: 'c-icon', url: '', action: 'context', roleNeeded: 'contentAdmin',
      icon: 'help-circle', label: '', children: [{
        key: 'icon-add', name: 'icon-add', url: 'add', action: 'call',
        roleNeeded: 'contentAdmin', icon: 'add-circle', label: 'Icon hinzufügen',
      }],
    }]);

    await expect(applySelection(fdb as unknown as Firestore, [block], { enabled: ['cms'], withheld: [] }, 'p13', 'uid-1'))
      .rejects.toThrow(/cannot be resolved.*'icon-add'.*legacy-id-a.*legacy-id-b/s);
    expect(fdb.dump(MenuItemCollection)['c-icon']).toBeUndefined(); // nothing written
  });

  it('refuses when the tenant\'s own ROOT doc name is ambiguous, even though no menu spec names it', async () => {
    // `planRootMenuOp` reads `main_<tenantId>` straight out of the same index, so that
    // name is part of the touched set even though it appears in no block's `menu`.
    const fdb = new FakeFirestore();
    fdb.seed(AppConfigCollection, 'p13', { enabledFeatures: [] });
    // Two autoid docs both claiming `name: 'main_p13'` and both naming p13 — no rung of
    // the ladder can separate them (neither has `id === name`).
    fdb.seed(MenuItemCollection, 'legacy-root-a', { okey: 'legacy-root-a', name: 'main_p13', tenants: ['p13'], isArchived: false, menuItems: ['home'] });
    fdb.seed(MenuItemCollection, 'legacy-root-b', { okey: 'legacy-root-b', name: 'main_p13', tenants: ['p13'], isArchived: false, menuItems: ['other'] });
    const block = catalogueBlock('calevent', []);

    await expect(applySelection(fdb as unknown as Firestore, [block], { enabled: ['calevent'], withheld: [] }, 'p13', 'uid-1'))
      .rejects.toThrow(/cannot be resolved.*'main_p13'.*legacy-root-a.*legacy-root-b/s);
  });
});
