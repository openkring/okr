import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';

import { AppStore } from '@okr/shared-feature';
import { hasRole } from '@okr/shared-util-core';

export const isPrivilegedGuard = (): CanActivateFn => {
  return () => {
    return hasRole('privileged', inject(AppStore).currentUser());
  };
};
