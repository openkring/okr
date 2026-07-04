import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { AppStore } from '@okr/shared-feature';
import { hasRole } from '@okr/shared-util-core';

// Direct CanActivateFn (NOT a factory): registered bare as `canActivate: [isPrivilegedGuard]`.
// A factory would be invoked by Angular as the guard itself and return a truthy inner
// function, so the hasRole check would never run and the route would always activate.
export const isPrivilegedGuard: CanActivateFn = () =>
  hasRole('privileged', inject(AppStore).currentUser());
