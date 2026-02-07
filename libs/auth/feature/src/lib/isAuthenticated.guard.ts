import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AUTH } from '@bk2/shared-config';
import { authState } from 'rxfire/auth';
import { map, take } from 'rxjs/operators';

export const isAuthenticatedGuard: CanActivateFn = () => {
  const auth = inject(AUTH);
  const router = inject(Router);
  
  // Wait for auth state to be determined
  return authState(auth).pipe(
    take(1), // Take the first emission (current auth state)
    map(user => {
      const isAuth = user !== null && user !== undefined;
      console.log('isAuthenticatedGuard:', { isAuth, email: user?.email });
      if (isAuth) return true;
      console.warn('isAuthenticatedGuard: not authenticated, redirecting to login');
      return router.parseUrl('/auth/login');
    })
  );
};
