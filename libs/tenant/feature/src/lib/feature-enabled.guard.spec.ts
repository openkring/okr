import { ApplicationRef, provideZonelessChangeDetection, runInInjectionContext, signal, type EnvironmentProviders, type Provider } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { DefaultUrlSerializer, Router, type ActivatedRouteSnapshot, type RouterStateSnapshot, type UrlTree } from '@angular/router';
import { NEVER, Subject, catchError, isObservable, of, throwError, type Observable } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppStore, READINESS_TIMEOUT_MS } from '@okr/shared-feature';
import { FeatureRolloutModel } from '@okr/shared-models';
import { FeatureRolloutService } from '@okr/tenant-data-access';

import { isFeatureEnabledGuard } from './feature-enabled.guard';
import { FeatureStore } from './feature.store';

const ROOT_URL = '/public/welcome';
const TENANT = 'p13';

/**
 * A real Angular environment injector, via `createApplication` — NOT `TestBed`.
 *
 * Both are needed for a reason and the reason is narrow: the guard calls `toObservable`, which
 * creates an `effect`, which needs a genuine environment injector (a bare `Injector.create`,
 * which `compose-gated-routes.spec.ts` uses for the same guard, has no effect scheduler). But
 * `TestBed.configureTestingModule` compiles a test NgModule and walks every JIT-compiled
 * Angular class this spec's import graph pulled in — `@okr/shared-feature`'s barrel exports
 * several Ionic standalone modals — and dies in `applyProviderOverridesInScope` with "Cannot
 * read properties of null (reading 'ngModule')" (verified: that is exactly what this spec did
 * before). `createApplication` builds the same kind of injector without compiling a module
 * scope. `appRef.tick()` is what flushes the effect behind `toObservable`.
 */
async function makeApp(providers: (Provider | EnvironmentProviders)[]): Promise<ApplicationRef> {
  const serializer = new DefaultUrlSerializer();
  return createApplication({
    providers: [
      provideZonelessChangeDetection(),
      // like the real one: a url that cannot be parsed becomes '/'
      { provide: Router, useValue: { parseUrl: (url: string): UrlTree => { try { return serializer.parse(url); } catch { return serializer.parse('/'); } } } },
      ...providers,
    ],
  });
}

/**
 * The four `AppStore` members `FeatureStore.settled` and the guard actually read. Signals, not
 * plain getters: `settled` is a `computed`, so the test has to be able to FLIP these and have
 * the derivation re-run.
 *
 * `fbUser` is tri-state and each state means something different here: `undefined` = auth
 * still restoring, `null` = signed out (the anonymous fast path), an object = signed in.
 */
function appStoreMock(over: {
  fbUser?: unknown;
  appConfigSettled?: boolean;
  readinessTimedOut?: boolean;
  enabledFeatures?: string[];
  rootUrl?: string;
} = {}) {
  return {
    fbUser: signal<unknown>('fbUser' in over ? over.fbUser : { uid: 'u1' }),
    isAppConfigSettled: signal(over.appConfigSettled ?? false),
    readinessTimedOut: signal(over.readinessTimedOut ?? false),
    tenantId: signal(TENANT),
    appConfig: signal({ rootUrl: over.rootUrl ?? ROOT_URL, enabledFeatures: over.enabledFeatures }),
  };
}

/** The REAL `FeatureStore`, over a rollout stream and an `AppStore` the test drives by hand. */
async function makeFeatureStore(
  appStore: ReturnType<typeof appStoreMock>,
  rollouts$: Observable<FeatureRolloutModel[]> | (() => Observable<FeatureRolloutModel[]>),
): Promise<{ store: InstanceType<typeof FeatureStore>; appRef: ApplicationRef }> {
  const appRef = await makeApp([
    { provide: AppStore, useValue: appStore },
    { provide: FeatureRolloutService, useValue: { list: typeof rollouts$ === 'function' ? rollouts$ : () => rollouts$ } },
  ]);
  const store = appRef.injector.get(FeatureStore);
  appRef.tick(); // the rollouts are read once the user is known (toObservable)
  return { store, appRef };
}

/** A `FeatureStore` stand-in with the two signals the guard reads, both drivable. */
function featureStoreStub(settled: boolean, effective: string[]) {
  return { settled: signal(settled), effective: signal(new Set(effective)) };
}

/**
 * Runs the guard and records every emission plus completion. Completion is asserted as hard as
 * the verdict is: this guard is prepended to EVERY block's fragments, so an Observable that
 * emits but never completes — or never emits at all — hangs navigation app-wide rather than
 * failing one screen.
 */
function runGuard(blockId: string, appRef: ApplicationRef, url = '/somewhere') {
  const seen: (true | UrlTree)[] = [];
  let completed = false;

  const result = runInInjectionContext(appRef.injector, () =>
    isFeatureEnabledGuard(blockId)({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
  expect(isObservable(result), 'guard must return an Observable so it can wait').toBe(true);
  (result as Observable<true | UrlTree>).subscribe({
    next: v => seen.push(v),
    complete: () => { completed = true; },
  });

  return {
    get verdict(): true | UrlTree | undefined { return seen[0]; },
    get emissions(): number { return seen.length; },
    get completed(): boolean { return completed; },
    flush: (): void => appRef.tick(),
  };
}

/** Runs the guard against a stubbed `FeatureStore` whose `settled`/`effective` the test drives. */
async function runGuardWithStub(blockId: string, stub: ReturnType<typeof featureStoreStub>, over: { url?: string; rootUrl?: string; fbUser?: unknown; appConfigSettled?: boolean } = {}) {
  const appStore = appStoreMock({ appConfigSettled: true, ...over });
  const appRef = await makeApp([
    { provide: FeatureStore, useValue: stub },
    // The guard reads `appConfig().rootUrl` for the redirect target; the real `AppStore` would
    // drag in `FirestoreService` and its ENV/FIRESTORE tokens.
    { provide: AppStore, useValue: appStore },
  ]);
  return Object.assign(runGuard(blockId, appRef, over.url), { appStore });
}

describe('FeatureStore.settled', () => {
  /**
   * THE ANONYMOUS STEADY STATE, not a load window. `firestore.rules` allows `feature-rollout`
   * reads only `if signedIn()`, so the rollout stream is not guaranteed to emit for a signed-out
   * visitor, and `settled` does not wait for app-config either (which loads for visitors too) —
   * modelled here as a rollout stream that never emits and an app-config that never settles.
   * Without the explicit anonymous clause `settled` stays false forever and every PUBLIC route
   * hangs.
   */
  it('is true for a signed-out visitor even though neither source ever emits', async () => {
    const { store } = await makeFeatureStore(appStoreMock({ fbUser: null }), NEVER);
    expect(store.settled()).toBe(true);
  });

  it('is false while auth is still restoring (fbUser undefined)', async () => {
    const appStore = appStoreMock({ fbUser: undefined });
    const { store } = await makeFeatureStore(appStore, NEVER);
    expect(store.settled()).toBe(false);

    appStore.fbUser.set(null); // signed out for real
    expect(store.settled()).toBe(true);
  });

  it('for a signed-in user waits for BOTH the rollout stream and app-config', async () => {
    const rollouts$ = new Subject<FeatureRolloutModel[]>();
    const appStore = appStoreMock({ appConfigSettled: false });
    const { store } = await makeFeatureStore(appStore, rollouts$);

    expect(store.settled()).toBe(false);

    rollouts$.next([]); // an EMPTY rollout list is a loaded value, not "not loaded yet"
    expect(store.settled()).toBe(false); // app-config still loading

    appStore.isAppConfigSettled.set(true);
    expect(store.settled()).toBe(true);
  });

  it('does not mistake a loaded-but-empty rollout list for "still loading"', async () => {
    const rollouts$ = new Subject<FeatureRolloutModel[]>();
    const { store } = await makeFeatureStore(appStoreMock({ appConfigSettled: true }), rollouts$);

    expect(store.settled()).toBe(false);
    rollouts$.next([]);
    expect(store.settled()).toBe(true);
  });

  /** The app-ready watchdog opened navigation; this gate must not be the thing still holding it. */
  it('gives up with the app-readiness watchdog rather than hanging', async () => {
    const { store } = await makeFeatureStore(appStoreMock({ readinessTimedOut: true }), NEVER);
    expect(store.settled()).toBe(true);
  });

  /**
   * THE ERROR PATH, which is correct by construction but was previously untested. A denied or
   * dropped `feature-rollout` listen does NOT reach this store as an error: `FirestoreService`
   * .searchData` wraps every stream in `catchError(() => of([]))` (it must — an errored stream
   * reaching a consuming `rxResource` re-throws inside change detection and crashes the app,
   * SCS-13). So the store sees an ordinary `[]`, which is a LOADED value and settles. The
   * `catchError` here stands in for the one the service applies, deliberately: without that
   * layer the test would assert behaviour production cannot produce.
   */
  it('settles when the rollout listen fails the way FirestoreService reports failures', async () => {
    const denied$ = throwError(() => new Error('permission-denied'))
      .pipe(catchError(() => of([] as FeatureRolloutModel[])));
    const { store } = await makeFeatureStore(appStoreMock({ appConfigSettled: true }), denied$);

    expect(store.settled()).toBe(true);
  });

  /** The same failure without the service's `catchError`: it must neither throw inside a guard nor end the reading for the next user. */
  it('settles on the defaults when the stream itself fails, and reads again for the next user', async () => {
    const raw$ = throwError(() => new Error('permission-denied')) as Observable<FeatureRolloutModel[]>;
    const answers = [raw$, of([allow('diary')])];
    const appStore = appStoreMock({ appConfigSettled: true, enabledFeatures: ['diary'] });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { store, appRef } = await makeFeatureStore(appStore, () => answers.shift() ?? NEVER);

    expect(store.settled()).toBe(true);
    expect(store.isEnabled()('diary')).toBe(false);

    appStore.fbUser.set({ uid: 'u2' });
    appRef.tick();
    expect(store.settled()).toBe(true);
    expect(store.isEnabled()('diary')).toBe(true);
  });
});

/** A rollout that opens a beta block for the tenant of this file. */
function allow(block: string): FeatureRolloutModel {
  return { okey: block, availability: 'beta', allowTenants: [TENANT], denyTenants: [], reason: '' } as unknown as FeatureRolloutModel;
}

/** The rollout list as Firestore serves it: a listen attached without a user is denied, which arrives as `[]` and the end of the stream. */
function deniedUntilSignedIn(appStore: ReturnType<typeof appStoreMock>, rollouts$: Observable<FeatureRolloutModel[]>): () => Observable<FeatureRolloutModel[]> {
  return () => (appStore.fbUser() ? rollouts$ : of([]));
}

/** Live finding of 1.174: the listen attached before the sign-in was denied, settled on [] and stayed there until a reload. */
describe('FeatureStore, sign-in and sign-out inside the app', () => {
  it('does not read the rollouts for a signed-out visitor, nor before the sign-in state is known', async () => {
    const list = vi.fn(() => NEVER as Observable<FeatureRolloutModel[]>);
    const appStore = appStoreMock({ fbUser: undefined, appConfigSettled: true });
    const { appRef } = await makeFeatureStore(appStore, list);
    appStore.fbUser.set(null);
    appRef.tick();
    expect(list).not.toHaveBeenCalled();
  });

  it('reads them when somebody signs in, and is unsettled from that very moment until they are there', async () => {
    const rollouts$ = new Subject<FeatureRolloutModel[]>();
    const appStore = appStoreMock({ fbUser: null, appConfigSettled: true, enabledFeatures: ['diary'] });
    const { store, appRef } = await makeFeatureStore(appStore, deniedUntilSignedIn(appStore, rollouts$));
    expect(store.settled()).toBe(true);
    expect(store.isEnabled()('diary')).toBe(false);

    appStore.fbUser.set({ uid: 'u1' });
    expect(store.settled(), 'before the effects ran').toBe(false);
    appRef.tick();
    expect(store.settled(), 'read pending').toBe(false);

    rollouts$.next([allow('diary')]);
    expect(store.settled()).toBe(true);
    expect(store.isEnabled()('diary')).toBe(true);
  });

  it('drops them on sign-out, and reads again for the next user', async () => {
    const reads: Subject<FeatureRolloutModel[]>[] = [];
    const appStore = appStoreMock({ fbUser: { uid: 'u1' }, appConfigSettled: true, enabledFeatures: ['diary'] });
    const { store, appRef } = await makeFeatureStore(appStore, () => { const s = new Subject<FeatureRolloutModel[]>(); reads.push(s); return s; });
    reads[0].next([allow('diary')]);
    expect(store.isEnabled()('diary')).toBe(true);

    appStore.fbUser.set(null);
    expect(store.settled(), 'a visitor is settled').toBe(true);
    expect(store.isEnabled()('diary'), 'what the user could read is gone').toBe(false);
    appRef.tick();
    expect(reads[0].observed).toBe(false);

    appStore.fbUser.set({ uid: 'u2' });
    appRef.tick();
    expect(store.settled()).toBe(false);
    reads[1].next([allow('diary')]);
    expect(store.settled()).toBe(true);
    expect(store.isEnabled()('diary')).toBe(true);
  });

  it('never takes the list of one user for another, even when the user changes without a sign-out in between', async () => {
    const reads: Subject<FeatureRolloutModel[]>[] = [];
    const appStore = appStoreMock({ fbUser: { uid: 'u1' }, appConfigSettled: true, enabledFeatures: ['diary'] });
    const { store, appRef } = await makeFeatureStore(appStore, () => { const s = new Subject<FeatureRolloutModel[]>(); reads.push(s); return s; });
    reads[0].next([allow('diary')]);
    appStore.fbUser.set({ uid: 'u2' });
    expect(store.settled()).toBe(false);
    expect(store.isEnabled()('diary')).toBe(false);
    appRef.tick();
    reads[1].next([]);
    expect(store.settled()).toBe(true);
  });

  it('does not read again when the same user is emitted once more', async () => {
    const list = vi.fn(() => of([] as FeatureRolloutModel[]));
    const appStore = appStoreMock({ appConfigSettled: true });
    const { store, appRef } = await makeFeatureStore(appStore, list);
    appStore.fbUser.set({ uid: 'u1' });
    expect(store.settled()).toBe(true);
    appRef.tick();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('follows a change the operator makes while the user is signed in', async () => {
    const rollouts$ = new Subject<FeatureRolloutModel[]>();
    const { store } = await makeFeatureStore(appStoreMock({ appConfigSettled: true, enabledFeatures: ['diary'] }), rollouts$);
    rollouts$.next([allow('diary')]);
    expect(store.isEnabled()('diary')).toBe(true);
    rollouts$.next([]);
    expect(store.settled()).toBe(true);
    expect(store.isEnabled()('diary')).toBe(false);
  });

  it('the guard holds the navigation after an in-app sign-in and then lets it through', async () => {
    const rollouts$ = new Subject<FeatureRolloutModel[]>();
    const appStore = appStoreMock({ fbUser: null, appConfigSettled: true, enabledFeatures: ['diary'], rootUrl: '/diary/all/c-diary' });
    const { appRef } = await makeFeatureStore(appStore, deniedUntilSignedIn(appStore, rollouts$));
    const before = runGuard('diary', appRef, '/diary/all/c-diary');
    before.flush();
    expect(String(before.verdict)).toBe('/auth/login?returnUrl=%2Fdiary%2Fall%2Fc-diary');

    appStore.fbUser.set({ uid: 'u1' });
    const after = runGuard('diary', appRef, '/diary/all/c-diary');
    after.flush();
    expect(after.emissions).toBe(0);
    rollouts$.next([allow('diary')]);
    after.flush();
    expect(after.verdict).toBe(true);
    expect(after.completed).toBe(true);
  });
});

describe('isFeatureEnabledGuard', () => {
  afterEach(() => { vi.useRealTimers(); });

  /**
   * THE FAIL-OPEN. Before `enabledFeatures` lands it reads as `undefined`, which means "every
   * non-internal block" (D-BB-10) — so a `ga` block the tenant deliberately switched off is in
   * `effective()` during the load window. A synchronous guard lets the deep link straight
   * through; this one must hold, then deny.
   */
  it('does not decide while unsettled, and DENIES a switched-off block once settled', async () => {
    const stub = featureStoreStub(false, ['forms', 'games']);
    const run = await runGuardWithStub('games', stub);

    run.flush();
    expect(run.emissions, 'guard decided before the effective set was real').toBe(0);
    expect(run.completed).toBe(false);

    stub.effective.set(new Set(['forms'])); // the loaded set: tenant switched `games` off
    stub.settled.set(true);
    run.flush();

    expect(run.emissions).toBe(1);
    expect(run.verdict).not.toBe(true);
    expect(String(run.verdict)).toBe(ROOT_URL);
    expect(run.completed, 'guard emitted but never completed').toBe(true);
  });

  /**
   * THE FAIL-CLOSED, the other direction. A `beta`/`internal` block is absent from the
   * cold-start set (no rollout doc has been read yet, so no allow-list has been seen) and a
   * synchronous guard would bounce a legitimate deep link to a block this tenant IS
   * allow-listed for.
   */
  it('PERMITS an allow-listed block that is absent from the cold-start set', async () => {
    const stub = featureStoreStub(false, []);
    const run = await runGuardWithStub('lab', stub);

    run.flush();
    expect(run.emissions, 'guard decided before the rollout allow-list was read').toBe(0);

    stub.effective.set(new Set(['lab']));
    stub.settled.set(true);
    run.flush();

    expect(run.verdict).toBe(true);
    expect(run.completed).toBe(true);
  });

  it('resolves at once when the set is already settled (warm in-app navigation)', async () => {
    const run = await runGuardWithStub('forms', featureStoreStub(true, ['forms']));
    run.flush();

    expect(run.verdict).toBe(true);
    expect(run.completed).toBe(true);
  });

  /**
   * THE HOLE `AppStore.readinessTimedOut` CANNOT COVER, and the reason this guard carries its
   * own timer.
   *
   * `app.store.ts` arms the watchdog only while `authed && !isDataReady()` and RESETS the flag
   * once `isDataReady()` is true — and `isDataReady` reads `currentUserResource` and
   * `categoriesResource`, never `appConfigResource` and never the rollout listen. This test is
   * that exact user: signed in, session healthy (`readinessTimedOut: false`, i.e. `isDataReady()`
   * true), while app-config never settles and the rollout listen never answers. `settled` stays
   * false forever, and since this guard is prepended to EVERY block's fragments, without the
   * timer every navigation in the app hangs forever.
   *
   * Fake timers are installed AFTER `createApplication` so the app's own bootstrap scheduling is
   * unaffected; only the guard's `timer` is advanced.
   */
  it('emits anyway when app-config stalls while the session is otherwise healthy', async () => {
    const appStore = appStoreMock({ appConfigSettled: false, readinessTimedOut: false });
    const { store, appRef } = await makeFeatureStore(appStore, NEVER);
    expect(store.settled(), 'precondition: nothing has settled').toBe(false);

    vi.useFakeTimers();
    const run = runGuard('cms', appRef);
    run.flush();
    expect(run.emissions, 'decided before either source or the timer').toBe(0);

    vi.advanceTimersByTime(READINESS_TIMEOUT_MS);

    expect(run.emissions, 'navigation would hang forever on a stalled app-config read').toBe(1);
    expect(run.completed).toBe(true);
    expect(store.settled(), 'the timer must not fake settled-ness, only stop waiting for it').toBe(false);
  });

  /**
   * END TO END on the path that would hang: the REAL `FeatureStore`, a signed-out visitor, a
   * rollout stream that never emits and an app-config that never settles. The guard must still
   * emit and COMPLETE — anything else takes down every public route in both apps.
   */
  it('completes for an anonymous visitor with no data at all', async () => {
    const { store, appRef } = await makeFeatureStore(appStoreMock({ fbUser: null }), NEVER);
    expect(store.settled()).toBe(true);

    const run = runGuard('cms', appRef); // `cms` is core, hence in the catalogue-default set
    run.flush();

    expect(run.emissions).toBe(1);
    expect(run.verdict).toBe(true);
    expect(run.completed, 'anonymous navigation would hang forever').toBe(true);
  });

  /** A start page whose own block was switched off redirected to itself, for ever (spec 1.174 §7.4). */
  it.each([
    ['another page', '/quiz', '/diary/all/c-diary', '/diary/all/c-diary'],
    ['another page, with its query', '/quiz', '/person/all/c-persons?filters=search', '/person/all/c-persons?filters=search'],
    ['the page itself', '/quiz', '/quiz', '/public/welcome'],
    ['the page itself with a query', '/quiz?level=1', '/quiz', '/public/welcome'],
    ['a url the router cannot parse', '/quiz', '/a/(b', '/public/welcome'],
    ['a url that cannot be decoded', '/quiz', '/a?b=%', '/public/welcome'],
    ['the page itself once the router has read it', '/quiz', '/quiz//x', '/public/welcome'],
    ['the welcome page while that one is off', '/public/welcome', '/quiz', '/notfound'],
  ])('a block that is off, root url is %s', async (_name, url, rootUrl, expected) => {
    const run = await runGuardWithStub('games', featureStoreStub(true, []), { url, rootUrl });
    run.flush();

    expect(String(run.verdict)).toBe(expected);
    expect(run.completed).toBe(true);
  });

  /** Signed-in visitors keep the welcome page (above); a signed-out one may get in by signing in (spec 1.174 §7.4). */
  it.each([
    ['its start page', '/diary/all/c-diary', '/diary/all/c-diary', '/auth/login?returnUrl=%2Fdiary%2Fall%2Fc-diary'],
    ['its start page with a query', '/person/all/c-persons?filters=search', '/person/all/c-persons?filters=search', '/auth/login?returnUrl=%2Fperson%2Fall%2Fc-persons%3Ffilters%3Dsearch'],
    ['another page', '/quiz', '/diary/all/c-diary', '/diary/all/c-diary'],
    ['the welcome page', '/public/welcome', '/diary/all/c-diary', '/notfound'],
    ['the login page', '/auth/login?returnUrl=%2Fdiary%2Fall%2Fc-diary', '/diary/all/c-diary', '/public/welcome'],
  ])('a signed-out visitor is refused %s', async (_name, url, rootUrl, expected) => {
    const run = await runGuardWithStub('games', featureStoreStub(true, []), { url, rootUrl, fbUser: null });
    run.flush();

    expect(String(run.verdict)).toBe(expected);
    expect(run.completed).toBe(true);
  });

  /** A reload of the start page: without the config the guard would compare with the default start page and open the welcome page. */
  it('waits for app-config before refusing a signed-out visitor, and only then', async () => {
    const run = await runGuardWithStub('games', featureStoreStub(true, []), { url: '/quiz', rootUrl: '/quiz', fbUser: null, appConfigSettled: false });
    run.flush();
    expect(run.emissions).toBe(0);
    run.appStore.isAppConfigSettled.set(true);
    run.flush();
    expect(String(run.verdict)).toBe('/auth/login?returnUrl=%2Fquiz');
    expect(run.completed).toBe(true);

    const open = await runGuardWithStub('games', featureStoreStub(true, ['games']), { fbUser: null, appConfigSettled: false });
    open.flush();
    expect(open.verdict, 'an open page does not wait').toBe(true);
  });

  it('gives up waiting for app-config', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'clearInterval', 'clearTimeout', 'Date'] });
    const run = await runGuardWithStub('games', featureStoreStub(true, []), { url: '/quiz', rootUrl: '/quiz', fbUser: null, appConfigSettled: false });
    run.flush();
    expect(run.emissions).toBe(0);
    vi.advanceTimersByTime(READINESS_TIMEOUT_MS);
    expect(run.emissions).toBe(1);
    expect(run.completed).toBe(true);
  });
});
