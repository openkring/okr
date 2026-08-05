import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AppStore } from '@okr/shared-feature';
import { hasRole } from '@okr/shared-util-core';

// Owner ruling R-5 (2026-08-05). Admits `contentAdmin` and `admin` (hasRole('contentAdmin') →
// ['contentAdmin', 'admin']) — the role five live menu documents declare as their `roleNeeded`
// and which no existing guard matched: `isPrivilegedGuard` resolves to ['privileged', 'admin'],
// so a contentAdmin saw the menu row and had the navigation silently cancelled.
//
// ⚠️ A FACTORY, like isAdminGuard/isAuditorGuard and unlike isPrivilegedGuard/isAuthenticatedGuard.
// Every call site must write it CALLED — `canActivate: [isContentAdminGuard()]`. Written
// uncalled, Angular invokes the factory AS the guard, the returned inner function is truthy,
// and the route always activates: that is exactly how twelve scs routes came to enforce
// nothing.
export const isContentAdminGuard = (): CanActivateFn => {
  return () => {
    return hasRole('contentAdmin', inject(AppStore).currentUser());
  };
};
