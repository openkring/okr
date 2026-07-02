import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AppStore } from '@okr/shared-feature';
import { hasRole } from '@okr/shared-util-core';

export const isAuditorGuard = (): CanActivateFn => {
  return () => {
    return hasRole('auditor', inject(AppStore).currentUser());
  };
};
