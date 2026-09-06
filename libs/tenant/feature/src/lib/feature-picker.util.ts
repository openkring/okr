import type { RoleName } from '@okr/shared-models';
import { resolveMenuLabelKey } from '@okr/cms-menu-util';
import type {
  FeatureBlock, FeatureRollout, MenuSpec, MenuStructureChange,
} from '@okr/tenant-util';
import { effectiveFeatures } from '@okr/tenant-util';

/**
 * Which blocks directly depend on `id`? Used to warn before an unpick, naming exactly what
 * would break — the user decides, not the picker, whether to cascade further.
 *
 * Direct dependents only, by design and by the spec in `feature-picker.util.spec.ts`: for
 * `person ← calevent, finance ← esign`, `dependentsOf(catalogue, 'person')` is
 * `['calevent', 'finance']`, NOT `['calevent', 'finance', 'esign']` — the brief's own
 * reference implementation (a `dependsOn` fixed-point closure) computes the full transitive
 * set instead and fails that exact case; verified by running the test before trusting it.
 * A cascading uncheck (person → finance → esign) is the caller's job, one direct hop at a
 * time, so each hop gets its own confirmation naming only what breaks at that hop — see
 * `transitiveDependentsOf` below for the whole-chain version the picker actually uses.
 */
export function dependentsOf(catalogue: FeatureBlock[], id: string): string[] {
  return catalogue.filter(block => block.dependsOn.includes(id)).map(block => block.id);
}

/**
 * Every currently-SELECTED block that would break, transitively, if `id` were switched off.
 * `dependentsOf` itself only returns direct dependents — this walks the chain (BFS over
 * repeated `dependentsOf` calls) so the picker can show ONE confirmation for the whole
 * cascade instead of one dialog per hop, restricted to blocks the admin actually has ticked
 * (an already-unticked dependent needs no warning).
 */
export function transitiveDependentsOf(
  catalogue: FeatureBlock[], id: string, selected: ReadonlySet<string> | Iterable<string>,
): string[] {
  const selectedSet = selected instanceof Set ? selected : new Set(selected);
  const out = new Set<string>();
  const queue = [id];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const dep of dependentsOf(catalogue, current)) {
      if (selectedSet.has(dep) && !out.has(dep)) {
        out.add(dep);
        queue.push(dep);
      }
    }
  }
  return [...out];
}

/**
 * Which blocks would lose their menu entries if `nextEnabled` were saved right now? The whole
 * point of the removal-confirmation dialog (spec Task 11) — computed with a SINGLE `rollouts`
 * snapshot for both sides on purpose: `before`/`after` used to be derived from two independent
 * `toSignal` subscriptions to the same Firestore stream (the component's own vs.
 * `FeatureStore`'s), which can legitimately disagree for one render tick if one has a fresher
 * emission than the other — a `beta` block that's allow-listed for this tenant could then be
 * reported as "about to be removed" when it would not be. One snapshot in, both sides computed
 * from it, makes that class of mismatch impossible by construction.
 *
 * `currentEnabled` MUST be passed verbatim — `undefined` (D-BB-10: no rollout doc yet, every
 * non-internal block is on) is NOT the same as `[]` (explicitly nothing on). Coalescing it
 * before calling this function silently defeats the legacy-tenant safety net; `effectiveFeatures`
 * (imported, not reimplemented here) is the single place that interprets `undefined` correctly,
 * and this function relies on it doing so for BOTH sides in the same way `FeatureStore` does.
 */
export function blocksRemovedBySave(input: {
  catalogue: FeatureBlock[];
  rollouts: FeatureRollout[];
  /** app-config's field verbatim — `undefined` = legacy doc, D-BB-10. Never coalesce. */
  currentEnabled: string[] | undefined;
  nextEnabled: string[];
  tenantId: string;
}): string[] {
  const { catalogue, rollouts, currentEnabled, nextEnabled, tenantId } = input;
  const before = effectiveFeatures({ catalogue, rollouts, enabled: currentEnabled, tenantId });
  const after = effectiveFeatures({ catalogue, rollouts, enabled: nextEnabled, tenantId });
  return [...before].filter(id => !after.has(id));
}

/** One row of a block's menu subtree, flattened for display in the picker. */
export interface MenuOutlineRow {
  /** Nesting level in the block's `menu` tree — 0 for a top-level (root-nav) entry. */
  depth: number;
  key: string;
  name: string;
  /** '' for a `sub` node, which is a container and navigates nowhere. */
  url: string;
  action: MenuSpec['action'];
  roleNeeded: RoleName;
  /**
   * The key to hand to `TranslatePipe` — the spec's raw `label` run through the SAME
   * `resolveMenuLabelKey` the rendered menu uses, so the picker shows the very wording the
   * admin sees in the sidebar rather than a bare `@item.…` key.
   */
  labelKey: string;
}

/**
 * A block's `menu` specs flattened depth-first, so the picker can answer the one question a
 * checkbox alone cannot: WHICH menu entries and routes does this toggle switch on?
 *
 * Reads the catalogue, not the live `menuItems` documents: the point is what the block
 * OWNS. Where a live doc has drifted from that, the drift section at the top of the screen is
 * what says so.
 *
 * `version: ''` in the token context is deliberate — no catalogue label carries `@VERSION@`
 * (the version row's label is a bare string, see `feature-blocks.ts`), and the picker has no
 * business resolving a running app version to render a structural outline.
 */
export function menuOutlineOf(block: FeatureBlock): MenuOutlineRow[] {
  const rows: MenuOutlineRow[] = [];
  const walk = (specs: MenuSpec[], depth: number): void => {
    for (const spec of specs) {
      rows.push({
        depth, key: spec.key, name: spec.name, url: spec.url, action: spec.action,
        roleNeeded: spec.roleNeeded, labelKey: resolveMenuLabelKey(spec.label, { version: '' }),
      });
      if (spec.children && spec.children.length > 0) walk(spec.children, depth + 1);
    }
  };
  walk(block.menu, 0);
  return rows;
}

/** Where a menu name is declared in the catalogue — the context a drift row needs. */
export interface MenuReference {
  /** Ids of every block that declares a spec with this name. */
  blockIds: string[];
  /** Names of the parent specs it is nested under. Empty for a root-nav entry. */
  parents: string[];
}

/**
 * Indexes the whole catalogue by menu NAME → who declares it and under which parents.
 *
 * A drift row identifies a live document, and a document is resolved by `name` — but several
 * blocks legitimately declare the same name (`filter-toggle` is declared by `calevent`,
 * `document`, `finance` and `meeting`; `cms-menu`/`aoc-menu`/`subjects-menu` are shared
 * parents by design). Without this map the picker prints the bare name four times over and
 * the reader cannot tell whether that is one document or four.
 */
export function menuReferencesByName(catalogue: FeatureBlock[]): Map<string, MenuReference> {
  const index = new Map<string, { blockIds: Set<string>; parents: Set<string> }>();
  const record = (name: string, blockId: string, parent: string | undefined): void => {
    const entry = index.get(name) ?? { blockIds: new Set<string>(), parents: new Set<string>() };
    entry.blockIds.add(blockId);
    if (parent) entry.parents.add(parent);
    index.set(name, entry);
  };
  for (const block of catalogue) {
    const walk = (specs: MenuSpec[], parent: string | undefined): void => {
      for (const spec of specs) {
        record(spec.name, block.id, parent);
        if (spec.children && spec.children.length > 0) walk(spec.children, spec.name);
      }
    };
    walk(block.menu, undefined);
  }
  return new Map([...index].map(([name, entry]) =>
    [name, { blockIds: [...entry.blockIds], parents: [...entry.parents] }]));
}

/**
 * Minimal HTML escape for values interpolated into an alert message.
 *
 * `AlertOptions.message` is rendered as HTML in every app (`innerHTMLTemplatesEnabled: true`
 * in each `app.config.ts`), and the strings put into it here come from Firestore documents,
 * not from code. Ionic's own sanitizer strips scripts and `on*` handlers, but relying on it
 * to undo our own bad concatenation is backwards: escape at the point of interpolation.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The fields of a picker drift row this comparison needs. */
export interface DriftRowLike {
  name: string;
  docId: string;
  field: string;
  live: string;
  /** What THIS app's catalogue says the value should be. */
  catalogue: string;
}

/**
 * What the server actually plans to overwrite, checked against what this screen shows.
 *
 * The catalogue is compiled into TWO artefacts - the app bundle (which produces the drift
 * list) and `dist/apps/functions` (which produces the writes). They agree only while the
 * functions have been deployed since the last `feature-blocks.ts` edit. When they have not:
 *
 *  - a row whose live value the DEPLOYED catalogue already agrees with is planned as nothing
 *    at all (`unplanned`) - the apply reports success and the row never clears;
 *  - a row the two catalogues disagree on is written to the DEPLOYED value (`conflicting`),
 *    so the row survives pointing the other way, which reads like the write went backwards.
 *
 * Both were silent before: the confirmation was built from the client's own rows and the
 * write was fired blind. That is why the dialog now asks for a dry run first.
 *
 * Observed live on 2026-09-06 (tenant scs): `contextMenuChat` unplanned, `c-contentpage` /
 * `cp-sort-sections` / `page-edit` conflicting, all four because the deployed functions
 * predated the catalogue edits the running app already carried.
 */
export interface CataloguePlanComparison {
  /** The server's plan, verbatim. */
  planned: MenuStructureChange[];
  /** Rows the server plans no write for. */
  unplanned: DriftRowLike[];
  /** Rows the server plans to write a DIFFERENT value to than this app expects. */
  conflicting: { row: DriftRowLike; serverValue: string }[];
}

export function comparePlanToDrift(
  rows: DriftRowLike[], overwritten: MenuStructureChange[],
): CataloguePlanComparison {
  const byTarget = new Map(overwritten.map(change => [change.docId + ' ' + change.field, change]));
  const unplanned: DriftRowLike[] = [];
  const conflicting: { row: DriftRowLike; serverValue: string }[] = [];
  for (const row of rows) {
    const change = byTarget.get(row.docId + ' ' + row.field);
    if (!change) unplanned.push(row);
    else if (change.to !== row.catalogue) conflicting.push({ row, serverValue: change.to });
  }
  return { planned: overwritten, unplanned, conflicting };
}
