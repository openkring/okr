import { describe, expect, it } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  applySelection, chunk, commitChunked, computeTransitions,
  planMenuOpsForBlocks, planSelection,
} from './apply-feature-selection';
import type { PendingWrite, SelectionPlan } from './apply-feature-selection';
import type { FeatureBlock, FeatureRollout, MenuSpec } from '@okr/tenant-util';
import { AppConfigCollection, FeatureEventCollection, MenuItemCollection } from '@okr/shared-models';
import type { MenuItemModel } from '@okr/shared-models';

const block = (id: string, over: Partial<FeatureBlock> = {}): FeatureBlock => ({
  id, bundle: 'special', label: `@f.${id}`, icon: 'help-circle',
  defaultAvailability: 'ga', dependsOn: [], routes: () => [], menu: [], collections: [],
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
      dependsOn: [], routes: () => [], collections: [], menu: [parentSpec('childX')],
    };
    const blockB: FeatureBlock = {
      id: 'b', bundle: 'special', label: '@f.b', icon: 'help-circle', defaultAvailability: 'ga',
      dependsOn: [], routes: () => [], collections: [], menu: [parentSpec('childY')],
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
      dependsOn: [], routes: () => [], collections: [], menu: [parentSpec('childX')],
    };
    const blockB: FeatureBlock = {
      id: 'b', bundle: 'special', label: '@f.b', icon: 'help-circle', defaultAvailability: 'ga',
      dependsOn: [], routes: () => [], collections: [], menu: [parentSpec('childY')],
    };
    const existing = new Map<string, MenuItemModel>(); // parent does not exist yet

    const ops = planMenuOpsForBlocks([blockA, blockB], 'p13', existing);

    const parentOps = ops.filter(o => o.key === 'new-parent');
    expect(parentOps).toHaveLength(1);
    expect(parentOps[0].fields.menuItems).toEqual(['childX', 'childY']);
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
  dependsOn: [], routes: () => [], collections: [], menu,
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

    const { seeded } = await applySelection(fdb as unknown as Firestore, catalogue, plan, 'p13', 'uid-admin-1');

    expect(seeded.sort()).toEqual(['a', 'b']);

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
});
