import { runInInjectionContext, Injector } from '@angular/core';
import { DefaultUrlSerializer, Router, type ActivatedRouteSnapshot, type CanActivateFn, type Route, type RouterStateSnapshot, type UrlTree } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { isAdminGuard, isAuthenticatedGuard, isPrivilegedGuard } from '@okr/auth-feature';
import { AppStore } from '@okr/shared-feature';
import { FeatureStore } from '@okr/tenant-feature';
import { FEATURE_BLOCKS } from '@okr/tenant-util';

import { composeGatedFeatureRoutes } from './compose-gated-routes';
import { FEATURE_ROUTES, type BlockRoutes } from './feature-catalogue';

const ROOT_URL = '/public/welcome';

/**
 * Stands in for the three things `isFeatureEnabledGuard` injects. `FeatureStore` and
 * `AppStore` are `signalStore({ providedIn: 'root' })` classes, i.e. usable as plain DI
 * tokens, so a `useValue` override is enough — instantiating the real ones would drag in
 * Firestore (`FeatureRolloutService`, `AppConfigService`) and turn a route-composition test
 * into an integration test of the data layer. `Router` is stubbed down to `parseUrl` alone,
 * backed by the REAL `DefaultUrlSerializer` so the redirect target is a genuine `UrlTree`
 * rather than a string.
 *
 * A bare `Injector.create`, NOT `TestBed`: `TestBed.configureTestingModule` compiles a test
 * NgModule and, in doing so, walks every JIT-compiled Angular class this spec's import graph
 * has pulled in — `@okr/tenant-feature`'s barrel exports `FeaturePicker`, an Ionic
 * standalone component — and blows up in `applyProviderOverridesInScope` with
 * "Cannot read properties of null (reading 'ngModule')". None of that machinery is needed
 * to call one `CanActivateFn` in an injection context.
 */
function injectorFor(effective: string[]): Injector {
  const serializer = new DefaultUrlSerializer();
  return Injector.create({
    providers: [
      { provide: Router, useValue: { parseUrl: (url: string): UrlTree => serializer.parse(url) } },
      { provide: FeatureStore, useValue: { effective: () => new Set(effective) } },
      { provide: AppStore, useValue: { appConfig: () => ({ rootUrl: ROOT_URL }) } },
    ],
  });
}

/**
 * The verdict of the FEATURE gate alone — `canActivate[0]`, which the two ordering tests
 * below independently prove is the guard composition prepended. The rest of the chain is
 * deliberately not run: `isAuthenticatedGuard` returns an Observable over Firebase Auth and
 * the role guards read `AppStore.currentUser()`, none of which a route-composition test has
 * any business standing up — and when the feature gate blocks, the router never reaches
 * them either.
 */
function featureVerdict(route: Route, injector: Injector): true | UrlTree {
  const guard = (route.canActivate ?? [])[0] as CanActivateFn;
  expect(guard, 'fragment has no canActivate — composition did not gate it').toBeTypeOf('function');
  const verdict = runInInjectionContext(injector, () =>
    guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
  return verdict as true | UrlTree;
}

/**
 * `BlockRoutes.routes` is a FACTORY — every call rebuilds the fragments, and with them the
 * `isAdminGuard()` closures and `loadComponent` thunks inside. Calling it once and pinning
 * the result is what makes the by-reference assertions below mean anything; comparing two
 * separate invocations would compare different function objects and fail for the wrong
 * reason.
 */
function pin(block: BlockRoutes): { original: Route[]; gated: Route[] } {
  const original = block.routes();
  return { original, gated: composeGatedFeatureRoutes([{ id: block.id, routes: () => original }]) };
}

/**
 * The composed fragment a NAMED block contributes at a given top-level path. Not a lookup
 * over the whole table: two blocks legitimately own a top-level `public` fragment
 * (`calevent`'s `/public/calendar` and `cms`'s `/public/:id`), so a `find` by path alone
 * would silently answer about the wrong block.
 */
function fragmentOf(blockId: string, path: string): Route {
  const block = FEATURE_ROUTES.find(b => b.id === blockId);
  expect(block, `no FEATURE_ROUTES entry '${blockId}'`).toBeDefined();
  const hit = pin(block as BlockRoutes).gated.find(r => r.path === path);
  expect(hit, `block '${blockId}' owns no top-level fragment '${path}'`).toBeDefined();
  return hit as Route;
}

const allBlockIds = (): string[] => FEATURE_BLOCKS.map(b => b.id);

describe('composeGatedFeatureRoutes', () => {
  /**
   * THE RULING THIS WHOLE FUNCTION EXISTS FOR. The repo owner set `games` to
   * `defaultAvailability: 'disabled'` on 2026-08-04 intending `/quiz` to disappear, and the
   * `games` block deliberately KEEPS its route fragment (disabling is not deleting). With
   * the ungated `composeFeatureRoutes` from `@okr/tenant-util` — which is what
   * `feature-catalogue.spec.ts` calls, and therefore the obvious thing to copy — `/quiz`
   * would stay reachable behind nothing but `isAuthenticatedGuard` and the ruling would do
   * nothing at all.
   */
  it('a route belonging to a block the tenant does not have is NOT reachable', () => {
    const injector = injectorFor(allBlockIds().filter(id => id !== 'games'));
    const verdict = featureVerdict(fragmentOf('games', 'quiz'), injector);

    expect(verdict).not.toBe(true);
    expect(String(verdict)).toBe(ROOT_URL);
  });

  it('the same route IS reachable for a tenant that has the block', () => {
    expect(featureVerdict(fragmentOf('games', 'quiz'), injectorFor(['games']))).toBe(true);
  });

  /**
   * `core: true` bypasses ENABLEMENT inside `effectiveFeatures`, never ROLLOUT — a core
   * block whose `feature-rollout/<id>` doc says `disabled` (or deny-lists the tenant) drops
   * out of `effective()` and must then be unreachable. That is the "kill a broken core block
   * without a redeploy" lever, and it only exists if the guard is applied to core blocks
   * too. `cms` is `core: true`; `/private` is a fragment only `cms` owns.
   */
  it('a core: true block is gated as well (rollout can still kill it)', () => {
    expect(FEATURE_BLOCKS.find(b => b.id === 'cms')?.core).toBe(true);

    const withoutCms = injectorFor(allBlockIds().filter(id => id !== 'cms'));
    expect(featureVerdict(fragmentOf('cms', 'private'), withoutCms)).not.toBe(true);

    expect(featureVerdict(fragmentOf('cms', 'private'), injectorFor(['cms']))).toBe(true);
  });

  /**
   * Order matters twice over: the feature gate must run FIRST (so a tenant without the block
   * is redirected before a role check can leak that the feature exists), and the fragment's
   * own guards must survive unchanged AFTER it — not reordered, not replaced. A synthetic
   * block keeps the guard identities checkable by reference.
   */
  it('preserves the fragment\'s own guards, in order, after the feature guard', () => {
    const admin = isAdminGuard();
    const [route] = composeGatedFeatureRoutes([{
      id: 'x',
      routes: (): Route[] => [{ path: 'x', canActivate: [isAuthenticatedGuard, admin] }],
    }]);

    expect(route.canActivate).toHaveLength(3);
    expect(route.canActivate?.[1]).toBe(isAuthenticatedGuard);
    expect(route.canActivate?.[2]).toBe(admin);
    expect(route.canActivate?.[0]).not.toBe(isAuthenticatedGuard);
    expect(route.canActivate?.[0]).not.toBe(admin);
  });

  /**
   * The same invariant over the REAL catalogue rather than one synthetic fragment: for every
   * top-level fragment of every block, the composed `canActivate` must be exactly the
   * original array with one guard prepended. Catches a partial application (some blocks
   * gated, some not) and a guard dropped or reordered during composition — neither of which
   * the synthetic test above would see.
   */
  it('every top-level fragment of every block is gated, with its original guards intact', () => {
    const defects: string[] = [];

    FEATURE_ROUTES.forEach(block => {
      const { original, gated } = pin(block);
      if (gated.length !== original.length) {
        defects.push(`${block.id}: fragment count ${original.length} → ${gated.length}`);
        return;
      }
      original.forEach((before, i) => {
        const after = gated[i].canActivate ?? [];
        const own = before.canActivate ?? [];
        if (after.length !== own.length + 1) {
          defects.push(`${block.id}[${i}] '${before.path}': ${own.length} guard(s) → ${after.length}`);
          return;
        }
        own.forEach((guard, g) => {
          if (after[g + 1] !== guard) defects.push(`${block.id}[${i}] '${before.path}': guard ${g} changed`);
        });
      });
    });

    expect(defects).toEqual([]);
  });

  /**
   * The gate is applied to the top-level fragment ONLY, never pushed down into `children`: a
   * child inherits its ancestor's `canActivate`, so duplicating it would cost an extra
   * `inject`/`Set.has` per segment and buy nothing. Also pins that a child's OWN guards come
   * through untouched — `cms`'s `/page` child carries `isPrivilegedGuard`.
   */
  it('does not touch children (the subtree is passed through by reference)', () => {
    FEATURE_ROUTES.forEach(block => {
      const { original, gated } = pin(block);
      original.forEach((before, i) => {
        expect(gated[i].children, `${block.id} '${before.path}'`).toBe(before.children);
      });
    });

    expect(fragmentOf('cms', 'page').children?.[0].canActivate).toEqual([isPrivilegedGuard]);
  });

  /** Nothing is dropped: one composed fragment per fragment the catalogue declares. */
  it('composes every block\'s fragments and no others', () => {
    const declared = FEATURE_ROUTES.reduce((n, b) => n + b.routes().length, 0);
    expect(composeGatedFeatureRoutes(FEATURE_ROUTES)).toHaveLength(declared);
  });
});
