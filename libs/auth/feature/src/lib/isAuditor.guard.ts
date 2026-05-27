import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AppStore } from '@bk2/shared-feature';
import { hasRole } from '@bk2/shared-util-core';

export const isAuditorGuard = (): CanActivateFn => {
  return () => {
    return hasRole('auditor', inject(AppStore).currentUser());
  };
};
