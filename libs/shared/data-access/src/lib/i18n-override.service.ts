import { Injectable, InjectionToken, Signal, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { User } from 'firebase/auth';
import { distinctUntilChanged } from 'rxjs/operators';

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

  public init(): void {
    const lang = this.translocoService.getActiveLang();
    if (this.appStore.currentUser()) {
      this.applyOverrides(lang);
    }
    // `distinctUntilChanged` is load-bearing, not a tidy-up. `setTranslation` below calls
    // Transloco's `setActiveLang` internally, which pushes the CURRENT language back through
    // this same BehaviorSubject. Without the filter, the very first applied override re-enters
    // `applyOverrides` -> `setTranslation` -> `langChanges$` and pegs the main thread in an
    // infinite loop: the tab freezes right after login, logs nothing, and cannot even be
    // reloaded. It only reproduces for a signed-in user of a tenant that HAS override
    // documents, which is why it surfaced only once the per-tenant CMS texts were seeded.
    this.translocoService.langChanges$.pipe(distinctUntilChanged()).subscribe((newLang: string) => {
      if (this.appStore.currentUser()) {
        this.applyOverrides(newLang);
      }
    });
  }

  public applyOverrides(lang: string): void {
    const tenantId = this.appStore.env.tenantId;
    // Query on `tenants` (array-contains), NOT the model's scalar `tenantId`.
    // The firestore rule gates this collection with tenantRead() → belongsToTenant(),
    // which reads resource.data.tenants. Firestore rules are not filters: a list query
    // whose constraints don't provably restrict the result to rule-readable documents is
    // rejected wholesale with "Missing or insufficient permissions". Filtering on
    // tenantId alone left `tenants` unconstrained, so every login logged a denied read.
    // getSystemQuery is the same tenant-scoping every other collection uses.
    this.firestoreService.searchData<I18nTenantOverrideModel>(
      I18nTenantOverrideCollection,
      getSystemQuery(tenantId),
      'module',
      'asc',
    ).pipe(
      // Firestore delivers the cache snapshot and then the server snapshot; on a cold start both
      // hold the same documents. Applying them twice costs a full app-wide re-translation each.
      distinctUntilChanged(deepEqual),
    ).subscribe(overrides => {
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
        applied++;

        // A path scope is addressed through the language ('subject/address/feature/de').
        // Limit: a row for a key of a bundle that loads later loses against that bundle; keys the bundle lacks stay.
        const [row, path] = override.module.includes('/')
          ? [{ [override.key]: value }, `${override.module}/${lang}`]
          : [{ [`${override.module}.${override.key}`]: value }, lang];
        this.translocoService.setTranslation(row, path, { merge: true, emitChange: false });
      }
      // What Transloco would have done after each call — once, and only if something changed.
      if (applied > 0) this.translocoService.setActiveLang(this.translocoService.getActiveLang());
    });
  }
}
