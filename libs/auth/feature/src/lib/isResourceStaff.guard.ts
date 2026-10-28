import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { AppStore } from '@okr/shared-feature';
import { hasRole } from '@okr/shared-util-core';

// privileged OR resourceAdmin — the group that may lock a boat and keeps the Schadensliste.
// hasRole has no union of the two (privileged → [privileged, admin], resourceAdmin →
// [resourceAdmin, admin]), hence a guard of its own. Direct CanActivateFn, not a factory
// (see isPrivilegedGuard).
export const isResourceStaffGuard: CanActivateFn = () => {
  const user = inject(AppStore).currentUser();
  return hasRole('privileged', user) || hasRole('resourceAdmin', user);
};
