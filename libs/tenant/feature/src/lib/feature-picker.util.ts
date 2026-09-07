import type { FeatureBlock, MenuSpec } from '@okr/tenant-util';

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
