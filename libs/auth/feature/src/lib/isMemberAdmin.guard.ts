import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { AppStore } from '@okr/shared-feature';
import { hasRole } from '@okr/shared-util-core';

// Direct CanActivateFn (NOT a factory): registered bare as `canActivate: [isMemberAdminGuard]`.
// A factory would be invoked by Angular as the guard itself and return a truthy inner
// function, so the hasRole check would never run and the route would always activate.
//
// Matches the `addresses` read rule (owner ∨ privileged ∨ memberAdmin, spec 1.19 D-P4-1
// as amended): hasRole('privileged') resolves to ['privileged', 'admin'] and excludes
// memberAdmin, so a route that reads the vault needs both checks or it locks out exactly
// the role whose job it is.
export const isMemberAdminGuard: CanActivateFn = () => {
  const user = inject(AppStore).currentUser();
  return hasRole('privileged', user) || hasRole('memberAdmin', user);
};
