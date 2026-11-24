import { Injectable, InjectionToken, Injector, Signal, inject } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import type { User } from 'firebase/auth';
import { EMPTY, Observable, combineLatest } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';

import type { OkrEnvironment } from '@okr/shared-config';
import { AppConfig, GroupModel, I18nTenantOverrideCollection, I18nTenantOverrideModel, PersonModel, UserModel } from '@okr/shared-models';
import { deepEqual, getSystemQuery } from '@okr/shared-util-core';

import { FirestoreService } from './firestore.service';

/**
 * The slice of AppStore that libs BELOW the feature layer may read (data-access services, ui
 * components). AppStore lives in shared-feature, so importing it from there breaks the layering
 * (`@nx/enforce-module-boundaries`); they inject APP_STORE_MIN instead. Every app provides it as
 * `{ provide: APP_STORE_MIN, useExisting: AppStore }`, and shared-feature asserts at compile time
 * that AppStore still satisfies this interface (`asAppStoreMin` in app.store.ts). Add a member here only
 * when such a lib needs it — the interface is the contract, not a mirror of AppStore.
 */
export interface AppStoreMin {
  readonly currentUser: Signal<UserModel | undefined>;
  readonly currentPerson: Signal<PersonModel | undefined>;
  readonly allPersons: Signal<PersonModel[]>;
  /** Groups AND ad-hoc chats — chat only (see AppStore.allGroupsAndChats). */
  readonly allGroupsAndChats: Signal<GroupModel[]>;
  readonly appConfig: Signal<AppConfig>;
  readonly appOrigin: Signal<string>;
  readonly tenantId: Signal<string>;
  readonly fbUser: Signal<User | null | undefined>;
  readonly env: OkrEnvironment;
}

/** Injection token for AppStoreMin — every app provides it with `useExisting: AppStore`. */
export const APP_STORE_MIN = new InjectionToken<AppStoreMin>('APP_STORE_MIN');

@Injectable({ providedIn: 'root' })
export class I18nOverrideService {
  private readonly translocoService = inject(TranslocoService);
  private readonly firestoreService = inject(FirestoreService);
  private readonly appStore = inject(APP_STORE_MIN);
  private readonly injector = inject(Injector);

  public init(): void {
    const signedIn$ = toObservable(this.appStore.currentUser, { injector: this.injector });
    combineLatest([this.translocoService.langChanges$, signedIn$]).pipe(
      // the user loads after bootstrap, and the rules deny the read without one
      map(([lang, user]) => user ? lang : undefined),
      // `distinctUntilChanged` is load-bearing, not a tidy-up. `apply` below calls Transloco's
      // `setActiveLang`, which pushes the CURRENT language back through this same stream.
      // Without the filter, the very first applied override re-enters `apply` ->
      // `setActiveLang` -> `langChanges$` and pegs the main thread in an infinite loop: the tab
      // freezes right after login, logs nothing, and cannot even be reloaded. It only reproduces
      // for a signed-in user of a tenant that HAS override documents, which is why it surfaced
      // only once the per-tenant CMS texts were seeded.
      distinctUntilChanged(),
      switchMap(lang => !lang ? EMPTY : this.overrides(lang).pipe(
        // a failing read must not end this stream: the next language or sign-in tries again
        catchError(error => {
          console.error('I18nOverrideService: cannot read the overrides', error);
          return EMPTY;
        }),
      )),
    ).subscribe();
  }

  public applyOverrides(lang: string): void {
    this.overrides(lang).subscribe();
  }

  /** The tenant's rows, each snapshot applied to `lang` as it arrives. */
  private overrides(lang: string): Observable<I18nTenantOverrideModel[]> {
    const tenantId = this.appStore.env.tenantId;
    // Query on `tenants` (array-contains), NOT the model's scalar `tenantId`.
    // The firestore rule gates this collection with tenantRead() → belongsToTenant(),
    // which reads resource.data.tenants. Firestore rules are not filters: a list query
    // whose constraints don't provably restrict the result to rule-readable documents is
    // rejected wholesale with "Missing or insufficient permissions". Filtering on
    // tenantId alone left `tenants` unconstrained, so every login logged a denied read.
    // getSystemQuery is the same tenant-scoping every other collection uses.
    return this.firestoreService.searchData<I18nTenantOverrideModel>(
      I18nTenantOverrideCollection,
      getSystemQuery(tenantId),
      'module',
      'asc',
    ).pipe(
      // Firestore delivers the cache snapshot and then the server snapshot; on a cold start both
      // hold the same documents. Applying them twice costs a full app-wide re-translation each.
      distinctUntilChanged(deepEqual),
      tap(overrides => this.apply(overrides, lang)),
    );
  }

  private apply(overrides: I18nTenantOverrideModel[], lang: string): void {
    // PERFORMANCE — measured 2026-09-09 (perf-baselines.md, »Der Firestore-Snapshot-Task war
    // Transloco«): `setTranslation` with the default `emitChange: true` calls `setActiveLang`,
    // which re-emits `langChanges$`, and EVERY `selectTranslate` subscription in the app
    // (hundreds — each `translateAll` signal of every mounted component) re-runs on each emit.
    // With seven override documents that was seven app-wide re-translations per snapshot,
    // ~150 ms observed / ~600 ms simulated TBT on the dashboard. So: apply all overrides
    // silently, then emit exactly once.
    let applied = 0;
    for (const override of overrides) {
      const value = (override as unknown as Record<string, unknown>)[lang] as string | undefined;
      if (!value) continue;

      // A path scope is addressed through the language ('subject/address/feature/de').
      // Limit: a row for a key of a bundle that loads later loses against that bundle; keys the bundle lacks stay.
      try {
        const [row, path] = override.module.includes('/')
          ? [{ [override.key]: value }, `${override.module}/${lang}`]
          : [{ [`${override.module}.${override.key}`]: value }, lang];
        this.translocoService.setTranslation(row, path, { merge: true, emitChange: false });
        applied++;
      } catch (error) {
        console.error(`I18nOverrideService: row ${override.okey} skipped`, error);
      }
    }
    // What Transloco would have done after each call — once, and only if something changed.
    if (applied > 0) this.translocoService.setActiveLang(this.translocoService.getActiveLang());
  }
}
