import type { RoleName } from '@okr/shared-models';

/** Rollout stage of a block. `disabled` is the kill-switch. */
export type Availability = 'ga' | 'beta' | 'internal' | 'disabled';

export type BundleId =
  | 'core' | 'members' | 'events' | 'finance'
  | 'documents' | 'communication' | 'special';

/** One node of a block's default menu subtree. `key` is the `menuItems` doc id. */
export interface MenuSpec {
  key: string;
  name: string;
  url: string;
  action: 'navigate' | 'sub' | 'context' | 'call' | 'toggle';
  roleNeeded: RoleName;
  /** Presentational defaults — used on create, never rewritten on an existing doc (D-BB-7). */
  icon: string;
  label: string;
  children?: MenuSpec[];
}

/** A Firestore doc this block seeds if absent (category lists, CMS pages). */
export interface SeedSpec {
  collection: string;
  okey: string;
  data: Record<string, unknown>;
}

/**
 * A feature block's pure METADATA — id, dependsOn, bundle, menu specs, seed specs. Zero
 * Angular imports by construction (every field here is plain data), so this type and its
 * instances (`FEATURE_BLOCKS` in `feature-blocks.ts`) are safe for `apps/functions` to
 * import directly.
 *
 * The Angular ROUTE table (`canActivate` guards, `loadComponent`) is deliberately NOT a
 * field here — it lives in `@okr/tenant-feature`'s `BlockRoutes`/`FEATURE_ROUTES`, joined
 * to this type by `id`. Blocks eagerly import `isAdminGuard`/`isAuthenticatedGuard` from
 * `@okr/auth-feature` to populate `canActivate`, and `@okr/auth-feature` pulls in
 * `@angular/core` + an NgRx Signal Store — verified (twice) to grow
 * `dist/apps/functions/main.cjs` from 3.9MB to 15MB and ship live `@angular/core` symbols
 * into the Node runtime if the two are kept together. See
 * `libs/tenant/feature/src/lib/feature-catalogue.sync.spec.ts` for the test that keeps the
 * two halves from drifting apart.
 */
export interface FeatureBlock {
  /** STABLE, immutable — becomes a SKU key (D-BB-5). Never rename. */
  id: string;
  bundle: BundleId;
  label: string;
  icon: string;
  /** true ⇒ always on, never pickable. */
  core?: boolean;
  /** Used when no rollout doc exists (D-BB-10). */
  defaultAvailability: Availability;
  dependsOn: string[];
  menu: MenuSpec[];
  seed?: SeedSpec[];
  /** Collections this block owns — feeds retention + audit. */
  collections: string[];
}

/** Per-block rollout document, `feature-rollout/{blockId}`. */
export interface FeatureRollout {
  okey: string;
  availability: Availability;
  allowTenants: string[];
  denyTenants: string[];
  reason: string;
  updatedAt: string;
  updatedBy: string;
}
