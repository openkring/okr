import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { authState } from 'rxfire/auth';
import { map, take } from 'rxjs/operators';

import { AUTH } from '@bk2/shared-config';

export const isAuthenticatedGuard: CanActivateFn = () => {
  const auth = inject(AUTH);
  const router = inject(Router);
  
  // Wait for auth state to be determined
  return authState(auth).pipe(
    take(1), // Take the first emission (current auth state)
    map(user => {
      const isAuth = user !== null && user !== undefined;
      if (isAuth) return true;
      return router.parseUrl('/auth/login');
    })
  );
};
