import type { Route } from '@angular/router';
import { isAdminGuard } from '@okr/auth-feature';

/**
 * Routes that belong to NO feature block and must therefore never pass through
 * `isFeatureEnabledGuard` — but which a catalogued `menuItems` document may still point at.
 *
 * There is exactly one today: the feature picker. It must not be feature-gated, because it is
 * the screen you use to switch a block back on — gating it on a block would let a tenant lock
 * itself out of its own configuration. `tenant` is in `NON_BLOCK_DOMAINS` for the same reason:
 * control plane, not a product feature.
 *
 * WHY THIS EXISTS AS AN EXPORTED CONSTANT rather than a literal in each app's `app.routes.ts`,
 * which is where it lived until the `tenant-features` menu row was catalogued: the two
 * catalogue specs (`feature-catalogue.spec.ts`, `menu-role-resolution.spec.ts`) compose their
 * route table from `FEATURE_ROUTES` alone, so a menu url pointing at an app-level literal
 * resolved against nothing and failed coverage — while the route itself was perfectly fine.
 * Both specs now append this array, so the picker is catalogued for the purpose of "does every
 * menu row open?" WITHOUT being catalogued as a gateable feature. Keeping the definition here
 * also stops the catalogue-driven apps (scs, p13, okr) from drifting apart on it. `bkg` and
 * `kring` still hand-write their route tables and do not call `composeGatedFeatureRoutes` at
 * all, so they carry no picker route — that is a separate, pre-existing gap.
 *
 * The bar for adding an entry is the same as `NON_BLOCK_DOMAINS`: cross-cutting control plane
 * with a menu row. A product screen belongs in `FEATURE_ROUTES` behind its block.
 */
export const UNGATED_ROUTES: Route[] = [
  {
    path: 'tenant/features',
    canActivate: [isAdminGuard()],
    loadComponent: () => import('@okr/tenant-feature').then(m => m.FeaturePicker),
  },
];
