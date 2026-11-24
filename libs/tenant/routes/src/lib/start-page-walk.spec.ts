import { APP_BASE_HREF, LocationStrategy } from '@angular/common';
import { MockLocationStrategy } from '@angular/common/testing';
import { ApplicationRef, computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { provideRouter, Router, type Route } from '@angular/router';
import { Subject, of, type Observable } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';

import { isAppReadyGuard, rootUrlGuard } from '@okr/auth-feature';
import { AUTH } from '@okr/shared-config';
import { AppStore } from '@okr/shared-feature';
import { FeatureRolloutModel } from '@okr/shared-models';
import { FeatureRolloutService } from '@okr/tenant-data-access';

import { composeGatedFeatureRoutes } from './compose-gated-routes';
import { UNGATED_ROUTES } from './ungated-routes';

/**
 * The start pages in use (spec 1.174 §7.4), walked through the real router, the real gated route table, the real
 * guards (`rootUrlGuard`, `isFeatureEnabledGuard`, `isAuthenticatedGuard`) and the real `FeatureStore`. Only the pages
 * themselves are empty, and Firebase is a sign-in state and a rollout list the test drives.
 *
 * A redirect loop never resolves, so every walk is bounded by the test timeout; `hops` counts the navigations.
 */

const TENANT = 'bka';
const DIARY = '/diary/all/c-diary';
const DASHBOARD = '/private/dashboard/c-contentpage';
const PUBLIC_PAGE = '/public/welcome_la21staefa';
const PERSONS = '/person/all/c-persons?filters=search';
const WELCOME = '/public/welcome';

const login = (url: string): string => `/auth/login?returnUrl=${encodeURIComponent(url)}`;
/** The router writes a query its own way ('/' and '?' stay readable): compare what the url says. */
const decoded = (url: string): string => decodeURIComponent(url);

const BLOCK_OF: Record<string, string> = { [DIARY]: 'diary', [DASHBOARD]: 'cms', [PUBLIC_PAGE]: 'cms', [PERSONS]: 'subject' };

function rollout(okey: string, patch: Partial<FeatureRolloutModel>): FeatureRolloutModel {
  return { okey, availability: 'ga', allowTenants: [], denyTenants: [], reason: '', ...patch } as unknown as FeatureRolloutModel;
}
const DIARY_OPEN = rollout('diary', { availability: 'beta', allowTenants: [TENANT] });

/** The route table without its pages: an empty leaf matches the same urls and runs the same guards. */
function withoutPages(routes: Route[]): Route[] {
  return routes.map(original => {
    const route = { ...original };
    delete route.loadComponent;
    delete route.component;
    delete route.loadChildren;
    return route.redirectTo !== undefined ? route : { ...route, children: withoutPages(original.children ?? []) };
  });
}

interface World {
  go: (url: string) => Promise<string>;
  signIn: () => void;
  signOut: () => void;
  hops: () => number;
  appConfigSettled: ReturnType<typeof signal<boolean>>;
}

let app: ApplicationRef | undefined;
afterEach(() => { app?.destroy(); app = undefined; });

async function makeWorld(over: {
  rootUrl: string;
  user?: boolean;
  enabled?: string[];
  rollouts?: FeatureRolloutModel[] | Observable<FeatureRolloutModel[]>;
  appConfigSettled?: boolean;
}): Promise<World> {
  const user = { uid: 'u1' };
  const fbUser = signal<{ uid: string } | null>(over.user ? user : null);
  const appConfigSettled = signal(over.appConfigSettled ?? true);
  const currentUser = computed(() => (fbUser() ? { okey: 'u1', personKey: 'p1', tenants: [TENANT], roles: { registered: true } } : undefined));
  const rollouts$ = Array.isArray(over.rollouts) || over.rollouts === undefined ? of(over.rollouts ?? []) : over.rollouts;
  const config = { rootUrl: over.rootUrl, enabledFeatures: over.enabled ?? ['diary', 'subject'] };
  app = await createApplication({
    providers: [
      provideZonelessChangeDetection(),
      { provide: APP_BASE_HREF, useValue: '/' },
      { provide: LocationStrategy, useClass: MockLocationStrategy },
      provideRouter([
        { path: '', pathMatch: 'full', canActivate: [rootUrlGuard], children: [] },
        {
          path: '', canActivateChild: [isAppReadyGuard],
          children: withoutPages([...composeGatedFeatureRoutes(), ...UNGATED_ROUTES, { path: '**', children: [] }]),
        },
      ]),
      {
        provide: AppStore,
        useValue: {
          fbUser, currentUser, tenantId: signal(TENANT), readinessTimedOut: signal(false),
          isAppReady: signal(true), isUserSessionReady: signal(true), isAppConfigSettled: appConfigSettled,
          // as in production: the class default until the config is there
          appConfig: computed(() => (appConfigSettled() ? config : { rootUrl: WELCOME, enabledFeatures: undefined })),
        },
      },
      {
        provide: AUTH,
        useValue: { onAuthStateChanged: (next: (u: unknown) => void): (() => void) => { next(fbUser()); return (): void => undefined; } },
      },
      // a listen attached without a user is denied: `[]`, and the stream ends
      { provide: FeatureRolloutService, useValue: { list: () => (fbUser() ? rollouts$ : of([])) } },
    ],
  });
  const router = app.injector.get(Router);
  let hops = 0;
  router.events.subscribe(e => { if (e.constructor.name === 'NavigationStart') hops++; });
  return {
    go: async url => { hops = 0; await router.navigateByUrl(url); return decoded(router.url); },
    signIn: () => fbUser.set(user),
    signOut: () => fbUser.set(null),
    hops: () => hops,
    appConfigSettled,
  };
}

describe('start pages, signed out', () => {
  it.each([DIARY, DASHBOARD, PERSONS])('%s asks for a sign-in and comes back to it', async start => {
    const world = await makeWorld({ rootUrl: start });
    expect(await world.go('/')).toBe(decoded(login(start)));
    expect(await world.go(start)).toBe(decoded(login(start)));
    expect(world.hops()).toBeLessThan(4);
  });
  it('the public page opens', async () => {
    expect(await (await makeWorld({ rootUrl: PUBLIC_PAGE })).go('/')).toBe(PUBLIC_PAGE);
  });
  it('a deep link behind the same beta block goes to the sign-in for the start page', async () => {
    expect(await (await makeWorld({ rootUrl: DIARY })).go('/diary/trip/t1')).toBe(decoded(login(DIARY)));
  });
  it('a reload of the start page while app-config still loads', async () => {
    const world = await makeWorld({ rootUrl: DIARY, appConfigSettled: false });
    const reached = world.go(DIARY);
    await new Promise(resolve => setTimeout(resolve, 20));
    world.appConfigSettled.set(true);
    expect(await reached).toBe(decoded(login(DIARY)));
  });
});

describe('start pages, signed in', () => {
  it.each([DIARY, DASHBOARD, PUBLIC_PAGE, PERSONS])('%s opens on a cold start', async start => {
    expect(await (await makeWorld({ rootUrl: start, user: true, rollouts: [DIARY_OPEN] })).go('/')).toBe(start);
  });

  it.each([DIARY, DASHBOARD, PUBLIC_PAGE, PERSONS])('%s opens after a sign-in inside the app, without a reload', async start => {
    const rollouts$ = new Subject<FeatureRolloutModel[]>();
    const world = await makeWorld({ rootUrl: start, rollouts: rollouts$ });
    await world.go('/');
    await world.go('/auth/login');
    world.signIn();
    const reached = world.go(start); // what the login page does with its returnUrl
    let there = false;
    void reached.then(() => { there = true; });
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(there, 'decided before the rollouts were read').toBe(false);
    rollouts$.next([DIARY_OPEN]);
    expect(await reached).toBe(start);
    expect(await world.go('/'), 'a login without returnUrl').toBe(start);
  });

  it.each([DIARY, DASHBOARD, PERSONS])('%s is closed again after signing out', async start => {
    const world = await makeWorld({ rootUrl: start, user: true, rollouts: [DIARY_OPEN] });
    expect(await world.go('/')).toBe(start);
    expect(await world.go('/auth/login')).toBe('/auth/login');
    world.signOut();
    expect(await world.go(start)).toBe(decoded(login(start)));
  });
});

describe('start pages whose block is off', () => {
  const denied = (start: string): FeatureRolloutModel[] => [rollout(BLOCK_OF[start], { denyTenants: [TENANT] })];

  it.each([DIARY, PERSONS])('%s, signed in: the welcome page', async start => {
    const world = await makeWorld({ rootUrl: start, user: true, rollouts: denied(start) });
    expect(await world.go('/')).toBe(WELCOME);
    expect(world.hops()).toBeLessThan(4);
  });
  it.each([DASHBOARD, PUBLIC_PAGE])('%s, signed in: the welcome page is off as well, so the not-found screen', async start => {
    expect(await (await makeWorld({ rootUrl: start, user: true, rollouts: denied(start) })).go('/')).toBe('/notfound');
  });
  it.each([DIARY, PERSONS])('%s, off in app-config: signed out the sign-in, then the welcome page', async start => {
    const world = await makeWorld({ rootUrl: start, enabled: [] });
    expect(await world.go('/')).toBe(decoded(login(start)));
    world.signIn();
    expect(await world.go(start)).toBe(WELCOME);
  });
  it('ends when the login is off too', async () => {
    const world = await makeWorld({ rootUrl: DIARY, user: true, rollouts: [...denied(DIARY), rollout('auth', { denyTenants: [TENANT] }), rollout('cms', { denyTenants: [TENANT] })] });
    expect(await world.go('/auth/login')).toBe('/notfound');
  });
});
