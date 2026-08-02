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
  /** Lazy route fragment this block owns. Called only when composing the table. */
  routes: () => unknown[];
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
