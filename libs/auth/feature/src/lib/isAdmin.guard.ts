import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AppStore } from '@okr/shared-feature';
import { hasRole } from '@okr/shared-util-core';

export const isAdminGuard = (): CanActivateFn => {
  return () => {
    return hasRole('admin', inject(AppStore).currentUser());
  };
};
