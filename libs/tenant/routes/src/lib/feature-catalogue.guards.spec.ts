import { Injector, runInInjectionContext } from '@angular/core';
import type { ActivatedRouteSnapshot, CanActivateFn, Route, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AppStore } from '@okr/shared-feature';

import { FEATURE_ROUTES } from './feature-catalogue';

/**
 * THE SAFETY NET FOR THE 2026-08-05 RULING, and specifically for how it was applied to `/aoc`.
 *
 * The ruling softened four routes to match their menu documents. Two of them (`aoc/website`,
 * `/aoc/srv`) sit under the `/aoc` parent, whose `isAdminGuard()` Angular evaluates FIRST — so
 * softening the children alone would have been a no-op. The admin gate therefore moved down
 * onto the fourteen children the ruling does not name, and the parent keeps only the
 * `isPrivilegedGuard` floor.
 *
 * That arrangement is correct but fragile in one specific way: a child added to `/aoc` without
 * its own `canActivate` silently inherits `privileged` where it used to inherit `admin`. This
 * spec is what makes that fail loudly. It asserts BEHAVIOUR, not guard identity —
 * `isAdminGuard()` mints a fresh closure per call, so there is nothing to compare by reference,
 * and behaviour is the property that matters anyway.
 */

const AOC_SOFTENED = ['srv', 'website'] as const;

/** Roles is a flag map (`{ admin: true }`), not an array — see `checkAuthorization`. */
function injectorFor(roles: Record<string, boolean>): Injector {
  return Injector.create({
    providers: [{ provide: AppStore, useValue: { currentUser: () => ({ roles }) } }],
  });
}

const ADMIN = injectorFor({ admin: true });
const PRIVILEGED = injectorFor({ privileged: true });
const CONTENT_ADMIN = injectorFor({ contentAdmin: true });
const REGISTERED = injectorFor({ registered: true });

/**
 * Runs a route's whole ancestor→self guard chain the way the router would: every guard must
 * pass. The feature gate composed by `composeGatedFeatureRoutes` is deliberately NOT part of
 * this — that is a per-tenant packaging question, and `compose-gated-routes.spec.ts` owns it.
 */
function activates(injector: Injector, ...chain: Route[]): boolean {
  const guards = chain.flatMap(route => (route.canActivate ?? []) as CanActivateFn[]);
  expect(guards.length, 'route chain has no guard at all').toBeGreaterThan(0);
  return guards.every(guard => runInInjectionContext(injector, () =>
    guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot)) === true);
}

function fragmentOf(blockId: string, path: string): Route {
  const block = FEATURE_ROUTES.find(b => b.id === blockId);
  expect(block, `no FEATURE_ROUTES entry '${blockId}'`).toBeDefined();
  const hit = block?.routes().find(r => r.path === path);
  expect(hit, `block '${blockId}' owns no top-level fragment '${path}'`).toBeDefined();
  return hit as Route;
}

function aocChild(path: string): { parent: Route; child: Route } {
  const parent = fragmentOf('aoc', 'aoc');
  const child = (parent.children ?? []).find(c => c.path === path);
  expect(child, `/aoc has no child '${path}'`).toBeDefined();
  return { parent, child: child as Route };
}

describe('/aoc guards after the 2026-08-05 ruling', () => {
  it('every child the ruling does NOT name stays admin-only', () => {
    const { children = [] } = fragmentOf('aoc', 'aoc');
    const leaked = children
      .filter(child => !AOC_SOFTENED.includes(child.path as typeof AOC_SOFTENED[number]))
      .filter(child => activates(PRIVILEGED, child)) // the child's OWN guard must reject
      .map(child => child.path);

    expect(leaked, 'a /aoc child is reachable by a non-admin — the parent no longer covers it').toEqual([]);
    expect(children.length, 'children were added or removed; re-check the ruling list').toBe(16);
  });

  it('an admin still reaches every /aoc screen', () => {
    const { children = [] } = fragmentOf('aoc', 'aoc');
    const parent = fragmentOf('aoc', 'aoc');
    const blocked = children.filter(child => !activates(ADMIN, parent, child)).map(child => child.path);

    expect(blocked).toEqual([]);
  });

  it('the two softened screens are reachable by a privileged non-admin', () => {
    AOC_SOFTENED.forEach(path => {
      const { parent, child } = aocChild(path);
      expect(activates(PRIVILEGED, parent, child), `/aoc/${path} still blocked`).toBe(true);
    });
  });

  it('the /aoc floor still keeps a merely-registered user out', () => {
    const { children = [] } = fragmentOf('aoc', 'aoc');
    const parent = fragmentOf('aoc', 'aoc');
    const reachable = children.filter(child => activates(REGISTERED, parent, child)).map(child => child.path);

    expect(reachable).toEqual([]);
  });

  /**
   * THE RULING'S RESIDUE, pinned so it is not mistaken for a passing requirement. The menu docs
   * say `contentAdmin`; the strongest available softening is `isPrivilegedGuard`
   * (`hasRole('privileged')` → `['privileged', 'admin']`), which does not include
   * `contentAdmin`. A user whose only role is `contentAdmin` therefore still sees the menu row
   * and still cannot navigate. Change this expectation only together with a real
   * contentAdmin-aware guard.
   */
  it('a contentAdmin-only user is STILL blocked (no isContentAdminGuard exists)', () => {
    const { parent, child } = aocChild('website');
    expect(activates(CONTENT_ADMIN, parent, child)).toBe(false);
    expect(activates(CONTENT_ADMIN, fragmentOf('pdf-template', 'templates'))).toBe(false);
    expect(activates(CONTENT_ADMIN, fragmentOf('forms', 'forms'))).toBe(false);
  });
});

describe('the two softened top-level fragments', () => {
  it('/templates and /forms admit a privileged non-admin, and no one below that', () => {
    ([['pdf-template', 'templates'], ['forms', 'forms']] as const).forEach(([blockId, path]) => {
      const fragment = fragmentOf(blockId, path);
      expect(activates(PRIVILEGED, fragment), `/${path} still admin-only`).toBe(true);
      expect(activates(ADMIN, fragment), `/${path} locked out admins`).toBe(true);
      expect(activates(REGISTERED, fragment), `/${path} open to any member`).toBe(false);
    });
  });
});
