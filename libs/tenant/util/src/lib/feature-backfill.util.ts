import type { FeatureBlock, FeatureRollout } from './feature-catalogue.types';
import { resolveWithDeps } from './feature-deps.util';
import { resolveAvailability } from './feature-rollout.util';
import { blockOwnersOfMenuKey } from './feature-routes.util';

/**
 * ONE-TIME BACKFILL DERIVATION — reconstruct a tenant's `enabledFeatures` from the menu
 * documents it demonstrably owns today. Pure; the Firestore I/O lives in
 * `scripts/backfill-enabled-features.mjs`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS AT ALL
 * ─────────────────────────────────────────────────────────────────────────────────────
 * Every `app-config` doc today has NO `enabledFeatures` field, so `effectiveFeatures`
 * takes the D-BB-10 legacy path (`enabled === undefined` ⇒ "every non-internal block")
 * and the gate enforces nothing. Reproducing that fallback in a backfill would write
 * every non-internal block — including `social-feed` and `games` — into every tenant's
 * array in one shot. This derivation is deliberately built from EVIDENCE instead, and
 * finishes by running the same availability gate the runtime runs.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * THE ATTRIBUTION POLICY — the decision that determines whether the arrays are right
 * ─────────────────────────────────────────────────────────────────────────────────────
 * `menuItems` documents are deliberately CO-DECLARED by several blocks (the "shared
 * parent" pattern: `cmsMenuParent()`, `aocMenuParent()`, `subjectsMenuParent()`,
 * `resourceMenuParent()`, plus `contextMenuChat`/`chat-room-add`/`chat-room-edit` which
 * `subject` and `chat` both declare, and `filter-toggle` which `calevent`, `task` and
 * `document` all declare). `blockOwnersOfMenuKey` returns EVERY declaring block, so the
 * policy question is: what does possessing a co-declared document actually prove?
 *
 * Three candidate policies, and what each would produce:
 *
 *   'all'          Attribute a document to every declaring block.
 *                  REJECTED. A shared parent owned by five blocks does not prove the
 *                  tenant has all five — it proves only that the tenant has SOME child
 *                  under it. Concretely: `aoc-menu` is co-declared by `aoc`, `activity`,
 *                  `user`, `security` and `mobility`. Eight tenants own an `aoc-menu`
 *                  document because they have the `aoc-*` admin screens; under 'all' they
 *                  would each be granted `activity` (the activity-log admin screen) and
 *                  `mobility` (the SCS flight tracker) despite owning neither
 *                  `activity-all` nor `flighttracker`. That is a silent grant of two
 *                  blocks to eight tenants that demonstrably do not run them.
 *
 *   'exclusive'    CHOSEN (the default). Attribute a document only when exactly one block
 *                  declares it. A co-declared document is treated as evidence of nothing.
 *                  Safe by construction: a block is admitted only on proof it cannot
 *                  share. The obvious worry — "does this under-attribute?" — does not
 *                  bite, because the shared PARENTS are shared while their CHILDREN are
 *                  not: `cms-menu` is co-declared by eight blocks, but `menu-all`,
 *                  `page-all`, `section-all` and `icon-all` are declared by `cms` alone,
 *                  `category-all` by `category` alone, `location-all` by `geo` alone, and
 *                  so on. Every block that owns a child of a shared parent also owns that
 *                  child exclusively. Verified against the catalogue: of the 30 blocks,
 *                  only `session`, `i18n`, `avatar`, `comment`, `consent` (all `core:
 *                  true`, hence unioned in below regardless), `games`/`social-feed` (both
 *                  `disabled`, hence gated out below regardless) and `instruments` have no
 *                  exclusively-declared key — see the coverage note at the bottom. (`vcard`
 *                  was in that list until it was made `core: true`.)
 *
 *   'corroborated' Attribute a co-declared document to owner O only if the tenant also
 *                  owns an exclusively-declared document of O. IMPLEMENTED, but note the
 *                  result: it is SET-IDENTICAL to 'exclusive' by construction, because
 *                  its admission condition is "O is already in the exclusive set". It
 *                  differs only in the EVIDENCE it records (it credits the shared parent
 *                  to the blocks that earned it elsewhere). Kept as a named policy so the
 *                  dry-run can demonstrate the equivalence rather than assert it, and so
 *                  the richer evidence listing is available for the hand cross-check.
 *
 * So the live choice is 'exclusive' vs 'all', and the dry-run quantifies it.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * THE REST OF THE PIPELINE
 * ─────────────────────────────────────────────────────────────────────────────────────
 *  - CORE BLOCKS ARE UNIONED IN. `effectiveFeatures` lets `core: true` bypass enablement,
 *    so listing them is redundant at runtime — but omitting them would make the stored
 *    array a poor record of what the tenant actually runs, and would make a future
 *    "core-ness" change silently subtractive. Included deliberately.
 *  - DEPENDENCIES ARE CLOSED OVER, via the same `resolveWithDeps` the runtime uses. This
 *    is runtime-neutral (the runtime would expand them anyway) and keeps the stored array
 *    self-consistent, so nobody reading the doc has to re-run the graph in their head.
 *    `depsOnly` reports which blocks entered this way and no other.
 *  - THE AVAILABILITY GATE RUNS LAST, exactly as in `effectiveFeatures`: `resolveAvailability`
 *    per block, dropping anything not `offered`. This is why `social-feed` and `games`
 *    cannot appear in the output, and why NOTHING here hardcodes those two ids — the day a
 *    third block is set to `disabled` (or a `feature-rollout` doc denies a tenant), this
 *    derivation follows without an edit.
 *
 * COVERAGE GAP, stated rather than hidden: `instruments` is a non-core, non-disabled block
 * with NO menu documents, so no menu-evidence derivation can ever attribute it. (`vcard` had
 * the same problem and left scs/p13/bkg with the export unticked though the feature was live;
 * it is now `core: true` — it owns no collection, no menu and no route, so enablement had no
 * surface to gate anyway.) `instruments` DOES own routes
 * (`/whiteboard`, `/instruments`); leaving it out of every array locks them, which is
 * consistent with the data (its `instruments` and `whiteboards` collections are empty for
 * every tenant) but is a judgement the operator should confirm.
 */
export type AttributionPolicy = 'exclusive' | 'corroborated' | 'all';

/** The subset of a live `menuItems` doc this derivation reads. */
export interface MenuDocInput {
  /** Firestore document id. Often an autoid — NOT reliably the catalogue key. */
  okey: string;
  /**
   * The `name` field. This is what a `MenuSpec.key` must be matched against: the catalogue
   * guarantees `key === name`, while the doc id is frequently an autoid (e.g. the live
   * `icon-sync` doc is `0tnxjt1ajgzaiw0ik2e0`). Matching on the id alone silently misses
   * most documents.
   */
  name?: string;
  tenants?: string[];
  isArchived?: boolean;
}

/**
 * An OWNER RULING that replaces menu-evidence attribution for one tenant.
 *
 * Everything downstream is unchanged: the core union, `resolveWithDeps`, and above all the
 * availability gate still run exactly as for a derived tenant. So an override CANNOT
 * introduce a `disabled` block or bypass a `denyTenants` entry — it only replaces the
 * question "what does the menu data prove?" with "what did the owner rule?".
 */
export interface OwnerOverride {
  /** e.g. `'R-8'` — the ruling id, so the array is traceable to a decision. */
  ruling: string;
  /** ISO date of the ruling. */
  date: string;
  /** Why the derivation was overridden. Shown in the dry-run and stored in the report. */
  reason: string;
  /** The requested block ids, pre-gate. */
  ids: string[];
}

export interface DerivationInput {
  catalogue: FeatureBlock[];
  rollouts: FeatureRollout[];
  menuDocs: MenuDocInput[];
  tenantId: string;
  /** Defaults to `'exclusive'` — see the policy discussion above. */
  policy?: AttributionPolicy;
  /**
   * When present, the tenant's block set comes from this ruling instead of its menu
   * evidence. Menu evidence is still COMPUTED and reported (so the divergence stays
   * visible), it just does not decide the array.
   */
  override?: OwnerOverride;
}

export interface DerivationResult {
  tenantId: string;
  policy: AttributionPolicy;
  /** The proposed `enabledFeatures` value, sorted and deduplicated. */
  enabled: string[];
  /** blockId → the menu-document names that attributed it. Sorted; empty for core/dep-only. */
  evidence: Record<string, string[]>;
  /** Blocks admitted purely because they are `core: true`. */
  coreOnly: string[];
  /** Blocks admitted purely as a transitive dependency of an evidenced block. */
  depsOnly: string[];
  /** Blocks the availability gate refused, with the verdict's availability. */
  gatedOut: { id: string; availability: string }[];
  /** Live menu-doc names matching no catalogue block (tenant-authored). Never attributed. */
  uncatalogued: string[];
  /** Count of live menu docs considered for this tenant. */
  docCount: number;
  /** The owner ruling that produced `enabled`, when one replaced the derivation. */
  override?: OwnerOverride;
  /** What the menu evidence WOULD have produced, present only when an override applied. */
  derivedInstead?: string[];
}

const isLiveForTenant = (doc: MenuDocInput, tenantId: string): boolean =>
  doc.isArchived !== true && Array.isArray(doc.tenants) && doc.tenants.includes(tenantId);

/** The catalogue key a live doc corresponds to: its `name` field, falling back to its id. */
const keyOf = (doc: MenuDocInput): string => doc.name ?? doc.okey;

export function deriveEnabledFeatures(input: DerivationInput): DerivationResult {
  const { catalogue, rollouts, menuDocs, tenantId } = input;
  const policy: AttributionPolicy = input.policy ?? 'exclusive';

  const mine = menuDocs.filter(d => isLiveForTenant(d, tenantId));

  // Pass 1 — split the tenant's live docs by owner multiplicity.
  const exclusiveHits: { block: string; key: string }[] = [];
  const sharedHits: { owners: string[]; key: string }[] = [];
  const uncatalogued = new Set<string>();

  for (const doc of mine) {
    const key = keyOf(doc);
    const owners = blockOwnersOfMenuKey(catalogue, key);
    if (owners.length === 0) { uncatalogued.add(key); continue; }
    if (owners.length === 1) exclusiveHits.push({ block: owners[0], key });
    else sharedHits.push({ owners, key });
  }

  const evidence: Record<string, Set<string>> = {};
  const credit = (block: string, key: string): void => {
    (evidence[block] ??= new Set<string>()).add(key);
  };

  exclusiveHits.forEach(h => credit(h.block, h.key));
  const evidenced = new Set(Object.keys(evidence));

  // Pass 2 — apply the policy to the co-declared documents.
  if (policy === 'all') {
    sharedHits.forEach(h => h.owners.forEach(o => credit(o, h.key)));
  } else if (policy === 'corroborated') {
    // Credits the shared parent only to owners already proven by an exclusive document —
    // set-identical to 'exclusive', richer evidence.
    sharedHits.forEach(h => h.owners.filter(o => evidenced.has(o)).forEach(o => credit(o, h.key)));
  }
  // policy === 'exclusive': co-declared documents are evidence of nothing.

  // An owner ruling replaces WHAT IS REQUESTED, and nothing else. The evidence above is
  // still computed and returned so the divergence from the data stays visible.
  const derivedAttribution = Object.keys(evidence);
  const attributed = input.override ? input.override.ids : derivedAttribution;

  // Union the core blocks, then close over dependencies — the same expansion the runtime's
  // `effectiveFeatures` performs, so the stored array and the runtime agree.
  const coreIds = catalogue.filter(b => b.core === true).map(b => b.id);
  const requested = [...new Set([...attributed, ...coreIds])];
  const withDeps = resolveWithDeps(catalogue, requested);

  // The availability gate — LAST, and identical to the runtime's. Nothing is hardcoded:
  // `disabled` blocks and denied tenants fall out here, whatever their ids happen to be.
  const rolloutById = new Map(rollouts.map(r => [r.okey, r]));
  const enabled: string[] = [];
  const gatedOut: { id: string; availability: string }[] = [];
  for (const id of withDeps) {
    const block = catalogue.find(b => b.id === id);
    if (!block) continue;
    const verdict = resolveAvailability(block, rolloutById.get(id), tenantId);
    if (verdict.offered) enabled.push(id);
    else gatedOut.push({ id, availability: verdict.availability });
  }

  const enabledSet = new Set(enabled);
  const attributedSet = new Set(attributed);
  const requestedSet = new Set(requested);

  return {
    tenantId,
    policy,
    enabled: [...enabled].sort(),
    evidence: Object.fromEntries(
      Object.entries(evidence).map(([k, v]) => [k, [...v].sort()]),
    ),
    coreOnly: coreIds.filter(id => !attributedSet.has(id) && enabledSet.has(id)).sort(),
    depsOnly: enabled.filter(id => !requestedSet.has(id)).sort(),
    gatedOut: gatedOut.sort((a, b) => a.id.localeCompare(b.id)),
    uncatalogued: [...uncatalogued].sort(),
    docCount: mine.length,
    ...(input.override
      ? { override: input.override, derivedInstead: [...derivedAttribution].sort() }
      : {}),
  };
}
