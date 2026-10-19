import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AppStore } from '@okr/shared-feature';
import { hasRole } from '@okr/shared-util-core';

// Spec 1.101 phase 2. Admits `tripAdmin` and `admin` (hasRole('tripAdmin') → ['tripAdmin', 'admin']):
// the role the trip-maintenance menu row declares as its `roleNeeded`. `isAdminGuard` would
// shut a tripAdmin out of a screen whose menu row they can see.
//
// ⚠️ A FACTORY, like isContentAdminGuard/isAdminGuard. Write it CALLED at every call site:
// `canActivate: [isTripAdminGuard()]`. Written uncalled, the factory runs as the guard, its
// returned function is truthy, and the route always activates.
export const isTripAdminGuard = (): CanActivateFn => {
  return () => {
    return hasRole('tripAdmin', inject(AppStore).currentUser());
  };
};
