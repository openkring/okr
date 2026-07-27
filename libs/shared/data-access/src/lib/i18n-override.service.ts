import { Inject, Injectable, InjectionToken } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { I18nTenantOverrideCollection, I18nTenantOverrideModel } from '@okr/shared-models';
import { getSystemQuery } from '@okr/shared-util-core';

import { FirestoreService } from './firestore.service';

/** Minimal shape of AppStore used by this service (avoids circular dep with shared-feature). */
export interface AppStoreMin {
  currentUser: () => { okey: string } | undefined;
  env: { tenantId: string };
}

/** Injection token for AppStoreMin — callers provide AppStore which satisfies this interface. */
export const APP_STORE_MIN = new InjectionToken<AppStoreMin>('APP_STORE_MIN');

@Injectable({ providedIn: 'root' })
export class I18nOverrideService {
  private readonly translocoService: TranslocoService;
  private readonly firestoreService: FirestoreService;
  private readonly appStore: AppStoreMin;

  constructor(
    translocoService: TranslocoService,
    firestoreService: FirestoreService,
    @Inject(APP_STORE_MIN) appStore: AppStoreMin,
  ) {
    this.translocoService = translocoService;
    this.firestoreService = firestoreService;
    this.appStore = appStore;
  }

  public init(): void {
    const lang = this.translocoService.getActiveLang();
    if (this.appStore.currentUser()) {
      this.applyOverrides(lang);
    }
    this.translocoService.langChanges$.subscribe((newLang: string) => {
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
    ).subscribe(overrides => {
      for (const override of overrides) {
        const value = (override as unknown as Record<string, unknown>)[lang] as string | undefined;
        if (!value) continue;

        const isScoped = override.module.includes('/');
        if (isScoped) {
          // The options cast is intentional — `scope` is a runtime extension point.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.translocoService.setTranslation(
            { [override.key]: value },
            lang,
            { merge: true, scope: override.module } as any,
          );
        } else {
          this.translocoService.setTranslation(
            { [`${override.module}.${override.key}`]: value },
            lang,
            { merge: true },
          );
        }
      }
    });
  }
}
