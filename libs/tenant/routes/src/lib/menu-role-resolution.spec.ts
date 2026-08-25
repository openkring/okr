import { Injector, runInInjectionContext } from '@angular/core';
import { RedirectCommand, UrlTree, type ActivatedRouteSnapshot, type CanActivateFn, type Route, type RouterStateSnapshot } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { isAuthenticatedGuard } from '@okr/auth-feature';
import { AppStore } from '@okr/shared-feature';
import { FEATURE_BLOCKS, type MenuSpec } from '@okr/tenant-util';

import { FEATURE_ROUTES } from './feature-catalogue';
import { UNGATED_ROUTES } from './ungated-routes';

/**
 * DOES EVERY MENU ROW ACTUALLY OPEN, FOR THE ROLE IT DECLARES?
 *
 * A `navigate` menu doc carries a `roleNeeded`, which decides who SEES the row; the route it
 * points at carries guards, which decide who may OPEN it. Nothing kept those two in step. Every
 * mismatch found in this plan — the twelve closed by rulings R-5/R-6 on 2026-08-05, plus the
 * still-open ones inventoried below — was found by hand-running a throwaway script three times.
 * This file is that script, committed, so the next mismatch fails CI instead of waiting for
 * someone to think of running it.
 *
 * It is deliberately DERIVED, not enumerated: it walks `FEATURE_BLOCKS`' menu specs and resolves
 * each `url` against the composed route table. `feature-catalogue.guards.spec.ts` hardcodes
 * `{menuDoc, blockId, path, child}` triples for the twelve ruled routes — that is the right
 * shape for pinning a RULING (it names what was decided), but it cannot notice a menu doc whose
 * url moves, nor a NEW `roleNeeded` doc pointing at a stricter route. This one can.
 *
 * TWO DIRECTIONS, and they are not the same problem:
 *   - route STRICTER than the menu doc → the row is visible and the navigation silently
 *     cancels. A UX dead end. This is the class the rulings closed.
 *   - route WEAKER than the menu doc → the row is hidden from users who could still reach the
 *     screen by typing the url. An information-disclosure question, not a usability one.
 */

const seg = (url: string): string[] => url.split('/').filter(Boolean);

/**
 * The guard chain a url activates through — ancestors first — or `undefined` if the url does
 * not resolve at all. A `:param` segment matches any single segment, matching `urlResolves`
 * (`@okr/tenant-util`); this is not a reimplementation of Angular's matcher and does not need
 * to be.
 */
function chainFor(routes: Route[], segments: string[], acc: CanActivateFn[] = []): CanActivateFn[] | undefined {
  if (segments.length === 0) return acc;
  for (const route of routes) {
    const routeSegments = seg(route.path ?? '');
    if (routeSegments.length > segments.length) continue;
    const head = segments.slice(0, routeSegments.length);
    if (!routeSegments.every((rs, i) => rs.startsWith(':') || rs === head[i])) continue;

    const next = acc.concat((route.canActivate ?? []) as CanActivateFn[]);
    const rest = segments.slice(routeSegments.length);
    if (rest.length === 0) return next;
    const deeper = chainFor(route.children ?? [], rest, next);
    if (deeper) return deeper;
  }
  return undefined;
}

/**
 * Who is asking. `signedIn` is not cosmetic: it decides how `isAuthenticatedGuard` is treated
 * (see `activates`), which is the difference between modelling a member and modelling a visitor.
 */
interface Persona { injector: Injector; signedIn: boolean; }

/** Roles is a flag map (`{ admin: true }`), not an array — see `checkAuthorization`. */
const asMember = (roles: Record<string, boolean>): Persona => ({
  injector: Injector.create({ providers: [{ provide: AppStore, useValue: { currentUser: () => ({ roles }) } }] }),
  signedIn: true,
});

/** A signed-out visitor: no `currentUser`, so `checkAuthorization` denies every role guard. */
const VISITOR: Persona = {
  injector: Injector.create({ providers: [{ provide: AppStore, useValue: { currentUser: () => undefined } }] }),
  signedIn: false,
};

/** A plain signed-in member with no admin role of any kind. */
const MEMBER = asMember({ registered: true });

/**
 * The audience a `roleNeeded` names. `anonymous` means "visible only to signed-out users"
 * (`hasRole`'s own semantics), and `public`/`none` mean "everyone", whose strictest member is
 * likewise a signed-out visitor — so all three model as `VISITOR`. Everything else is a
 * signed-in user holding exactly that role.
 */
function personaFor(roleNeeded: string): Persona {
  return ['anonymous', 'public', 'none'].includes(roleNeeded) ? VISITOR : asMember({ [roleNeeded]: true });
}

/**
 * `isAuthenticatedGuard` is the only non-role guard these chains contain. It injects `AUTH`/
 * `Router` and answers over Firebase auth state, which this harness has no business standing up.
 * For a SIGNED-IN persona it is never the discriminator, so it is skipped; for a VISITOR it is
 * precisely the discriminator, so it BLOCKS. Getting that second half wrong would let an
 * `anonymous` menu doc pointing behind an auth wall read as reachable.
 *
 * Skipped by IDENTITY (a plain `CanActivateFn`, not a factory, so identity is stable) rather
 * than by catching what it throws: a ROLE guard that starts throwing after a DI refactor must
 * fail this suite loudly, not be silently read as "allows".
 */
const NON_ROLE_GUARDS: ReadonlySet<CanActivateFn> = new Set([isAuthenticatedGuard]);

/** Angular's own rule: only `false` and a redirect block. See `feature-catalogue.guards.spec.ts`. */
const blocks = (result: unknown): boolean =>
  result === false || result instanceof UrlTree || result instanceof RedirectCommand;

function activates(chain: CanActivateFn[], persona: Persona): boolean {
  return chain.every(guard => {
    if (NON_ROLE_GUARDS.has(guard)) return persona.signedIn;
    let result: unknown;
    try {
      result = runInInjectionContext(persona.injector, () =>
        guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
    } catch (err) {
      throw new Error(`role guard threw instead of deciding — a "passing" test here would be a lie: ${String(err)}`);
    }
    return !blocks(result);
  });
}

interface NavDoc { key: string; url: string; roleNeeded: string; }

/**
 * Roles that name no privilege, so "is the route WEAKER than this?" is meaningless — the
 * comparison persona for direction 2 is itself a plain `registered` member.
 *
 * ⚠️ This exclusion applies to DIRECTION 2 ONLY. Direction 1 runs over every doc: a
 * `roleNeeded: registered` row pointing at an admin-only route is a perfectly real dead end,
 * and scoping these out of both directions (as this file first did) would hide it. Eight docs
 * are in this bucket today — seven `registered` plus `login` (`anonymous`) — all resolving to
 * routes with no role guard at all, so direction 1 is currently silent on them. Latent, not live.
 */
const UNGATED_ROLES = ['public', 'none', 'anonymous', 'registered'];

const isGated = (doc: NavDoc): boolean => !UNGATED_ROLES.includes(doc.roleNeeded);

function navDocs(): NavDoc[] {
  const out: NavDoc[] = [];
  const visit = (spec: MenuSpec): void => {
    // Only `navigate` carries a router path — `call`/`toggle` docs put an ACTION VERB in `url`
    // (`add`, `exportRaw`), which is correct data and must not be resolved as a route.
    if (spec.action === 'navigate' && spec.url && spec.roleNeeded) {
      out.push({ key: spec.key, url: spec.url, roleNeeded: spec.roleNeeded });
    }
    (spec.children ?? []).forEach(visit);
  };
  FEATURE_BLOCKS.forEach(block => block.menu.forEach(visit));
  // The same doc key can be declared by several blocks (the shared-parent pattern); dedupe so a
  // defect is reported once.
  return [...new Map(out.map(d => [`${d.key}::${d.url}`, d])).values()];
}

// UNGATED_ROUTES appended for the same reason as in feature-catalogue.spec.ts: a menu row
// may point at a control-plane screen that is deliberately not a gateable feature.
const ROUTES = [...FEATURE_ROUTES.flatMap(block => block.routes()), ...UNGATED_ROUTES];
/** Every `navigate` doc that declares a role — direction 1's population. */
const DOCS = navDocs();
/** Those naming a privilege above plain membership — direction 2's population. */
const GATED = DOCS.filter(isGated);

/**
 * KNOWN-OPEN, route STRICTER than the menu doc. One entry, and it must stay one line with a
 * reason — never a loose filter.
 *
 * `addresses` is NOT of the class R-5/R-6 closed: those were `roleNeeded: contentAdmin` against
 * a stricter route, and were closed by adding `isContentAdminGuard`. This one is `privileged`
 * (menu) against `isAdminGuard()` (route), which no ruling covers, and closing it is not
 * cosmetic in either direction — widening the route to `privileged` is a real access increase
 * over the PII vault's address-list screen (spec 1.19), and tightening the doc to `admin` is a
 * live-data edit. It stays flagged in `feature-blocks.ts` until an owner rules.
 */
const KNOWN_DEAD_ENDS: readonly string[] = ['addresses'];

/**
 * KNOWN-OPEN, route WEAKER than the menu doc: the row is hidden from a plain member, but the
 * url is not — anyone who types or bookmarks it reaches the screen.
 *
 * THIS LIST IS AN INVENTORY, NOT AN APPROVAL. It is committed so that a NEW too-weak route
 * fails here, and so that fixing one of these is a deliberate edit to this list rather than an
 * invisible change. No ruling covers this direction: unlike the twelve, closing any of these
 * ADDS a guard where the live `app.routes.ts` has none, i.e. it takes access away from users
 * who have it today, on screens nobody has complained about. Bounded by two facts worth keeping
 * in view: every one of these routes still sits behind `isAuthenticatedGuard`, so nothing here
 * is anonymous, and Firestore rules remain the data boundary — a list screen renders only what
 * its queries are allowed to return.
 *
 * Grouped by the role the menu doc declares.
 */
const KNOWN_WEAKER_THAN_MENU: readonly string[] = [
  // contentAdmin — the four that surfaced alongside the R-5/R-6 work
  'icon-all', 'ownerships-all', 'responsibility-all', 'flighttracker',
  // contentAdmin, and the one entry here that IS covered by a ruling: R-7 (2026-08-25) took
  // the role guard off `document/:listId/:contextMenuName` on purpose. `:listId` is `all` or
  // `f:<folderKey>`, so one guard cannot serve menu docs that legitimately differ — `stuerbord`
  // (scs) and elab's `document-all` both say `registered` and were dead-ending on the
  // contentAdmin guard. `docs`/`folders` are `allow read: if tenantRead()` in firestore.rules,
  // so a member typing `/document/all/c-documents` reads nothing they could not already read.
  'document-all',
  // privileged
  'person-contacts', 'org-all', 'task-all',
  // memberAdmin
  'group-all', 'personal-rel-all', 'workrel-all',
  // resourceAdmin
  'reservation-all', 'transfer-all', 'resource-all', 'rboat-all',
  'lockers-all', 'keys-all', 'boats-private',
  // eventAdmin
  'calevent-all', 'invitation-all',
  // treasurer
  'expenses-all',
];

describe('menu roleNeeded vs. the route it navigates to', () => {
  /**
   * Guards the assertions below against passing VACUOUSLY. If the resolver stopped matching,
   * every "no mismatch" list would be empty for the wrong reason. The second expectation pins
   * that direction 1's population is strictly larger than direction 2's — i.e. the ungated docs
   * really are being checked, which is the whole point of the scoping fix.
   */
  it('every navigate doc that declares a role resolves against the composed route table', () => {
    expect(GATED.length, 'no gated navigate docs found — the walk is broken').toBeGreaterThan(30);
    expect(DOCS.length, 'ungated docs are not reaching direction 1').toBeGreaterThan(GATED.length);
    expect(DOCS.filter(doc => !chainFor(ROUTES, seg(doc.url))).map(d => `${d.key} → ${d.url}`)).toEqual([]);
  });

  /**
   * DIRECTION 1 — the dead-end class the rulings closed. The role the doc declares must be able
   * to open the screen the doc points at.
   *
   * Runs over EVERY doc, ungated ones included: `roleNeeded: registered` pointing at an
   * admin-only route, or `anonymous` pointing behind an auth wall, are dead ends exactly like
   * `contentAdmin` pointing at an admin route. Only direction 2 has a reason to skip them.
   */
  it('the role a menu doc declares can open the route it points at', () => {
    const deadEnds = DOCS
      .filter(doc => !KNOWN_DEAD_ENDS.includes(doc.key))
      .filter(doc => !activates(chainFor(ROUTES, seg(doc.url)) as CanActivateFn[], personaFor(doc.roleNeeded)))
      .map(doc => `${doc.key} → ${doc.url} (menu says ${doc.roleNeeded}, route is stricter)`);

    expect(deadEnds, 'menu row visible, navigation silently cancelled').toEqual([]);
  });

  /** A stale exclusion is as bad as a missing one: every entry must still be a real dead end. */
  it('every KNOWN_DEAD_ENDS entry is still one', () => {
    const fixed = KNOWN_DEAD_ENDS.filter(key => {
      const doc = DOCS.find(d => d.key === key);
      if (!doc) return true; // doc gone — the exclusion is stale either way
      return activates(chainFor(ROUTES, seg(doc.url)) as CanActivateFn[], personaFor(doc.roleNeeded));
    });

    expect(fixed, 'resolved — delete it from KNOWN_DEAD_ENDS').toEqual([]);
  });

  /**
   * DIRECTION 2 — route weaker than the doc declares. Asserted as an exact SET so it fails both
   * ways: a new too-weak route appears, or one of the inventoried ones is fixed without the
   * list being updated. Gated docs only: the comparison persona IS a `registered` member, so
   * asking whether a `registered` doc is "weaker than declared" compares a role with itself.
   */
  it('no route is reachable by a plain member unless it is in the known inventory', () => {
    const weaker = GATED
      .filter(doc => activates(chainFor(ROUTES, seg(doc.url)) as CanActivateFn[], MEMBER))
      .map(doc => doc.key);

    expect([...weaker].sort(),
      'a menu doc declares a role its route does not enforce — add it to the inventory only with a ruling')
      .toEqual([...KNOWN_WEAKER_THAN_MENU].sort());
  });
});
