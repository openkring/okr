import type { MenuOutlineRow } from '@okr/tenant-util';

/**
 * Pure selection logic behind `BlockEnableModal`'s checkbox tree — split out so the one rule
 * that actually matters (an already-present row's key can NEVER be dropped from the emitted
 * `menuKeys`, no matter what the checkbox tree does) is verifiable without a component test
 * harness, which this lib does not otherwise have.
 *
 * `rows` is always `menuOutlineOf(block)` — a depth-first flattening of the block's `menu`
 * tree, so "descendant"/"ancestor" here means exactly what `MenuOutlineRow.depth` encodes:
 * every row after `rows[index]` with a strictly greater depth (an unbroken run, since the
 * walk is depth-first) is a descendant; a row's ancestors are found by walking backward and
 * taking the nearest row at each successively shallower depth.
 */

/** Every row nested BELOW `rows[index]` (depth-first order makes this a contiguous run). */
export function descendantsOf(rows: MenuOutlineRow[], index: number): MenuOutlineRow[] {
  const depth = rows[index].depth;
  const out: MenuOutlineRow[] = [];
  for (let i = index + 1; i < rows.length && rows[i].depth > depth; i++) out.push(rows[i]);
  return out;
}

/** `rows[index]`'s parent chain, walking backward one depth level at a time. */
export function ancestorsOf(rows: MenuOutlineRow[], index: number): MenuOutlineRow[] {
  const out: MenuOutlineRow[] = [];
  let depth = rows[index].depth;
  for (let i = index - 1; i >= 0 && depth > 0; i--) {
    if (rows[i].depth === depth - 1) {
      out.push(rows[i]);
      depth--;
    }
  }
  return out;
}

/**
 * Apply one checkbox flip to `current`, returning the NEW selection (never mutates `current`).
 *
 * Ticking `key` also ticks its ancestor chain — a child cannot be attached without its parent.
 * Unticking `key` also unticks its descendants — EXCEPT any descendant whose key is in
 * `alreadyPresent`: that row renders checked-and-disabled (the admin has no control to object
 * with), so an ancestor's uncheck must not silently take its key out of the selection. This is
 * the one rule `menuKeysFor` below also enforces independently, on purpose — see its own doc
 * comment for why the guarantee is deliberately duplicated rather than relied on here alone.
 */
export function applyRowToggle(
  rows: MenuOutlineRow[],
  current: ReadonlySet<string>,
  alreadyPresent: ReadonlySet<string>,
  key: string,
  checked: boolean,
): Set<string> {
  const index = rows.findIndex(row => row.key === key);
  const next = new Set(current);
  if (index === -1) return next; // defensive: unknown key, nothing to do
  if (checked) {
    next.add(key);
    for (const ancestor of ancestorsOf(rows, index)) next.add(ancestor.key);
  } else {
    next.delete(key);
    for (const descendant of descendantsOf(rows, index)) {
      if (!alreadyPresent.has(descendant.key)) next.delete(descendant.key);
    }
  }
  return next;
}

/**
 * The keys actually sent as `BlockEnableResult.menuKeys` — `selected` UNIONED with
 * `alreadyPresent`, so a key already reachable in the tenant's menu can NEVER be missing from
 * the payload, regardless of how `selected` got built. This is deliberately independent of the
 * cascade guard in `applyRowToggle` (belt AND suspenders, not either/or): the checkbox tree's
 * whole point is showing the admin an accurate preview of what will be attached, and an
 * already-present row is drawn checked-and-disabled specifically so the admin reads it as "this
 * stays, no matter what you do here" — a payload that could still drop it would make that
 * drawing a lie the very next task's confirmation text would then repeat.
 */
export function menuKeysFor(selected: ReadonlySet<string>, alreadyPresent: ReadonlySet<string>): string[] {
  return [...new Set([...selected, ...alreadyPresent])];
}
