import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AppStore } from '@okr/shared-feature';
import { FeatureStore } from './feature.store';

/**
 * Blocks direct URL entry into a feature the tenant does not have.
 *
 * Redirects silently to the tenant's rootUrl — deliberately NOT a 404-vs-403
 * distinction, which would leak which features exist to a tenant that may not have them.
 */
export function isFeatureEnabledGuard(blockId: string): CanActivateFn {
  return () => {
    const featureStore = inject(FeatureStore);
    const appStore = inject(AppStore);
    const router = inject(Router);

    if (featureStore.effective().has(blockId)) return true;
    return router.parseUrl(appStore.appConfig()?.rootUrl ?? '/public/welcome');
  };
}
