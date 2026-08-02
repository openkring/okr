import type { Route } from '@angular/router';
import { isAdminGuard } from '@okr/auth-feature';
import { isAuthenticatedGuard } from '@okr/auth-feature';

/**
 * A feature block's Angular ROUTE fragment — `canActivate` guards + `loadComponent`. Split
 * out of `@okr/tenant-util`'s `FeatureBlock` (metadata only) because blocks eagerly import
 * `isAdminGuard`/`isAuthenticatedGuard` from `@okr/auth-feature`, which pulls in
 * `@angular/core` (`inject`) and `@okr/shared-feature`'s `AppStore` (an NgRx Signal Store).
 * `apps/functions` needs the metadata but must never import this: confirmed empirically —
 * adding `FEATURE_CATALOGUE` (the old, unsplit export) to the Cloud Functions build grew
 * `dist/apps/functions/main.cjs` from 3.9MB to 15MB and shipped live `@angular/core`
 * symbols into the Node runtime (task-8 report).
 *
 * Joined to `FEATURE_BLOCKS` (`@okr/tenant-util`) by `id`. `feature-catalogue.sync.spec.ts`
 * fails CI if the two arrays ever drift apart; `feature-catalogue.spec.ts` (route-coverage)
 * fails if a menu url declared in `FEATURE_BLOCKS` resolves against no route here.
 */
export interface BlockRoutes {
  /** Joins to `FeatureBlock.id` in `@okr/tenant-util`'s `FEATURE_BLOCKS`. */
  id: string;
  /** Lazy route fragment this block owns. Called only when composing the table. */
  routes: () => Route[];
}

const calevent: BlockRoutes = {
  id: 'calevent',
  routes: (): Route[] => [{
    path: 'calevent',
    canActivate: [isAuthenticatedGuard],
    children: [{
      // No privileged guard: every authenticated member must reach the event list.
      // CalEventList gates create/edit/delete itself via canChange().
      path: ':listId/:contextMenuName',
      loadComponent: () => import('@okr/calevent-feature').then(m => m.CalEventList),
      data: { color: 'secondary', view: 'grid', showMenu: true },
    }],
  }],
};

const aoc: BlockRoutes = {
  id: 'aoc',
  routes: (): Route[] => [{
    path: 'aoc',
    canActivate: [isAdminGuard()],
    children: [
      { path: 'adminops',   loadComponent: () => import('@okr/aoc-feature').then(m => m.AocAdminOps) },
      { path: 'roles',      loadComponent: () => import('@okr/aoc-feature').then(m => m.AocRoles) },
      { path: 'content',    loadComponent: () => import('@okr/aoc-feature').then(m => m.AocContent) },
      { path: 'data',       loadComponent: () => import('@okr/aoc-feature').then(m => m.AocData) },
      { path: 'statistics', loadComponent: () => import('@okr/aoc-feature').then(m => m.AocStatistics) },
      { path: 'storage',    loadComponent: () => import('@okr/aoc-feature').then(m => m.AocStorage) },
    ],
  }],
};

/**
 * Every feature block's Angular route fragment. Adding a block here is HALF of what makes
 * a feature reachable — the matching metadata (id, dependsOn, bundle, menu, seed) must
 * also be added to `FEATURE_BLOCKS` in `@okr/tenant-util`. Tasks 12-18 fill in the
 * remaining blocks, one bundle each; these two exist because they are p13's bug.
 */
export const FEATURE_ROUTES: BlockRoutes[] = [calevent, aoc];
