import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AppStore } from '@bk2/shared/feature';
import { hasRole } from '@bk2/shared/util-core';

export const isPrivilegedGuard = (): CanActivateFn => {
    return () => {
      return hasRole('privileged', inject(AppStore).currentUser());
    }
};
