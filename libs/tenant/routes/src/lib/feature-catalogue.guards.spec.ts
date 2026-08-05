import { Injector, runInInjectionContext } from '@angular/core';
import type { ActivatedRouteSnapshot, CanActivateFn, Route, RouterStateSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AppStore } from '@okr/shared-feature';

import { FEATURE_ROUTES } from './feature-catalogue';

/**
 * THE SAFETY NET FOR THE 2026-08-05 RULINGS, and specifically for how they were applied to
 * `/aoc`.
 *
 * Five live menu documents declare `roleNeeded: contentAdmin` while their routes demanded more.
 * Ruling R-5 added `isContentAdminGuard` and put it on all five. Three of them (`aoc/website`,
 * `/aoc/srv`, `/aoc/tag`) sit under the `/aoc` parent, whose guard Angular evaluates FIRST — so
 * the parent had to become a floor a contentAdmin can pass (`isContentAdminGuard()`, the union
 * of what the children require), while each of the thirteen children the rulings do not name
 * carries its own `isAdminGuard()`.
 *
 * Two things that arrangement can silently lose, both pinned below: a `/aoc` child added
 * without its own guard now inherits the contentAdmin FLOOR rather than `admin`, and a revert
 * of any of the five to `isPrivilegedGuard` would look harmless while re-breaking the exact
 * role the menu documents name. Assertions are BEHAVIOURAL, not by guard identity —
 * `isAdminGuard()`/`isContentAdminGuard()` mint a fresh closure per call, so there is nothing
 * to compare by reference, and behaviour is the property that matters anyway.
 */

/** The `/aoc` children ruled down to contentAdmin. Everything else under `/aoc` is admin-only. */
const AOC_CONTENT_ADMIN = ['tag', 'srv', 'website'] as const;

/** All five routes ruled to match their menu doc's `roleNeeded: contentAdmin`. */
const RULED = [
  { menuDoc: 'templates', blockId: 'pdf-template', path: 'templates', child: undefined },
  { menuDoc: 'forms-all', blockId: 'forms', path: 'forms', child: undefined },
  { menuDoc: 'aoc-website', blockId: 'aoc', path: 'aoc', child: 'website' },
  { menuDoc: 'aoc-srv', blockId: 'aoc', path: 'aoc', child: 'srv' },
  { menuDoc: 'tag-all', blockId: 'aoc', path: 'aoc', child: 'tag' },
] as const;

/** Roles is a flag map (`{ admin: true }`), not an array — see `checkAuthorization`. */
function injectorFor(roles: Record<string, boolean>): Injector {
  return Injector.create({
    providers: [{ provide: AppStore, useValue: { currentUser: () => ({ roles }) } }],
  });
}

const ADMIN = injectorFor({ admin: true });
const CONTENT_ADMIN = injectorFor({ contentAdmin: true });
const PRIVILEGED = injectorFor({ privileged: true });
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

/** The full guard chain of a ruled route, parent included where there is one. */
function chainOf(entry: typeof RULED[number]): Route[] {
  const fragment = fragmentOf(entry.blockId, entry.path);
  return entry.child ? [fragment, aocChild(entry.child).child] : [fragment];
}

describe('the five routes ruled to match their menu documents', () => {
  /**
   * THE RULING ITSELF, and the test that fails on a revert to `isPrivilegedGuard`. That guard
   * is `hasRole('privileged')` → `['privileged', 'admin']`, which never admitted `contentAdmin`
   * — the very role all five menu documents name. This assertion is the difference between the
   * dead end being narrowed and being closed.
   */
  it('a contentAdmin reaches all five', () => {
    const blocked = RULED
      .filter(entry => !activates(CONTENT_ADMIN, ...chainOf(entry)))
      .map(entry => entry.menuDoc);

    expect(blocked, 'menu row visible, navigation still cancelled — the ruling is not in effect').toEqual([]);
  });

  it('an admin reaches all five too (softening never locks admins out)', () => {
    expect(RULED.filter(entry => !activates(ADMIN, ...chainOf(entry))).map(e => e.menuDoc)).toEqual([]);
  });

  /**
   * `privileged` is NOT `contentAdmin`: the two are siblings and neither implies the other
   * (`hasRole` maps each to `[<role>, 'admin']`). A privileged-only user passing any of the
   * five would mean a guard drifted back to `isPrivilegedGuard`.
   */
  it('a privileged-only user reaches none of the five', () => {
    expect(RULED.filter(entry => activates(PRIVILEGED, ...chainOf(entry))).map(e => e.menuDoc)).toEqual([]);
  });

  it('a merely-registered member reaches none of the five', () => {
    expect(RULED.filter(entry => activates(REGISTERED, ...chainOf(entry))).map(e => e.menuDoc)).toEqual([]);
  });
});

describe('/aoc guards after the 2026-08-05 rulings', () => {
  /**
   * The floor is no longer `admin`, so "the parent will catch it" is no longer true. Every
   * child must state its own requirement — this is what makes the next test meaningful.
   */
  it('every /aoc child carries its own guard', () => {
    const { children = [] } = fragmentOf('aoc', 'aoc');
    const unguarded = children.filter(c => (c.canActivate ?? []).length === 0).map(c => c.path);

    expect(unguarded, 'child would silently inherit the contentAdmin floor').toEqual([]);
    expect(children.length, 'children were added or removed; re-check the ruling list').toBe(16);
  });

  it('every child the rulings do NOT name stays admin-only', () => {
    const { children = [] } = fragmentOf('aoc', 'aoc');
    const others = children.filter(c => !AOC_CONTENT_ADMIN.includes(c.path as typeof AOC_CONTENT_ADMIN[number]));

    expect(others.length, 'expected thirteen admin-only /aoc children').toBe(13);
    // The child's OWN guard must reject both non-admin roles, independently of the floor.
    expect(others.filter(c => activates(CONTENT_ADMIN, c)).map(c => c.path)).toEqual([]);
    expect(others.filter(c => activates(PRIVILEGED, c)).map(c => c.path)).toEqual([]);
  });

  it('an admin still reaches every /aoc screen', () => {
    const parent = fragmentOf('aoc', 'aoc');
    const blocked = (parent.children ?? []).filter(c => !activates(ADMIN, parent, c)).map(c => c.path);

    expect(blocked).toEqual([]);
  });

  it('the /aoc floor still keeps a merely-registered user out of everything', () => {
    const parent = fragmentOf('aoc', 'aoc');
    const reachable = (parent.children ?? []).filter(c => activates(REGISTERED, parent, c)).map(c => c.path);

    expect(reachable).toEqual([]);
  });

  /**
   * The floor must not be the thing that decides: a contentAdmin has to clear the PARENT (so
   * the three ruled children are reachable) and still be stopped by each admin-only child. Both
   * halves in one assertion, because getting either wrong reintroduces the defeat-by-ancestor
   * bug the restructuring exists to avoid.
   */
  it('a contentAdmin clears the floor but only reaches the three ruled screens', () => {
    const parent = fragmentOf('aoc', 'aoc');
    const reachable = (parent.children ?? [])
      .filter(c => activates(CONTENT_ADMIN, parent, c))
      .map(c => c.path as string);

    expect(reachable.sort()).toEqual([...AOC_CONTENT_ADMIN].sort());
  });
});
