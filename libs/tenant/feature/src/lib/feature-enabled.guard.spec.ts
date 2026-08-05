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
      { provide: Router, useValue: { parseUrl: (url: string): UrlTree => serializer.parse(url) } },
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
} = {}) {
  return {
    fbUser: signal<unknown>('fbUser' in over ? over.fbUser : { uid: 'u1' }),
    isAppConfigSettled: signal(over.appConfigSettled ?? false),
    readinessTimedOut: signal(over.readinessTimedOut ?? false),
    tenantId: signal(TENANT),
    appConfig: signal({ rootUrl: ROOT_URL, enabledFeatures: over.enabledFeatures }),
  };
}

/** The REAL `FeatureStore`, over a rollout stream and an `AppStore` the test drives by hand. */
async function makeFeatureStore(
  appStore: ReturnType<typeof appStoreMock>,
  rollouts$: Observable<FeatureRolloutModel[]>,
): Promise<{ store: InstanceType<typeof FeatureStore>; appRef: ApplicationRef }> {
  const appRef = await makeApp([
    { provide: AppStore, useValue: appStore },
    { provide: FeatureRolloutService, useValue: { list: () => rollouts$ } },
  ]);
  return { store: appRef.injector.get(FeatureStore), appRef };
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
function runGuard(blockId: string, appRef: ApplicationRef) {
  const seen: (true | UrlTree)[] = [];
  let completed = false;

  const result = runInInjectionContext(appRef.injector, () =>
    isFeatureEnabledGuard(blockId)({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot));
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
async function runGuardWithStub(blockId: string, stub: ReturnType<typeof featureStoreStub>) {
  const appRef = await makeApp([
    { provide: FeatureStore, useValue: stub },
    // The guard reads `appConfig().rootUrl` for the redirect target; the real `AppStore` would
    // drag in `FirestoreService` and its ENV/FIRESTORE tokens.
    { provide: AppStore, useValue: appStoreMock() },
  ]);
  return runGuard(blockId, appRef);
}

describe('FeatureStore.settled', () => {
  /**
   * THE ANONYMOUS STEADY STATE, not a load window. `appConfigResource` returns `of(undefined)`
   * without an `fbUser`, and `firestore.rules` allows `feature-rollout` reads only
   * `if signedIn()`, so NEITHER source is guaranteed to emit for a signed-out visitor —
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

  /**
   * The same failure WITHOUT that service-level `catchError` — pinned because it is the shape
   * of the dependency, not a scenario: if anyone removes `searchData`'s `catchError`, a raw
   * stream error propagates into `toSignal`, which re-throws on read, and every read of
   * `settled`/`effective` throws inside a guard. Named here so that removal is a red test with
   * an obvious cause rather than a mystery navigation crash.
   */
  it('would THROW on a raw stream error — i.e. FirestoreService\'s catchError is load-bearing', async () => {
    const raw$ = throwError(() => new Error('permission-denied')) as Observable<FeatureRolloutModel[]>;
    const { store } = await makeFeatureStore(appStoreMock({ appConfigSettled: true }), raw$);

    expect(() => store.settled()).toThrow();
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
});
