import { inject } from '@angular/core';
import type { ActivatedRouteSnapshot, CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { AppStore } from '@okr/shared-feature';

/**
 * Target of the retired `/memberfees/:contextMenuName` url (spec 1.108): the screen now lives
 * under the accounting shell, in the app's DEFAULT books. Without a default books id there is no
 * books to show, so fall back to the app root — never the tenant id (it is not a books id).
 */
export function memberFeesRedirectUrl(defaultBooks: string | undefined, contextMenuName: string): string {
  if (!defaultBooks) return '/';
  return `/accounting/${defaultBooks}/member-fees/${contextMenuName}`;
}

export const memberFeesRedirectGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const books = inject(AppStore).appConfig().defaultAccountingTenantId ?? '';
  return inject(Router).parseUrl(memberFeesRedirectUrl(books, route.params['contextMenuName'] ?? 'c-memberfees'));
};
