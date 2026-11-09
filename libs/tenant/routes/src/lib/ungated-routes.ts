import type { Route } from '@angular/router';
import { isAdminGuard, isAuthenticatedGuard } from '@okr/auth-feature';

/**
 * Routes that belong to NO feature block and must therefore never pass through
 * `isFeatureEnabledGuard` — but which a catalogued `menuItems` document may still point at.
 *
 * Today these are the feature picker and the two billing screens (`billing`, `pay/:invoiceKey`).
 * The picker must not be feature-gated, because it is the screen you use to switch a block back
 * on — gating it on a block would let a tenant lock itself out of its own configuration. Billing
 * is how the tenant pays the operator; no block may switch it off. `tenant` is in `NON_BLOCK_DOMAINS` for the same reason:
 * control plane, not a product feature.
 *
 * WHY THIS EXISTS AS AN EXPORTED CONSTANT rather than a literal in each app's `app.routes.ts`,
 * which is where it lived until the `tenant-features` menu row was catalogued: the two
 * catalogue specs (`feature-catalogue.spec.ts`, `menu-role-resolution.spec.ts`) compose their
 * route table from `FEATURE_ROUTES` alone, so a menu url pointing at an app-level literal
 * resolved against nothing and failed coverage — while the route itself was perfectly fine.
 * Both specs now append this array, so the picker is catalogued for the purpose of "does every
 * menu row open?" WITHOUT being catalogued as a gateable feature. Keeping the definition here
 * also stops the apps from drifting apart on it — every tenant app composes its table from
 * `composeGatedFeatureRoutes()` plus this array.
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
  // Billing (spec 1.149): how this tenant pays the operator — control plane, never a block a tenant could switch off.
  // Stripe returns to both with `?stripe=done|cancel`; the urls are built by the callables, so keep the paths stable.
  {
    path: 'billing',
    canActivate: [isAdminGuard()],
    loadComponent: () => import('@okr/finance-collection-feature').then(m => m.BillingPage),
  },
  {
    path: 'pay/:invoiceKey',
    canActivate: [isAuthenticatedGuard],
    loadComponent: () => import('@okr/finance-collection-feature').then(m => m.PayPage),
  },
];
