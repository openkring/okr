import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AppStore } from '@bk2/shared/feature';
import { hasRole } from '@bk2/shared/util';

export const isAdminGuard = (): CanActivateFn => {
  return () => {
    return hasRole('admin', inject(AppStore).currentUser());
  }
};
